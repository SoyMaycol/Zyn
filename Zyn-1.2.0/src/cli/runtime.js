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
  loadOrCreateSessionState,
} = require('../utils/sessionStorage');
const { appendTranscriptEntry } = require('../utils/transcriptStorage');

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

function getCommandDeps() {
  return {
    appendTranscriptEntry,
    applyLoadedState,
    printBanner,
    printHistory,
    printMemory,
    printSession,
    printSessions,
    printStatus,
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
    const { resumed } = loaded;
    if (process.stdout.isTTY) {
      await printWelcome();
      printBanner(state);
      logEvent(state, 'info', resumed ? 'session resumed' : 'new session');
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

  const { state, resumed } = await loadOrCreateSessionState(rl, options);
  await printWelcome();
  printBanner(state);
  logEvent(state, 'info', resumed ? 'session resumed' : 'chat active — /help for commands');
  console.log('');

  const messageQueue = [];
  let pendingExit = false;
  let currentAbort = null;

  state.getQueuedMessages = () => messageQueue.splice(0);
  state.abortCurrentTurn = () => {
    if (currentAbort && !currentAbort.signal.aborted) {
      currentAbort.abort();
      return true;
    }
    return false;
  };

  const runCommandInline = async (input) => {
    try {
      const handled = await handleLocalCommand(input, state, getCommandDeps());
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
      const result = await runAgentTurn(input, state, getUiBindings(), { signal: currentAbort.signal });
      if (!result.rendered) {
        await streamBufferedAssistantMessage(state, result.content);
      }
    } catch (err) {
      logEvent(state, 'error', 'Error', err.message);
    } finally {
      currentAbort = null;
    }
  };

  try {
    while (true) {
      const input = (await rl.question('  \x1b[97m❯\x1b[0m ')).trim();
      if (!input) continue;

      if (input === '/exit' || input === '/quit') {
        logEvent(state, 'info', 'Hasta luego');
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
        logEvent(state, 'info', 'Hasta luego');
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

  console.log(`  ${C.cyan}[1/4]${C.reset} Config y modelos`);
  const modelKeys = Object.keys(MODELS);
  const zenModels = modelKeys.filter(k => MODELS[k].provider === 'zen');
  if (modelKeys.length > 0) {
    console.log(`    ${ok('Modelos registrados: ' + modelKeys.join(', '))}`);
    console.log(`    ${ok('Zen models: ' + zenModels.map(k => MODELS[k].label).join(', '))}`);
  } else {
    console.log(`    ${fail('No hay modelos registrados')}`);
  }
  console.log('');

  console.log(`  ${C.cyan}[2/4]${C.reset} Modulos cargables`);
  const modules = [
    ['core/agent', '../core/agent'],
    ['core/prompts', '../core/prompts'],
    ['tools/index', '../tools/index'],
    ['providers/scraperClient', '../providers/scraperClient'],
    ['providers/zen', '../providers/zen/index'],
    ['providers/qwen', '../providers/qwen/index'],
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

  console.log(`  ${C.cyan}[3/4]${C.reset} TUI (ESM import)`);
  try {
    await import('../tui/app.mjs');
    console.log(`    ${ok('tui/app.mjs cargado correctamente')}`);
  } catch (err) {
    console.log(`    ${fail('tui/app.mjs: ' + err.message)}`);
  }
  console.log('');

  console.log(`  ${C.cyan}[4/4]${C.reset} Zen API — stream en vivo (nemotron)`);
  console.log(`    ${dim('Enviando: "que modelo eres?"')}`);
  process.stdout.write(`    ${C.purple}`);
  try {
    const startMs = Date.now();
    let totalChars = 0;
    const msgs = [{ role: 'user', content: 'que modelo eres? responde en 1 linea corta' }];
    await zen(msgs, 'nemotron-3-super-free', (text, phase) => {
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

  console.log('');
  console.log(`  ${dim('─'.repeat(40))}`);
  console.log(`  ${title('Test completado')}`);
  console.log('');
}

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs[0] === 'test') {
    await runTest();
    return;
  }

  const options = {
    forceNew: false,
    sessionId: null,
  };
  const args = [];

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === '--new') {
      options.forceNew = true;
      continue;
    }

    if (arg === '--resume') {
      options.sessionId = rawArgs[index + 1] ?? null;
      index += 1;
      continue;
    }

    args.push(arg);
  }

  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    return;
  }

  if (args[0] === 'web' || args.includes('--web')) {
    const { handleLocalCommand } = require('./commands');
    const tmpState = { abortCurrentTurn: null };
    await handleLocalCommand('/web start', tmpState, {
      applyLoadedState: () => {},
      appendTranscriptEntry: async () => {},
      printBanner: () => {},
      printHistory: () => {},
      printMemory: () => {},
      printSession: () => {},
      printSessions: () => {},
      printStatus: () => {},
    });
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
