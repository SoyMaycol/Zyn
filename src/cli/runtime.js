const readline = require('readline/promises');

const { handleLocalCommand, printHelp } = require('./commands');
const {
  beginAssistantStream,
  beginThinkingStream,
  endAssistantStream,
  endThinkingStream,
  logEvent,
  paint,
  printBanner,
  printHistory,
  printHistoryReplay,
  printMemory,
  printSession,
  printSessions,
  printStatus,
  printWelcome,
  pushAction,
  shortText,
  startThinkingIndicator,
  streamBufferedAssistantMessage,
  writeAssistantDelta,
  writeThinkingDelta,
} = require('./print');
const { runAgentTurn } = require('../core/agent');
const {
  applyLoadedState,
  consumeBackgroundResult,
  listBackgroundResults,
  loadOrCreateSessionState,
} = require('../utils/sessionStorage');
const { appendTranscriptEntry } = require('../utils/transcriptStorage');
const { t } = require('../i18n');

async function readPromptFromStdin() {
  if (process.stdin.isTTY) {
    return '';
  }

  let data = '';
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return data.trim();
}

function getUiBindings() {
  return {
    beginAssistantStream,
    beginThinkingStream,
    endAssistantStream,
    endThinkingStream,
    logEvent,
    paint,
    pushAction,
    startThinkingIndicator,
    writeAssistantDelta,
    writeThinkingDelta,
  };
}

const selector = require('./selector');

function getCommandDeps(extra = {}) {
  return {
    appendTranscriptEntry,
    applyLoadedState,
    printBanner,
    printHistory,
    printHistoryReplay,
    printMemory,
    printSession,
    printSessions,
    printStatus,
    askSelect: (options) => selector.askSelect(extra?.state || null, null, options),
    askInput: (options) => selector.askInput(extra?.state || null, null, options),
    askConfirm: (options) => selector.askConfirm(extra?.state || null, null, options),
    ...extra,
  };
}

async function runSinglePrompt(prompt, options = {}) {
  const rl = process.stdin.isTTY && process.stdout.isTTY
    ? readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })
    : null;
  let state = null;

  try {
    const loaded = await loadOrCreateSessionState(rl, options);
    state = loaded.state;
    if (!rl) {
      state.autoApprove = true;
    }

    try {
      const fs = require('fs');
      const { MCP_CONFIG_FILE } = require('../config');
      const mcpConfigPath = MCP_CONFIG_FILE;
      const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
      state.mcpServers = mcpConfig.servers || {};
    } catch {
      state.mcpServers = {};
    }
    try { require('../mcp/client').autoConnectAll(); } catch {}
    try { require('../plugins/index').loadPlugins(); } catch {}

    const { resumed, rehydrated } = loaded;
    if (process.stdout.isTTY) {
      await printWelcome();
      printBanner(state);
      logEvent(state, 'info', resumed ? 'session resumed' : 'new session');
      if (rehydrated && Array.isArray(state.__resumedHistory) && state.__resumedHistory.length > 0) {
        printHistoryReplay(state, state.__resumedHistory);
      }
      console.log('');
    }

    const result = await runAgentTurn(prompt, state, getUiBindings());
    if (process.stdout.isTTY) {
      if (!result.rendered) {
        await streamBufferedAssistantMessage(state, result.content);
      }
    } else {
      process.stdout.write(`${result.content}\n`);
    }
  } finally {
    state?.rl?.close();
  }
}

