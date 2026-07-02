const { createOpenAICompatible } = require('../openai-compatible/index');

// Chutes AI: https://llm.chutes.ai/v1 (OpenAI-compatible)
const chutes = createOpenAICompatible('Chutes AI', 'https://llm.chutes.ai/v1', 'CHUTES_API_KEY', 16384);

module.exports = { chutes };
