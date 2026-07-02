const { qwenapi } = require('./qwenapi/index');
const { zen } = require('./zen/index');
const { gemini } = require('./gemini/index');
const { huggingface } = require('./huggingface/index');
const { custom } = require('./custom/index');
const { deepseekChat } = require('./deepseek/index');
const { openai } = require('./openai/index');
const { anthropic } = require('./anthropic/index');
const { groq } = require('./groq/index');
const { createOpenAICompatible } = require('./openai-compatible/index');
const { cohere } = require('./cohere/index');
const { ollama, ollamaCloud } = require('./ollama/index');
const { github } = require('./github/index');
const { azure } = require('./azure/index');
const { bedrock } = require('./bedrock/index');
const { vertex } = require('./vertex/index');
const { replicate } = require('./replicate/index');
const { cloudflare } = require('./cloudflare/index');
const { lmstudio } = require('./lmstudio/index');
const { novita } = require('./novita/index');
const { chutes } = require('./chutes/index');
const { inference } = require('./inference/index');
const { DEFAULT_MODEL_KEY, MODELS } = require('../config');
const { describeProviderConfig } = require('./catalog');

// Create OpenAI-compatible providers for together, openrouter, mistral, xai, fireworks, perplexity
const together = createOpenAICompatible('Together AI', 'https://api.together.xyz/v1', 'TOGETHER_API_KEY');
const openrouter = createOpenAICompatible('OpenRouter', 'https://openrouter.ai/api/v1', 'OPENROUTER_API_KEY');
const mistral = createOpenAICompatible('Mistral AI', 'https://api.mistral.ai/v1', 'MISTRAL_API_KEY');
const xai = createOpenAICompatible('xAI', 'https://api.x.ai/v1', 'XAI_API_KEY');
const fireworks = createOpenAICompatible('Fireworks AI', 'https://api.fireworks.ai/inference/v1', 'FIREWORKS_API_KEY');
const perplexity = createOpenAICompatible('Perplexity', 'https://api.perplexity.ai', 'PERPLEXITY_API_KEY');

function buildPromptFromMessages(messages) {
  const parts = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      parts.push(`[Sistema]\n${msg.content}`);
    } else if (msg.role === 'assistant') {
      parts.push(`[Asistente]\n${msg.content}`);
    } else {
      parts.push(`[Usuario]\n${msg.content}`);
    }
  }

  return parts.join('\n\n');
}

function getModelDefinition(modelKey) {
  const key = modelKey || DEFAULT_MODEL_KEY;
  return { key, model: MODELS[key] };
}

function buildProviderOptions(provider, model) {
  const providerConfig = describeProviderConfig(provider) || {};
  const merged = { ...providerConfig, ...(model || {}) };
  return merged;
}

async function runProvider(provider, messages, model, onChunk, options = {}) {
  const providerConfig = buildProviderOptions(provider, model);

  switch (provider) {
    case 'qwenapi':
      return qwenapi(messages, model.qwenapiModel, onChunk, { ...options, config: providerConfig });
    case 'zen':
      return zen(messages, model.zenModel, onChunk, { ...options, config: providerConfig });
    case 'gemini':
      return gemini(messages, model.geminiModel || 'gemini-2.5-flash', onChunk, { ...options, config: providerConfig });
    case 'huggingface':
      return huggingface(messages, model.huggingfaceModel, onChunk, { ...options, config: providerConfig });
    case 'deepseek':
      return deepseekChat(messages, model.deepseekChatModel, onChunk, { ...options, config: providerConfig });
    case 'openai':
      return openai(messages, model.modelId || model.openaiModel, onChunk, { ...options, config: providerConfig });
    case 'anthropic':
      return anthropic(messages, model.modelId || model.anthropicModel, onChunk, { ...options, config: providerConfig });
    case 'groq':
      return groq(messages, model.modelId || model.groqModel, onChunk, { ...options, config: providerConfig });
    case 'together':
      return together(messages, model.modelId || model.togetherModel, onChunk, { ...options, config: providerConfig });
    case 'openrouter':
      return openrouter(messages, model.modelId || model.openrouterModel, onChunk, { ...options, config: providerConfig });
    case 'mistral':
      return mistral(messages, model.modelId || model.mistralModel, onChunk, { ...options, config: providerConfig });
    case 'xai':
      return xai(messages, model.modelId || model.xaiModel, onChunk, { ...options, config: providerConfig });
    case 'cohere':
      return cohere(messages, model.modelId || model.cohereModel, onChunk, { ...options, config: providerConfig });
    case 'fireworks':
      return fireworks(messages, model.modelId || model.fireworksModel, onChunk, { ...options, config: providerConfig });
    case 'perplexity':
      return perplexity(messages, model.modelId || model.perplexityModel, onChunk, { ...options, config: providerConfig });
    case 'ollama':
      return ollama(messages, model.modelId || model.ollamaModel, onChunk, { ...options, config: providerConfig });
    case 'ollamaCloud':
      return ollamaCloud(messages, model.modelId || model.ollamaModel, onChunk, { ...options, config: providerConfig });
    case 'github':
      return github(messages, model.modelId || model.githubModel, onChunk, { ...options, config: providerConfig });
    case 'azure':
      return azure(messages, model.modelId || model.azureModel, onChunk, { ...options, config: providerConfig });
    case 'bedrock':
      return bedrock(messages, model.modelId || model.bedrockModel, onChunk, { ...options, config: providerConfig });
    case 'vertex':
      return vertex(messages, model.modelId || model.vertexModel, onChunk, { ...options, config: providerConfig });
    case 'replicate':
      return replicate(messages, model.modelId || model.replicateModel, onChunk, { ...options, config: providerConfig });
    case 'cloudflare':
      return cloudflare(messages, model.modelId || model.cloudflareModel, onChunk, { ...options, config: providerConfig });
    case 'lmstudio':
      return lmstudio(messages, model.modelId || model.lmstudioModel, onChunk, { ...options, config: providerConfig });
    case 'novita':
      return novita(messages, model.modelId || model.novitaModel, onChunk, { ...options, config: providerConfig });
    case 'chutes':
      return chutes(messages, model.modelId || model.chutesModel, onChunk, { ...options, config: providerConfig });
    case 'inference':
      return inference(messages, model.modelId || model.inferenceModel, onChunk, { ...options, config: providerConfig });
    case 'custom':
      return custom(messages, model, onChunk, { ...options, config: providerConfig });
    default:
      throw new Error(`Proveedor desconocido: "${provider}". Modelos disponibles: ${Object.keys(MODELS).join(', ')}`);
  }
}

async function chat({ messages, onChunk, modelKey, signal }) {
  const { key, model } = getModelDefinition(modelKey);
  const provider = model?.provider || 'zen';
  const result = await runProvider(provider, messages, model || {}, onChunk, { signal, modelKey: key });

  return {
    answer: result.text || '',
    thinking: result.thinking || '',
  };
}

async function chatSilent({ messages, modelKey, signal }) {
  const { key, model } = getModelDefinition(modelKey);
  const provider = model?.provider || 'zen';
  const result = await runProvider(provider, messages, model || {}, null, { signal, modelKey: key });
  return { answer: result.text || '' };
}

module.exports = { chat, chatSilent, buildPromptFromMessages, getModelDefinition };
