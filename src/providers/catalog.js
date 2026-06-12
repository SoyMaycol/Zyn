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
    return { providers: {}, customModels: {} };
  }
  return {
    providers: raw.providers && typeof raw.providers === 'object' ? raw.providers : {},
    customModels: raw.customModels && typeof raw.customModels === 'object' ? raw.customModels : {},
  };
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
      if (!item?.key || !item?.provider || !SUPPORTED_MODEL_PROVIDERS.has(item.provider)) continue;
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

function describeProviderConfig(providerKey) {
  const registry = loadProviderRegistry();
  return registry.providers[providerKey] || null;
}

const SETTABLE_PROVIDER_FIELDS = new Set([
  'apiKey', 'baseUrl', 'email', 'password', 'model', 'modelId',
  'chatEndpoint', 'modelEndpoint', 'username', 'authHeader', 'authPrefix',
]);

function setProviderField(providerKey, field, value) {
  if (!SETTABLE_PROVIDER_FIELDS.has(field)) {
    throw new Error(`Campo no soportado: ${field}. Campos validos: ${[...SETTABLE_PROVIDER_FIELDS].join(', ')}`);
  }
  const registry = loadProviderRegistry();
  const current = registry.providers[providerKey] || { provider: providerKey };
  const updated = { ...current, [field]: String(value || '').trim() };
  registry.providers[providerKey] = {
    ...updated,
    provider: providerKey,
    updatedAt: new Date().toISOString(),
  };
  saveProviderRegistry(registry);
  return registry.providers[providerKey];
}

function unsetProviderField(providerKey, field) {
  if (!SETTABLE_PROVIDER_FIELDS.has(field)) {
    throw new Error(`Campo no soportado: ${field}`);
  }
  const registry = loadProviderRegistry();
  if (registry.providers[providerKey]) {
    delete registry.providers[providerKey][field];
    registry.providers[providerKey].updatedAt = new Date().toISOString();
    saveProviderRegistry(registry);
  }
}

function maskSecret(value) {
  if (!value) return '';
  const str = String(value);
  if (str.length <= 4) return '****';
  return `${str.slice(0, 2)}${'*'.repeat(Math.min(12, str.length - 4))}${str.slice(-2)}`;
}

function summarizeProviderConfig(providerKey) {
  const config = describeProviderConfig(providerKey);
  if (!config) return null;
  const summary = { key: providerKey, fields: [] };
  for (const field of [...SETTABLE_PROVIDER_FIELDS].sort()) {
    if (config[field]) {
      const isSecret = ['apiKey', 'password'].includes(field);
      summary.fields.push({
        name: field,
        value: isSecret ? maskSecret(config[field]) : String(config[field]),
        secret: isSecret,
      });
    }
  }
  summary.updatedAt = config.updatedAt;
  return summary;
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

async function fetchQwenapiModels(config) {
  const baseUrl = (config?.baseUrl || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  const apiKey = String(config?.apiKey || process.env.ZYN_QWEN_API_KEY || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim();
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  try {
    const data = await fetchJson(`${baseUrl}/models`, { headers });
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map(model => buildModelRecord(
      'qwenapi',
      { ...config, baseUrl },
      model.id,
      model.name || model.id,
      { qwenapiModel: model.id, raw: model },
    )).filter(item => item.modelId);
  } catch {
    const fallback = [
      { id: 'qwen-plus', label: 'Qwen Plus' },
      { id: 'qwen-max', label: 'Qwen Max' },
      { id: 'qwen-turbo', label: 'Qwen Turbo' },
    ];
    return fallback.map(model => buildModelRecord(
      'qwenapi',
      config,
      model.id,
      model.label,
      { qwenapiModel: model.id, static: true },
    ));
  }
}

async function fetchGeminiModels(config) {
  const models = [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
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

async function fetchCustomModels(config) {
  const baseUrl = normalizeBaseUrl(config.baseUrl || '');
  const apiKey = String(config.apiKey || '').trim();
  if (!baseUrl) return [];

  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const candidates = [
    `${baseUrl}/models`,
    `${baseUrl}/v1/models`,
  ];

  let lastError = null;
  for (const url of candidates) {
    try {
      const data = await fetchJson(url, { headers });
      const models = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
      return models.map(model => buildModelRecord(
        'custom',
        { ...config, baseUrl },
        model.id || model.name || model.model,
        model.name || titleize(model.id || model.name || model.model),
        {
          customModel: model.id || model.name || model.model,
          raw: model,
        },
      )).filter(item => item.modelId);
    } catch (err) {
      lastError = err;
    }
  }

  if (config.modelId) {
    return [buildModelRecord(
      'custom',
      { ...config, baseUrl },
      config.modelId,
      titleize(config.modelId),
      { customModel: config.modelId },
    )];
  }

  throw new Error(`No se pudieron listar modelos custom: ${lastError?.message || 'sin respuesta'}`);
}

async function fetchHuggingFaceModels(config) {
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://router.huggingface.co');
  const apiKey = String(config.apiKey || '').trim();
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  try {
    const data = await fetchJson(`${baseUrl}/v1/models`, { headers });
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    return list.map(model => buildModelRecord(
      'huggingface',
      { ...config, baseUrl },
      model.id || model.modelId || model.name,
      model.name || titleize(model.id || model.modelId || model.name),
      {
        huggingfaceModel: model.id || model.modelId || model.name,
        raw: model,
      },
    )).filter(item => item.modelId);
  } catch (err) {
    if (config.modelId) {
      return [buildModelRecord(
        'huggingface',
        config,
        config.modelId,
        titleize(config.modelId),
        { huggingfaceModel: config.modelId },
      )];
    }
    throw err;
  }
}

async function fetchProviderModels(providerKey, config = {}) {
  const key = String(providerKey || '').trim();
  if (!SUPPORTED_MODEL_PROVIDERS.has(key)) throw new Error(`Proveedor no soportado: ${key}. Usa /provider set ${key} para configurar.`);
  if (key === 'qwenapi') return fetchQwenapiModels(config);
  if (key === 'gemini') return fetchGeminiModels(config);
  if (key === 'zen') return fetchZenModels(config);
  if (key === 'huggingface') return fetchHuggingFaceModels(config);
  if (key === 'custom') return fetchCustomModels(config);
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

function getActiveModelsForProvider(providerKey) {
  const { MODELS } = require('../config');
  return Object.entries(MODELS)
    .filter(([, model]) => model?.provider === providerKey)
    .map(([key, model]) => ({ key, ...model }));
}

module.exports = {
  SETTABLE_PROVIDER_FIELDS,
  buildModelRecord,
  describeProviderConfig,
  fetchProviderModels,
  getActiveModelsForProvider,
  listConfiguredProviders,
  loadProviderRegistry,
  maskSecret,
  mergeProviderModels,
  normalizeBaseUrl,
  removeProviderConfig,
  sanitizeModelKey,
  saveProviderRegistry,
  setProviderField,
  summarizeProviderConfig,
  syncProvider,
  unsetProviderField,
  upsertProviderConfig,
};
