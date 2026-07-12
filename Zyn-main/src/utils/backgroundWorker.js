const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const {
  BACKGROUND_DIR,
  DEFAULT_LANGUAGE,
  DEFAULT_MODEL_KEY,
  SESSIONS_DIR,
} = require('../config');
const {
  completeBackgroundTask,
  getBackgroundTaskPath,
  listBackgroundTasks,
} = require('./sessionStorage');
const { loadSessionState, saveState } = require('./sessionStorage');
const { runAgentTurn } = require('../core/agent');
const { appendTranscriptEntry } = require('./transcriptStorage');
const { normalizeLanguage } = require('../i18n');

function getCliEntry() {
  return path.join(__dirname, '..', '..', 'zyn.js');
}

async function readJson(filePath) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function detachBackgroundTurn(options) {
  const { taskId, sessionId, input, cwd, modelKey, language, personaPrompt, autoApprove } = options;
  const child = spawn(process.execPath, [getCliEntry(), '--bg-run', taskId], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ZYN_BG_RUN: '1',
      ZYN_BG_TASK: taskId,
    },
  });
  child.unref();
  return child.pid;
}

async function runBackgroundTask(task) {
  const { taskId, sessionId, input } = task;
  const state = await loadSessionState(sessionId, null);
  if (!state) throw new Error(`Session not found: ${sessionId}`);

  const ui = {
    beginThinkingStream() {},
    writeThinkingDelta() {},
    endThinkingStream() {},
    beginAssistantStream() {},
    writeAssistantDelta() {},
    endAssistantStream() {},
    startThinkingIndicator() { return () => {}; },
    pushAction() {},
    logEvent() {},
    paint: (text) => text,
  };

  const controller = new AbortController();
  const result = await runAgentTurn(input, state, ui, { signal: controller.signal });
  await saveState(state);
  await appendTranscriptEntry(sessionId, { type: 'system', content: `[background ${taskId}] completed` });
  return {
    content: result?.content || '',
    sessionId,
    taskId,
  };
}

async function runBackgroundWorker() {
  const taskId = process.env.ZYN_BG_TASK || process.argv[2];
  if (!taskId || taskId === '--bg-run') {
    console.error('Background worker requires a taskId (ZYN_BG_TASK env or argv).');
    process.exit(1);
  }
  const taskPath = getBackgroundTaskPath(taskId);
  const task = await readJson(taskPath);
  if (!task) {
    console.error(`Background task not found: ${taskId}`);
    process.exit(1);
  }

  try {
    const result = await runBackgroundTask(task);
    await completeBackgroundTask(taskId, { ok: true, ...result });
  } catch (err) {
    await completeBackgroundTask(taskId, { ok: false, error: err.message });
  }
}

async function consumePendingBackgroundResults() {
  const tasks = await listBackgroundTasks();
  const completed = tasks.filter(task => task.result && !task.result.consumed);
  for (const task of completed) {
    task.result.consumed = true;
    const taskPath = getBackgroundTaskPath(task.taskId);
    await fs.promises.writeFile(taskPath, JSON.stringify({ ...task, result: task.result }, null, 2));
  }
  return completed;
}

module.exports = {
  consumePendingBackgroundResults,
  detachBackgroundTurn,
  runBackgroundWorker,
  runBackgroundTask,
};
