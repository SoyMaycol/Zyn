const { createOpenAICompatible } = require('../openai-compatible/index');

// Inference.net: https://api.inference.net/v1 (OpenAI-compatible)
const inference = createOpenAICompatible('Inference.net', 'https://api.inference.net/v1', 'INFERENCE_API_KEY', 16384);

module.exports = { inference };
