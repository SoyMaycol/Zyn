const fs = require('fs');
const path = require('path');

const fsp = fs.promises;

const {
  ACTION_LOG_LIMIT,
  BACKGROUND_DIR,
  CURRENT_SESSION_FILE,
  DEFAULT_LANGUAGE,
  DEFAULT_MODEL_KEY,
  PERSISTENT_CONFIG_FILE,
  SESSIONS_DIR,
} = require('../config');
const { normalizeLanguage } = require('../i18n');
const { getTranscriptPath } = require('./transcriptStorage');

function createState(rl = null) {
  return {
    sessionId: '',
    sessionPath: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: 'New session',
    cwd: process.cwd(),
    history: [],
    memorySummary: '',
    sessionMemory: {},
    rl,
    actionLog: [],
    turnCount: 0,
    liveResponse: null,
    transcriptPath: '',
    autoApprove: false,
    activeModel: DEFAULT_MODEL_KEY,
    language: DEFAULT_LANGUAGE,
    personaPrompt: '',
    theme: 'dark',
  };
}

async function loadPersistentConfig() {
  const data = await readJson(PERSISTENT_CONFIG_FILE);
  if (!data || typeof data !== 'object') return {};
  return {
    cwd: typeof data.cwd === 'string' && data.cwd.trim() ? data.cwd : undefined,
    autoApprove: Boolean(data.autoApprove),
    activeModel: typeof data.activeModel === 'string' && data.activeModel.trim() ? data.activeModel : undefined,
    language: normalizeLanguage(data.language || DEFAULT_LANGUAGE),
    personaPrompt: typeof data.personaPrompt === 'string' ? data.personaPrompt : undefined,
    theme: typeof data.theme === 'string' && data.theme.trim() ? data.theme : undefined,
    settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
  };
}

async function savePersistentConfig(state) {
  await writeJson(PERSISTENT_CONFIG_FILE, {
    cwd: state.cwd || process.cwd(),
    autoApprove: Boolean(state.autoApprove),
    activeModel: state.activeModel || DEFAULT_MODEL_KEY,
    language: state.language || DEFAULT_LANGUAGE,
    personaPrompt: state.personaPrompt || '',
    theme: state.theme || 'dark',
    settings: state.settings || {},
  });
}

function createSessionId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `zyn-${stamp}-${random}`;
}

function getSessionPath(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

async function ensureSessionStorage() {
  await fsp.mkdir(SESSIONS_DIR, { recursive: true });
  await fsp.mkdir(BACKGROUND_DIR, { recursive: true });
}

function getBackgroundTaskPath(taskId) {
  return path.join(BACKGROUND_DIR, `${taskId}.json`);
}

function getBackgroundResultPath(taskId) {
  return path.join(BACKGROUND_DIR, `${taskId}.result.json`);
}

function createBackgroundTaskId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `bg-${stamp}-${random}`;
}

async function enqueueBackgroundTask({ sessionId, input, detachedAt }) {
  await ensureSessionStorage();
  const taskId = createBackgroundTaskId();
  const task = {
    taskId,
    sessionId,
    input,
    detachedAt: detachedAt || new Date().toISOString(),
    status: 'pending',
    result: null,
  };
  await writeJson(getBackgroundTaskPath(taskId), task);
  return taskId;
}

async function listBackgroundTasks(sessionId = null) {
  await ensureSessionStorage();
  const entries = await fsp.readdir(BACKGROUND_DIR, { withFileTypes: true });
  const tasks = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    if (entry.name.endsWith('.result.json')) continue;
    const data = await readJson(path.join(BACKGROUND_DIR, entry.name));
    if (!data?.taskId) continue;
    if (sessionId && data.sessionId !== sessionId) continue;
    const resultPath = getBackgroundResultPath(data.taskId);
    const resultFile = await readJson(resultPath);
    tasks.push({ ...data, result: resultFile?.result || data.result || null });
  }
  tasks.sort((left, right) => String(left.detachedAt).localeCompare(String(right.detachedAt)));
  return tasks;
}

async function listBackgroundResults(sessionId = null) {
  const tasks = await listBackgroundTasks(sessionId);
  return tasks.filter(task => task.result);
}

async function consumeBackgroundResult(taskId) {
  const resultPath = getBackgroundResultPath(taskId);
  const data = await readJson(resultPath);
  await fsp.unlink(resultPath).catch(() => {});
  const taskPath = getBackgroundTaskPath(taskId);
  await fsp.unlink(taskPath).catch(() => {});
  return data?.result || null;
}

async function completeBackgroundTask(taskId, result) {
  const taskPath = getBackgroundTaskPath(taskId);
  const task = await readJson(taskPath);
  const finalTask = {
    ...(task || { taskId }),
    taskId,
    status: 'done',
    completedAt: new Date().toISOString(),
    result,
  };
  await writeJson(taskPath, finalTask);
  await writeJson(getBackgroundResultPath(taskId), finalTask);
}

async function readJson(filePath) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

async function writeJson(filePath, data) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
  try {
    await fsp.rename(tempPath, filePath);
  } catch {
    await fsp.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    await fsp.unlink(tempPath).catch(() => {});
  }
}

async function setCurrentSessionId(sessionId) {
  await writeJson(CURRENT_SESSION_FILE, { sessionId });
}

async function getCurrentSessionId() {
  const data = await readJson(CURRENT_SESSION_FILE);
  return data?.sessionId ?? null;
}

