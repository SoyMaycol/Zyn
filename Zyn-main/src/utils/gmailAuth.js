const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const fsp = fs.promises;

const {
  GMAIL_AUTH_FILE,
  REQUEST_TIMEOUT_MS,
} = require('../config');

const GMAIL_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];

const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const CALLBACK_PATH = '/oauth/gmail/callback';
const CREDENTIALS_URL = 'https://cdn.soymaycol.icu/files/zyn-credentials.json';

let pendingFlow = null;
let cachedGoogleCredentials = null;

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createPkcePair() {
  const verifier = base64Url(crypto.randomBytes(64));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

async function readAuthFile() {
  try {
    return JSON.parse(await fsp.readFile(GMAIL_AUTH_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeAuthFile(data) {
  await fsp.mkdir(path.dirname(GMAIL_AUTH_FILE), { recursive: true });
  const safe = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  await fsp.writeFile(GMAIL_AUTH_FILE, JSON.stringify(safe, null, 2), 'utf8');
}

async function clearGmailAuth() {
  await fsp.rm(GMAIL_AUTH_FILE, { force: true });
}

function makeApiError(status, body, fallbackMessage) {
  const detail =
    body?.error_description ||
    body?.error?.message ||
    body?.error ||
    body?.message ||
    fallbackMessage ||
    'Error desconocido';
  const err = new Error(`Gmail API falló (${status}): ${String(detail).slice(0, 300)}`);
  err.status = status;
  err.body = body;
  return err;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = options.signal;
  const onAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal,
    });

    const text = await res.text();
    let json = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const rawCode = String(json?.error || '').toLowerCase();
      if (
        rawCode === 'invalid_client' ||
        String(json?.error_description || '').toLowerCase().includes('client_secret is missing') ||
        String(json?.error_description || '').toLowerCase().includes('invalid client type')
      ) {
        const err = new Error(
          'Invalid client type o client_secret faltante. Este flujo necesita el client_secret del mismo OAuth client que el client_id.'
        );
        err.status = res.status;
        err.body = json;
        throw err;
      }

      throw makeApiError(res.status, json, text);
    }

    return json;
  } finally {
    clearTimeout(timeout);
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
  }
}

async function getGoogleOAuthCredentials() {
  if (cachedGoogleCredentials) return cachedGoogleCredentials;

  const res = await fetch(CREDENTIALS_URL, {
    headers: {
      'user-agent': 'Zyn-GmailAuth/1.0',
      'accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`No se pudo obtener las credenciales OAuth remotas (${res.status})`);
  }

  const json = await res.json();
  const installed = json?.installed;

  if (!installed?.client_id || !installed?.client_secret) {
    throw new Error('El JSON remoto de credenciales no tiene installed.client_id o installed.client_secret');
  }

  cachedGoogleCredentials = {
    clientId: installed.client_id,
    clientSecret: installed.client_secret,
    redirectUris: Array.isArray(installed.redirect_uris) ? installed.redirect_uris : [],
  };

  return cachedGoogleCredentials;
}

function buildStoredToken(token, profile = null) {
  const expiresIn = Number(token.expires_in || 3600);
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token || '',
    token_type: token.token_type || 'Bearer',
    scope: token.scope || GMAIL_SCOPES.join(' '),
    expiry_date: Date.now() + Math.max(1, expiresIn - 60) * 1000,
    connectedAt: new Date().toISOString(),
    profile,
  };
}

async function getUserProfile(accessToken) {
  try {
    return await fetchJson(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeoutMs: 30000,
    });
  } catch {
    return null;
  }
}

async function exchangeCodeForToken({ code, codeVerifier, redirectUri }) {
  const creds = await getGoogleOAuthCredentials();

  const params = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  return fetchJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: params,
    timeoutMs: 30000,
  });
}

async function refreshAccessToken(auth) {
  if (!auth?.refresh_token) {
    throw new Error('Gmail no está conectado o el refresh token falta. Usa /gmail connect otra vez.');
  }

  const creds = await getGoogleOAuthCredentials();

  const params = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: auth.refresh_token,
    grant_type: 'refresh_token',
  });

  const token = await fetchJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: params,
    timeoutMs: 30000,
  });

  const next = buildStoredToken(
    {
      ...token,
      refresh_token: auth.refresh_token,
    },
    auth.profile || null
  );

  await writeAuthFile(next);
  return next;
}

