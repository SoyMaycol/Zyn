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
  'qwen': {
    label: 'Qwen 3.6 Plus',
    provider: 'qwen',
  },
  'qwen-coder': {
    label: 'Qwen Coder',
    provider: 'qwen',
  },
  'nemotron': {
    label: 'Nemotron 3 Super',
    provider: 'zen',
    zenModel: 'nemotron-3-super-free',
  },
  'minimax': {
    label: 'MiniMax M2.5',
    provider: 'zen',
    zenModel: 'minimax-m2.5-free',
  },
  'trinity': {
    label: 'Trinity Large',
    provider: 'zen',
    zenModel: 'trinity-large-preview-free',
  },
  'ollama-qwen': {
    label: 'Ollama Qwen 2.5',
    provider: 'ollama',
    ollamaModel: 'qwen2.5:latest',
  },
  'ollama-gemma': {
    label: 'Ollama Gemma 3',
    provider: 'ollama',
    ollamaModel: 'gemma3:latest',
  },
  'openai-mini': {
    label: 'OpenAI Compatible Mini',
    provider: 'openai-compatible',
    openaiModel: 'gpt-4o-mini',
  },
};

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
      if (!item?.key || !item?.provider) continue;
      output[item.key] = {
        label: item.label || item.key,
        provider: item.provider,
        ...item,
      };
    }
    return output;
  }

  if (raw && typeof raw === 'object' && raw.models && typeof raw.models === 'object') {
    return raw.models;
  }

  return raw && typeof raw === 'object' ? raw : {};
}

const MODELS = {
  ...BUILTIN_MODELS,
  ...loadExternalModels(),
};

const DEFAULT_MODEL_KEY = process.env.ZYN_DEFAULT_MODEL || 'qwen';
const DEFAULT_LANGUAGE = normalizeLanguage(process.env.ZYN_DEFAULT_LANG || process.env.ZYN_LANGUAGE || process.env.LANG || 'en');

const QWEN_EMAIL = process.env.ZYN_QWEN_EMAIL || 'danielalejandrobasado@gmail.com';
const QWEN_PASSWORD = process.env.ZYN_QWEN_PASSWORD || 'zyzz1234';

const MAX_TOOL_STEPS = Number.POSITIVE_INFINITY;
const MAX_OUTPUT_CHARS = 12000;
const MAX_FILE_LINES = 500;
const ACTION_LOG_LIMIT = 40;
const REQUEST_TIMEOUT_MS = Number(process.env.ZYN_REQUEST_TIMEOUT_MS || 180000);
const MAX_HISTORY_CHARS = 24000;
const KEEP_RECENT_MESSAGES = 12;
const SESSION_ROOT = path.join(DATA_ROOT, 'chat');
const SESSIONS_DIR = path.join(SESSION_ROOT, 'sessions');
const CURRENT_SESSION_FILE = path.join(SESSION_ROOT, 'current-session.json');
const TRANSCRIPTS_DIR = path.join(SESSION_ROOT, 'transcripts');
const EXPORTS_DIR = path.join(SESSION_ROOT, 'exports');
const THINK_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

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
  BUILTIN_MODELS,
  CURRENT_SESSION_FILE,
  DATA_ROOT,
  DEFAULT_LANGUAGE,
  DEFAULT_MODEL_KEY,
  EXPORTS_DIR,
  HOME_DIR,
  KEEP_RECENT_MESSAGES,
  MAX_FILE_LINES,
  MAX_HISTORY_CHARS,
  MAX_OUTPUT_CHARS,
  MAX_TOOL_STEPS,
  MODELS,
  MODELS_FILE,
  QWEN_EMAIL,
  QWEN_PASSWORD,
  REQUEST_TIMEOUT_MS,
  SESSION_ROOT,
  SESSIONS_DIR,
  THINK_FRAMES,
  TRANSCRIPTS_DIR,
  listProvidersFromModels,
};
