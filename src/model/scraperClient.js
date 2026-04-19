const { qwen } = require('./qwenScraper');
const { deepseek } = require('./deepseekScraper');
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
  const prompt = buildPromptFromMessages(messages);
  const key = modelKey || DEFAULT_MODEL_KEY;
  const provider = MODELS[key]?.provider || 'qwen';

  let result;
  if (provider === 'deepseek') {
    result = await deepseek(prompt, onChunk);
  } else {
    result = await qwen(prompt, onChunk);
  }

  return {
    answer: result.text || '',
    thinking: result.thinking || '',
  };
}

module.exports = { chat, buildPromptFromMessages };
