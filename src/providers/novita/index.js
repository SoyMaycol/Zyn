const { createOpenAICompatible } = require('../openai-compatible/index');

// Novita AI: https://api.novita.ai/openai/v1 (OpenAI-compatible)
const novita = createOpenAICompatible('Novita AI', 'https://api.novita.ai/openai/v1', 'NOVITA_API_KEY', 16384);

module.exports = { novita };
