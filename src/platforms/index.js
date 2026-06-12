function load(name) {
  switch (name) {
    case 'baileys':
    case 'whatsapp':
      return () => require('./baileys');
    case 'discord':
      return () => require('./discord');
    case 'telegram':
      return () => require('./telegram');
    default:
      throw new Error(`Unknown platform: ${name}`);
  }
}

const adapters = {
  baileys: () => require('./baileys'),
  whatsapp: () => require('./baileys'),
  discord: () => require('./discord'),
  telegram: () => require('./telegram'),
};

function get(name) {
  const factory = adapters[name];
  if (!factory) throw new Error(`Unknown platform: ${name}. Available: ${Object.keys(adapters).join(', ')}`);
  return factory();
}

module.exports = { get, load, adapters };