function applyLoadedState(state, loaded) {
  state.sessionId = loaded.sessionId;
  state.sessionPath = loaded.sessionPath;
  state.createdAt = loaded.createdAt;
  state.updatedAt = loaded.updatedAt;
  state.title = loaded.title;
  state.cwd = loaded.cwd;
  state.history = Array.isArray(loaded.history) ? loaded.history : [];
  state.memorySummary = loaded.memorySummary ?? '';
  state.sessionMemory = loaded.sessionMemory && typeof loaded.sessionMemory === 'object' ? loaded.sessionMemory : {};
  state.actionLog = Array.isArray(loaded.actionLog) ? loaded.actionLog : [];
  state.turnCount = Number(loaded.turnCount ?? 0);
  state.transcriptPath = loaded.transcriptPath || getTranscriptPath(loaded.sessionId);
  state.autoApprove = Boolean(loaded.autoApprove);
  state.activeModel = loaded.activeModel || DEFAULT_MODEL_KEY;
  state.language = loaded.language || DEFAULT_LANGUAGE;
  state.personaPrompt = loaded.personaPrompt || '';
  state.theme = loaded.theme || '';
  state.settings = loaded.settings && typeof loaded.settings === 'object' ? loaded.settings : {};
  if (state.actionLog.length > ACTION_LOG_LIMIT) {
    state.actionLog = state.actionLog.slice(-ACTION_LOG_LIMIT);
  }
  state.__resumedHistory = state.history.slice();
}

async function saveState(state) {
  if (!state.sessionId) {
    return;
  }

  state.updatedAt = new Date().toISOString();
  state.transcriptPath = state.transcriptPath || getTranscriptPath(state.sessionId);
  await writeJson(state.sessionPath, {
    sessionId: state.sessionId,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    title: state.title,
    cwd: state.cwd,
    history: state.history,
    memorySummary: state.memorySummary,
    sessionMemory: state.sessionMemory || {},
    actionLog: state.actionLog,
    turnCount: state.turnCount,
    transcriptPath: state.transcriptPath,
    autoApprove: Boolean(state.autoApprove),
    activeModel: state.activeModel || DEFAULT_MODEL_KEY,
    language: state.language || DEFAULT_LANGUAGE,
    personaPrompt: state.personaPrompt || '',
    theme: state.theme || 'dark',
    settings: state.settings || {},
  });
  await setCurrentSessionId(state.sessionId);
  await savePersistentConfig(state);
}

async function applyPersistentConfig(state) {
  const persisted = await loadPersistentConfig();
  if (!persisted || Object.keys(persisted).length === 0) return false;

  state.cwd = persisted.cwd || state.cwd;
  state.autoApprove = Boolean(persisted.autoApprove);
  state.activeModel = persisted.activeModel || state.activeModel;
  state.language = persisted.language || state.language;
  state.personaPrompt = persisted.personaPrompt || state.personaPrompt || '';
  state.theme = persisted.theme || state.theme || 'dark';
  state.settings = { ...state.settings, ...(persisted.settings || {}) };
  return true;
}

async function createNewSessionState(rl) {
  await ensureSessionStorage();
  const state = createState(rl);
  state.sessionId = createSessionId();
  state.sessionPath = getSessionPath(state.sessionId);
  state.transcriptPath = getTranscriptPath(state.sessionId);
  await applyPersistentConfig(state);
  await saveState(state);
  return state;
}

async function loadSessionState(sessionId, rl) {
  await ensureSessionStorage();
  const filePath = getSessionPath(sessionId);
  const data = await readJson(filePath);
  if (!data) {
    return null;
  }

  const state = createState(rl);
  applyLoadedState(state, {
    ...data,
    sessionId,
    sessionPath: filePath,
  });
  await applyPersistentConfig(state);
  return state;
}

async function loadOrCreateSessionState(rl, options = {}) {
  const { forceNew = true, sessionId = null, resume = false } = options;

  if (forceNew) {
    return {
      state: await createNewSessionState(rl),
      resumed: false,
    };
  }

  const targetSessionId = sessionId ?? (await getCurrentSessionId());
  if (targetSessionId) {
    const loaded = await loadSessionState(targetSessionId, rl);
    if (loaded) {
      await setCurrentSessionId(loaded.sessionId);
      return {
        state: loaded,
        resumed: true,
        rehydrated: Boolean(resume),
      };
    }
  }

  const created = await createNewSessionState(rl);
  return { state: created, resumed: false };
}

async function listSessions() {
  await ensureSessionStorage();
  const entries = await fsp.readdir(SESSIONS_DIR, { withFileTypes: true });
  const sessions = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const data = await readJson(path.join(SESSIONS_DIR, entry.name));
    if (!data?.sessionId) {
      continue;
    }

    sessions.push({
      sessionId: data.sessionId,
      title: data.title ?? 'Session',
      updatedAt: data.updatedAt ?? data.createdAt ?? '',
      turnCount: Number(data.turnCount ?? 0),
      cwd: data.cwd ?? '',
    });
  }

  sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return sessions;
}

function estimateHistoryChars(messages) {
  return messages.reduce((total, message) => total + (message.content?.length ?? 0), 0);
}

module.exports = {
  applyLoadedState,
  completeBackgroundTask,
  consumeBackgroundResult,
  createNewSessionState,
  createState,
  enqueueBackgroundTask,
  estimateHistoryChars,
  getBackgroundResultPath,
  getBackgroundTaskPath,
  listBackgroundResults,
  listBackgroundTasks,
  listSessions,
  loadOrCreateSessionState,
  loadSessionState,
  saveState,
};
