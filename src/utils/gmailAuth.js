const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const fsp = fs.promises;

const {
  GMAIL_AUTH_FILE,
  GMAIL_CLIENT_ID,
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

let pendingFlow = null;

function base64Url(buffer) {
  return Buffer.from(buffer)
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

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
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
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    if (!res.ok) {
      const detail = json?.error_description || json?.error?.message || json?.error || text;
      const err = new Error(`Gmail API fallo (${res.status}): ${String(detail || '').slice(0, 300)}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timeout);
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
  }
}

async function exchangeCodeForToken({ code, codeVerifier, redirectUri }) {
  const body = new URLSearchParams({
    client_id: GMAIL_CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  return fetchJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  });
}

async function refreshAccessToken(auth) {
  if (!auth?.refresh_token) throw new Error('Gmail no está conectado. Usa /gmail connect primero.');
  const body = new URLSearchParams({
    client_id: GMAIL_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: auth.refresh_token,
  });
  const token = await fetchJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  });
  const next = buildStoredToken({ ...token, refresh_token: auth.refresh_token }, auth.profile || null);
  await writeAuthFile(next);
  return next;
}

function buildStoredToken(token, profile = null) {
  const expiresIn = Number(token.expires_in || 3600);
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type || 'Bearer',
    scope: token.scope || GMAIL_SCOPES.join(' '),
    expiry_date: Date.now() + Math.max(1, expiresIn - 60) * 1000,
    connectedAt: new Date().toISOString(),
    profile,
  };
}

async function getUserProfile(accessToken) {
  return fetchJson(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: 30000,
  }).catch(() => null);
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
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
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

function buildAuthUrl({ redirectUri, codeChallenge, state }) {
  const url = new URL(AUTH_BASE);
  url.searchParams.set('client_id', GMAIL_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GMAIL_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
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
      const currentUrl = new URL(req.url, redirectUri || `http://${host}`);
      if (currentUrl.pathname !== CALLBACK_PATH) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      const error = currentUrl.searchParams.get('error');
      if (error) throw new Error(error);
      const receivedState = currentUrl.searchParams.get('state');
      if (receivedState !== state) throw new Error('OAuth state invalido');
      const code = currentUrl.searchParams.get('code');
      if (!code) throw new Error('Google no devolvio code');
      const stored = await saveTokenFromCode({ code, codeVerifier: verifier, redirectUri });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>Zyn Gmail conectado</title><h1>Gmail conectado con Zyn</h1><p>Ya puedes cerrar esta pestaña y volver al agente.</p>');
      resolveDone(stored);
      setTimeout(() => closeServer(server).catch(() => {}), 250);
    } catch (err) {
      res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Error Gmail</title><h1>Error conectando Gmail</h1><pre>${String(err.message || err)}</pre>`);
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
  const authUrl = buildAuthUrl({ redirectUri, codeChallenge: challenge, state });

  const timeout = setTimeout(() => {
    rejectDone(new Error('Tiempo agotado esperando login de Gmail'));
    closeServer(server).catch(() => {});
  }, Number(options.timeoutMs || 10 * 60 * 1000));

  done.finally(() => {
    clearTimeout(timeout);
    if (pendingFlow?.server === server) pendingFlow = null;
  }).catch(() => {});

  pendingFlow = { server, done, authUrl, redirectUri };
  return { authUrl, redirectUri, done };
}

module.exports = {
  GMAIL_SCOPES,
  clearGmailAuth,
  getGmailAuthStatus,
  gmailApiRequest,
  startGmailOAuthFlow,
};
