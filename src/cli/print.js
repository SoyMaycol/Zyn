const {
  ACTION_LOG_LIMIT,
  APP_NAME,
  DEFAULT_MODEL_KEY,
  MODELS,
  THINK_FRAMES,
} = require('../config');
const { shortText } = require('../utils/text');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  white: '\x1b[97m',
  light: '\x1b[37m',
  gray: '\x1b[90m',
  darkGray: '\x1b[38;5;240m',
  faintGreen: '\x1b[38;5;250m',
  faintRed: '\x1b[38;5;245m',
};

function hasTTY() {
  return Boolean(process.stdout.isTTY || process.stderr.isTTY);
}

function c(text, ...styles) {
  if (!hasTTY()) return text;
  return styles.join('') + text + C.reset;
}

function termWidth() {
  return Math.max(60, Math.min(process.stdout.columns ?? 80, 100));
}

function pushAction(state, kind, title, detail = '') {
  if (!state?.actionLog) return;
  state.actionLog.push({ at: new Date().toISOString(), kind, title, detail });
  if (state.actionLog.length > ACTION_LOG_LIMIT) state.actionLog.shift();
}

const EVENT_SYMBOLS = {
  info:  { sym: '·', color: C.gray },
  think: { sym: '○', color: C.gray },
  tool:  { sym: '▸', color: C.light },
  ok:    { sym: '✓', color: C.white },
  warn:  { sym: '!', color: C.light },
  error: { sym: '✗', color: C.light },
};

function logEvent(state, kind, title, detail = '') {
  pushAction(state, kind, title, detail);

  const ev = EVENT_SYMBOLS[kind] ?? EVENT_SYMBOLS.info;
  const sym = c(ev.sym, ev.color);
  const suffix = detail ? `  ${c(detail, C.gray)}` : '';
  console.error(`  ${sym} ${c(title, C.light)}${suffix}`);
}

function printDivider() {
  const w = Math.min(termWidth() - 4, 44);
  console.log(`  ${c('─'.repeat(w), C.darkGray)}`);
}

function printBanner(state) {
  const key = state.activeModel || DEFAULT_MODEL_KEY;
  const model = (MODELS[key]?.label || key).toLowerCase();

  console.log('');
  console.log(`  ${c('◆', C.white)} ${c(APP_NAME, C.bold, C.white)}  ${c('·', C.darkGray)}  ${c(model, C.gray)}`);
  console.log(`    ${c('/help para comandos', C.darkGray)}`);
  console.log('');
}

async function printWelcome() {
  if (!process.stdout.isTTY) return;

  const label = c(APP_NAME, C.bold, C.white);

  for (let i = 0; i < THINK_FRAMES.length; i++) {
    process.stdout.write(`\r  ${c(THINK_FRAMES[i], C.gray)} ${label}`);
    await sleep(40);
  }

  process.stdout.write(`\r  ${c('◆', C.white)} ${label}\n`);
}

function printAssistantMessage(content) {
  console.log('');
  const lines = content.split('\n');
  console.log(`  ${c('◆', C.white)} ${c(lines[0], C.white)}`);
  for (let i = 1; i < lines.length; i++) {
    console.log(`    ${c(lines[i], C.white)}`);
  }
  console.log('');
}

function startThinkingIndicator(state, label) {
  pushAction(state, 'think', label);

  if (!process.stderr.isTTY) {
    console.error(`  ${c('○', C.gray)} ${label}`);
    return () => {};
  }

  let idx = 0;
  let active = true;

  const render = () => {
    const frame = THINK_FRAMES[idx % THINK_FRAMES.length];
    process.stderr.write(`\r  ${c(frame, C.gray)} ${c(label, C.gray)}`);
    idx++;
  };

  render();
  const timer = setInterval(render, 80);

  return () => {
    if (!active) return;
    active = false;
    clearInterval(timer);
    process.stderr.write('\r\x1b[K');
  };
}

function beginThinkingStream(state) {
  if (state.thinkingStream?.active) return;

  if (!process.stderr.isTTY) {
    state.thinkingStream = { active: true, plain: true };
    return;
  }

  process.stderr.write(`  ${c('○', C.gray)} ${c('pensando', C.dim, C.italic)}  `);
  state.thinkingStream = { active: true, plain: false, chars: 0 };
}

function writeThinkingDelta(state, delta) {
  if (!delta || !state.thinkingStream?.active) return;

  if (state.thinkingStream.plain) return;

  const maxVisible = 60;
  const current = state.thinkingStream.chars || 0;

  if (current >= maxVisible) {
    const trimmed = delta.replace(/\n/g, ' ').slice(0, 20);
    process.stderr.write(`\r  ${c('○', C.gray)} ${c('pensando', C.dim, C.italic)}  ${c(trimmed.padEnd(20), C.dim, C.gray)}`);
    return;
  }

  const clean = delta.replace(/\n/g, ' ');
  const remaining = maxVisible - current;
  const show = clean.slice(0, remaining);
  process.stderr.write(c(show, C.dim, C.gray));
  state.thinkingStream.chars = current + show.length;
}

