const { qwenapi } = require('./qwenapi/index');
const { zen } = require('./zen/index');
const { gemini } = require('./gemini/index');
const { huggingface } = require('./huggingface/index');
const { custom } = require('./custom/index');
const { deepseekChat } = require('./deepseek/index');
const { DEFAULT_MODEL_KEY, MODELS } = require('../config');
const { describeProviderConfig } = require('./catalog');

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
