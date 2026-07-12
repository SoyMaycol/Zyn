const { createOpenAICompatible } = require('../openai-compatible/index');

// Ollama Local: http://localhost:11434/v1/ (no API key needed)
const ollama = createOpenAICompatible('Ollama Local', 'http://localhost:11434/v1', null, 8192);

// Ollama Cloud: https://ollama.com/api/ (needs API key from ollama.com)
const ollamaCloud = createOpenAICompatible('Ollama Cloud', 'https://ollama.com/api', 'OLLAMA_API_KEY', 8192);

module.exports = { ollama, ollamaCloud };