async function saveTokenFromCode({ code, codeVerifier, redirectUri }) {
  const token = await exchangeCodeForToken({ code, codeVerifier, redirectUri });
  const profile = await getUserProfile(token.access_token);
  const stored = buildStoredToken(token, profile);
  await writeAuthFile(stored);
  return stored;
}

async function getGmailAuthStatus() {
  const auth = await readAuthFile();
  if (!auth?.access_token && !auth?.refresh_token) {
    return { connected: false };
  }

  return {
    connected: true,
    email: auth.profile?.email || '',
    scopes: String(auth.scope || '').split(/\s+/).filter(Boolean),
    expiryDate: auth.expiry_date || 0,
    connectedAt: auth.connectedAt || '',
    refreshable: Boolean(auth.refresh_token),
  };
}

async function ensureAccessToken() {
  const auth = await readAuthFile();
  if (!auth?.access_token && !auth?.refresh_token) {
    throw new Error('Gmail no está conectado. Usa /gmail connect primero.');
  }

  if (auth.access_token && Number(auth.expiry_date || 0) > Date.now() + 60000) {
    return auth.access_token;
  }

  const refreshed = await refreshAccessToken(auth);
  return refreshed.access_token;
}

async function gmailApiRequest(method, apiPath, options = {}) {
  const token = await ensureAccessToken();
  const url = new URL(`${GMAIL_API_BASE}${apiPath}`);

  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  return fetchJson(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    timeoutMs: options.timeoutMs,
  });
}

async function buildAuthUrl({ redirectUri, codeChallenge, state }) {
  const creds = await getGoogleOAuthCredentials();
  const url = new URL(AUTH_BASE);

  url.searchParams.set('client_id', creds.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GMAIL_SCOPES.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
}

function closeServer(server) {
  return new Promise(resolve => server.close(() => resolve()));
}

async function startGmailOAuthFlow(options = {}) {
  if (pendingFlow?.server) {
    await closeServer(pendingFlow.server).catch(() => {});
    pendingFlow = null;
  }

  const { verifier, challenge } = createPkcePair();
  const state = base64Url(crypto.randomBytes(24));
  const host = options.host || '127.0.0.1';
  const preferredPort = Number(options.port || process.env.ZYN_GMAIL_OAUTH_PORT || 0);

  let redirectUri = '';
  let resolveDone;
  let rejectDone;

  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const server = http.createServer(async (req, res) => {
    try {
      const currentUrl = new URL(req.url, `http://${req.headers.host}`);

      if (currentUrl.pathname !== CALLBACK_PATH) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      const error = currentUrl.searchParams.get('error');
      if (error) throw new Error(error);

      const receivedState = currentUrl.searchParams.get('state');
      if (receivedState !== state) {
        throw new Error('OAuth state inválido');
      }

      const code = currentUrl.searchParams.get('code');
      if (!code) {
        throw new Error('Google no devolvió code');
      }

      const stored = await saveTokenFromCode({
        code,
        codeVerifier: verifier,
        redirectUri,
      });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><meta charset="utf-8"><title>Zyn Gmail conectado</title><h1>Gmail conectado con Zyn</h1><p>Ya puedes cerrar esta pestaña.</p>'
      );

      resolveDone(stored);
      setTimeout(() => closeServer(server).catch(() => {}), 250);
    } catch (err) {
      res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        `<!doctype html><meta charset="utf-8"><title>Error Gmail</title><h1>Error conectando Gmail</h1><pre>${String(err.message || err).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`
      );
      rejectDone(err);
      setTimeout(() => closeServer(server).catch(() => {}), 250);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(preferredPort, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : preferredPort;
  redirectUri = `http://${host}:${port}${CALLBACK_PATH}`;

  const authUrl = await buildAuthUrl({
    redirectUri,
    codeChallenge: challenge,
    state,
  });

  const timeout = setTimeout(() => {
    rejectDone(new Error('Tiempo agotado esperando login de Gmail'));
    closeServer(server).catch(() => {});
  }, Number(options.timeoutMs || 10 * 60 * 1000));

  done.finally(() => {
    clearTimeout(timeout);
    if (pendingFlow?.server === server) pendingFlow = null;
  }).catch(() => {});

  pendingFlow = { server, done, authUrl, redirectUri, flow: 'code' };

  return { authUrl, redirectUri, done, flow: 'code' };
}

module.exports = {
  GMAIL_SCOPES,
  clearGmailAuth,
  getGmailAuthStatus,
  gmailApiRequest,
  startGmailOAuthFlow,
};
