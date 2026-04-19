const { qwen } = require('./qwenScraper');

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

async function chat({ messages, onChunk }) {
  const prompt = buildPromptFromMessages(messages);
  const result = await qwen(prompt, onChunk);

  return {
    answer: result.text || '',
    thinking: result.thinking || '',
  };
}

module.exports = { chat, buildPromptFromMessages };
