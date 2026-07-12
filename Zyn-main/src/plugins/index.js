const fs = require('fs');
const path = require('path');
const { PLUGINS_DIR } = require('../config');

const _pluginToolDefs = [];
const _loadedPlugins = new Map();

function scanInstalledPlugins() {
  const nodeModules = path.join(PLUGINS_DIR, 'node_modules');
  if (!fs.existsSync(nodeModules)) return [];
  try {
    return fs.readdirSync(nodeModules).filter(name => {
      const dir = path.join(nodeModules, name);
      return fs.statSync(dir).isDirectory() && !name.startsWith('.');
    });
  } catch {
    return [];
  }
}

function readPluginManifest(pluginDir) {
  const manifestPath = path.join(pluginDir, 'manifest.json');
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function loadPlugins() {
  const names = scanInstalledPlugins();
  let toolCount = 0;

  for (const name of names) {
    if (_loadedPlugins.has(name)) continue;
    const pluginDir = path.join(PLUGINS_DIR, 'node_modules', name);
    const manifest = readPluginManifest(pluginDir);

    try {
      let pluginExports;
      const mainFile = manifest?.main || 'index.js';
      const mainPath = path.join(pluginDir, mainFile);
      if (fs.existsSync(mainPath)) {
        pluginExports = require(mainPath);
      }
      if (!pluginExports || typeof pluginExports.register !== 'function') continue;

      const ctx = {
        pluginName: name,
        manifest,
        registerTool(def) {
          const toolName = `plugin_${name}_${def.name}`;
          _pluginToolDefs.push({
            name: toolName,
            description: def.description || '',
            parameters: def.parameters || def.inputSchema || {},
            plugin: name,
            fn: def.fn,
          });
        },
      };

      pluginExports.register(ctx);
      _loadedPlugins.set(name, { manifest, tools: _pluginToolDefs.filter(t => t.plugin === name) });
      toolCount += _pluginToolDefs.filter(t => t.plugin === name).length;
    } catch (err) {
      console.error(`Plugin "${name}" load error: ${err.message}`);
    }
  }

  return { loaded: _loadedPlugins.size, tools: toolCount };
}

function getPluginToolDefinitions() {
  return _pluginToolDefs;
}

async function executePluginToolCall(fullToolName, args) {
  const def = _pluginToolDefs.find(t => t.name === fullToolName);
  if (!def) throw new Error(`Plugin tool not found: ${fullToolName}`);
  if (typeof def.fn !== 'function') throw new Error(`Plugin tool "${fullToolName}" has no handler`);
  return def.fn(args);
}

function reloadPlugins() {
  _pluginToolDefs.length = 0;
  _loadedPlugins.clear();
  Object.keys(require.cache).forEach(key => {
    if (key.includes(PLUGINS_DIR)) delete require.cache[key];
  });
  return loadPlugins();
}

module.exports = {
  getPluginToolDefinitions,
  executePluginToolCall,
  loadPlugins,
  reloadPlugins,
  scanInstalledPlugins,
};