async function runInteractiveChatClassic(options = {}) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const { state, resumed, rehydrated } = await loadOrCreateSessionState(rl, options);

  try {
    const fs = require('fs');
    const { MCP_CONFIG_FILE } = require('../config');
    const mcpConfigPath = MCP_CONFIG_FILE;
    const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
    state.mcpServers = mcpConfig.servers || {};
  } catch {
    state.mcpServers = {};
  }

  try {
    const { autoConnectAll } = require('../mcp/client');
    const mcpResults = await autoConnectAll();
    const connected = mcpResults.filter(r => r.ok);
    const failed = mcpResults.filter(r => !r.ok);
    if (connected.length > 0) {
      const summary = connected.map(r => `${r.name}(${r.toolCount})`).join(', ');
      logEvent(state, 'info', `MCP Connected: ${summary}`);
      if (process.stdout.isTTY) console.log(`\x1b[36m  \u00b7 MCP\x1b[0m\n    Connected: ${summary}`);
    }
    if (failed.length > 0) {
      const failSummary = failed.map(r => `${r.name}: ${r.error || 'unreachable'}`).join(', ');
      logEvent(state, 'warn', `MCP Failed: ${failSummary}`);
      if (process.stdout.isTTY) console.log(`\x1b[33m  \u00b7 MCP\x1b[0m\n    Failed: ${failSummary}`);
    }
  } catch {}

  try {
    const { loadPlugins } = require('../plugins/index');
    const pluginResult = loadPlugins();
    if (pluginResult.loaded > 0) {
      logEvent(state, 'info', `Plugins: ${pluginResult.loaded} loaded, ${pluginResult.tools} tools`);
      if (process.stdout.isTTY) console.log(`\x1b[32m  \u00b7 Plugins\x1b[0m\n    ${pluginResult.loaded} loaded, ${pluginResult.tools} tools`);
    }
  } catch {}

  const completedBackgrounds = await listBackgroundResults(state.sessionId).catch(() => []);
  if (completedBackgrounds.length > 0) {
    console.log('');
    for (const bg of completedBackgrounds) {
      const status = bg.result?.ok ? 'OK' : 'FAIL';
      const preview = bg.result?.ok ? shortText(bg.result.content || '', 100) : (bg.result?.error || 'unknown');
      console.log(`  \x1b[36m[bg ${status}]\x1b[0m \x1b[90mtask:${bg.taskId}\x1b[0m`);
      console.log(`    ${preview}`);
      await consumeBackgroundResult(bg.taskId);
    }
    console.log('');
  }

  await printWelcome();
  printBanner(state);
  logEvent(state, 'info', resumed ? 'session resumed' : 'chat active — /help for commands');
  if (rehydrated && Array.isArray(state.__resumedHistory) && state.__resumedHistory.length > 0) {
    printHistoryReplay(state, state.__resumedHistory);
  }
  console.log('');

  const messageQueue = [];
  let pendingExit = false;
  let currentAbort = null;
  let pendingExitAfterBg = false;

  state.getQueuedMessages = () => messageQueue.splice(0);
  state.clearQueuedMessages = () => { messageQueue.length = 0; };
  state.abortCurrentTurn = () => {
    if (currentAbort && !currentAbort.signal.aborted) {
      currentAbort.abort();
      return true;
    }
    return false;
  };

  const runCommandInline = async (input) => {
    try {
      const handled = await handleLocalCommand(input, state, getCommandDeps({
        exitAfterBg: () => { pendingExitAfterBg = true; pendingExit = true; },
      }));
      if (!handled) {
        console.log('Comando no reconocido. Usa /help.');
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
  };

  const processInput = async (input, { fromQueue = false } = {}) => {
    if (input === '/exit' || input === '/quit') {
      pendingExit = true;
      return;
    }

    if (input.startsWith('/')) {
      await runCommandInline(input);
      return;
    }

    try {
      currentAbort = new AbortController();
      state.abortCurrentTurn = () => {
        if (!currentAbort.signal.aborted) {
          currentAbort.abort();
          return true;
        }
        return false;
      };
      state.__bgDetach = { input, signal: currentAbort.signal };
      const result = await runAgentTurn(input, state, getUiBindings(), { signal: currentAbort.signal });
      if (!result.rendered) {
        await streamBufferedAssistantMessage(state, result.content);
      }
    } catch (err) {
      logEvent(state, 'error', 'Error', err.message);
    } finally {
      currentAbort = null;
      state.__bgDetach = null;
    }
  };

  try {
    while (true) {
      const input = (await rl.question('  \x1b[97m❯\x1b[0m ')).trim();
      if (!input) continue;

      if (input === '/exit' || input === '/quit') {
        logEvent(state, 'info', t(state.language, 'goodbye'));
        break;
      }

      const lineHandler = (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (trimmed.startsWith('/')) {
          void runCommandInline(trimmed);
          return;
        }
        messageQueue.push(trimmed);
        console.log(`  \x1b[33m📩 en cola:\x1b[0m \x1b[90m${shortText(trimmed, 60)}\x1b[0m`);
      };
      rl.on('line', lineHandler);

      await processInput(input);

      while (messageQueue.length > 0) {
        const next = messageQueue.shift();
        console.log(`\n  \x1b[33m▸\x1b[0m procesando mensaje en cola: \x1b[97m${shortText(next, 50)}\x1b[0m`);
        await processInput(next, { fromQueue: true });
      }

      rl.removeListener('line', lineHandler);

      if (pendingExit) {
        if (pendingExitAfterBg) {
          logEvent(state, 'info', 'Background task scheduled. Exiting CLI...');
        } else {
          logEvent(state, 'info', t(state.language, 'goodbye'));
        }
        break;
      }
    }
  } finally {
    rl.close();
  }
}

async function runInteractiveChat(options = {}) {
  let useTui = false;
  try {
    require.resolve('ink');
    useTui = true;
  } catch {}

  if (useTui) {
    const { startTUI } = await import('../tui/app.mjs');
    await startTUI(options);
  } else {
    await runInteractiveChatClassic(options);
  }
}

async function runTest() {
  const { MODELS } = require('../config');
  const { zen } = require('../providers/zen/index');

  const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    accent: '\x1b[38;5;179m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    white: '\x1b[97m',
    purple: '\x1b[35m',
  };

  const ok = (t) => `${C.green}✓${C.reset} ${t}`;
  const fail = (t) => `${C.red}✗${C.reset} ${t}`;
  const title = (t) => `${C.accent}${C.bold}${t}${C.reset}`;
  const dim = (t) => `${C.gray}${t}${C.reset}`;

  console.log('');
  console.log(`  ${title('● Zyn Test Suite')}`);
  console.log(`  ${dim('─'.repeat(40))}`);
  console.log('');

  console.log(`  ${C.cyan}[1/5]${C.reset} Config y modelos`);
  const modelKeys = Object.keys(MODELS);
  const zenModels = modelKeys.filter(k => MODELS[k].provider === 'zen');
  if (modelKeys.length > 0) {
    console.log(`    ${ok('Modelos registrados: ' + modelKeys.join(', '))}`);
    console.log(`    ${ok('Zen models: ' + zenModels.map(k => MODELS[k].label).join(', '))}`);
  } else {
    console.log(`    ${fail('No hay modelos registrados')}`);
  }
  console.log('');

  console.log(`  ${C.cyan}[2/5]${C.reset} Modulos cargables`);
  const modules = [
    ['core/agent', '../core/agent'],
    ['core/prompts', '../core/prompts'],
    ['tools/index', '../tools/index'],
    ['providers/scraperClient', '../providers/scraperClient'],
    ['providers/zen', '../providers/zen/index'],
    ['providers/qwenapi', '../providers/qwenapi/index'],
  ];
  for (const [name, modPath] of modules) {
    try {
      require(modPath);
      console.log(`    ${ok(name)}`);
    } catch (err) {
      console.log(`    ${fail(name + ': ' + err.message)}`);
    }
  }
  console.log('');

  console.log(`  ${C.cyan}[3/5]${C.reset} TUI (ESM import)`);
  try {
    await import('../tui/app.mjs');
    console.log(`    ${ok('tui/app.mjs cargado correctamente')}`);
  } catch (err) {
    console.log(`    ${fail('tui/app.mjs: ' + err.message)}`);
  }
  console.log('');

  console.log(`  ${C.cyan}[4/5]${C.reset} Zen API — stream en vivo (nemotron)`);
  console.log(`    ${dim('Enviando: "que modelo eres?"')}`);
  process.stdout.write(`    ${C.purple}`);
  try {
    const startMs = Date.now();
    let totalChars = 0;
    const msgs = [{ role: 'user', content: 'que modelo eres? responde en 1 linea corta' }];
    await zen(msgs, 'nemotron-3-ultra-free', (text, phase) => {
      if (phase === 'answer') {
        process.stdout.write(text);
        totalChars += text.length;
      }
    });
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    process.stdout.write(C.reset + '\n');
    console.log(`    ${ok(`${totalChars} chars en ${elapsed}s`)}`);
  } catch (err) {
    process.stdout.write(C.reset + '\n');
    console.log(`    ${fail(err.message)}`);
  }

  const { parseAgentResponse } = require('../core/prompts');

  console.log(`  ${C.cyan}[5/5]${C.reset} parseAgentResponse`);
  const parseTests = [
    ['Pure JSON tool', '{"type":"tool","tool":"list_dir","args":{"path":"."}}', 'tool', 'list_dir'],
    ['Pure JSON final', '{"type":"final","content":"Hola"}', 'final', null],
    ['Text+tool JSON', 'Voy a listar el directorio {"type":"tool","tool":"list_dir","args":{"path":"."}}', 'tool', 'list_dir'],
    ['Text+final JSON', 'La respuesta es {"type":"final","content":"Hola"}', 'final', null],
    ['XML invoke', '<invoke name="write_file"><args>{"path":"test.txt","content":"test"}</args></invoke>', 'tool', 'write_file'],
    ['Malformed final', '{"type":"final","content":"Respuesta truncada', 'final', null],
    ['Plain text', 'Hola mundo', 'final', null],
    ['Empty string', '', 'final', null],
  ];
  let parseOk = 0;
  for (const [name, input, expType, expTool] of parseTests) {
    const result = parseAgentResponse(input);
    if (result && result.type === expType && (expTool === null || result.tool === expTool)) {
      parseOk++;
    } else {
      console.log(`    ${fail(`${name}: se esperaba ${expType}${expTool ? '/' + expTool : ''}, se obtuvo ${JSON.stringify(result)}`)}`);
    }
  }
  if (parseOk === parseTests.length) {
    console.log(`    ${ok(`${parseOk}/${parseTests.length} casos correctos`)}`);
  } else {
    console.log(`    ${fail(`${parseOk}/${parseTests.length} casos correctos`)}`);
  }

  console.log('');
  console.log(`  ${dim('─'.repeat(40))}`);
  console.log(`  ${title('Test completado')}`);
  console.log('');
}

async function main() {
  const cleanup = () => { try { require('../mcp/client').stopAllStdioServers(); } catch {} };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  const rawArgs = process.argv.slice(2);

  if (rawArgs[0] === 'test') {
    await runTest();
    return;
  }

  if (rawArgs[0] === 'skills') {
    const { installSkill, listSkills } = require('../core/skills');
    const sub = rawArgs[1];
    if (sub === 'install' && rawArgs[2]) {
      const repo = rawArgs[2];
      const skillName = rawArgs[3] || null;
      console.log(`\n  Instalando skill desde ${repo}...`);
      try {
        const result = await installSkill(repo, skillName);
        console.log(`  ✓ Skill "${result.name}" instalada en ${result.path}`);
        if (result.description) console.log(`  ${result.description}`);
      } catch (err) {
        console.error(`  ✗ Error: ${err.message}`);
        process.exit(1);
      }
    } else if (sub === 'list') {
      const skills = listSkills();
      console.log('\n  Skills instaladas:');
      for (const s of skills) {
        console.log(`    ${s.name} — ${s.description || s.title || ''}`);
      }
    } else {
      console.log('\n  Uso:');
      console.log('    node zyn.js skills install <owner/repo> [name]');
      console.log('    node zyn.js skills list');
    }
    return;
  }

  const options = {
    forceNew: true,
    sessionId: null,
    resume: false,
  };
  const args = [];

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === '--new') {
      options.forceNew = true;
      continue;
    }

    if (arg === '--resume') {
      options.forceNew = false;
      options.resume = true;
      if (rawArgs[index + 1] && !rawArgs[index + 1].startsWith('--')) {
        options.sessionId = rawArgs[index + 1];
        index += 1;
      }
      continue;
    }

    args.push(arg);
  }

  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    return;
  }

  if (args[0] === 'web' || args.includes('--web')) {
    console.error('La versión web de Zyn fue eliminada. El agente ahora es CLI/TUI + integrable vía API pública (require("zyn-ai/agent")).');
    return;
  }

  if (args[0] === '--bg-run' || process.env.ZYN_BG_RUN === '1') {
    const { runBackgroundWorker } = require('../utils/backgroundWorker');
    await runBackgroundWorker();
    return;
  }

  const stdinPrompt = await readPromptFromStdin();
  if (stdinPrompt) {
    await runSinglePrompt(stdinPrompt, options);
    return;
  }

  if (args.length > 0) {
    await runSinglePrompt(args.join(' '), options);
    return;
  }

  await runInteractiveChat(options);
}

module.exports = {
  main,
};
