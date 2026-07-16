const fs = require('fs');
const path = require('path');
const { BUNDLED_MODELS_FILE, BUNDLED_PROVIDERS_FILE, MODELS_FILE, PROVIDERS_FILE, SUPPORTED_MODEL_PROVIDERS } = require('../config');

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
};

const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://github.com/SoyMaycol/Zyn',
  'X-OpenRouter-Title': 'Zyn Agent',
  'X-OpenRouter-Categories': 'cli-agent,programming-app',
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
  const raw = readJsonFile(PROVIDERS_FILE) || readJsonFile(BUNDLED_PROVIDERS_FILE);
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
  const raw = readJsonFile(MODELS_FILE) || readJsonFile(BUNDLED_MODELS_FILE);
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
  'contextLength', 'hifLeim',
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
  if (config?.contextLength) record.contextLength = Number(config.contextLength);
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
      contextLength: Number(model.context_length || model.max_tokens || model.max_context_length || 0) || undefined,
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
      {
        qwenapiModel: model.id,
        contextLength: Number(model.context_length || model.max_tokens || model.max_context_length || 0) || undefined,
        raw: model,
      },
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
  const GEMINI_CONTEXT = { 'gemini-2.5-pro': 1000000, 'gemini-2.5-flash': 1000000, 'gemini-2.5-flash-lite': 1000000 };
  return models.map(model => buildModelRecord(
    'gemini',
    config,
    model.id,
    model.label,
    {
      geminiModel: model.id,
      static: true,
      contextLength: GEMINI_CONTEXT[model.id],
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
          contextLength: Number(model.context_length || model.max_tokens || model.max_context_length || 0) || undefined,
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

async function fetchDeepseekModels(config) {
  const models = [
    { id: 'default', label: 'DeepSeek V4 Flash' },
    { id: 'deepseek-v4', label: 'DeepSeek V4' },
  ];
  return models.map(model => buildModelRecord(
    'deepseek',
    config,
    model.id,
    model.label,
    {
      deepseekChatModel: model.id,
      static: true,
      contextLength: 128000,
    },
  ));
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
        contextLength: Number(model.context_length || model.max_tokens || model.max_context_length || 0) || undefined,
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

async function fetchOpenAIModels(config) {
  const apiKey = String(config.apiKey || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('OpenAI requiere apiKey');
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://api.openai.com/v1');
  const data = await fetchJson(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.filter(m => m.id && m.id.startsWith('gpt-')).map(model => buildModelRecord(
    'openai', config, model.id, model.id, { modelId: model.id, contextLength: 128000 },
  ));
}

async function fetchAnthropicModels(config) {
  const models = [
    { id: 'claude-opus-4-8-20260813', label: 'Claude Opus 4.8', contextLength: 200000 },
    { id: 'claude-opus-4-7-20260605', label: 'Claude Opus 4.7', contextLength: 200000 },
    { id: 'claude-opus-4-6-20260409', label: 'Claude Opus 4.6', contextLength: 200000 },
    { id: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5', contextLength: 200000 },
    { id: 'claude-opus-4-20250514', label: 'Claude Opus 4', contextLength: 200000 },
    { id: 'claude-sonnet-4-6-20260305', label: 'Claude Sonnet 4.6', contextLength: 200000 },
    { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', contextLength: 200000 },
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', contextLength: 200000 },
    { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet', contextLength: 200000 },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet v2', contextLength: 200000 },
    { id: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet', contextLength: 200000 },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', contextLength: 200000 },
    { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', contextLength: 200000 },
    { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', contextLength: 200000 },
    { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus', contextLength: 200000 },
  ];
  return models.map(m => buildModelRecord('anthropic', config, m.id, m.label, { modelId: m.id, contextLength: m.contextLength }));
}

async function fetchGroqModels(config) {
  const apiKey = String(config.apiKey || process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) throw new Error('Groq requiere apiKey');
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://api.groq.com/openai/v1');
  const data = await fetchJson(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map(model => buildModelRecord(
    'groq', config, model.id, model.id, { modelId: model.id, contextLength: model.context_window || 128000 },
  ));
}

async function fetchTogetherModels(config) {
  const apiKey = String(config.apiKey || process.env.TOGETHER_API_KEY || '').trim();
  if (!apiKey) throw new Error('Together AI requiere apiKey');
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://api.together.xyz/v1');
  const data = await fetchJson(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.filter(m => m.type === 'chat').map(model => buildModelRecord(
    'together', config, model.id, model.display_name || model.id, { modelId: model.id, contextLength: model.context_length || 128000 },
  ));
}

async function fetchOpenRouterModels(config) {
  const apiKey = String(config.apiKey || process.env.OPENROUTER_API_KEY || '').trim();
  const headers = {
    ...OPENROUTER_HEADERS,
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
  const data = await fetchJson('https://openrouter.ai/api/v1/models', { headers });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map(model => buildModelRecord(
    'openrouter', config, model.id, model.name || model.id, { modelId: model.id, contextLength: model.context_length || 128000 },
  ));
}

async function fetchMistralModels(config) {
  const apiKey = String(config.apiKey || process.env.MISTRAL_API_KEY || '').trim();
  if (!apiKey) throw new Error('Mistral requiere apiKey');
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://api.mistral.ai/v1');
  const data = await fetchJson(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map(model => buildModelRecord(
    'mistral', config, model.id, model.name || model.id, { modelId: model.id, contextLength: model.max_context_length || 128000 },
  ));
}

async function fetchXAIModels(config) {
  const models = [
    { id: 'grok-4.3', label: 'Grok 4.3', contextLength: 1000000 },
    { id: 'grok-4.20', label: 'Grok 4.20', contextLength: 1000000 },
    { id: 'grok-4', label: 'Grok 4', contextLength: 1000000 },
    { id: 'grok-4-fast-reasoning', label: 'Grok 4 Fast Reasoning', contextLength: 1000000 },
    { id: 'grok-4-fast-non-reasoning', label: 'Grok 4 Fast Non-Reasoning', contextLength: 1000000 },
    { id: 'grok-3', label: 'Grok 3', contextLength: 131072 },
    { id: 'grok-3-fast', label: 'Grok 3 Fast', contextLength: 131072 },
    { id: 'grok-3-mini', label: 'Grok 3 Mini', contextLength: 131072 },
    { id: 'grok-3-mini-fast', label: 'Grok 3 Mini Fast', contextLength: 131072 },
    { id: 'grok-2', label: 'Grok 2', contextLength: 131072 },
    { id: 'grok-2-vision', label: 'Grok 2 Vision', contextLength: 131072 },
  ];
  return models.map(m => buildModelRecord('xai', config, m.id, m.label, { modelId: m.id, contextLength: m.contextLength }));
}

async function fetchCohereModels(config) {
  const models = [
    { id: 'command-a-plus', label: 'Command A+', contextLength: 128000 },
    { id: 'command-a', label: 'Command A', contextLength: 128000 },
    { id: 'command-a-translate', label: 'Command A Translate', contextLength: 128000 },
    { id: 'command-a-vision', label: 'Command A Vision', contextLength: 128000 },
    { id: 'command-r-plus', label: 'Command R+', contextLength: 128000 },
    { id: 'command-r', label: 'Command R', contextLength: 128000 },
    { id: 'command-r7b', label: 'Command R7B', contextLength: 128000 },
  ];
  return models.map(m => buildModelRecord('cohere', config, m.id, m.label, { modelId: m.id, contextLength: m.contextLength }));
}

async function fetchFireworksModels(config) {
  const apiKey = String(config.apiKey || process.env.FIREWORKS_API_KEY || '').trim();
  if (!apiKey) throw new Error('Fireworks AI requiere apiKey');
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://api.fireworks.ai/inference/v1');
  const data = await fetchJson(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map(model => buildModelRecord(
    'fireworks', config, model.id, model.id, { modelId: model.id, contextLength: 128000 },
  ));
}

async function fetchPerplexityModels(config) {
  const models = [
    { id: 'sonar-pro', label: 'Sonar Pro', contextLength: 200000 },
    { id: 'sonar', label: 'Sonar', contextLength: 200000 },
    { id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro', contextLength: 200000 },
    { id: 'sonar-reasoning', label: 'Sonar Reasoning', contextLength: 200000 },
  ];
  return models.map(m => buildModelRecord('perplexity', config, m.id, m.label, { modelId: m.id, contextLength: m.contextLength }));
}

async function fetchOllamaModels(config) {
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'http://localhost:11434/v1');
  try {
    const data = await fetchJson(`${baseUrl}/models`);
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map(model => buildModelRecord(
      'ollama', config, model.id, model.id, { modelId: model.id, contextLength: 128000 },
    ));
  } catch {
    throw new Error('Ollama no esta corriendo. Instala Ollama: https://ollama.com');
  }
}

async function fetchOllamaCloudModels(config) {
  const apiKey = String(config.apiKey || process.env.OLLAMA_API_KEY || '').trim();
  if (!apiKey) throw new Error('Ollama Cloud requiere apiKey de ollama.com');
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://ollama.com/api');
  const data = await fetchJson(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map(model => buildModelRecord(
    'ollamaCloud', config, model.id, model.id, { modelId: model.id, contextLength: 128000 },
  ));
}

async function fetchGitHubModels(config) {
  const token = String(config.apiKey || process.env.GITHUB_TOKEN || '').trim();
  if (!token) throw new Error('GitHub Models requiere GitHub PAT con scope models:read');
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://models.github.ai/inference');
  const data = await fetchJson(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
    },
  });
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return list.map(model => buildModelRecord(
    'github', config, model.id, model.name || model.id, { modelId: model.id, contextLength: model.context_length || 128000 },
  ));
}

async function fetchAzureModels(config) {
  const models = [
    { id: 'gpt-5.5', label: 'GPT-5.5', contextLength: 1048576 },
    { id: 'gpt-5.4', label: 'GPT-5.4', contextLength: 1048576 },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', contextLength: 1048576 },
    { id: 'gpt-5.2', label: 'GPT-5.2', contextLength: 1048576 },
    { id: 'gpt-5.1', label: 'GPT-5.1', contextLength: 1048576 },
    { id: 'gpt-5', label: 'GPT-5', contextLength: 1048576 },
    { id: 'gpt-4.1', label: 'GPT-4.1', contextLength: 1047576 },
    { id: 'gpt-4o', label: 'GPT-4o', contextLength: 128000 },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', contextLength: 128000 },
    { id: 'o4-mini', label: 'o4-mini', contextLength: 200000 },
    { id: 'o3', label: 'o3', contextLength: 200000 },
  ];
  return models.map(m => buildModelRecord('azure', config, m.id, m.label, { modelId: m.id, contextLength: m.contextLength }));
}

async function fetchBedrockModels(config) {
  const models = [
    { id: 'anthropic.claude-opus-4-20250514-v1:0', label: 'Claude Opus 4', contextLength: 200000 },
    { id: 'anthropic.claude-sonnet-4-20250514-v1:0', label: 'Claude Sonnet 4', contextLength: 200000 },
    { id: 'anthropic.claude-3-7-sonnet-20250219-v1:0', label: 'Claude 3.7 Sonnet', contextLength: 200000 },
    { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', label: 'Claude 3.5 Sonnet', contextLength: 200000 },
    { id: 'meta.llama4-maverick-17b-128e-instruct-v1:0', label: 'Llama 4 Maverick', contextLength: 131072 },
    { id: 'meta.llama3-3-70b-instruct-v1:0', label: 'Llama 3.3 70B', contextLength: 131072 },
    { id: 'meta.llama3-1-405b-instruct-v1:0', label: 'Llama 3.1 405B', contextLength: 131072 },
    { id: 'mistral.mistral-large-2402-v1:0', label: 'Mistral Large', contextLength: 128000 },
    { id: 'mistral.mistral-medium-2402-v1:0', label: 'Mistral Medium', contextLength: 32768 },
    { id: 'ai21.jamba-1-5-large-v1:0', label: 'Jamba 1.5 Large', contextLength: 256000 },
    { id: 'ai21.jamba-1-5-mini-v1:0', label: 'Jamba 1.5 Mini', contextLength: 256000 },
  ];
  return models.map(m => buildModelRecord('bedrock', config, m.id, m.label, { modelId: m.id, contextLength: m.contextLength }));
}

async function fetchVertexModels(config) {
  const models = [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextLength: 1000000 },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextLength: 1000000 },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', contextLength: 1000000 },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', contextLength: 2000000 },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', contextLength: 1000000 },
  ];
  return models.map(m => buildModelRecord('vertex', config, m.id, m.label, { modelId: m.id, contextLength: m.contextLength }));
}

async function fetchCloudflareModels(config) {
  const token = String(config.apiKey || process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const accountId = String(config.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!token || !accountId) throw new Error('Cloudflare requiere apiKey y accountId');
  const data = await fetchJson(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const list = Array.isArray(data?.result) ? data.result : [];
  return list.filter(m => m.task?.name === 'Text Generation').map(model => buildModelRecord(
    'cloudflare', config, model.id, model.name || model.id, { modelId: model.id, contextLength: 128000 },
  ));
}

async function fetchLMStudioModels(config) {
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'http://localhost:1234/v1');
  try {
    const data = await fetchJson(`${baseUrl}/models`);
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map(model => buildModelRecord(
      'lmstudio', config, model.id, model.id, { modelId: model.id, contextLength: 128000 },
    ));
  } catch {
    throw new Error('LM Studio no esta corriendo. Inicia LM Studio: https://lmstudio.ai');
  }
}

async function fetchNovitaModels(config) {
  const apiKey = String(config.apiKey || process.env.NOVITA_API_KEY || '').trim();
  if (!apiKey) throw new Error('Novita AI requiere apiKey');
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://api.novita.ai/openai/v1');
  const data = await fetchJson(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map(model => buildModelRecord(
    'novita', config, model.id, model.id, { modelId: model.id, contextLength: model.context_length || 128000 },
  ));
}

async function fetchChutesModels(config) {
  const apiKey = String(config.apiKey || process.env.CHUTES_API_KEY || '').trim();
  if (!apiKey) throw new Error('Chutes AI requiere apiKey');
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://llm.chutes.ai/v1');
  const data = await fetchJson(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map(model => buildModelRecord(
    'chutes', config, model.id, model.id, { modelId: model.id, contextLength: model.context_length || 32768 },
  ));
}

async function fetchInferenceModels(config) {
  const apiKey = String(config.apiKey || process.env.INFERENCE_API_KEY || '').trim();
  if (!apiKey) throw new Error('Inference.net requiere apiKey');
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://api.inference.net/v1');
  const data = await fetchJson(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map(model => buildModelRecord(
    'inference', config, model.id, model.id, { modelId: model.id, contextLength: 128000 },
  ));
}

async function fetchZyncloudModels(config) {
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://zyn.soymaycol.icu/v1');
  const apiKey = String(config.apiKey || '').trim();
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const data = await fetchJson(`${baseUrl}/models`, { headers });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map(model => {
    const label = model.id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return buildModelRecord(
      'zyncloud', config, model.id, label, { modelId: model.id, contextLength: 128000 },
    );
  });
}

async function fetchReplicateModels(config) {
  const models = [
    { id: 'meta/meta-llama-3.3-70b-instruct', label: 'Llama 3.3 70B', contextLength: 131072 },
    { id: 'meta/meta-llama-3.1-405b-instruct', label: 'Llama 3.1 405B', contextLength: 131072 },
    { id: 'meta/meta-llama-3.1-8b-instruct', label: 'Llama 3.1 8B', contextLength: 131072 },
    { id: 'meta/meta-llama-3-70b-instruct', label: 'Llama 3 70B', contextLength: 8192 },
    { id: 'meta/meta-llama-3-8b-instruct', label: 'Llama 3 8B', contextLength: 8192 },
  ];
  return models.map(m => buildModelRecord('replicate', config, m.id, m.label, { modelId: m.id, contextLength: m.contextLength }));
}

async function fetchProviderModels(providerKey, config = {}) {
  const key = String(providerKey || '').trim();
  if (key === 'qwenapi') return fetchQwenapiModels(config);
  if (key === 'gemini') return fetchGeminiModels(config);
  if (key === 'zen') return fetchZenModels(config);
  if (key === 'huggingface') return fetchHuggingFaceModels(config);
  if (key === 'deepseek') return fetchDeepseekModels(config);
  if (key === 'custom') return fetchCustomModels(config);
  if (key === 'openai') return fetchOpenAIModels(config);
  if (key === 'anthropic') return fetchAnthropicModels(config);
  if (key === 'groq') return fetchGroqModels(config);
  if (key === 'together') return fetchTogetherModels(config);
  if (key === 'openrouter') return fetchOpenRouterModels(config);
  if (key === 'mistral') return fetchMistralModels(config);
  if (key === 'xai') return fetchXAIModels(config);
  if (key === 'cohere') return fetchCohereModels(config);
  if (key === 'fireworks') return fetchFireworksModels(config);
  if (key === 'perplexity') return fetchPerplexityModels(config);
  if (key === 'ollama') return fetchOllamaModels(config);
  if (key === 'ollamaCloud') return fetchOllamaCloudModels(config);
  if (key === 'github') return fetchGitHubModels(config);
  if (key === 'azure') return fetchAzureModels(config);
  if (key === 'bedrock') return fetchBedrockModels(config);
  if (key === 'vertex') return fetchVertexModels(config);
  if (key === 'cloudflare') return fetchCloudflareModels(config);
  if (key === 'lmstudio') return fetchLMStudioModels(config);
  if (key === 'novita') return fetchNovitaModels(config);
  if (key === 'chutes') return fetchChutesModels(config);
  if (key === 'inference') return fetchInferenceModels(config);
  if (key === 'zyncloud') return fetchZyncloudModels(config);
  if (key === 'replicate') return fetchReplicateModels(config);
  if (config?.baseUrl) return fetchCustomModels(config);
  throw new Error(`Proveedor no soportado: ${key}. No tiene baseUrl configurada. Usa /provider set ${key} baseUrl <url> primero.`);
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
  let config = registry.providers[providerKey];
  if (!config) {
    config = { provider: providerKey };
    registry.providers[providerKey] = config;
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

  if (models.length > 0) {
    const { MODELS } = require('../config');
    const syncedKeys = new Set(models.map(m => m.key));
    const oldKey = global.__zynActiveModel;
    if (oldKey && MODELS[oldKey]?.provider === providerKey && !syncedKeys.has(oldKey)) {
      global.__zynActiveModel = models[0].key;
    }
  }

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
