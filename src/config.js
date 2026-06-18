const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizeLanguage } = require('./i18n');

const APP_NAME = 'Zyn';
const APP_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.join(APP_ROOT, 'data');
const HOME_DIR = os.homedir() || '/root';

const MODELS_FILE = path.join(DATA_ROOT, 'models.json');

const BUILTIN_MODELS = {
  'nemotron': {
    label: 'Nemotron 3 Ultra',
    provider: 'zen',
    zenModel: 'nemotron-3-ultra-free',
    contextLength: 128000,
  },
  'mimo': {
    label: 'Mimo 2.5',
    provider: 'zen',
    zenModel: 'mimo-v2.5-free',
    contextLength: 128000,
  },
  'north-mini': {
    label: 'North Mini Code',
    provider: 'zen',
    zenModel: 'north-mini-code-free',
    contextLength: 128000,
  },
  'deepseek-zen': {
    label: 'DeepSeek V4 Flash (Zen)',
    provider: 'zen',
    zenModel: 'deepseek-v4-flash-free',
    contextLength: 128000,
  },
  'qwen-plus': {
    label: 'Qwen Plus',
    provider: 'qwenapi',
    qwenapiModel: 'qwen-plus',
    contextLength: 131072,
  },
  'qwen-max': {
    label: 'Qwen Max',
    provider: 'qwenapi',
    qwenapiModel: 'qwen-max',
    contextLength: 32000,
  },
  'qwen-turbo': {
    label: 'Qwen Turbo',
    provider: 'qwenapi',
    qwenapiModel: 'qwen-turbo',
    contextLength: 1000000,
  },
  'gemini-flash': {
    label: 'Gemini 2.5 Flash',
    provider: 'gemini',
    geminiModel: 'gemini-2.5-flash',
    contextLength: 1000000,
  },
  'gemini-flash-001': {
    label: 'Gemini 2.5 Flash 001',
    provider: 'gemini',
    geminiModel: 'gemini-2.5-flash-001',
    contextLength: 1000000,
  },
  'gemini-pro': {
    label: 'Gemini 2.5 Pro',
    provider: 'gemini',
    geminiModel: 'gemini-2.5-pro',
    contextLength: 1000000,
  },
  'gemini-flash-lite': {
    label: 'Gemini 2.5 Flash Lite',
    provider: 'gemini',
    geminiModel: 'gemini-2.5-flash-lite',
    contextLength: 1000000,
  },
  'gemini-flash-lite-001': {
    label: 'Gemini 2.5 Flash Lite 001',
    provider: 'gemini',
    geminiModel: 'gemini-2.5-flash-lite-001',
    contextLength: 1000000,
  },
  'gemma-3': {
    label: 'Gemma 3 27B',
    provider: 'gemini',
    geminiModel: 'gemma-3-27b-it',
    contextLength: 128000,
  },
  'hf-ling-2.6-1t': {
    label: 'InclusionAI Ling 2.6 1T',
    provider: 'huggingface',
    huggingfaceModel: 'inclusionai/ling-2.6-1t',
    contextLength: 128000,
  },
  'deepseek': {
    label: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    deepseekChatModel: 'default',
    contextLength: 128000,
  },
};

const SUPPORTED_MODEL_PROVIDERS = new Set(['qwenapi', 'zen', 'gemini', 'huggingface', 'custom', 'deepseek']);
const GEMINI_MODEL_WARNING = '';

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function loadExternalModels() {
  const raw = readJsonFile(MODELS_FILE);
  if (!raw) return {};

  if (Array.isArray(raw)) {
    const output = {};
    for (const item of raw) {
      if (!item?.key || !item?.provider || !SUPPORTED_MODEL_PROVIDERS.has(item.provider)) continue;
      output[item.key] = {
        label: item.label || item.key,
        provider: item.provider,
        ...item,
      };
    }
    return output;
  }

  const rawModels = raw && typeof raw === 'object' && raw.models && typeof raw.models === 'object'
    ? raw.models
    : (raw && typeof raw === 'object' ? raw : {});

  return Object.fromEntries(
    Object.entries(rawModels).filter(([, model]) => SUPPORTED_MODEL_PROVIDERS.has(model?.provider)),
  );
}

const MODELS = {
  ...BUILTIN_MODELS,
  ...loadExternalModels(),
};

const DEFAULT_MODEL_KEY = process.env.ZYN_DEFAULT_MODEL || 'nemotron';
const DEFAULT_LANGUAGE = normalizeLanguage(process.env.ZYN_DEFAULT_LANG || process.env.ZYN_LANGUAGE || process.env.LANG || 'en');

const HUGGINGFACE_TOKEN = process.env.ZYN_HUGGINGFACE_TOKEN || process.env.HF_TOKEN || '';
const GEMINI_API_KEY = process.env.ZYN_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

const MAX_TOOL_STEPS = Number(process.env.ZYN_MAX_TOOL_STEPS || 20);

