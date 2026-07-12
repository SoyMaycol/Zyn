const { createOpenAICompatible } = require('../openai-compatible/index');
const zyncloud = createOpenAICompatible('Zyn Cloud', 'https://zyn.soymaycol.icu/v1', 'ZYNCLOUD_API_KEY', 16384);
module.exports = { zyncloud };
