const { qwen } = require('./qwen/index');
const { zen } = require('./zen/index');
const { gemini } = require('./gemini/index');
const { DEFAULT_MODEL_KEY, MODELS } = require('../config');

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

async function runProvider(provider, messages, model, onChunk, options = {}) {
  switch (provider) {
    case 'zen':
      return zen(messages, model.zenModel, onChunk, options);
    case 'gemini':
      return gemini(messages, model.geminiModel || 'gemini-flash', onChunk, options);
    case 'qwen':
    default: {
      const prompt = buildPromptFromMessages(messages);
      return qwen(prompt, onChunk, options);
    }
  }
}

async function chat({ messages, onChunk, modelKey, signal }) {
  const { key, model } = getModelDefinition(modelKey);
  const provider = model?.provider || 'qwen';
  const result = await runProvider(provider, messages, model || {}, onChunk, { signal, modelKey: key });

  return {
    answer: result.text || '',
    thinking: result.thinking || '',
  };
}

async function chatSilent({ messages, modelKey, signal }) {
  const { key, model } = getModelDefinition(modelKey);
  const provider = model?.provider || 'qwen';
  const result = await runProvider(provider, messages, model || {}, null, { signal, modelKey: key });
  return { answer: result.text || '' };
}

module.exports = { chat, chatSilent, buildPromptFromMessages, getModelDefinition };
