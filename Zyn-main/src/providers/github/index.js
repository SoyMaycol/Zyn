const { createOpenAICompatible } = require('../openai-compatible/index');

// GitHub Models: https://models.github.ai/inference/ (needs GitHub PAT with models:read)
const github = createOpenAICompatible('GitHub Models', 'https://models.github.ai/inference', 'GITHUB_TOKEN', 16384);

module.exports = { github };
