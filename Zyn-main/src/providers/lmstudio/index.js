const { createOpenAICompatible } = require('../openai-compatible/index');

// LM Studio Local: http://localhost:1234/v1/ (no API key needed)
const lmstudio = createOpenAICompatible('LM Studio', 'http://localhost:1234/v1', null, 16384);

// LM Studio Remote: configurable URL
const lmstudioRemote = createOpenAICompatible('LM Studio Remote', 'http://localhost:1234/v1', 'LM_STUDIO_API_KEY', 16384);

module.exports = { lmstudio, lmstudioRemote };