function endThinkingStream(state) {
  if (!state.thinkingStream?.active) return;
  if (!state.thinkingStream.plain) {
    process.stderr.write('\r\x1b[K');
  }
  state.thinkingStream = null;
}

function beginAssistantStream(state) {
  if (state.liveResponse?.active) return;

  if (!process.stdout.isTTY) {
    state.liveResponse = { active: true, streamed: false, plain: true };
    return;
  }

  console.log('');
  process.stdout.write(`  ${c('◆', C.white)} `);
  state.liveResponse = { active: true, streamed: false, plain: false };
}

function writeAssistantDelta(state, delta) {
  if (!delta) return;
  if (!state.liveResponse?.active) beginAssistantStream(state);
  state.liveResponse.streamed = true;

  if (state.liveResponse.plain) {
    process.stdout.write(delta);
    return;
  }

  const indented = delta.replace(/\n/g, '\n    ');
  process.stdout.write(c(indented, C.white));
}

function endAssistantStream(state) {
  if (!state.liveResponse?.active) return;
  process.stdout.write(state.liveResponse.plain ? '\n' : '\n\n');
  state.liveResponse = null;
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function streamBufferedAssistantMessage(state, content) {
  beginAssistantStream(state);

  if (!process.stdout.isTTY) {
    writeAssistantDelta(state, content);
    endAssistantStream(state);
    return;
  }

  const tokens = content.split(/(\s+)/);
  let buf = '';
  for (const token of tokens) {
    buf += token;
    if (buf.length >= 12 || token.includes('\n')) {
      writeAssistantDelta(state, buf);
      buf = '';
      await sleep(8);
    }
  }
  if (buf) writeAssistantDelta(state, buf);

  endAssistantStream(state);
}

function printStatus(state) {
  const key = state.activeModel || DEFAULT_MODEL_KEY;
  const model = MODELS[key]?.label || key;

  const rows = [
    ['sesion', state.sessionId],
    ['titulo', state.title],
    ['modelo', model],
    ['cwd', state.cwd],
    ['auto', state.autoApprove ? 'on' : 'off'],
    ['turnos', String(state.turnCount)],
    ['mensajes', String(state.history.length)],
    ['memoria', state.memorySummary ? 'si' : 'no'],
  ];

  console.log('');
  for (const [label, value] of rows) {
    console.log(`  ${c(label.padEnd(10), C.gray)} ${c(value, C.white)}`);
  }
  console.log('');
}

function printHistory(state) {
  if (state.actionLog.length === 0) {
    console.log(`  ${c('Sin acciones registradas.', C.gray)}`);
    return;
  }

  console.log('');
  for (const item of state.actionLog.slice(-15)) {
    const time = c(item.at.slice(11, 19), C.darkGray);
    const detail = item.detail ? `  ${c(item.detail, C.gray)}` : '';
    console.log(`  ${time}  ${c(item.title, C.light)}${detail}`);
  }
  console.log('');
}

function printMemory(state) {
  if (!state.memorySummary) {
    console.log(`  ${c('Sin memoria compactada.', C.gray)}`);
    return;
  }

  console.log('');
  console.log(`  ${c(state.memorySummary, C.light)}`);
  console.log('');
}

function printSession(state) {
  const rows = [
    ['sesion', state.sessionId],
    ['titulo', state.title],
    ['archivo', state.sessionPath],
    ['transcript', state.transcriptPath],
    ['desde', state.createdAt],
    ['update', state.updatedAt],
  ];

  console.log('');
  for (const [label, value] of rows) {
    console.log(`  ${c(label.padEnd(12), C.gray)} ${c(value, C.light)}`);
  }
  console.log('');
}

function printSessions(sessions) {
  if (sessions.length === 0) {
    console.log(`  ${c('No hay sesiones guardadas.', C.gray)}`);
    return;
  }

  console.log('');
  for (const s of sessions.slice(0, 15)) {
    const id = c(s.sessionId.replace('adonix-', ''), C.darkGray);
    const turns = c(`${s.turnCount}t`, C.gray);
    const title = shortText(s.title, 40);
    console.log(`  ${id}  ${turns}  ${c(title, C.light)}`);
  }
  console.log('');
}

function paint(text, color) {
  const map = {
    cyan: C.white,
    green: C.white,
    yellow: C.light,
    red: C.light,
    magenta: C.gray,
    dim: C.gray,
    bold: C.bold,
  };
  return c(text, map[color] || '');
}

module.exports = {
  beginAssistantStream,
  beginThinkingStream,
  endAssistantStream,
  endThinkingStream,
  logEvent,
  paint,
  printAssistantMessage,
  printBanner,
  printDivider,
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
  termWidth,
  writeAssistantDelta,
  writeThinkingDelta,
};