const REQUEST_TIMEOUT_MS = Number(process.env.ZYN_REQUEST_TIMEOUT_MS || 120000);
const ACTION_LOG_LIMIT = 100;
const MAX_HISTORY_CHARS = 12000;
const MAX_FILE_LINES = 2000;
const KEEP_RECENT_MESSAGES = 50;
const MAX_OUTPUT_CHARS = 8000;
const AUTO_COMPACT_THRESHOLD = 0.85;

const DEFAULT_CONTEXT_LIMIT = 128000;

function countTokens(str) {
  if (!str) return 0;
  return Math.ceil(str.length * 0.25);
}

function estimateContextTokens(state) {
  let total = 0;
  if (state.memorySummary) total += countTokens(state.memorySummary);
  if (Array.isArray(state.history)) {
    for (const msg of state.history) {
      if (msg.content) total += countTokens(msg.content) + 4;
    }
  }
  return total;
}

function getContextLimit(modelKey) {
  const model = MODELS[modelKey];
  return (model && model.contextLength) || DEFAULT_CONTEXT_LIMIT;
}

function stripBase64Images(text) {
  if (!text) return text;
  const base64LineRe = /^[A-Za-z0-9+/]{200,}={0,2}$/gm;
  return text.replace(base64LineRe, '[base64 image data removed]');
}
const PROVIDER_TIMEOUT_RETRY_DELAY_MS = Number(process.env.ZYN_PROVIDER_TIMEOUT_RETRY_DELAY_MS || 5000);
const PROVIDER_TIMEOUT_MAX_ATTEMPTS = 4;
const SESSION_ROOT = path.join(DATA_ROOT, 'chat');
const SESSIONS_DIR = path.join(SESSION_ROOT, 'sessions');
const CURRENT_SESSION_FILE = path.join(SESSION_ROOT, 'current-session.json');
const PERSISTENT_CONFIG_FILE = path.join(SESSION_ROOT, 'persistent-config.json');
const TRANSCRIPTS_DIR = path.join(SESSION_ROOT, 'transcripts');
const EXPORTS_DIR = path.join(SESSION_ROOT, 'exports');
const BACKGROUND_DIR = path.join(SESSION_ROOT, 'background');
const THINK_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const USER_DATA_ROOT = path.join(os.homedir(), '.zyn');
const TASKS_FILE = path.join(USER_DATA_ROOT, 'tasks.json');
const GMAIL_CLIENT_ID = '871944347395-rnpsjsqgbnvlfb05hqk4dc9283olgnh2.apps.googleusercontent.com';
const GMAIL_CLIENT_SECRET = process.env.ZYN_GMAIL_CLIENT_SECRET || '';
const GMAIL_AUTH_FILE = path.join(USER_DATA_ROOT, 'gmail-auth.json');
const PROVIDERS_FILE = path.join(DATA_ROOT, 'providers.json');

function listProvidersFromModels(models = MODELS) {
  const grouped = new Map();
  for (const [key, model] of Object.entries(models)) {
    const provider = model.provider || 'unknown';
    if (!grouped.has(provider)) {
      grouped.set(provider, {
        key: provider,
        label: provider,
        models: [],
      });
    }
    grouped.get(provider).models.push({
      key,
      label: model.label || key,
      ...model,
    });
  }
  return [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key));
}

module.exports = {
  ACTION_LOG_LIMIT,
  APP_NAME,
  APP_ROOT,
  AUTO_COMPACT_THRESHOLD,
  BACKGROUND_DIR,
  BUILTIN_MODELS,
  CURRENT_SESSION_FILE,
  PERSISTENT_CONFIG_FILE,
  DATA_ROOT,
  DEFAULT_LANGUAGE,
  DEFAULT_CONTEXT_LIMIT,
  DEFAULT_MODEL_KEY,
  GEMINI_MODEL_WARNING,
  GMAIL_AUTH_FILE,
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  EXPORTS_DIR,
  HUGGINGFACE_TOKEN,
  GEMINI_API_KEY,
  HOME_DIR,
  KEEP_RECENT_MESSAGES,
  MAX_FILE_LINES,
  MAX_HISTORY_CHARS,
  MAX_OUTPUT_CHARS,
  MAX_TOOL_STEPS,
  MODELS,
  MODELS_FILE,
  PROVIDERS_FILE,
  SUPPORTED_MODEL_PROVIDERS,
  PROVIDER_TIMEOUT_MAX_ATTEMPTS,
  PROVIDER_TIMEOUT_RETRY_DELAY_MS,
  REQUEST_TIMEOUT_MS,
  SESSION_ROOT,
  SESSIONS_DIR,
  TASKS_FILE,
  THINK_FRAMES,
  TRANSCRIPTS_DIR,
  USER_DATA_ROOT,
  countTokens,
  estimateContextTokens,
  getContextLimit,
  listProvidersFromModels,
  stripBase64Images,
};
