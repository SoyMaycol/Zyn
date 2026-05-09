const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME_DIR = os.homedir() || '/root';
const DATA_ROOT = path.join(HOME_DIR, '.zyn');
const GIT_SECRETS_FILE = path.join(DATA_ROOT, 'git-secrets.json');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadGitSecrets() {
  const raw = readJson(GIT_SECRETS_FILE);
  if (!raw || typeof raw !== 'object') {
    return { github: null, gitlab: null, custom: {} };
  }

  return {
    github: raw.github || null,
    gitlab: raw.gitlab || null,
    custom: raw.custom && typeof raw.custom === 'object' ? raw.custom : {},
  };
}

function saveGitSecrets(data) {
  writeJson(GIT_SECRETS_FILE, {
    github: data.github || null,
    gitlab: data.gitlab || null,
    custom: data.custom && typeof data.custom === 'object' ? data.custom : {},
    updatedAt: new Date().toISOString(),
  });
}

function normalizeProfileName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function sanitizeSecretConfig(input = {}) {
  const output = {};
  if (input.token !== undefined) output.token = String(input.token || '').trim();
  if (input.username !== undefined) output.username = String(input.username || '').trim();
  if (input.apiBaseUrl !== undefined) output.apiBaseUrl = normalizeBaseUrl(input.apiBaseUrl);
  if (input.cloneBaseUrl !== undefined) output.cloneBaseUrl = normalizeBaseUrl(input.cloneBaseUrl);
  if (input.authHeader !== undefined) output.authHeader = String(input.authHeader || '').trim();
  if (input.name !== undefined) output.name = String(input.name || '').trim();
  return output;
}

function upsertGitSecret(provider, input = {}) {
  const key = normalizeProfileName(provider);
  const config = sanitizeSecretConfig(input);
  const store = loadGitSecrets();

  if (key === 'github') {
    store.github = {
      ...store.github,
      ...config,
      provider: 'github',
      apiBaseUrl: config.apiBaseUrl || store.github?.apiBaseUrl || 'https://api.github.com',
      cloneBaseUrl: config.cloneBaseUrl || store.github?.cloneBaseUrl || 'https://github.com',
      updatedAt: new Date().toISOString(),
    };
    saveGitSecrets(store);
    return store.github;
  }

  if (key === 'gitlab') {
    store.gitlab = {
      ...store.gitlab,
      ...config,
      provider: 'gitlab',
      apiBaseUrl: config.apiBaseUrl || store.gitlab?.apiBaseUrl || 'https://gitlab.com/api/v4',
      cloneBaseUrl: config.cloneBaseUrl || store.gitlab?.cloneBaseUrl || 'https://gitlab.com',
      updatedAt: new Date().toISOString(),
    };
    saveGitSecrets(store);
    return store.gitlab;
  }

  const name = config.name || key || 'custom';
  store.custom[name] = {
    ...store.custom[name],
    ...config,
    provider: 'custom',
    name,
    updatedAt: new Date().toISOString(),
  };
  saveGitSecrets(store);
  return store.custom[name];
}

function removeGitSecret(provider, name = '') {
  const key = normalizeProfileName(provider);
  const store = loadGitSecrets();
  if (key === 'github') {
    store.github = null;
    saveGitSecrets(store);
    return true;
  }
  if (key === 'gitlab') {
    store.gitlab = null;
    saveGitSecrets(store);
    return true;
  }
  const customName = String(name || '').trim();
  if (!customName) return false;
  if (store.custom[customName]) {
    delete store.custom[customName];
    saveGitSecrets(store);
    return true;
  }
  return false;
}

function listGitSecrets() {
  const store = loadGitSecrets();
  const output = [];
  if (store.github) output.push({ key: 'github', ...store.github, token: '[set]' });
  if (store.gitlab) output.push({ key: 'gitlab', ...store.gitlab, token: '[set]' });
  for (const [name, config] of Object.entries(store.custom || {})) {
    output.push({ key: `custom:${name}`, ...config, token: '[set]' });
  }
  return output;
}

function getGitSecret(provider, name = '') {
  const key = normalizeProfileName(provider);
  const store = loadGitSecrets();
  if (key === 'github') return store.github || null;
  if (key === 'gitlab') return store.gitlab || null;
  const customName = String(name || '').trim();
  if (!customName) return null;
  return store.custom[customName] || null;
}

function resolveGitProfile(provider, name = '') {
  const key = normalizeProfileName(provider);
  if (key === 'github' || key === 'gitlab') return getGitSecret(key);
  return getGitSecret('custom', name);
}

function buildCloneUrl(repoUrl, profile = {}) {
  const raw = String(repoUrl || '').trim();
  if (!raw) throw new Error('Missing repo URL');
  if (!profile?.token) return raw;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }

  const host = parsed.hostname.toLowerCase();
  if (host.includes('github.com')) {
    parsed.username = 'x-access-token';
    parsed.password = profile.token;
    return parsed.toString();
  }

  if (host.includes('gitlab.com')) {
    parsed.username = profile.username || 'oauth2';
    parsed.password = profile.token;
    return parsed.toString();
  }

  parsed.username = profile.username || 'oauth2';
  parsed.password = profile.token;
  return parsed.toString();
}

function getApiBaseUrl(provider, profile = {}) {
  const key = normalizeProfileName(provider);
  if (profile?.apiBaseUrl) return normalizeBaseUrl(profile.apiBaseUrl);
  if (key === 'github') return 'https://api.github.com';
  if (key === 'gitlab') return 'https://gitlab.com/api/v4';
  return '';
}

function buildApiHeaders(provider, profile = {}, extraHeaders = {}) {
  const key = normalizeProfileName(provider);
  const token = profile?.token || '';
  const headers = { ...extraHeaders };

  if (token) {
    if (key === 'gitlab') {
      headers['PRIVATE-TOKEN'] = token;
    } else if (profile?.authHeader) {
      headers[profile.authHeader] = token;
    } else {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return headers;
}

module.exports = {
  buildApiHeaders,
  buildCloneUrl,
  getApiBaseUrl,
  getGitSecret,
  listGitSecrets,
  loadGitSecrets,
  normalizeProfileName,
  removeGitSecret,
  resolveGitProfile,
  saveGitSecrets,
  upsertGitSecret,
};
