const fs = require('fs');
const path = require('path');
const { MODELS_FILE, PROVIDERS_FILE, SUPPORTED_MODEL_PROVIDERS } = require('../config');

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': 'Zyn/1.0',
};

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function normalizeBaseUrl(input) {
  return String(input || '').trim().replace(/\/$/, '');
}

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'model';
}

function titleize(text) {
  return String(text || '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

async function fetchJson(url, options = {}) {
  const signal = options.signal;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      ...DEFAULT_HEADERS,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const detail = typeof data === 'string'
      ? data
      : data?.message || data?.error || text;
    const err = new Error(`HTTP ${res.status}: ${String(detail || '').slice(0, 300)}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

function loadProviderRegistry() {
  const raw = readJsonFile(PROVIDERS_FILE);
  if (!raw || typeof raw !== 'object') {
    return { providers: {} };
  }
  if (raw.providers && typeof raw.providers === 'object') {
    return { providers: raw.providers };
  }
  return { providers: raw };
}

function saveProviderRegistry(registry) {
  writeJsonFile(PROVIDERS_FILE, registry);
}

function loadExternalModels() {
  const raw = readJsonFile(MODELS_FILE);
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const output = {};
    for (const item of raw) {
      if (!item?.key || !SUPPORTED_MODEL_PROVIDERS.has(item.provider)) continue;
      output[item.key] = item;
    }
    return output;
  }
  const rawModels = raw.models && typeof raw.models === 'object'
    ? raw.models
    : (raw && typeof raw === 'object' ? raw : {});
  return Object.fromEntries(
    Object.entries(rawModels).filter(([, model]) => SUPPORTED_MODEL_PROVIDERS.has(model?.provider)),
  );
}

function saveExternalModels(models) {
  writeJsonFile(MODELS_FILE, models);
}

function upsertProviderConfig(providerKey, config) {
  const registry = loadProviderRegistry();
  registry.providers[providerKey] = {
    ...registry.providers[providerKey],
    ...config,
    provider: providerKey,
    updatedAt: new Date().toISOString(),
  };
  saveProviderRegistry(registry);
  return registry.providers[providerKey];
}

function removeProviderConfig(providerKey) {
  const registry = loadProviderRegistry();
  delete registry.providers[providerKey];
  saveProviderRegistry(registry);
}

function listConfiguredProviders() {
  const registry = loadProviderRegistry();
  return Object.entries(registry.providers).map(([key, value]) => ({ key, ...value }));
}

function sanitizeModelKey(providerKey, modelId) {
  return `${slugify(providerKey)}-${slugify(modelId)}`;
}

function buildModelRecord(providerKey, config, modelId, label, extra = {}) {
  const key = sanitizeModelKey(providerKey, modelId);
  const record = {
    key,
    label: label || titleize(modelId),
    provider: providerKey,
    modelId,
    ...extra,
  };

  if (config?.baseUrl) record.baseUrl = config.baseUrl;
  if (config?.apiKey) record.apiKey = config.apiKey;
  if (config?.modelEndpoint) record.modelEndpoint = config.modelEndpoint;
  if (config?.chatEndpoint) record.chatEndpoint = config.chatEndpoint;
  return record;
}

async function fetchZenModels(config) {
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://opencode.ai/zen');
  const data = await fetchJson(`${baseUrl}/v1/models`, {
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
  });
  const models = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  return models.map(model => buildModelRecord(
    'zen',
    { ...config, baseUrl },
    model.id || model.name,
    model.name || titleize(model.id || model.name),
    {
      zenModel: model.id || model.name,
      raw: model,
    },
  )).filter(item => item.modelId);
}

async function fetchQwenModels(config) {
  const models = [
    { id: 'qwen3.6-plus', label: 'Qwen 3.6 Plus' },
    { id: 'qwen3.5-plus', label: 'Qwen 3.5 Plus' },
    { id: 'qwen-coder-plus', label: 'Qwen Coder Plus' },
  ];
  return models.map(model => buildModelRecord(
    'qwen',
    config,
    model.id,
    model.label,
    {
      qwenModel: model.id,
      static: true,
    },
  ));
}


async function fetchGeminiModels(config) {
  const models = [
    { id: 'gemini-flash', label: 'Gemini Flash' },
  ];
  return models.map(model => buildModelRecord(
    'gemini',
    config,
    model.id,
    model.label,
    {
      geminiModel: model.id,
      static: true,
    },
  ));
}

async function fetchProviderModels(providerKey, config = {}) {
  const key = String(providerKey || '').trim();
  if (!SUPPORTED_MODEL_PROVIDERS.has(key)) throw new Error(`Proveedor no soportado: ${key}`);
  if (key === 'gemini') return fetchGeminiModels(config);
  if (key === 'zen') return fetchZenModels(config);
  if (key === 'qwen') return fetchQwenModels(config);
  throw new Error(`Proveedor no soportado: ${key}`);
}

function mergeProviderModels(providerKey, models) {
  const current = loadExternalModels();
  const next = {};

  for (const [key, model] of Object.entries(current)) {
    if (model.provider !== providerKey) {
      next[key] = model;
    }
  }

  for (const model of models) {
    next[model.key] = model;
  }

  saveExternalModels(next);
  return next;
}

async function syncProvider(providerKey) {
  const registry = loadProviderRegistry();
  const config = registry.providers[providerKey];
  if (!config) {
    throw new Error(`Proveedor no configurado: ${providerKey}`);
  }
  const models = await fetchProviderModels(providerKey, config);
  registry.providers[providerKey] = {
    ...config,
    provider: providerKey,
    updatedAt: new Date().toISOString(),
    modelCount: models.length,
  };
  saveProviderRegistry(registry);
  mergeProviderModels(providerKey, models);
  return models;
}

function describeProviderConfig(providerKey) {
  const registry = loadProviderRegistry();
  return registry.providers[providerKey] || null;
}

module.exports = {
  describeProviderConfig,
  fetchProviderModels,
  listConfiguredProviders,
  loadProviderRegistry,
  mergeProviderModels,
  normalizeBaseUrl,
  removeProviderConfig,
  saveProviderRegistry,
  syncProvider,
  upsertProviderConfig,
};
