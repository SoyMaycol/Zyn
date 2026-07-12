const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizeLanguage } = require('./i18n');

const APP_NAME = 'Zyn';
const APP_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.join(APP_ROOT, 'data');
const HOME_DIR = os.homedir() || process.env.USERPROFILE || process.env.HOME || process.cwd();
const USER_DATA_ROOT = path.resolve(process.env.ZYN_DATA_DIR || path.join(HOME_DIR, '.zyn'));
const USER_CONFIG_ROOT = path.join(USER_DATA_ROOT, 'config');
const USER_WEB_ROOT = path.join(USER_DATA_ROOT, 'web');
const LEGACY_SESSION_ROOT = path.join(DATA_ROOT, 'chat');
const LEGACY_PLUGINS_DIR = path.join(DATA_ROOT, 'plugins');
const LEGACY_WEB_ROOT = path.join(APP_ROOT, 'src', 'web', 'data');

const BUNDLED_MODELS_FILE = path.join(DATA_ROOT, 'models.json');
const MODELS_FILE = path.join(USER_CONFIG_ROOT, 'models.json');

const BUILTIN_MODELS = {
  // ===== Zen (Default - Free) =====
  'nemotron': { label: 'Nemotron 3 Ultra', provider: 'zen', zenModel: 'nemotron-3-ultra-free', contextLength: 128000 },
  'mimo': { label: 'Mimo 2.5', provider: 'zen', zenModel: 'mimo-v2.5-free', contextLength: 128000 },
  'north-mini': { label: 'North Mini Code', provider: 'zen', zenModel: 'north-mini-code-free', contextLength: 128000 },
  'deepseek-zen': { label: 'DeepSeek V4 Flash (Zen)', provider: 'zen', zenModel: 'deepseek-v4-flash-free', contextLength: 128000 },
  'hy3-free': { label: 'Hy3 Free', provider: 'zen', zenModel: 'hy3-free', contextLength: 128000 },

  // ===== Qwen API (Alibaba Cloud) =====
  'qwen-plus': { label: 'Qwen Plus', provider: 'qwenapi', qwenapiModel: 'qwen-plus', contextLength: 131072 },
  'qwen-max': { label: 'Qwen Max', provider: 'qwenapi', qwenapiModel: 'qwen-max', contextLength: 32000 },
  'qwen-turbo': { label: 'Qwen Turbo', provider: 'qwenapi', qwenapiModel: 'qwen-turbo', contextLength: 1000000 },
  'qwen-long': { label: 'Qwen Long', provider: 'qwenapi', qwenapiModel: 'qwen-long', contextLength: 10000000 },

  // ===== Google Gemini =====
  'gemini-2.5-pro': { label: 'Gemini 2.5 Pro', provider: 'gemini', geminiModel: 'gemini-2.5-pro', contextLength: 1000000 },
  'gemini-2.5-flash': { label: 'Gemini 2.5 Flash', provider: 'gemini', geminiModel: 'gemini-2.5-flash', contextLength: 1000000 },
  'gemini-2.5-flash-lite': { label: 'Gemini 2.5 Flash Lite', provider: 'gemini', geminiModel: 'gemini-2.5-flash-lite', contextLength: 1000000 },
  'gemini-2.0-flash': { label: 'Gemini 2.0 Flash', provider: 'gemini', geminiModel: 'gemini-2.0-flash', contextLength: 1000000 },
  'gemini-2.0-flash-lite': { label: 'Gemini 2.0 Flash Lite', provider: 'gemini', geminiModel: 'gemini-2.0-flash-lite', contextLength: 1000000 },
  'gemma-3-27b': { label: 'Gemma 3 27B', provider: 'gemini', geminiModel: 'gemma-3-27b-it', contextLength: 128000 },
  'gemma-3-12b': { label: 'Gemma 3 12B', provider: 'gemini', geminiModel: 'gemma-3-12b-it', contextLength: 128000 },
  'gemma-3-4b': { label: 'Gemma 3 4B', provider: 'gemini', geminiModel: 'gemma-3-4b-it', contextLength: 128000 },

  // ===== Hugging Face =====
  'hf-ling-2.6-1t': { label: 'InclusionAI Ling 2.6 1T', provider: 'huggingface', huggingfaceModel: 'inclusionai/ling-2.6-1t', contextLength: 128000 },

  // ===== DeepSeek =====
  'deepseek-chat': { label: 'DeepSeek V3', provider: 'deepseek', deepseekChatModel: 'deepseek-chat', contextLength: 65536 },
  'deepseek-reasoner': { label: 'DeepSeek R1', provider: 'deepseek', deepseekChatModel: 'deepseek-reasoner', contextLength: 65536 },

  // ===== OpenAI =====
  'gpt-5.5': { label: 'GPT-5.5', provider: 'openai', modelId: 'gpt-5.5', contextLength: 1048576 },
  'gpt-5.4': { label: 'GPT-5.4', provider: 'openai', modelId: 'gpt-5.4', contextLength: 1048576 },
  'gpt-5.4-mini': { label: 'GPT-5.4 Mini', provider: 'openai', modelId: 'gpt-5.4-mini', contextLength: 1048576 },
  'gpt-5.4-nano': { label: 'GPT-5.4 Nano', provider: 'openai', modelId: 'gpt-5.4-nano', contextLength: 1048576 },
  'gpt-5.2': { label: 'GPT-5.2', provider: 'openai', modelId: 'gpt-5.2', contextLength: 1048576 },
  'gpt-5.1': { label: 'GPT-5.1', provider: 'openai', modelId: 'gpt-5.1', contextLength: 1048576 },
  'gpt-5.1-codex': { label: 'GPT-5.1 Codex', provider: 'openai', modelId: 'gpt-5.1-codex', contextLength: 1048576 },
  'gpt-5': { label: 'GPT-5', provider: 'openai', modelId: 'gpt-5', contextLength: 1048576 },
  'gpt-5-mini': { label: 'GPT-5 Mini', provider: 'openai', modelId: 'gpt-5-mini', contextLength: 1048576 },
  'gpt-5-nano': { label: 'GPT-5 Nano', provider: 'openai', modelId: 'gpt-5-nano', contextLength: 1048576 },
  'gpt-4.1': { label: 'GPT-4.1', provider: 'openai', modelId: 'gpt-4.1', contextLength: 1048576 },
  'gpt-4.1-mini': { label: 'GPT-4.1 Mini', provider: 'openai', modelId: 'gpt-4.1-mini', contextLength: 1048576 },
  'gpt-4.1-nano': { label: 'GPT-4.1 Nano', provider: 'openai', modelId: 'gpt-4.1-nano', contextLength: 1048576 },
  'gpt-4o': { label: 'GPT-4o', provider: 'openai', modelId: 'gpt-4o', contextLength: 128000 },
  'gpt-4o-mini': { label: 'GPT-4o Mini', provider: 'openai', modelId: 'gpt-4o-mini', contextLength: 128000 },
  'gpt-4o-search': { label: 'GPT-4o Search', provider: 'openai', modelId: 'gpt-4o-search-preview', contextLength: 128000 },
  'gpt-4o-mini-search': { label: 'GPT-4o Mini Search', provider: 'openai', modelId: 'gpt-4o-mini-search-preview', contextLength: 128000 },
  'gpt-4-turbo': { label: 'GPT-4 Turbo', provider: 'openai', modelId: 'gpt-4-turbo', contextLength: 128000 },
  'gpt-4': { label: 'GPT-4', provider: 'openai', modelId: 'gpt-4', contextLength: 8192 },
  'o4-mini': { label: 'OpenAI o4-mini', provider: 'openai', modelId: 'o4-mini', contextLength: 200000 },
  'o3': { label: 'OpenAI o3', provider: 'openai', modelId: 'o3', contextLength: 200000 },
  'o3-mini': { label: 'OpenAI o3-mini', provider: 'openai', modelId: 'o3-mini', contextLength: 200000 },
  'o1': { label: 'OpenAI o1', provider: 'openai', modelId: 'o1', contextLength: 200000 },
  'o1-mini': { label: 'OpenAI o1-mini', provider: 'openai', modelId: 'o1-mini', contextLength: 128000 },
  'o1-preview': { label: 'OpenAI o1-preview', provider: 'openai', modelId: 'o1-preview', contextLength: 128000 },
  'codex-mini': { label: 'Codex Mini', provider: 'openai', modelId: 'codex-mini-latest', contextLength: 200000 },

  // ===== Anthropic / Claude =====
  'claude-opus-4.8': { label: 'Claude Opus 4.8', provider: 'anthropic', modelId: 'claude-opus-4-8', contextLength: 200000 },
  'claude-opus-4.7': { label: 'Claude Opus 4.7', provider: 'anthropic', modelId: 'claude-opus-4-7', contextLength: 200000 },
  'claude-opus-4.6': { label: 'Claude Opus 4.6', provider: 'anthropic', modelId: 'claude-opus-4-6', contextLength: 200000 },
  'claude-opus-4.5': { label: 'Claude Opus 4.5', provider: 'anthropic', modelId: 'claude-opus-4-5', contextLength: 200000 },
  'claude-opus-4': { label: 'Claude Opus 4', provider: 'anthropic', modelId: 'claude-opus-4-20250514', contextLength: 200000 },
  'claude-sonnet-4.6': { label: 'Claude Sonnet 4.6', provider: 'anthropic', modelId: 'claude-sonnet-4-6', contextLength: 200000 },
  'claude-sonnet-4.5': { label: 'Claude Sonnet 4.5', provider: 'anthropic', modelId: 'claude-sonnet-4-5', contextLength: 200000 },
  'claude-sonnet-4': { label: 'Claude Sonnet 4', provider: 'anthropic', modelId: 'claude-sonnet-4-20250514', contextLength: 200000 },
  'claude-3.7-sonnet': { label: 'Claude 3.7 Sonnet', provider: 'anthropic', modelId: 'claude-3-7-sonnet-20250219', contextLength: 200000 },
  'claude-3.5-sonnet-v2': { label: 'Claude 3.5 Sonnet v2', provider: 'anthropic', modelId: 'claude-3-5-sonnet-20241022', contextLength: 200000 },
  'claude-3.5-sonnet': { label: 'Claude 3.5 Sonnet', provider: 'anthropic', modelId: 'claude-3-5-sonnet-20240620', contextLength: 200000 },
  'claude-haiku-4.5': { label: 'Claude Haiku 4.5', provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001', contextLength: 200000 },
  'claude-3.5-haiku': { label: 'Claude 3.5 Haiku', provider: 'anthropic', modelId: 'claude-3-5-haiku-20241022', contextLength: 200000 },
  'claude-3-haiku': { label: 'Claude 3 Haiku', provider: 'anthropic', modelId: 'claude-3-haiku-20240307', contextLength: 200000 },
  'claude-3-opus': { label: 'Claude 3 Opus', provider: 'anthropic', modelId: 'claude-3-opus-20240229', contextLength: 200000 },

  // ===== Groq (Fast Inference) =====
  'groq-llama-3.3-70b': { label: 'Llama 3.3 70B (Groq)', provider: 'groq', modelId: 'llama-3.3-70b-versatile', contextLength: 131072 },
  'groq-llama-3.1-8b': { label: 'Llama 3.1 8B (Groq)', provider: 'groq', modelId: 'llama-3.1-8b-instant', contextLength: 131072 },
  'groq-llama-4-maverick': { label: 'Llama 4 Maverick (Groq)', provider: 'groq', modelId: 'meta-llama/llama-4-maverick-17b-128e-instruct', contextLength: 131072 },
  'groq-llama-4-scout': { label: 'Llama 4 Scout (Groq)', provider: 'groq', modelId: 'meta-llama/llama-4-scout-17b-16e-instruct', contextLength: 131072 },
  'groq-gpt-oss-120b': { label: 'GPT-OSS 120B (Groq)', provider: 'groq', modelId: 'openai/gpt-oss-120b', contextLength: 131072 },
  'groq-gpt-oss-20b': { label: 'GPT-OSS 20B (Groq)', provider: 'groq', modelId: 'openai/gpt-oss-20b', contextLength: 131072 },
  'groq-deepseek-r1-distill': { label: 'DeepSeek R1 Distill (Groq)', provider: 'groq', modelId: 'deepseek-r1-distill-llama-70b', contextLength: 131072 },
  'groq-qwen3-32b': { label: 'Qwen3 32B (Groq)', provider: 'groq', modelId: 'qwen/qwen3-32b', contextLength: 131072 },
  'groq-qwen3.6-27b': { label: 'Qwen3.6 27B (Groq)', provider: 'groq', modelId: 'qwen/qwen3.6-27b', contextLength: 131072 },
  'groq-mistral-saba': { label: 'Mistral Saba 24B (Groq)', provider: 'groq', modelId: 'mistral-saba-24b', contextLength: 32768 },
  'groq-gemma2-9b': { label: 'Gemma 2 9B (Groq)', provider: 'groq', modelId: 'gemma2-9b-it', contextLength: 8192 },
  'groq-gemma-7b': { label: 'Gemma 7B (Groq)', provider: 'groq', modelId: 'gemma-7b-it', contextLength: 8192 },
  'groq-compound': { label: 'Groq Compound', provider: 'groq', modelId: 'groq/compound', contextLength: 131072 },
  'groq-compound-mini': { label: 'Groq Compound Mini', provider: 'groq', modelId: 'groq/compound-mini', contextLength: 131072 },

  // ===== Together AI =====
  'together-deepseek-v3.2': { label: 'DeepSeek V3.2 (Together)', provider: 'together', modelId: 'deepseek-ai/DeepSeek-V3.2', contextLength: 163840 },
  'together-deepseek-v3.1': { label: 'DeepSeek V3.1 (Together)', provider: 'together', modelId: 'deepseek-ai/DeepSeek-V3.1', contextLength: 163840 },
  'together-deepseek-r1': { label: 'DeepSeek R1 (Together)', provider: 'together', modelId: 'deepseek-ai/DeepSeek-R1', contextLength: 131072 },
  'together-qwen3.7-max': { label: 'Qwen3.7 Max (Together)', provider: 'together', modelId: 'Qwen/Qwen3.7-Max', contextLength: 131072 },
  'together-qwen3.6-plus': { label: 'Qwen3.6 Plus (Together)', provider: 'together', modelId: 'Qwen/Qwen3.6-Plus', contextLength: 1000000 },
  'together-qwen3.5-397b': { label: 'Qwen3.5 397B (Together)', provider: 'together', modelId: 'Qwen/Qwen3.5-397B-A17B', contextLength: 131072 },
  'together-qwen3.5-9b': { label: 'Qwen3.5 9B (Together)', provider: 'together', modelId: 'Qwen/Qwen3.5-9B', contextLength: 262144 },
  'together-kimi-k2.7': { label: 'Kimi K2.7 (Together)', provider: 'together', modelId: 'moonshotai/Kimi-K2.7-Code', contextLength: 262144 },
  'together-kimi-k2.6': { label: 'Kimi K2.6 (Together)', provider: 'together', modelId: 'moonshotai/Kimi-K2.6', contextLength: 262144 },
  'together-glm-5.2': { label: 'GLM-5.2 (Together)', provider: 'together', modelId: 'zhipu/GLM-5.2', contextLength: 262144 },
  'together-gpt-oss-120b': { label: 'GPT-OSS 120B (Together)', provider: 'together', modelId: 'openai/gpt-oss-120b', contextLength: 131072 },
  'together-gpt-oss-20b': { label: 'GPT-OSS 20B (Together)', provider: 'together', modelId: 'openai/gpt-oss-20b', contextLength: 131072 },
  'together-minimax-m3': { label: 'Minimax M3 (Together)', provider: 'together', modelId: 'MiniMaxAI/MiniMax-M3', contextLength: 524288 },
  'together-llama-4-maverick': { label: 'Llama 4 Maverick (Together)', provider: 'together', modelId: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct', contextLength: 131072 },
  'together-llama-4-scout': { label: 'Llama 4 Scout (Together)', provider: 'together', modelId: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', contextLength: 131072 },
  'together-llama-3.3-70b': { label: 'Llama 3.3 70B (Together)', provider: 'together', modelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', contextLength: 131072 },
  'together-llama-3.1-405b': { label: 'Llama 3.1 405B (Together)', provider: 'together', modelId: 'meta-llama/Llama-3.1-405B-Instruct-Turbo', contextLength: 131072 },
  'together-gemma-3-27b': { label: 'Gemma 3 27B (Together)', provider: 'together', modelId: 'google/gemma-3-27b-it', contextLength: 131072 },

  // ===== OpenRouter (Complete Catalog) =====
  // --- Meta ---
  'openrouter-llama-4-maverick': { label: 'Llama 4 Maverick (OpenRouter)', provider: 'openrouter', modelId: 'meta-llama/llama-4-maverick', contextLength: 1048576 },
  'openrouter-llama-4-scout': { label: 'Llama 4 Scout (OpenRouter)', provider: 'openrouter', modelId: 'meta-llama/llama-4-scout', contextLength: 10000000 },
  'openrouter-llama-3.3-70b': { label: 'Llama 3.3 70B (OpenRouter)', provider: 'openrouter', modelId: 'meta-llama/llama-3.3-70b-instruct', contextLength: 131072 },
  'openrouter-llama-3.3-70b-free': { label: 'Llama 3.3 70B Free (OpenRouter)', provider: 'openrouter', modelId: 'meta-llama/llama-3.3-70b-instruct:free', contextLength: 131072 },
  'openrouter-llama-3.1-70b': { label: 'Llama 3.1 70B (OpenRouter)', provider: 'openrouter', modelId: 'meta-llama/llama-3.1-70b-instruct', contextLength: 131072 },
  'openrouter-llama-3.1-8b': { label: 'Llama 3.1 8B (OpenRouter)', provider: 'openrouter', modelId: 'meta-llama/llama-3.1-8b-instruct', contextLength: 131072 },
  'openrouter-llama-3.2-3b-free': { label: 'Llama 3.2 3B Free (OpenRouter)', provider: 'openrouter', modelId: 'meta-llama/llama-3.2-3b-instruct:free', contextLength: 131072 },
  'openrouter-llama-3.2-11b-vision': { label: 'Llama 3.2 11B Vision (OpenRouter)', provider: 'openrouter', modelId: 'meta-llama/llama-3.2-11b-vision-instruct', contextLength: 131072 },
  'openrouter-llama-3.2-3b': { label: 'Llama 3.2 3B (OpenRouter)', provider: 'openrouter', modelId: 'meta-llama/llama-3.2-3b-instruct', contextLength: 131072 },
  'openrouter-llama-3.2-1b': { label: 'Llama 3.2 1B (OpenRouter)', provider: 'openrouter', modelId: 'meta-llama/llama-3.2-1b-instruct', contextLength: 131072 },
  'openrouter-llama-3-8b': { label: 'Llama 3 8B (OpenRouter)', provider: 'openrouter', modelId: 'meta-llama/llama-3-8b-instruct', contextLength: 8192 },
  'openrouter-llama-guard-4-12b': { label: 'Llama Guard 4 12B (OpenRouter)', provider: 'openrouter', modelId: 'meta-llama/llama-guard-4-12b', contextLength: 163840 },

  // --- OpenAI ---
  'openrouter-auto': { label: 'OpenRouter Auto', provider: 'openrouter', modelId: 'openrouter/auto', contextLength: 2000000 },
  'openrouter-gpt-5.5': { label: 'GPT-5.5 (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-5.5', contextLength: 1048576 },
  'openrouter-gpt-5.5-pro': { label: 'GPT-5.5 Pro (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-5.5-pro', contextLength: 1048576 },
  'openrouter-gpt-5.4': { label: 'GPT-5.4 (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-5.4', contextLength: 1048576 },
  'openrouter-gpt-5.4-mini': { label: 'GPT-5.4 Mini (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-5.4-mini', contextLength: 400000 },
  'openrouter-gpt-5.4-nano': { label: 'GPT-5.4 Nano (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-5.4-nano', contextLength: 400000 },
  'openrouter-gpt-5.2': { label: 'GPT-5.2 (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-5.2', contextLength: 400000 },
  'openrouter-gpt-5.2-pro': { label: 'GPT-5.2 Pro (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-5.2-pro', contextLength: 400000 },
  'openrouter-gpt-5.1': { label: 'GPT-5.1 (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-5.1', contextLength: 400000 },
  'openrouter-gpt-5': { label: 'GPT-5 (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-5', contextLength: 400000 },
  'openrouter-gpt-5-mini': { label: 'GPT-5 Mini (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-5-mini', contextLength: 400000 },
  'openrouter-gpt-5-nano': { label: 'GPT-5 Nano (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-5-nano', contextLength: 400000 },
  'openrouter-gpt-5-pro': { label: 'GPT-5 Pro (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-5-pro', contextLength: 400000 },
  'openrouter-gpt-4.1': { label: 'GPT-4.1 (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-4.1', contextLength: 1048576 },
  'openrouter-gpt-4.1-mini': { label: 'GPT-4.1 Mini (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-4.1-mini', contextLength: 1048576 },
  'openrouter-gpt-4.1-nano': { label: 'GPT-4.1 Nano (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-4.1-nano', contextLength: 1048576 },
  'openrouter-gpt-4o': { label: 'GPT-4o (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-4o', contextLength: 128000 },
  'openrouter-gpt-4o-mini': { label: 'GPT-4o Mini (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-4o-mini', contextLength: 128000 },
  'openrouter-o3': { label: 'o3 (OpenRouter)', provider: 'openrouter', modelId: 'openai/o3', contextLength: 200000 },
  'openrouter-o3-pro': { label: 'o3 Pro (OpenRouter)', provider: 'openrouter', modelId: 'openai/o3-pro', contextLength: 200000 },
  'openrouter-o4-mini': { label: 'o4 Mini (OpenRouter)', provider: 'openrouter', modelId: 'openai/o4-mini', contextLength: 200000 },
  'openrouter-o4-mini-high': { label: 'o4 Mini High (OpenRouter)', provider: 'openrouter', modelId: 'openai/o4-mini-high', contextLength: 200000 },
  'openrouter-o1': { label: 'o1 (OpenRouter)', provider: 'openrouter', modelId: 'openai/o1', contextLength: 200000 },
  'openrouter-o1-pro': { label: 'o1 Pro (OpenRouter)', provider: 'openrouter', modelId: 'openai/o1-pro', contextLength: 200000 },
  'openrouter-gpt-oss-120b': { label: 'GPT-OSS 120B (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-oss-120b', contextLength: 131072 },
  'openrouter-gpt-oss-120b-free': { label: 'GPT-OSS 120B Free (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-oss-120b:free', contextLength: 131072 },
  'openrouter-gpt-oss-20b': { label: 'GPT-OSS 20B (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-oss-20b', contextLength: 131072 },
  'openrouter-gpt-oss-20b-free': { label: 'GPT-OSS 20B Free (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-oss-20b:free', contextLength: 131072 },

  // --- Anthropic ---
  'openrouter-claude-opus-4.8': { label: 'Claude Opus 4.8 (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-opus-4.8', contextLength: 1048576 },
  'openrouter-claude-opus-4.8-fast': { label: 'Claude Opus 4.8 Fast (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-opus-4.8-fast', contextLength: 1048576 },
  'openrouter-claude-opus-4.7': { label: 'Claude Opus 4.7 (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-opus-4.7', contextLength: 1048576 },
  'openrouter-claude-opus-4.7-fast': { label: 'Claude Opus 4.7 Fast (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-opus-4.7-fast', contextLength: 1048576 },
  'openrouter-claude-opus-4.6': { label: 'Claude Opus 4.6 (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-opus-4.6', contextLength: 1048576 },
  'openrouter-claude-opus-4.5': { label: 'Claude Opus 4.5 (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-opus-4.5', contextLength: 200000 },
  'openrouter-claude-opus-4': { label: 'Claude Opus 4 (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-opus-4', contextLength: 200000 },
  'openrouter-claude-opus-4.1': { label: 'Claude Opus 4.1 (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-opus-4.1', contextLength: 200000 },
  'openrouter-claude-sonnet-5': { label: 'Claude Sonnet 5 (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-sonnet-5', contextLength: 1048576 },
  'openrouter-claude-sonnet-4.6': { label: 'Claude Sonnet 4.6 (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-sonnet-4.6', contextLength: 1048576 },
  'openrouter-claude-sonnet-4.5': { label: 'Claude Sonnet 4.5 (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-sonnet-4.5', contextLength: 1048576 },
  'openrouter-claude-sonnet-4': { label: 'Claude Sonnet 4 (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-sonnet-4', contextLength: 1048576 },
  'openrouter-claude-haiku-4.5': { label: 'Claude Haiku 4.5 (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-haiku-4.5', contextLength: 200000 },
  'openrouter-claude-3-haiku': { label: 'Claude 3 Haiku (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-3-haiku', contextLength: 200000 },
  'openrouter-claude-fable-5': { label: 'Claude Fable 5 (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-fable-5', contextLength: 1048576 },

  // --- Google ---
  'openrouter-gemini-3.5-flash': { label: 'Gemini 3.5 Flash (OpenRouter)', provider: 'openrouter', modelId: 'google/gemini-3.5-flash', contextLength: 1048576 },
  'openrouter-gemini-3.1-flash-lite': { label: 'Gemini 3.1 Flash Lite (OpenRouter)', provider: 'openrouter', modelId: 'google/gemini-3.1-flash-lite', contextLength: 1048576 },
  'openrouter-gemini-3-pro-image': { label: 'Gemini 3 Pro Image (OpenRouter)', provider: 'openrouter', modelId: 'google/gemini-3-pro-image', contextLength: 65536 },
  'openrouter-gemini-3-flash-preview': { label: 'Gemini 3 Flash Preview (OpenRouter)', provider: 'openrouter', modelId: 'google/gemini-3-flash-preview', contextLength: 1048576 },
  'openrouter-gemini-2.5-pro': { label: 'Gemini 2.5 Pro (OpenRouter)', provider: 'openrouter', modelId: 'google/gemini-2.5-pro', contextLength: 1048576 },
  'openrouter-gemini-2.5-flash': { label: 'Gemini 2.5 Flash (OpenRouter)', provider: 'openrouter', modelId: 'google/gemini-2.5-flash', contextLength: 1048576 },
  'openrouter-gemini-2.5-flash-lite': { label: 'Gemini 2.5 Flash Lite (OpenRouter)', provider: 'openrouter', modelId: 'google/gemini-2.5-flash-lite', contextLength: 1048576 },
  'openrouter-gemini-2.5-flash-image': { label: 'Gemini 2.5 Flash Image (OpenRouter)', provider: 'openrouter', modelId: 'google/gemini-2.5-flash-image', contextLength: 32768 },
  'openrouter-gemma-4-31b': { label: 'Gemma 4 31B (OpenRouter)', provider: 'openrouter', modelId: 'google/gemma-4-31b-it', contextLength: 262144 },
  'openrouter-gemma-4-31b-free': { label: 'Gemma 4 31B Free (OpenRouter)', provider: 'openrouter', modelId: 'google/gemma-4-31b-it:free', contextLength: 262144 },
  'openrouter-gemma-4-26b': { label: 'Gemma 4 26B (OpenRouter)', provider: 'openrouter', modelId: 'google/gemma-4-26b-a4b-it', contextLength: 262144 },
  'openrouter-gemma-4-26b-free': { label: 'Gemma 4 26B Free (OpenRouter)', provider: 'openrouter', modelId: 'google/gemma-4-26b-a4b-it:free', contextLength: 262144 },

  // --- DeepSeek ---
  'openrouter-deepseek-v4-pro': { label: 'DeepSeek V4 Pro (OpenRouter)', provider: 'openrouter', modelId: 'deepseek/deepseek-v4-pro', contextLength: 1048576 },
  'openrouter-deepseek-v4-flash': { label: 'DeepSeek V4 Flash (OpenRouter)', provider: 'openrouter', modelId: 'deepseek/deepseek-v4-flash', contextLength: 1048576 },
  'openrouter-deepseek-v3.2': { label: 'DeepSeek V3.2 (OpenRouter)', provider: 'openrouter', modelId: 'deepseek/deepseek-v3.2', contextLength: 131072 },
  'openrouter-deepseek-v3.2-exp': { label: 'DeepSeek V3.2 Exp (OpenRouter)', provider: 'openrouter', modelId: 'deepseek/deepseek-v3.2-exp', contextLength: 163840 },
  'openrouter-deepseek-v3.1-terminus': { label: 'DeepSeek V3.1 Terminus (OpenRouter)', provider: 'openrouter', modelId: 'deepseek/deepseek-v3.1-terminus', contextLength: 163840 },
  'openrouter-deepseek-v3.1': { label: 'DeepSeek V3.1 (OpenRouter)', provider: 'openrouter', modelId: 'deepseek/deepseek-chat-v3.1', contextLength: 163840 },
  'openrouter-deepseek-v3-0324': { label: 'DeepSeek V3 0324 (OpenRouter)', provider: 'openrouter', modelId: 'deepseek/deepseek-chat-v3-0324', contextLength: 163840 },
  'openrouter-deepseek-r1': { label: 'DeepSeek R1 (OpenRouter)', provider: 'openrouter', modelId: 'deepseek/deepseek-r1', contextLength: 163840 },
  'openrouter-deepseek-r1-0528': { label: 'DeepSeek R1 0528 (OpenRouter)', provider: 'openrouter', modelId: 'deepseek/deepseek-r1-0528', contextLength: 163840 },
  'openrouter-deepseek-r1-distill-70b': { label: 'DeepSeek R1 Distill 70B (OpenRouter)', provider: 'openrouter', modelId: 'deepseek/deepseek-r1-distill-llama-70b', contextLength: 131072 },
  'openrouter-deepseek-chat': { label: 'DeepSeek Chat (OpenRouter)', provider: 'openrouter', modelId: 'deepseek/deepseek-chat', contextLength: 131072 },

  // --- Qwen ---
  'openrouter-qwen3.7-max': { label: 'Qwen 3.7 Max (OpenRouter)', provider: 'openrouter', modelId: 'qwen/qwen3.7-max', contextLength: 1048576 },
  'openrouter-qwen3.7-plus': { label: 'Qwen 3.7 Plus (OpenRouter)', provider: 'openrouter', modelId: 'qwen/qwen3.7-plus', contextLength: 1048576 },
  'openrouter-qwen3.6-max-preview': { label: 'Qwen 3.6 Max Preview (OpenRouter)', provider: 'openrouter', modelId: 'qwen/qwen3.6-max-preview', contextLength: 262144 },
  'openrouter-qwen3.5-397b': { label: 'Qwen 3.5 397B (OpenRouter)', provider: 'openrouter', modelId: 'qwen/qwen3.5-397b-a17b', contextLength: 262144 },
  'openrouter-qwen3.5-flash': { label: 'Qwen 3.5 Flash (OpenRouter)', provider: 'openrouter', modelId: 'qwen/qwen3.5-flash-02-23', contextLength: 1048576 },
  'openrouter-qwen3.5-plus': { label: 'Qwen 3.5 Plus (OpenRouter)', provider: 'openrouter', modelId: 'qwen/qwen3.5-plus-02-15', contextLength: 1048576 },
  'openrouter-qwen3-coder': { label: 'Qwen 3 Coder (OpenRouter)', provider: 'openrouter', modelId: 'qwen/qwen3-coder', contextLength: 1048576 },
  'openrouter-qwen3-coder-flash': { label: 'Qwen 3 Coder Flash (OpenRouter)', provider: 'openrouter', modelId: 'qwen/qwen3-coder-flash', contextLength: 1048576 },
  'openrouter-qwen3-coder-free': { label: 'Qwen 3 Coder Free (OpenRouter)', provider: 'openrouter', modelId: 'qwen/qwen3-coder:free', contextLength: 1048576 },
  'openrouter-qwen3-235b': { label: 'Qwen 3 235B (OpenRouter)', provider: 'openrouter', modelId: 'qwen/qwen3-235b-a22b', contextLength: 131072 },
  'openrouter-qwen3-235b-2507': { label: 'Qwen 3 235B 2507 (OpenRouter)', provider: 'openrouter', modelId: 'qwen/qwen3-235b-a22b-2507', contextLength: 262144 },
  'openrouter-qwen3-32b': { label: 'Qwen 3 32B (OpenRouter)', provider: 'openrouter', modelId: 'qwen/qwen3-32b', contextLength: 131072 },
  'openrouter-qwen3-max': { label: 'Qwen 3 Max (OpenRouter)', provider: 'openrouter', modelId: 'qwen/qwen3-max', contextLength: 262144 },
  'openrouter-qwen-plus': { label: 'Qwen Plus (OpenRouter)', provider: 'openrouter', modelId: 'qwen/qwen-plus', contextLength: 1048576 },

  // --- Mistral ---
  'openrouter-mistral-large': { label: 'Mistral Large (OpenRouter)', provider: 'openrouter', modelId: 'mistralai/mistral-large-2512', contextLength: 262144 },
  'openrouter-mistral-medium-3.5': { label: 'Mistral Medium 3.5 (OpenRouter)', provider: 'openrouter', modelId: 'mistralai/mistral-medium-3.5', contextLength: 262144 },
  'openrouter-mistral-medium-3': { label: 'Mistral Medium 3 (OpenRouter)', provider: 'openrouter', modelId: 'mistralai/mistral-medium-3', contextLength: 131072 },
  'openrouter-mistral-small': { label: 'Mistral Small (OpenRouter)', provider: 'openrouter', modelId: 'mistralai/mistral-small-2603', contextLength: 262144 },
  'openrouter-mistral-small-3.2-24b': { label: 'Mistral Small 3.2 24B (OpenRouter)', provider: 'openrouter', modelId: 'mistralai/mistral-small-3.2-24b-instruct', contextLength: 131072 },
  'openrouter-mistral-nemo': { label: 'Mistral Nemo (OpenRouter)', provider: 'openrouter', modelId: 'mistralai/mistral-nemo', contextLength: 131072 },
  'openrouter-codestral': { label: 'Codestral (OpenRouter)', provider: 'openrouter', modelId: 'mistralai/codestral-2508', contextLength: 262144 },
  'openrouter-devstral': { label: 'Devstral (OpenRouter)', provider: 'openrouter', modelId: 'mistralai/devstral-2512', contextLength: 262144 },
  'openrouter-voxtral-small': { label: 'Voxtral Small 24B (OpenRouter)', provider: 'openrouter', modelId: 'mistralai/voxtral-small-24b-2507', contextLength: 32768 },

  // --- Amazon ---
  'openrouter-nova-pro': { label: 'Nova Pro (OpenRouter)', provider: 'openrouter', modelId: 'amazon/nova-pro-v1', contextLength: 300000 },
  'openrouter-nova-lite': { label: 'Nova Lite (OpenRouter)', provider: 'openrouter', modelId: 'amazon/nova-lite-v1', contextLength: 300000 },
  'openrouter-nova-2-lite': { label: 'Nova 2 Lite (OpenRouter)', provider: 'openrouter', modelId: 'amazon/nova-2-lite-v1', contextLength: 1048576 },
  'openrouter-nova-micro': { label: 'Nova Micro (OpenRouter)', provider: 'openrouter', modelId: 'amazon/nova-micro-v1', contextLength: 131072 },
  'openrouter-nova-premier': { label: 'Nova Premier (OpenRouter)', provider: 'openrouter', modelId: 'amazon/nova-premier-v1', contextLength: 1048576 },

  // --- xAI ---
  'openrouter-grok-4.20': { label: 'Grok 4.20 (OpenRouter)', provider: 'openrouter', modelId: 'x-ai/grok-4.20', contextLength: 2000000 },
  'openrouter-grok-4.3': { label: 'Grok 4.3 (OpenRouter)', provider: 'openrouter', modelId: 'x-ai/grok-4.3', contextLength: 1048576 },
  'openrouter-grok-build': { label: 'Grok Build 0.1 (OpenRouter)', provider: 'openrouter', modelId: 'x-ai/grok-build-0.1', contextLength: 262144 },

  // --- MiniMax ---
  'openrouter-minimax-m3': { label: 'MiniMax M3 (OpenRouter)', provider: 'openrouter', modelId: 'minimax/minimax-m3', contextLength: 1048576 },
  'openrouter-minimax-m2.5': { label: 'MiniMax M2.5 (OpenRouter)', provider: 'openrouter', modelId: 'minimax/minimax-m2.5', contextLength: 204800 },
  'openrouter-minimax-m2': { label: 'MiniMax M2 (OpenRouter)', provider: 'openrouter', modelId: 'minimax/minimax-m2', contextLength: 204800 },
  'openrouter-minimax-m1': { label: 'MiniMax M1 (OpenRouter)', provider: 'openrouter', modelId: 'minimax/minimax-m1', contextLength: 1048576 },
  'openrouter-minimax-01': { label: 'MiniMax 01 (OpenRouter)', provider: 'openrouter', modelId: 'minimax/minimax-01', contextLength: 1048576 },

  // --- Moonshot / Kimi ---
  'openrouter-kimi-k2.7-code': { label: 'Kimi K2.7 Code (OpenRouter)', provider: 'openrouter', modelId: 'moonshotai/kimi-k2.7-code', contextLength: 262144 },
  'openrouter-kimi-k2.6': { label: 'Kimi K2.6 (OpenRouter)', provider: 'openrouter', modelId: 'moonshotai/kimi-k2.6', contextLength: 262144 },
  'openrouter-kimi-k2.5': { label: 'Kimi K2.5 (OpenRouter)', provider: 'openrouter', modelId: 'moonshotai/kimi-k2.5', contextLength: 262144 },
  'openrouter-kimi-k2': { label: 'Kimi K2 (OpenRouter)', provider: 'openrouter', modelId: 'moonshotai/kimi-k2', contextLength: 131072 },

  // --- NVIDIA ---
  'openrouter-nemotron-3-ultra': { label: 'Nemotron 3 Ultra 550B (OpenRouter)', provider: 'openrouter', modelId: 'nvidia/nemotron-3-ultra-550b-a55b', contextLength: 1048576 },
  'openrouter-nemotron-3-ultra-free': { label: 'Nemotron 3 Ultra Free (OpenRouter)', provider: 'openrouter', modelId: 'nvidia/nemotron-3-ultra-550b-a55b:free', contextLength: 1048576 },
  'openrouter-nemotron-3-super': { label: 'Nemotron 3 Super 120B (OpenRouter)', provider: 'openrouter', modelId: 'nvidia/nemotron-3-super-120b-a12b', contextLength: 1048576 },
  'openrouter-nemotron-3-super-free': { label: 'Nemotron 3 Super Free (OpenRouter)', provider: 'openrouter', modelId: 'nvidia/nemotron-3-super-120b-a12b:free', contextLength: 1048576 },
  'openrouter-nemotron-3-nano': { label: 'Nemotron 3 Nano 30B (OpenRouter)', provider: 'openrouter', modelId: 'nvidia/nemotron-3-nano-30b-a3b', contextLength: 262144 },
  'openrouter-nemotron-3-nano-free': { label: 'Nemotron 3 Nano Free (OpenRouter)', provider: 'openrouter', modelId: 'nvidia/nemotron-3-nano-30b-a3b:free', contextLength: 262144 },
  'openrouter-nemotron-super-49b': { label: 'Nemotron Super 49B (OpenRouter)', provider: 'openrouter', modelId: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', contextLength: 131072 },

  // --- Cohere ---
  'openrouter-cohere-command-a': { label: 'Command A (OpenRouter)', provider: 'openrouter', modelId: 'cohere/command-a', contextLength: 262144 },
  'openrouter-cohere-north-mini-code-free': { label: 'North Mini Code Free (OpenRouter)', provider: 'openrouter', modelId: 'cohere/north-mini-code:free', contextLength: 262144 },
  'openrouter-cohere-command-r-plus': { label: 'Command R+ (OpenRouter)', provider: 'openrouter', modelId: 'cohere/command-r-plus-08-2024', contextLength: 131072 },
  'openrouter-cohere-command-r': { label: 'Command R (OpenRouter)', provider: 'openrouter', modelId: 'cohere/command-r-08-2024', contextLength: 131072 },
  'openrouter-cohere-command-r7b': { label: 'Command R7B (OpenRouter)', provider: 'openrouter', modelId: 'cohere/command-r7b-12-2024', contextLength: 131072 },

  // --- Perplexity ---
  'openrouter-perplexity-sonar': { label: 'Sonar (OpenRouter)', provider: 'openrouter', modelId: 'perplexity/sonar', contextLength: 127000 },
  'openrouter-perplexity-sonar-pro': { label: 'Sonar Pro (OpenRouter)', provider: 'openrouter', modelId: 'perplexity/sonar-pro', contextLength: 200000 },
  'openrouter-perplexity-sonar-deep-research': { label: 'Sonar Deep Research (OpenRouter)', provider: 'openrouter', modelId: 'perplexity/sonar-deep-research', contextLength: 128000 },
  'openrouter-perplexity-sonar-reasoning-pro': { label: 'Sonar Reasoning Pro (OpenRouter)', provider: 'openrouter', modelId: 'perplexity/sonar-reasoning-pro', contextLength: 128000 },

  // --- NousResearch ---
  'openrouter-hermes-4-405b': { label: 'Hermes 4 405B (OpenRouter)', provider: 'openrouter', modelId: 'nousresearch/hermes-4-405b', contextLength: 131072 },
  'openrouter-hermes-4-70b': { label: 'Hermes 4 70B (OpenRouter)', provider: 'openrouter', modelId: 'nousresearch/hermes-4-70b', contextLength: 131072 },
  'openrouter-hermes-3-405b': { label: 'Hermes 3 405B (OpenRouter)', provider: 'openrouter', modelId: 'nousresearch/hermes-3-llama-3.1-405b', contextLength: 131072 },

  // --- Xiaomi ---
  'openrouter-mimo-v2.5': { label: 'Mimo V2.5 (OpenRouter)', provider: 'openrouter', modelId: 'xiaomi/mimo-v2.5', contextLength: 1048576 },
  'openrouter-mimo-v2.5-pro': { label: 'Mimo V2.5 Pro (OpenRouter)', provider: 'openrouter', modelId: 'xiaomi/mimo-v2.5-pro', contextLength: 1048576 },

  // --- Z AI / GLM ---
  'openrouter-glm-5.2': { label: 'GLM 5.2 (OpenRouter)', provider: 'openrouter', modelId: 'z-ai/glm-5.2', contextLength: 1048576 },
  'openrouter-glm-5-turbo': { label: 'GLM 5 Turbo (OpenRouter)', provider: 'openrouter', modelId: 'z-ai/glm-5-turbo', contextLength: 262144 },
  'openrouter-glm-5': { label: 'GLM 5 (OpenRouter)', provider: 'openrouter', modelId: 'z-ai/glm-5', contextLength: 202000 },
  'openrouter-glm-4.7': { label: 'GLM 4.7 (OpenRouter)', provider: 'openrouter', modelId: 'z-ai/glm-4.7', contextLength: 202000 },
  'openrouter-glm-4.7-flash': { label: 'GLM 4.7 Flash (OpenRouter)', provider: 'openrouter', modelId: 'z-ai/glm-4.7-flash', contextLength: 202000 },
  'openrouter-glm-4.6': { label: 'GLM 4.6 (OpenRouter)', provider: 'openrouter', modelId: 'z-ai/glm-4.6', contextLength: 202000 },
  'openrouter-glm-4.5': { label: 'GLM 4.5 (OpenRouter)', provider: 'openrouter', modelId: 'z-ai/glm-4.5', contextLength: 131072 },
  'openrouter-glm-4.5v': { label: 'GLM 4.5V (OpenRouter)', provider: 'openrouter', modelId: 'z-ai/glm-4.5v', contextLength: 65536 },
  'openrouter-glm-4.5-air': { label: 'GLM 4.5 Air (OpenRouter)', provider: 'openrouter', modelId: 'z-ai/glm-4.5-air', contextLength: 131072 },

  // --- ByteDance ---
  'openrouter-seed-1.6': { label: 'Seed 1.6 (OpenRouter)', provider: 'openrouter', modelId: 'bytedance-seed/seed-1.6', contextLength: 262144 },
  'openrouter-seed-1.6-flash': { label: 'Seed 1.6 Flash (OpenRouter)', provider: 'openrouter', modelId: 'bytedance-seed/seed-1.6-flash', contextLength: 262144 },
  'openrouter-seed-2.0-lite': { label: 'Seed 2.0 Lite (OpenRouter)', provider: 'openrouter', modelId: 'bytedance-seed/seed-2.0-lite', contextLength: 262144 },
  'openrouter-seed-2.0-mini': { label: 'Seed 2.0 Mini (OpenRouter)', provider: 'openrouter', modelId: 'bytedance-seed/seed-2.0-mini', contextLength: 262144 },

  // --- Arcee ---
  'openrouter-arcee-trinity-large': { label: 'Trinity Large Thinking (OpenRouter)', provider: 'openrouter', modelId: 'arcee-ai/trinity-large-thinking', contextLength: 262144 },
  'openrouter-arcee-virtuoso-large': { label: 'Virtuoso Large (OpenRouter)', provider: 'openrouter', modelId: 'arcee-ai/virtuoso-large', contextLength: 131072 },
  'openrouter-arcee-coder-large': { label: 'Coder Large (OpenRouter)', provider: 'openrouter', modelId: 'arcee-ai/coder-large', contextLength: 32768 },
  'openrouter-arcee-trinity-mini': { label: 'Trinity Mini (OpenRouter)', provider: 'openrouter', modelId: 'arcee-ai/trinity-mini', contextLength: 131072 },

  // --- Others ---
  'openrouter-inception-mercury-2': { label: 'Mercury 2 (OpenRouter)', provider: 'openrouter', modelId: 'inception/mercury-2', contextLength: 131072 },
  'openrouter-ai21-jamba-large': { label: 'Jamba Large 1.7 (OpenRouter)', provider: 'openrouter', modelId: 'ai21/jamba-large-1.7', contextLength: 262144 },
  'openrouter-deepcogito-cogito-v2.1': { label: 'Cogito V2.1 671B (OpenRouter)', provider: 'openrouter', modelId: 'deepcogito/cogito-v2.1-671b', contextLength: 131072 },
  'openrouter-reka-flash-3': { label: 'Reka Flash 3 (OpenRouter)', provider: 'openrouter', modelId: 'rekaai/reka-flash-3', contextLength: 65536 },
  'openrouter-solar-pro-3': { label: 'Solar Pro 3 (OpenRouter)', provider: 'openrouter', modelId: 'upstage/solar-pro-3', contextLength: 131072 },
  'openrouter-writer-palmyra-x5': { label: 'Palmyra X5 (OpenRouter)', provider: 'openrouter', modelId: 'writer/palmyra-x5', contextLength: 1048576 },
  'openrouter-ibm-granite-4.1-8b': { label: 'Granite 4.1 8B (OpenRouter)', provider: 'openrouter', modelId: 'ibm-granite/granite-4.1-8b', contextLength: 131072 },
  'openrouter-ibm-granite-4.0-h-micro': { label: 'Granite 4.0 H Micro (OpenRouter)', provider: 'openrouter', modelId: 'ibm-granite/granite-4.0-h-micro', contextLength: 131072 },
  'openrouter-inception-mercury': { label: 'Mercury (OpenRouter)', provider: 'openrouter', modelId: 'inception/mercury', contextLength: 131072 },
  'openrouter-microsoft-phi-4': { label: 'Phi 4 (OpenRouter)', provider: 'openrouter', modelId: 'microsoft/phi-4', contextLength: 16384 },
  'openrouter-microsoft-wizardlm-2': { label: 'WizardLM 2 8x22B (OpenRouter)', provider: 'openrouter', modelId: 'microsoft/wizardlm-2-8x22b', contextLength: 65536 },
  'openrouter-allenai-olmo-3-32b': { label: 'OLMo 3 32B Think (OpenRouter)', provider: 'openrouter', modelId: 'allenai/olmo-3-32b-think', contextLength: 65536 },
  'openrouter-inclusionai-ling-2.6-1t': { label: 'Ling 2.6 1T (OpenRouter)', provider: 'openrouter', modelId: 'inclusionai/ling-2.6-1t', contextLength: 262144 },
  'openrouter-inclusionai-ling-2.6-flash': { label: 'Ling 2.6 Flash (OpenRouter)', provider: 'openrouter', modelId: 'inclusionai/ling-2.6-flash', contextLength: 262144 },
  'openrouter-inclusionai-ring-2.6-1t': { label: 'Ring 2.6 1T (OpenRouter)', provider: 'openrouter', modelId: 'inclusionai/ring-2.6-1t', contextLength: 262144 },
  'openrouter-tencent-hunyuan-a13b': { label: 'Hunyuan A13B (OpenRouter)', provider: 'openrouter', modelId: 'tencent/hunyuan-a13b-instruct', contextLength: 131072 },
  'openrouter-tencent-hy3-preview': { label: 'Hy3 Preview (OpenRouter)', provider: 'openrouter', modelId: 'tencent/hy3-preview', contextLength: 262144 },
  'openrouter-stepfun-step-3.7-flash': { label: 'Step 3.7 Flash (OpenRouter)', provider: 'openrouter', modelId: 'stepfun/step-3.7-flash', contextLength: 262144 },
  'openrouter-stepfun-step-3.5-flash': { label: 'Step 3.5 Flash (OpenRouter)', provider: 'openrouter', modelId: 'stepfun/step-3.5-flash', contextLength: 262144 },
  'openrouter-kwaipilot-kat-coder-pro': { label: 'Kat Coder Pro V2 (OpenRouter)', provider: 'openrouter', modelId: 'kwaipilot/kat-coder-pro-v2', contextLength: 262144 },
  'openrouter-morph-v3-fast': { label: 'Morph V3 Fast (OpenRouter)', provider: 'openrouter', modelId: 'morph/morph-v3-fast', contextLength: 81920 },
  'openrouter-morph-v3-large': { label: 'Morph V3 Large (OpenRouter)', provider: 'openrouter', modelId: 'morph/morph-v3-large', contextLength: 262144 },
  'openrouter-relace-apply-3': { label: 'Relace Apply 3 (OpenRouter)', provider: 'openrouter', modelId: 'relace/relace-apply-3', contextLength: 262144 },
  'openrouter-relace-search': { label: 'Relace Search (OpenRouter)', provider: 'openrouter', modelId: 'relace/relace-search', contextLength: 262144 },
  'openrouter-sakana-fugu-ultra': { label: 'Fugu Ultra (OpenRouter)', provider: 'openrouter', modelId: 'sakana/fugu-ultra', contextLength: 1048576 },
  'openrouter-poolside-laguna-m1': { label: 'Laguna M.1 (OpenRouter)', provider: 'openrouter', modelId: 'poolside/laguna-m.1', contextLength: 262144 },
  'openrouter-poolside-laguna-m1-free': { label: 'Laguna M.1 Free (OpenRouter)', provider: 'openrouter', modelId: 'poolside/laguna-m.1:free', contextLength: 262144 },
  'openrouter-poolside-laguna-xs2': { label: 'Laguna XS.2 (OpenRouter)', provider: 'openrouter', modelId: 'poolside/laguna-xs.2', contextLength: 262144 },
  'openrouter-poolside-laguna-xs2-free': { label: 'Laguna XS.2 Free (OpenRouter)', provider: 'openrouter', modelId: 'poolside/laguna-xs.2:free', contextLength: 262144 },
  'openrouter-poolside-laguna-xs2.1': { label: 'Laguna XS 2.1 (OpenRouter)', provider: 'openrouter', modelId: 'poolside/laguna-xs-2.1', contextLength: 262144 },
  'openrouter-poolside-laguna-xs2.1-free': { label: 'Laguna XS 2.1 Free (OpenRouter)', provider: 'openrouter', modelId: 'poolside/laguna-xs-2.1:free', contextLength: 262144 },
  'openrouter-liquid-lfm-2-24b': { label: 'LFM 2 24B (OpenRouter)', provider: 'openrouter', modelId: 'liquid/lfm-2-24b-a2b', contextLength: 131072 },
  'openrouter-liquid-lfm-2.5-1.2b-free': { label: 'LFM 2.5 1.2B Free (OpenRouter)', provider: 'openrouter', modelId: 'liquid/lfm-2.5-1.2b-instruct:free', contextLength: 32768 },
  'openrouter-liquid-lfm-2.5-thinking-free': { label: 'LFM 2.5 Thinking Free (OpenRouter)', provider: 'openrouter', modelId: 'liquid/lfm-2.5-1.2b-thinking:free', contextLength: 32768 },
  'openrouter-aion-aion-2.0': { label: 'Aion 2.0 (OpenRouter)', provider: 'openrouter', modelId: 'aion-labs/aion-2.0', contextLength: 131072 },
  'openrouter-aion-aion-1.0': { label: 'Aion 1.0 (OpenRouter)', provider: 'openrouter', modelId: 'aion-labs/aion-1.0', contextLength: 131072 },
  'openrouter-aion-aion-1.0-mini': { label: 'Aion 1.0 Mini (OpenRouter)', provider: 'openrouter', modelId: 'aion-labs/aion-1.0-mini', contextLength: 131072 },
  'openrouter-aion-aion-rp-8b': { label: 'Aion RP Llama 3.1 8B (OpenRouter)', provider: 'openrouter', modelId: 'aion-labs/aion-rp-llama-3.1-8b', contextLength: 32768 },
  'openrouter-thedrummer-cydonia': { label: 'Cydonia 24B (OpenRouter)', provider: 'openrouter', modelId: 'thedrummer/cydonia-24b-v4.1', contextLength: 131072 },
  'openrouter-thedrummer-rocinante': { label: 'Rocinante 12B (OpenRouter)', provider: 'openrouter', modelId: 'thedrummer/rocinante-12b', contextLength: 32768 },
  'openrouter-thedrummer-skyfall': { label: 'Skyfall 36B V2 (OpenRouter)', provider: 'openrouter', modelId: 'thedrummer/skyfall-36b-v2', contextLength: 32768 },
  'openrouter-mancer-weaver': { label: 'Weaver (OpenRouter)', provider: 'openrouter', modelId: 'mancer/weaver', contextLength: 8192 },
  'openrouter-perceptron-mk1': { label: 'Perceptron MK1 (OpenRouter)', provider: 'openrouter', modelId: 'perceptron/perceptron-mk1', contextLength: 32768 },
  'openrouter-inflection-3-pi': { label: 'Inflection 3 Pi (OpenRouter)', provider: 'openrouter', modelId: 'inflection/inflection-3-pi', contextLength: 8192 },
  'openrouter-inflection-3-productivity': { label: 'Inflection 3 Productivity (OpenRouter)', provider: 'openrouter', modelId: 'inflection/inflection-3-productivity', contextLength: 8192 },
  'openrouter-dolphin-mistral-venice-free': { label: 'Dolphin Mistral Venice Free (OpenRouter)', provider: 'openrouter', modelId: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', contextLength: 32768 },
  'openrouter-baidu-ernie-4.5-vl': { label: 'ERNIE 4.5 VL 424B (OpenRouter)', provider: 'openrouter', modelId: 'baidu/ernie-4.5-vl-424b-a47b', contextLength: 131072 },
  'openrouter-bytedance-ui-tars': { label: 'UI-TARS 1.5 7B (OpenRouter)', provider: 'openrouter', modelId: 'bytedance/ui-tars-1.5-7b', contextLength: 131072 },

  // ===== Mistral AI =====
  'mistral-large-3': { label: 'Mistral Large 3', provider: 'mistral', modelId: 'mistral-large-latest', contextLength: 128000 },
  'mistral-medium-3.5': { label: 'Mistral Medium 3.5', provider: 'mistral', modelId: 'mistral-medium-latest', contextLength: 128000 },
  'mistral-small-4': { label: 'Mistral Small 4', provider: 'mistral', modelId: 'mistral-small-latest', contextLength: 128000 },
  'mistral-codestral': { label: 'Codestral', provider: 'mistral', modelId: 'codestral-latest', contextLength: 32000 },
  'mistral-saba': { label: 'Mistral Saba', provider: 'mistral', modelId: 'mistral-saba-2502', contextLength: 32768 },
  'mistral-nemo': { label: 'Mistral Nemo 12B', provider: 'mistral', modelId: 'open-mistral-nemo', contextLength: 32768 },
  'mistral-pixtral-large': { label: 'Pixtral Large', provider: 'mistral', modelId: 'pixtral-large-latest', contextLength: 128000 },
  'mistral-magistral-medium': { label: 'Magistral Medium', provider: 'mistral', modelId: 'magistral-medium-latest', contextLength: 128000 },
  'mistral-magistral-small': { label: 'Magistral Small', provider: 'mistral', modelId: 'magistral-small-latest', contextLength: 128000 },
  'mistral-devstral-2': { label: 'Devstral 2', provider: 'mistral', modelId: 'devstral-2512', contextLength: 128000 },

  // ===== xAI / Grok =====
  'grok-4.3': { label: 'Grok 4.3', provider: 'xai', modelId: 'grok-4.3', contextLength: 1000000 },
  'grok-4.20-reasoning': { label: 'Grok 4.20 Reasoning', provider: 'xai', modelId: 'grok-4.20-0309-reasoning', contextLength: 1000000 },
  'grok-4.20-non-reasoning': { label: 'Grok 4.20 Non-Reasoning', provider: 'xai', modelId: 'grok-4.20-0309-non-reasoning', contextLength: 1000000 },
  'grok-3': { label: 'Grok 3', provider: 'xai', modelId: 'grok-3', contextLength: 131072 },
  'grok-3-mini': { label: 'Grok 3 Mini', provider: 'xai', modelId: 'grok-3-mini', contextLength: 131072 },
  'grok-2': { label: 'Grok 2', provider: 'xai', modelId: 'grok-2', contextLength: 131072 },

  // ===== Cohere =====
  'cohere-command-a': { label: 'Command A', provider: 'cohere', modelId: 'command-a', contextLength: 128000 },
  'cohere-command-r-plus': { label: 'Command R+', provider: 'cohere', modelId: 'command-r-plus', contextLength: 128000 },
  'cohere-command-r': { label: 'Command R', provider: 'cohere', modelId: 'command-r', contextLength: 128000 },
  'cohere-command-r7b': { label: 'Command R7B', provider: 'cohere', modelId: 'command-r7b', contextLength: 128000 },

  // ===== Fireworks AI =====
  'fireworks-deepseek-v4-pro': { label: 'DeepSeek V4 Pro (Fireworks)', provider: 'fireworks', modelId: 'accounts/fireworks/models/deepseek-v4-pro', contextLength: 1048576 },
  'fireworks-deepseek-v3.2': { label: 'DeepSeek V3.2 (Fireworks)', provider: 'fireworks', modelId: 'accounts/fireworks/models/deepseek-v3p2', contextLength: 163840 },
  'fireworks-deepseek-v3.1': { label: 'DeepSeek V3.1 (Fireworks)', provider: 'fireworks', modelId: 'accounts/fireworks/models/deepseek-v3p1', contextLength: 163840 },
  'fireworks-deepseek-r1': { label: 'DeepSeek R1 (Fireworks)', provider: 'fireworks', modelId: 'accounts/fireworks/models/deepseek-r1', contextLength: 131072 },
  'fireworks-deepseek-r1-fast': { label: 'DeepSeek R1 Fast (Fireworks)', provider: 'fireworks', modelId: 'accounts/fireworks/models/deepseek-r1-fast', contextLength: 163840 },
  'fireworks-deepseek-v4-flash': { label: 'DeepSeek V4 Flash (Fireworks)', provider: 'fireworks', modelId: 'accounts/fireworks/models/deepseek-v4-flash', contextLength: 1048576 },
  'fireworks-llama-4-maverick': { label: 'Llama 4 Maverick (Fireworks)', provider: 'fireworks', modelId: 'accounts/fireworks/models/llama4-maverick-instruct-basic', contextLength: 1048576 },
  'fireworks-llama-4-scout': { label: 'Llama 4 Scout (Fireworks)', provider: 'fireworks', modelId: 'accounts/fireworks/models/llama4-scout-instruct-basic', contextLength: 1048576 },
  'fireworks-llama-3.3-70b': { label: 'Llama 3.3 70B (Fireworks)', provider: 'fireworks', modelId: 'accounts/fireworks/models/llama-v3p3-70b-instruct', contextLength: 131072 },
  'fireworks-llama-3.1-405b': { label: 'Llama 3.1 405B (Fireworks)', provider: 'fireworks', modelId: 'accounts/fireworks/models/llama-v3p1-405b-instruct', contextLength: 131072 },
  'fireworks-gpt-oss-120b': { label: 'GPT-OSS 120B (Fireworks)', provider: 'fireworks', modelId: 'accounts/fireworks/models/gpt-oss-120b', contextLength: 131072 },
  'fireworks-gpt-oss-20b': { label: 'GPT-OSS 20B (Fireworks)', provider: 'fireworks', modelId: 'accounts/fireworks/models/gpt-oss-20b', contextLength: 131072 },
  'fireworks-qwen3-8b': { label: 'Qwen3 8B (Fireworks)', provider: 'fireworks', modelId: 'accounts/fireworks/models/qwen3-8b', contextLength: 131072 },

  // ===== Perplexity =====
  'perplexity-sonar-pro': { label: 'Sonar Pro', provider: 'perplexity', modelId: 'sonar-pro', contextLength: 200000 },
  'perplexity-sonar': { label: 'Sonar', provider: 'perplexity', modelId: 'sonar', contextLength: 200000 },
  'perplexity-sonar-reasoning-pro': { label: 'Sonar Reasoning Pro', provider: 'perplexity', modelId: 'sonar-reasoning-pro', contextLength: 200000 },
  'perplexity-sonar-reasoning': { label: 'Sonar Reasoning', provider: 'perplexity', modelId: 'sonar-reasoning', contextLength: 200000 },

  // ===== Ollama Local =====
  'ollama-llama3.3': { label: 'Llama 3.3 (Ollama)', provider: 'ollama', modelId: 'llama3.3:latest', contextLength: 131072 },
  'ollama-llama3.2': { label: 'Llama 3.2 (Ollama)', provider: 'ollama', modelId: 'llama3.2:latest', contextLength: 131072 },
  'ollama-llama3.1': { label: 'Llama 3.1 (Ollama)', provider: 'ollama', modelId: 'llama3.1:latest', contextLength: 131072 },
  'ollama-qwen3': { label: 'Qwen3 8B (Ollama)', provider: 'ollama', modelId: 'qwen3:8b', contextLength: 131072 },
  'ollama-qwen3.5': { label: 'Qwen3.5 7B (Ollama)', provider: 'ollama', modelId: 'qwen3.5:7b', contextLength: 131072 },
  'ollama-codellama': { label: 'CodeLlama 34B (Ollama)', provider: 'ollama', modelId: 'codellama:34b', contextLength: 16384 },
  'ollama-codellama-70b': { label: 'CodeLlama 70B (Ollama)', provider: 'ollama', modelId: 'codellama:70b', contextLength: 16384 },
  'ollama-mistral': { label: 'Mistral 7B (Ollama)', provider: 'ollama', modelId: 'mistral:latest', contextLength: 32768 },
  'ollama-mixtral': { label: 'Mixtral 8x7B (Ollama)', provider: 'ollama', modelId: 'mixtral:latest', contextLength: 32768 },
  'ollama-deepseek-r1': { label: 'DeepSeek R1 (Ollama)', provider: 'ollama', modelId: 'deepseek-r1:latest', contextLength: 131072 },
  'ollama-deepseek-v3': { label: 'DeepSeek V3 (Ollama)', provider: 'ollama', modelId: 'deepseek-v3:latest', contextLength: 131072 },
  'ollama-gemma3': { label: 'Gemma 3 27B (Ollama)', provider: 'ollama', modelId: 'gemma3:27b', contextLength: 131072 },
  'ollama-phi4': { label: 'Phi-4 (Ollama)', provider: 'ollama', modelId: 'phi4:latest', contextLength: 16384 },
  'ollama-llama4-maverick': { label: 'Llama 4 Maverick (Ollama)', provider: 'ollama', modelId: 'llama4-maverick:latest', contextLength: 131072 },

  // ===== Ollama Cloud =====
  'ollama-cloud-llama3.3-70b': { label: 'Llama 3.3 70B (Ollama Cloud)', provider: 'ollamaCloud', modelId: 'llama3.3:70b', contextLength: 131072 },
  'ollama-cloud-qwen3-32b': { label: 'Qwen3 32B (Ollama Cloud)', provider: 'ollamaCloud', modelId: 'qwen3:32b', contextLength: 131072 },
  'ollama-cloud-deepseek-r1': { label: 'DeepSeek R1 (Ollama Cloud)', provider: 'ollamaCloud', modelId: 'deepseek-r1:70b', contextLength: 131072 },

  // ===== GitHub Models =====
  'github-gpt-5.5': { label: 'GPT-5.5 (GitHub)', provider: 'github', modelId: 'openai/gpt-5.5', contextLength: 1048576 },
  'github-gpt-4.1': { label: 'GPT-4.1 (GitHub)', provider: 'github', modelId: 'openai/gpt-4.1', contextLength: 1048576 },
  'github-gpt-4o': { label: 'GPT-4o (GitHub)', provider: 'github', modelId: 'openai/gpt-4o', contextLength: 128000 },
  'github-gpt-4o-mini': { label: 'GPT-4o Mini (GitHub)', provider: 'github', modelId: 'openai/gpt-4o-mini', contextLength: 128000 },
  'github-o4-mini': { label: 'o4-mini (GitHub)', provider: 'github', modelId: 'openai/o4-mini', contextLength: 200000 },
  'github-o3': { label: 'o3 (GitHub)', provider: 'github', modelId: 'openai/o3', contextLength: 200000 },
  'github-claude-sonnet-4': { label: 'Claude Sonnet 4 (GitHub)', provider: 'github', modelId: 'anthropic/claude-sonnet-4', contextLength: 200000 },
  'github-claude-3.5-sonnet': { label: 'Claude 3.5 Sonnet (GitHub)', provider: 'github', modelId: 'anthropic/claude-3.5-sonnet', contextLength: 200000 },
  'github-llama-4-maverick': { label: 'Llama 4 Maverick (GitHub)', provider: 'github', modelId: 'meta/llama-4-maverick-17b-128e-instruct', contextLength: 131072 },
  'github-llama-4-scout': { label: 'Llama 4 Scout (GitHub)', provider: 'github', modelId: 'meta/llama-4-scout-17b-16e-instruct', contextLength: 131072 },
  'github-llama-3.3-70b': { label: 'Llama 3.3 70B (GitHub)', provider: 'github', modelId: 'meta/llama-3.3-70b-instruct', contextLength: 131072 },
  'github-llama-3.1-405b': { label: 'Llama 3.1 405B (GitHub)', provider: 'github', modelId: 'meta/llama-3.1-405b-instruct', contextLength: 131072 },
  'github-deepseek-r1': { label: 'DeepSeek R1 (GitHub)', provider: 'github', modelId: 'deepseek/deepseek-r1', contextLength: 163840 },
  'github-grok-3': { label: 'Grok 3 (GitHub)', provider: 'github', modelId: 'xai/grok-3', contextLength: 131072 },
  'github-mistral-large': { label: 'Mistral Large (GitHub)', provider: 'github', modelId: 'mistralai/mistral-large-2-instruct', contextLength: 128000 },
  'github-gemini-2.5-flash': { label: 'Gemini 2.5 Flash (GitHub)', provider: 'github', modelId: 'google/gemini-2.5-flash', contextLength: 1000000 },
  'github-gemini-2.0-flash': { label: 'Gemini 2.0 Flash (GitHub)', provider: 'github', modelId: 'google/gemini-2.0-flash', contextLength: 1000000 },
  'github-cohere-command-r-plus': { label: 'Command R+ (GitHub)', provider: 'github', modelId: 'cohere/command-r-plus', contextLength: 128000 },

  // ===== Azure OpenAI =====
  'azure-gpt-5.5': { label: 'GPT-5.5 (Azure)', provider: 'azure', modelId: 'gpt-5.5', contextLength: 1048576 },
  'azure-gpt-5.4': { label: 'GPT-5.4 (Azure)', provider: 'azure', modelId: 'gpt-5.4', contextLength: 1048576 },
  'azure-gpt-5.4-mini': { label: 'GPT-5.4 Mini (Azure)', provider: 'azure', modelId: 'gpt-5.4-mini', contextLength: 1048576 },
  'azure-gpt-5.2': { label: 'GPT-5.2 (Azure)', provider: 'azure', modelId: 'gpt-5.2', contextLength: 1048576 },
  'azure-gpt-5.1': { label: 'GPT-5.1 (Azure)', provider: 'azure', modelId: 'gpt-5.1', contextLength: 1048576 },
  'azure-gpt-5': { label: 'GPT-5 (Azure)', provider: 'azure', modelId: 'gpt-5', contextLength: 1048576 },
  'azure-gpt-4.1': { label: 'GPT-4.1 (Azure)', provider: 'azure', modelId: 'gpt-4.1', contextLength: 1048576 },
  'azure-gpt-4o': { label: 'GPT-4o (Azure)', provider: 'azure', modelId: 'gpt-4o', contextLength: 128000 },
  'azure-gpt-4o-mini': { label: 'GPT-4o Mini (Azure)', provider: 'azure', modelId: 'gpt-4o-mini', contextLength: 128000 },
  'azure-o4-mini': { label: 'o4-mini (Azure)', provider: 'azure', modelId: 'o4-mini', contextLength: 200000 },
  'azure-o3': { label: 'o3 (Azure)', provider: 'azure', modelId: 'o3', contextLength: 200000 },

  // ===== AWS Bedrock =====
  'bedrock-claude-opus-4': { label: 'Claude Opus 4 (Bedrock)', provider: 'bedrock', modelId: 'anthropic.claude-opus-4-20250514-v1:0', contextLength: 200000 },
  'bedrock-claude-sonnet-4': { label: 'Claude Sonnet 4 (Bedrock)', provider: 'bedrock', modelId: 'anthropic.claude-sonnet-4-20250514-v1:0', contextLength: 200000 },
  'bedrock-claude-3.7-sonnet': { label: 'Claude 3.7 Sonnet (Bedrock)', provider: 'bedrock', modelId: 'anthropic.claude-3-7-sonnet-20250219-v1:0', contextLength: 200000 },
  'bedrock-claude-3.5-sonnet': { label: 'Claude 3.5 Sonnet (Bedrock)', provider: 'bedrock', modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0', contextLength: 200000 },
  'bedrock-llama-4-maverick': { label: 'Llama 4 Maverick (Bedrock)', provider: 'bedrock', modelId: 'meta.llama4-maverick-17b-128e-instruct-v1:0', contextLength: 131072 },
  'bedrock-llama-3.3-70b': { label: 'Llama 3.3 70B (Bedrock)', provider: 'bedrock', modelId: 'meta.llama3-3-70b-instruct-v1:0', contextLength: 131072 },
  'bedrock-llama-3.1-405b': { label: 'Llama 3.1 405B (Bedrock)', provider: 'bedrock', modelId: 'meta.llama3-1-405b-instruct-v1:0', contextLength: 131072 },
  'bedrock-mistral-large': { label: 'Mistral Large (Bedrock)', provider: 'bedrock', modelId: 'mistral.mistral-large-2402-v1:0', contextLength: 128000 },
  'bedrock-mistral-medium': { label: 'Mistral Medium (Bedrock)', provider: 'bedrock', modelId: 'mistral.mistral-medium-2402-v1:0', contextLength: 32768 },
  'bedrock-jamba-1.5-large': { label: 'Jamba 1.5 Large (Bedrock)', provider: 'bedrock', modelId: 'ai21.jamba-1-5-large-v1:0', contextLength: 256000 },
  'bedrock-jamba-1.5-mini': { label: 'Jamba 1.5 Mini (Bedrock)', provider: 'bedrock', modelId: 'ai21.jamba-1-5-mini-v1:0', contextLength: 256000 },

  // ===== Google Vertex AI =====
  'vertex-gemini-2.5-pro': { label: 'Gemini 2.5 Pro (Vertex)', provider: 'vertex', modelId: 'gemini-2.5-pro', contextLength: 1000000 },
  'vertex-gemini-2.5-flash': { label: 'Gemini 2.5 Flash (Vertex)', provider: 'vertex', modelId: 'gemini-2.5-flash', contextLength: 1000000 },
  'vertex-gemini-2.0-flash': { label: 'Gemini 2.0 Flash (Vertex)', provider: 'vertex', modelId: 'gemini-2.0-flash', contextLength: 1000000 },
  'vertex-gemini-1.5-pro': { label: 'Gemini 1.5 Pro (Vertex)', provider: 'vertex', modelId: 'gemini-1.5-pro', contextLength: 2000000 },
  'vertex-gemini-1.5-flash': { label: 'Gemini 1.5 Flash (Vertex)', provider: 'vertex', modelId: 'gemini-1.5-flash', contextLength: 1000000 },

  // ===== LM Studio (Local) =====
  'lmstudio-local': { label: 'LM Studio (Local)', provider: 'lmstudio', modelId: 'local-model', contextLength: 32768 },

  // ===== Novita AI =====
  'novita-deepseek-v3.2': { label: 'DeepSeek V3.2 (Novita)', provider: 'novita', modelId: 'deepseek/deepseek-v3.2-exp', contextLength: 163840 },
  'novita-deepseek-v3.1': { label: 'DeepSeek V3.1 (Novita)', provider: 'novita', modelId: 'deepseek/deepseek-v3.1', contextLength: 163840 },
  'novita-deepseek-r1': { label: 'DeepSeek R1 (Novita)', provider: 'novita', modelId: 'deepseek/deepseek-r1', contextLength: 163840 },
  'novita-llama-3.3-70b': { label: 'Llama 3.3 70B (Novita)', provider: 'novita', modelId: 'meta-llama/llama-3.3-70b-instruct', contextLength: 131072 },
  'novita-llama-3.1-8b': { label: 'Llama 3.1 8B (Novita)', provider: 'novita', modelId: 'meta-llama/llama-3.1-8b-instruct', contextLength: 131072 },

  // ===== Chutes AI =====
  'chutes-qwen3-32b': { label: 'Qwen3 32B (Chutes)', provider: 'chutes', modelId: 'Qwen/Qwen3-32B', contextLength: 131072 },
  'chutes-qwen3-8b': { label: 'Qwen3 8B (Chutes)', provider: 'chutes', modelId: 'Qwen/Qwen3-8B', contextLength: 131072 },
  'chutes-llama-3.3-70b': { label: 'Llama 3.3 70B (Chutes)', provider: 'chutes', modelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', contextLength: 131072 },

  // ===== Inference.net =====
  'inference-gpt-4.1': { label: 'GPT-4.1 (Inference.net)', provider: 'inference', modelId: 'openai/gpt-4.1', contextLength: 1048576 },
  'inference-gpt-4o': { label: 'GPT-4o (Inference.net)', provider: 'inference', modelId: 'openai/gpt-4o', contextLength: 128000 },
  'inference-claude-sonnet-4': { label: 'Claude Sonnet 4 (Inference.net)', provider: 'inference', modelId: 'anthropic/claude-sonnet-4', contextLength: 200000 },
  'inference-llama-3.3-70b': { label: 'Llama 3.3 70B (Inference.net)', provider: 'inference', modelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', contextLength: 131072 },

  // ===== Replicate =====
  'replicate-llama-3.3-70b': { label: 'Llama 3.3 70B (Replicate)', provider: 'replicate', modelId: 'meta/meta-llama-3.3-70b-instruct', contextLength: 131072 },
  'replicate-llama-3.1-405b': { label: 'Llama 3.1 405B (Replicate)', provider: 'replicate', modelId: 'meta/meta-llama-3.1-405b-instruct', contextLength: 131072 },
  'replicate-llama-3.1-8b': { label: 'Llama 3.1 8B (Replicate)', provider: 'replicate', modelId: 'meta/meta-llama-3.1-8b-instruct', contextLength: 131072 },

  // ===== Zyn Cloud =====
  'zyncloud-minimax-m3-thinking': { label: 'Minimax M3 Thinking', provider: 'zyncloud', modelId: 'minimax-m3-thinking', contextLength: 128000 },
  'zyncloud-minimax-m3': { label: 'Minimax M3', provider: 'zyncloud', modelId: 'minimax-m3', contextLength: 128000 },
};

const SUPPORTED_MODEL_PROVIDERS = new Set([
  'qwenapi', 'zen', 'gemini', 'huggingface', 'custom', 'deepseek',
  'openai', 'anthropic', 'groq', 'together', 'openrouter', 'mistral',
  'xai', 'cohere', 'fireworks', 'perplexity', 'ollama', 'ollamaCloud',
  'github', 'azure', 'bedrock', 'vertex', 'replicate', 'cloudflare',
  'lmstudio', 'novita', 'chutes', 'inference', 'zyncloud',
]);
const GEMINI_MODEL_WARNING = '';

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function copyIfExists(source, target) {
  try {
    if (!source || !target) return;
    const resolvedSource = path.resolve(source);
    const resolvedTarget = path.resolve(target);
    if (resolvedSource === resolvedTarget || !fs.existsSync(resolvedSource) || fs.existsSync(resolvedTarget)) return;
    fs.mkdirSync(path.dirname(resolvedTarget), { recursive: true });
    fs.cpSync(resolvedSource, resolvedTarget, { recursive: true, errorOnExist: false, force: false });
  } catch {
    // Best-effort migration only; normal reads/writes will still use USER_DATA_ROOT.
  }
}

function migrateLegacyUserData() {
  copyIfExists(LEGACY_SESSION_ROOT, SESSION_ROOT);
  copyIfExists(LEGACY_PLUGINS_DIR, PLUGINS_DIR);
  copyIfExists(LEGACY_WEB_ROOT, USER_WEB_ROOT);
  copyIfExists(path.join(LEGACY_SESSION_ROOT, 'mcp-servers.json'), MCP_CONFIG_FILE);
  copyIfExists(path.join(DATA_ROOT, 'providers.json'), PROVIDERS_FILE);
  copyIfExists(path.join(DATA_ROOT, 'models.json'), MODELS_FILE);
}

copyIfExists(BUNDLED_MODELS_FILE, MODELS_FILE);

function loadExternalModels() {
  const raw = readJsonFile(MODELS_FILE) || readJsonFile(BUNDLED_MODELS_FILE);
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

const DEFAULT_MODEL_KEY = process.env.ZYN_DEFAULT_MODEL || 'zyncloud-minimax-m3';
const DEFAULT_LANGUAGE = normalizeLanguage(process.env.ZYN_DEFAULT_LANG || process.env.ZYN_LANGUAGE || process.env.LANG || 'en');

const HUGGINGFACE_TOKEN = process.env.ZYN_HUGGINGFACE_TOKEN || process.env.HF_TOKEN || '';
const GEMINI_API_KEY = process.env.ZYN_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

const MAX_TOOL_STEPS = Number(process.env.ZYN_MAX_TOOL_STEPS || 100);

const REQUEST_TIMEOUT_MS = Number(process.env.ZYN_REQUEST_TIMEOUT_MS || 120000);
const ACTION_LOG_LIMIT = 100;
const MAX_HISTORY_CHARS = Number(process.env.ZYN_MAX_HISTORY_CHARS || 200000);
const MAX_FILE_LINES = Number(process.env.ZYN_MAX_FILE_LINES || 10000);
const KEEP_RECENT_MESSAGES = 50;
const MAX_OUTPUT_CHARS = Number(process.env.ZYN_MAX_OUTPUT_CHARS || 50000);
const AUTO_COMPACT_THRESHOLD = 0.75;

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

const DEFAULT_SETTINGS = {
  maxToolSteps: MAX_TOOL_STEPS,
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  maxHistoryChars: MAX_HISTORY_CHARS,
  maxOutputChars: MAX_OUTPUT_CHARS,
  maxFileLines: MAX_FILE_LINES,
  keepRecentMessages: KEEP_RECENT_MESSAGES,
  autoCompactThreshold: AUTO_COMPACT_THRESHOLD,
  autoCompactEnabled: true,
  compactMinMessages: 5,
  maxThinkingLines: 30,
  showThinking: false,
  providerMaxAttempts: PROVIDER_TIMEOUT_MAX_ATTEMPTS,
  providerRetryDelayMs: PROVIDER_TIMEOUT_RETRY_DELAY_MS,
  maxTokens: 16384,
};

function getSetting(state, key) {
  if (state?.settings && key in state.settings) return state.settings[key];
  return DEFAULT_SETTINGS[key];
}

const SESSION_ROOT = path.join(USER_DATA_ROOT, 'chat');
const SESSIONS_DIR = path.join(SESSION_ROOT, 'sessions');
const CURRENT_SESSION_FILE = path.join(SESSION_ROOT, 'current-session.json');
const PERSISTENT_CONFIG_FILE = path.join(SESSION_ROOT, 'persistent-config.json');
const TRANSCRIPTS_DIR = path.join(SESSION_ROOT, 'transcripts');
const EXPORTS_DIR = path.join(SESSION_ROOT, 'exports');
const BACKGROUND_DIR = path.join(SESSION_ROOT, 'background');
const THINK_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const TASKS_FILE = path.join(USER_DATA_ROOT, 'tasks.json');
const PLUGINS_DIR = path.join(USER_DATA_ROOT, 'plugins');
const GMAIL_CLIENT_ID = '871944347395-rnpsjsqgbnvlfb05hqk4dc9283olgnh2.apps.googleusercontent.com';
const GMAIL_CLIENT_SECRET = process.env.ZYN_GMAIL_CLIENT_SECRET || '';
const GMAIL_AUTH_FILE = path.join(USER_DATA_ROOT, 'gmail-auth.json');
const BUNDLED_PROVIDERS_FILE = path.join(DATA_ROOT, 'providers.json');
const PROVIDERS_FILE = path.join(USER_CONFIG_ROOT, 'providers.json');
const MCP_CONFIG_FILE = path.join(USER_CONFIG_ROOT, 'mcp-servers.json');

migrateLegacyUserData();

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
  BUNDLED_MODELS_FILE,
  BUNDLED_PROVIDERS_FILE,
  LEGACY_PLUGINS_DIR,
  LEGACY_SESSION_ROOT,
  LEGACY_WEB_ROOT,
  CURRENT_SESSION_FILE,
  PERSISTENT_CONFIG_FILE,
  DATA_ROOT,
  DEFAULT_LANGUAGE,
  DEFAULT_CONTEXT_LIMIT,
  DEFAULT_MODEL_KEY,
  DEFAULT_SETTINGS,
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
  MCP_CONFIG_FILE,
  PLUGINS_DIR,
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
  USER_CONFIG_ROOT,
  USER_DATA_ROOT,
  USER_WEB_ROOT,
  countTokens,
  estimateContextTokens,
  getContextLimit,
  getSetting,
  listProvidersFromModels,
  migrateLegacyUserData,
  stripBase64Images,
};
