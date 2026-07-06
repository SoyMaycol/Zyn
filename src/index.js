const manifest = require('../manifest.json');
const themeData = require('./rgb-theme.json');

function registerTheme(api) {
  if (!api || typeof api !== 'object') {
    return themeData;
  }

  if (typeof api.registerTheme === 'function') {
    api.registerTheme(manifest.theme || 'rgb', themeData.palette || themeData);
  }

  if (typeof api.addTheme === 'function') {
    api.addTheme({
      name: manifest.theme || 'rgb',
      label: themeData.label || 'RGB Neon',
      ...themeData,
    });
  }

  return themeData;
}

module.exports = {
  manifest,
  theme: themeData,
  registerTheme,
  default: themeData,
};
