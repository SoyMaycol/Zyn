const { qwen } = require('./qwenScraper');
const { zen } = require('./zenScraper');
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

async function chat({ messages, onChunk, modelKey }) {
  const key = modelKey || DEFAULT_MODEL_KEY;
  const model = MODELS[key];
  const provider = model?.provider || 'qwen';

  let result;
  if (provider === 'zen') {
    result = await zen(messages, model.zenModel, onChunk);
  } else {
    const prompt = buildPromptFromMessages(messages);
    result = await qwen(prompt, onChunk);
  }

  return {
    answer: result.text || '',
    thinking: result.thinking || '',
  };
}

async function chatSilent({ messages, modelKey }) {
  const key = modelKey || DEFAULT_MODEL_KEY;
  const model = MODELS[key];
  const provider = model?.provider || 'qwen';

  let result;
  if (provider === 'zen') {
    result = await zen(messages, model.zenModel);
  } else {
    const prompt = buildPromptFromMessages(messages);
    result = await qwen(prompt, () => {});
  }

  return { answer: result.text || '' };
}

module.exports = { chat, chatSilent, buildPromptFromMessages };
