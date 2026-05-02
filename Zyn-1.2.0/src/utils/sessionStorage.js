const fs = require('fs');
const path = require('path');

const fsp = fs.promises;

const {
  ACTION_LOG_LIMIT,
  CURRENT_SESSION_FILE,
  DEFAULT_LANGUAGE,
  DEFAULT_MODEL_KEY,
  SESSIONS_DIR,
} = require('../config');
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
    rl,
    actionLog: [],
    turnCount: 0,
    liveResponse: null,
    transcriptPath: '',
    autoApprove: false,
    activeModel: DEFAULT_MODEL_KEY,
    language: DEFAULT_LANGUAGE,
  };
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
  await fsp.rename(tempPath, filePath);
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
  state.actionLog = Array.isArray(loaded.actionLog) ? loaded.actionLog : [];
  state.turnCount = Number(loaded.turnCount ?? 0);
  state.transcriptPath = loaded.transcriptPath || getTranscriptPath(loaded.sessionId);
  state.autoApprove = Boolean(loaded.autoApprove);
  state.activeModel = loaded.activeModel || DEFAULT_MODEL_KEY;
  state.language = loaded.language || DEFAULT_LANGUAGE;
  if (state.actionLog.length > ACTION_LOG_LIMIT) {
    state.actionLog = state.actionLog.slice(-ACTION_LOG_LIMIT);
  }
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
    actionLog: state.actionLog,
    turnCount: state.turnCount,
    transcriptPath: state.transcriptPath,
    autoApprove: Boolean(state.autoApprove),
    activeModel: state.activeModel || DEFAULT_MODEL_KEY,
    language: state.language || DEFAULT_LANGUAGE,
  });
  await setCurrentSessionId(state.sessionId);
}

async function createNewSessionState(rl) {
  await ensureSessionStorage();
  const state = createState(rl);
  state.sessionId = createSessionId();
  state.sessionPath = getSessionPath(state.sessionId);
  state.transcriptPath = getTranscriptPath(state.sessionId);
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
  return state;
}

async function loadOrCreateSessionState(rl, options = {}) {
  const { forceNew = false, sessionId = null } = options;

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
      };
    }
  }

  return {
    state: await createNewSessionState(rl),
    resumed: false,
  };
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
  createNewSessionState,
  createState,
  estimateHistoryChars,
  listSessions,
  loadOrCreateSessionState,
  loadSessionState,
  saveState,
};
