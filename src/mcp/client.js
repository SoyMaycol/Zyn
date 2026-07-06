const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const MCP_CONFIG_PATH = path.join(__dirname, '..', '..', 'data', 'chat', 'mcp-servers.json');

const _stdioProcesses = new Map();

function loadMcpConfig() {
  try { return JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf8')); }
  catch { return { servers: {} }; }
}

function getConnectedServers() {
  const config = loadMcpConfig();
  return Object.entries(config.servers || {})
    .filter(([, srv]) => srv.connected)
    .map(([name, srv]) => ({ name, url: srv.url, transport: srv.transport || (srv.url ? 'http' : 'stdio'), tools: srv.tools || [] }));
}

function httpRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const reqOpts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 30000,
    };
    const req = http.request(reqOpts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body, ok: res.statusCode >= 200 && res.statusCode < 300 });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

function _stdioRequest(serverName, method, endpoint, body = null, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const proc = _stdioProcesses.get(serverName);
    if (!proc || proc.killed) {
      return reject(new Error(`MCP server "${serverName}" stdio process not running`));
    }

    const reqId = `_req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const request = { jsonrpc: '2.0', id: reqId, method, params: body || {} };

    const timer = setTimeout(() => {
      reject(new Error(`MCP stdio request timeout for "${serverName}"`));
    }, timeout);

    const onData = (chunk) => {
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        try {
          const parsed = JSON.parse(data);
          if (parsed.id === reqId) {
            clearTimeout(timer);
            proc.stdout.removeListener('data', onData);
            if (parsed.error) reject(new Error(parsed.error.message || 'MCP stdio error'));
            else resolve(parsed.result);
            return;
          }
        } catch {}
      }
    };

    proc.stdout.on('data', onData);
    proc.stdin.write(JSON.stringify(request) + '\n');
  });
}

async function startStdioServer(name, config) {
  if (_stdioProcesses.has(name)) return;

  const cmd = config.command;
  const args = config.args || [];
  const env = { ...process.env, ...(config.env || {}) };
  const cwd = config.cwd || process.cwd();

  const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env, cwd, shell: false });
  _stdioProcesses.set(name, proc);

  let stderrBuf = '';
  proc.stderr.on('data', (chunk) => { stderrBuf += chunk.toString(); });

  proc.on('error', (err) => {
    console.error(`MCP stdio "${name}" error:`, err.message);
    _stdioProcesses.delete(name);
  });

  proc.on('exit', (code) => {
    _stdioProcesses.delete(name);
  });

  await new Promise(r => setTimeout(r, 500));
  return proc;
}

async function stopStdioServer(name) {
  const proc = _stdioProcesses.get(name);
  if (proc && !proc.killed) {
    proc.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 500));
    if (!proc.killed) proc.kill('SIGKILL');
  }
  _stdioProcesses.delete(name);
}

async function callMcpTool(serverName, toolName, args) {
  const config = loadMcpConfig();
  const srv = config.servers?.[serverName];
  if (!srv) throw new Error(`MCP server "${serverName}" not found`);
  if (!srv.connected) throw new Error(`MCP server "${serverName}" is not connected`);

  const transport = srv.transport || (srv.url ? 'http' : 'stdio');

  if (transport === 'stdio') {
    if (!_stdioProcesses.has(serverName)) {
      await startStdioServer(serverName, srv);
    }
    const result = await _stdioRequest(serverName, 'tools/call', '/tools/call', { name: toolName, arguments: args });
    return result;
  }

  const url = srv.url.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json', ...(srv.headers || {}) };
  let response;
  try {
    response = await httpRequest(`${url}/tools/call`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: toolName, arguments: args }),
      timeout: 30000,
    });
  } catch (reqErr) {
    if (reqErr?.code === 'ECONNREFUSED') {
      throw new Error(`No se pudo conectar al servidor MCP "${serverName}" en ${url} (el servidor no está ejecutándose)`);
    }
    throw new Error(`Error de conexión al servidor MCP "${serverName}": ${reqErr?.message || reqErr}`);
  }

  if (!response.ok) {
    throw new Error(`MCP tool call failed (${response.status}): ${response.body.slice(0, 200)}`);
  }

  return JSON.parse(response.body);
}

async function autoConnectAll() {
  const config = loadMcpConfig();
  const results = [];
  for (const [name, srv] of Object.entries(config.servers || {})) {
    if (!srv.connected) continue;
    const transport = srv.transport || (srv.url ? 'http' : 'stdio');
    if (transport === 'stdio') {
      try {
        await startStdioServer(name, srv);
        const tools = await discoverMcpTools(name);
        results.push({ name, ok: true, toolCount: tools.length });
      } catch (err) {
        config.servers[name].connected = false;
        results.push({ name, ok: false, toolCount: 0, error: err?.message });
      }
    } else {
      try {
        const tools = await discoverMcpTools(name);
        results.push({ name, ok: true, toolCount: tools.length });
      } catch (err) {
        config.servers[name].connected = false;
        results.push({ name, ok: false, toolCount: 0, error: err?.message });
      }
    }
  }
  try {
    fs.mkdirSync(path.dirname(MCP_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch {}
  return results;
}

async function discoverMcpTools(serverName) {
  const config = loadMcpConfig();
  const srv = config.servers?.[serverName];
  if (!srv) throw new Error(`MCP server "${serverName}" not found`);

  const transport = srv.transport || (srv.url ? 'http' : 'stdio');

  if (transport === 'stdio') {
    if (!_stdioProcesses.has(serverName)) {
      await startStdioServer(serverName, srv);
    }
    const result = await _stdioRequest(serverName, 'tools/list', '/tools');
    const tools = result?.tools || (Array.isArray(result) ? result : []);
    config.servers[serverName].tools = tools;
    fs.mkdirSync(path.dirname(MCP_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    return tools;
  }

  const url = srv.url.replace(/\/$/, '');
  const headers = { ...(srv.headers || {}) };
  let response;
  try {
    response = await httpRequest(`${url}/tools`, { timeout: 5000, headers });
  } catch (reqErr) {
    if (reqErr?.code === 'ECONNREFUSED') {
      throw new Error(`Servidor "${serverName}" no está ejecutándose en ${url}`);
    }
    throw new Error(`Error de conexión al servidor "${serverName}": ${reqErr?.message || reqErr}`);
  }
  if (!response.ok) throw new Error(`Discovery failed (${response.status})`);
  const data = JSON.parse(response.body);
  const tools = Array.isArray(data) ? data : (data.tools || []);
  config.servers[serverName].tools = tools;
  fs.mkdirSync(path.dirname(MCP_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  return tools;
}

function getMcpToolDefinitions() {
  const servers = getConnectedServers();
  const defs = [];
  for (const srv of servers) {
    for (const tool of srv.tools || []) {
      defs.push({
        name: `mcp_${srv.name}_${tool.name}`,
        description: `[MCP:${srv.name}] ${tool.description || tool.name}`,
        parameters: tool.parameters || tool.inputSchema || { type: 'object', properties: {} },
        mcpServer: srv.name,
        mcpTool: tool.name,
      });
    }
  }
  return defs;
}

async function executeMcpToolCall(fullToolName, args) {
  const servers = getConnectedServers();
  for (const srv of servers) {
    const prefix = `mcp_${srv.name}_`;
    if (fullToolName.startsWith(prefix)) {
      const toolName = fullToolName.slice(prefix.length);
      return await callMcpTool(srv.name, toolName, args);
    }
  }
  throw new Error(`MCP tool "${fullToolName}" not found in any connected server`);
}

module.exports = {
  loadMcpConfig,
  getConnectedServers,
  callMcpTool,
  discoverMcpTools,
  getMcpToolDefinitions,
  executeMcpToolCall,
  autoConnectAll,
  startStdioServer,
  stopStdioServer,
};
