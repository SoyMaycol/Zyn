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
  // ===== Zen (Default - Free) =====
  'nemotron': { label: 'Nemotron 3 Ultra', provider: 'zen', zenModel: 'nemotron-3-ultra-free', contextLength: 128000 },
  'mimo': { label: 'Mimo 2.5', provider: 'zen', zenModel: 'mimo-v2.5-free', contextLength: 128000 },
  'north-mini': { label: 'North Mini Code', provider: 'zen', zenModel: 'north-mini-code-free', contextLength: 128000 },
  'deepseek-zen': { label: 'DeepSeek V4 Flash (Zen)', provider: 'zen', zenModel: 'deepseek-v4-flash-free', contextLength: 128000 },

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
  'gpt-4.1': { label: 'GPT-4.1', provider: 'openai', modelId: 'gpt-4.1', contextLength: 1047576 },
  'gpt-4.1-mini': { label: 'GPT-4.1 Mini', provider: 'openai', modelId: 'gpt-4.1-mini', contextLength: 1047576 },
  'gpt-4.1-nano': { label: 'GPT-4.1 Nano', provider: 'openai', modelId: 'gpt-4.1-nano', contextLength: 1047576 },
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

  // ===== OpenRouter =====
  'openrouter-auto': { label: 'OpenRouter Auto', provider: 'openrouter', modelId: 'openrouter/auto', contextLength: 200000 },
  'openrouter-gpt-5.5': { label: 'GPT-5.5 (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-5.5', contextLength: 1048576 },
  'openrouter-gpt-4o': { label: 'GPT-4o (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-4o', contextLength: 128000 },
  'openrouter-claude-sonnet-4': { label: 'Claude Sonnet 4 (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-sonnet-4', contextLength: 200000 },
  'openrouter-claude-opus-4': { label: 'Claude Opus 4 (OpenRouter)', provider: 'openrouter', modelId: 'anthropic/claude-opus-4', contextLength: 200000 },
  'openrouter-gemini-2.5-pro': { label: 'Gemini 2.5 Pro (OpenRouter)', provider: 'openrouter', modelId: 'google/gemini-2.5-pro', contextLength: 1000000 },
  'openrouter-deepseek-r1': { label: 'DeepSeek R1 (OpenRouter)', provider: 'openrouter', modelId: 'deepseek/deepseek-r1', contextLength: 163840 },
  'openrouter-deepseek-v4-pro': { label: 'DeepSeek V4 Pro (OpenRouter)', provider: 'openrouter', modelId: 'deepseek/deepseek-v4-pro', contextLength: 1048576 },
  'openrouter-llama-4-maverick': { label: 'Llama 4 Maverick (OpenRouter)', provider: 'openrouter', modelId: 'meta-llama/llama-4-maverick', contextLength: 131072 },
  'openrouter-gpt-oss-120b': { label: 'GPT-OSS 120B (OpenRouter)', provider: 'openrouter', modelId: 'openai/gpt-oss-120b', contextLength: 131072 },

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
  'github-gpt-4.1': { label: 'GPT-4.1 (GitHub)', provider: 'github', modelId: 'openai/gpt-4.1', contextLength: 1047576 },
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
  'azure-gpt-4.1': { label: 'GPT-4.1 (Azure)', provider: 'azure', modelId: 'gpt-4.1', contextLength: 1047576 },
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
  'inference-gpt-4.1': { label: 'GPT-4.1 (Inference.net)', provider: 'inference', modelId: 'openai/gpt-4.1', contextLength: 1047576 },
  'inference-gpt-4o': { label: 'GPT-4o (Inference.net)', provider: 'inference', modelId: 'openai/gpt-4o', contextLength: 128000 },
  'inference-claude-sonnet-4': { label: 'Claude Sonnet 4 (Inference.net)', provider: 'inference', modelId: 'anthropic/claude-sonnet-4', contextLength: 200000 },
  'inference-llama-3.3-70b': { label: 'Llama 3.3 70B (Inference.net)', provider: 'inference', modelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', contextLength: 131072 },

  // ===== Replicate =====
  'replicate-llama-3.3-70b': { label: 'Llama 3.3 70B (Replicate)', provider: 'replicate', modelId: 'meta/meta-llama-3.3-70b-instruct', contextLength: 131072 },
  'replicate-llama-3.1-405b': { label: 'Llama 3.1 405B (Replicate)', provider: 'replicate', modelId: 'meta/meta-llama-3.1-405b-instruct', contextLength: 131072 },
  'replicate-llama-3.1-8b': { label: 'Llama 3.1 8B (Replicate)', provider: 'replicate', modelId: 'meta/meta-llama-3.1-8b-instruct', contextLength: 131072 },
};

const SUPPORTED_MODEL_PROVIDERS = new Set([
  'qwenapi', 'zen', 'gemini', 'huggingface', 'custom', 'deepseek',
  'openai', 'anthropic', 'groq', 'together', 'openrouter', 'mistral',
  'xai', 'cohere', 'fireworks', 'perplexity', 'ollama', 'ollamaCloud',
  'github', 'azure', 'bedrock', 'vertex', 'replicate', 'cloudflare',
  'lmstudio', 'novita', 'chutes', 'inference',
]);
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

const MAX_TOOL_STEPS = Number(process.env.ZYN_MAX_TOOL_STEPS || 100);

const REQUEST_TIMEOUT_MS = Number(process.env.ZYN_REQUEST_TIMEOUT_MS || 120000);
const ACTION_LOG_LIMIT = 100;
const MAX_HISTORY_CHARS = Number(process.env.ZYN_MAX_HISTORY_CHARS || 200000);
const MAX_FILE_LINES = Number(process.env.ZYN_MAX_FILE_LINES || 10000);
const KEEP_RECENT_MESSAGES = 50;
const MAX_OUTPUT_CHARS = Number(process.env.ZYN_MAX_OUTPUT_CHARS || 50000);
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
