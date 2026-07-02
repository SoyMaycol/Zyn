const { EventEmitter } = require('events');
const { runAgentTurn } = require('./core/agent');
const { createNewSessionState, loadSessionState, loadOrCreateSessionState, listSessions, saveState } = require('./utils/sessionStorage');
const { MODELS, DEFAULT_MODEL_KEY, DEFAULT_LANGUAGE } = require('./config');
const { listSkills, listModels } = require('./public/helpers');
const { runBackgroundWorker, detachBackgroundTurn } = require('./utils/backgroundWorker');
const { enqueueBackgroundTask, listBackgroundResults, consumeBackgroundResult } = require('./utils/sessionStorage');

function noopUi() {
  return {
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
}

function createAgent(options = {}) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  const config = {
    sessionId: options.sessionId || null,
    cwd: options.cwd || process.cwd(),
    model: options.model || DEFAULT_MODEL_KEY,
    language: options.language || DEFAULT_LANGUAGE,
    autoApprove: options.autoApprove !== undefined ? Boolean(options.autoApprove) : true,
    personaPrompt: options.personaPrompt || '',
    userId: options.userId || 'default',
    resume: options.resume || false,
  };

  let state = null;
  let initPromise = null;

  async function ensureState() {
    if (state) return state;
    if (!initPromise) {
      initPromise = (async () => {
        if (config.sessionId) {
          const loaded = await loadSessionState(config.sessionId, null);
          if (loaded) {
            if (config.cwd) loaded.cwd = config.cwd;
            loaded.activeModel = config.model;
            loaded.language = config.language;
            loaded.autoApprove = config.autoApprove;
            if (config.personaPrompt) loaded.personaPrompt = config.personaPrompt;
            state = loaded;
            return state;
          }
        }
        if (config.resume) {
          const loaded = await loadOrCreateSessionState(null, { forceNew: false, resume: true });
          state = loaded.state;
          return state;
        }
        state = await createNewSessionState(null);
        state.cwd = config.cwd;
        state.activeModel = config.model;
        state.language = config.language;
        state.autoApprove = config.autoApprove;
        state.personaPrompt = config.personaPrompt;
        await saveState(state);
        return state;
      })();
    }
    return initPromise;
  }

  emitter.send = async function send(userId, text) {
    const s = await ensureState();
    const userKey = userId || config.userId;
    s.history.push({ role: 'user', content: String(text), userId: userKey });
    const ui = noopUi();
    const controller = new AbortController();
    emitter.emit('turnStart', { userId: userKey, text });
    try {
      const result = await runAgentTurn(String(text), s, ui, { signal: controller.signal });
      emitter.emit('turnEnd', { userId: userKey, text, content: result.content });
      emitter.emit('message', { userId: userKey, role: 'assistant', content: result.content });
      return result.content;
    } catch (err) {
      emitter.emit('error', err);
      throw err;
    } finally {
      await saveState(s);
    }
  };

  emitter.detach = function detach(userId, text) {
    return (async () => {
      const s = await ensureState();
      const userKey = userId || config.userId;
      const taskId = await enqueueBackgroundTask({ sessionId: s.sessionId, input: String(text), detachedAt: new Date().toISOString() });
      detachBackgroundTurn({
        taskId,
        sessionId: s.sessionId,
        input: String(text),
        cwd: s.cwd,
        modelKey: s.activeModel,
        language: s.language,
        personaPrompt: s.personaPrompt,
        autoApprove: s.autoApprove,
      });
      return taskId;
    })();
  };

  emitter.consumeBackground = async function consumeBackground() {
    const s = await ensureState();
    const results = await listBackgroundResults(s.sessionId);
    for (const r of results) {
      emitter.emit('background', r);
      await consumeBackgroundResult(r.taskId);
    }
    return results;
  };

  emitter.getState = async function getState() {
    const s = await ensureState();
    return {
      sessionId: s.sessionId,
      title: s.title,
      cwd: s.cwd,
      activeModel: s.activeModel,
      language: s.language,
      turnCount: s.turnCount,
      historyLength: s.history.length,
    };
  };

  emitter.reset = async function reset() {
    const s = await ensureState();
    s.history = [];
    s.actionLog = [];
    s.turnCount = 0;
    s.memorySummary = '';
    s.sessionMemory = {};
    await saveState(s);
    return true;
  };

  emitter.close = async function close() {
    if (state) {
      await saveState(state);
    }
  };

  return emitter;
}

module.exports = {
  createAgent,
  listSkills,
  listModels,
  listSessions,
  loadSessionState,
  runBackgroundWorker,
  runAgentTurn,
  DEFAULT_LANGUAGE,
  DEFAULT_MODEL_KEY,
  MODELS,
};
