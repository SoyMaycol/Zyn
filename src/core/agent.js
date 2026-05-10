const {
  DEFAULT_MODEL_KEY,
  KEEP_RECENT_MESSAGES,
  MAX_HISTORY_CHARS,
  MAX_TOOL_STEPS,
  MODELS,
  PROVIDER_TIMEOUT_MAX_ATTEMPTS,
  PROVIDER_TIMEOUT_RETRY_DELAY_MS,
} = require('../config');
const { chat, chatSilent } = require('../providers/scraperClient');
const {
  buildConversationMessages,
  buildSystemPrompt,
  buildToolErrorMessage,
  buildToolResultMessage,
  parseAgentResponse,
  sanitizeArgsForModel,
} = require('./prompts');
const {
  executeToolCall,
  parseDirectAction,
} = require('../tools');
const { appendTranscriptEntry } = require('../utils/transcriptStorage');
const { estimateHistoryChars, saveState } = require('../utils/sessionStorage');
const { normalizeText, shortText } = require('../utils/text');
const { detectLanguage } = require('../i18n');

function waitForRetry(ms, signal) {
  if (!ms || ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new Error('aborted'));

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(cleanupAndResolve, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error('aborted'));
    };
    function cleanup() {
      if (signal) signal.removeEventListener('abort', onAbort);
    }
    function cleanupAndResolve() {
      cleanup();
      resolve();
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

function looksLikeActionRequest(text) {
  const sample = normalizeText(String(text || '')).toLowerCase();
  if (!sample) return false;
  return /(instala|install|run|ejecuta|crea|build|compile|compila|fix|arregla|corrige|update|actualiza|edita|edit|borra|delete|remove|descarga|download|busca|search|prueba|test|verifica|check|configura|setup|mueve|move|import|aplica|apply|deploy|despliega|init|npm|git|docker|qemu)/i.test(sample);
}

async function requestModel(messages, state, ui, options = {}) {
  const {
    label = 'Pensando',
    streamOutput = false,
    signal,
  } = options;

  for (let attempt = 0; attempt < PROVIDER_TIMEOUT_MAX_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) {
      throw new Error(state.language === 'es' ? 'Agente detenido por el usuario' : 'Agent stopped by user');
    }
    const stopThinking = ui.startThinkingIndicator(state, attempt === 0 ? label : `${label} (${state.language === 'es' ? 'reintento' : 'retry'})`);
    let answerStarted = false;
    let thinkingStarted = false;
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();

    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const result = await chat({
        messages,
        modelKey: state?.activeModel || DEFAULT_MODEL_KEY,
        signal: controller.signal,
        onChunk: (delta, phase) => {
          if (phase === 'thinking') {
            if (!thinkingStarted) {
              stopThinking();
              ui.beginThinkingStream(state);
              thinkingStarted = true;
            }
            ui.writeThinkingDelta(state, delta);
            return;
          }
          if (thinkingStarted) {
            ui.endThinkingStream(state);
            thinkingStarted = false;
          }
          if (streamOutput && !answerStarted) {
            stopThinking();
            ui.beginAssistantStream(state);
            answerStarted = true;
          }
          if (streamOutput) ui.writeAssistantDelta(state, delta);
        },
      });
      ui.pushAction(state, 'ok', 'Respuesta recibida');
      return result.answer ?? '';
    } catch (err) {
      const externalAbort = Boolean(signal?.aborted);
      const aborted = controller.signal.aborted || err?.name === 'AbortError';
      if (aborted) throw new Error(state.language === 'es' ? 'Tiempo agotado' : 'Timeout');
      if (!externalAbort && attempt < PROVIDER_TIMEOUT_MAX_ATTEMPTS - 1) continue;
      throw err;
    } finally {
      if (signal) signal.removeEventListener('abort', onExternalAbort);
      stopThinking();
      if (thinkingStarted) ui.endThinkingStream(state);
      if (streamOutput && answerStarted) ui.endAssistantStream(state);
    }
  }
  throw new Error('Provider unreachable');
}

function normalizeCompactMode(mode) {
  const value = String(mode || '').trim().toLowerCase();
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return 'medium';
}

function compactTextLossless(text) {
  return String(text || '')
    .split('\r\n').join('\n')
    .split('\r').join('\n')
    .replaceAll('\t', ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function compactMessageContent(message, mode) {
  const content = compactTextLossless(message?.content ?? '');
  if (mode === 'low') return content;
  const lines = content.split('\n');
  const filtered = lines.filter((line, idx, arr) => !(line.trim() === '' && arr[idx - 1]?.trim() === ''));
  if (mode === 'high') {
    return filtered.slice(0, Math.max(8, Math.min(filtered.length, 24))).join('\n');
  }
  return filtered.join('\n');
}

function mergeMemorySummary(previous, next) {
  const parts = [compactTextLossless(previous), compactTextLossless(next)].filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return parts.join('\n\n');
}

async function summarizeMessages(state, ui, messages, mode = 'medium') {
  const compactMode = normalizeCompactMode(mode);
  const transcript = messages
    .map(message => `${message.role.toUpperCase()}:\n${compactMessageContent(message, compactMode)}`)
    .join('\n\n');

  if (compactMode === 'low') {
    return compactTextLossless([
      state.memorySummary ? `Memoria previa:\n${state.memorySummary}` : '',
      transcript,
    ].filter(Boolean).join('\n\n'));
  }

  const prompt = [
    {
      role: 'system',
      content: [
        state.language === 'es'
          ? 'Eres un sistema de compresion de memoria tecnica profesional.'
          : 'You are a professional technical memory compression system.',
        state.language === 'es'
          ? 'Resume la sesion manteniendo: Objetivos de desarrollo, estructura del proyecto actual, archivos modificados, comandos ejecutados con exito, errores encontrados y estado de los servicios (Docker/QEMU/Backend).'
          : 'Summarize the session while preserving development goals, current project structure, modified files, successful commands, encountered errors, and service state (Docker/QEMU/Backend).',
        state.language === 'es'
          ? 'Se extremadamente conciso. Usa listas de puntos. No pierdas rutas de archivos ni valores de variables de entorno.'
          : 'Be extremely concise. Use bullet points. Do not lose file paths or environment variable values.',
        state.language === 'es'
          ? 'Si algo no se termino, marcalo como [BLOQUEADO] o [PENDIENTE].'
          : 'If something was not finished, mark it as [BLOCKED] or [PENDING].',
        state.language === 'es'
          ? 'Formato: Contexto | Progreso Tecnico | Archivos | Pendientes. Max 20 lineas.'
          : 'Format: Context | Technical Progress | Files | Pending. Max 20 lines.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        state.memorySummary ? `${state.language === 'es' ? 'Memoria previa' : 'Previous memory'}:\n${state.memorySummary}\n` : '',
        state.language === 'es' ? 'Conversacion a resumir:' : 'Conversation to summarize:',
        transcript,
      ].join('\n'),
    },
  ];

  const label = compactMode === 'high'
    ? (state.language === 'es' ? 'Compactando memoria alta' : 'High memory compaction')
    : (state.language === 'es' ? 'Consolidando memoria técnica' : 'Consolidating technical memory');

  return normalizeText(await requestModel(prompt, state, ui, { label }));
}

async function compactHistoryIfNeeded(state, ui) {
  if (estimateHistoryChars(state.history) <= MAX_HISTORY_CHARS) return;
  if (state.history.length <= KEEP_RECENT_MESSAGES) return;

  const splitIndex = Math.max(2, state.history.length - KEEP_RECENT_MESSAGES);
  const oldMessages = state.history.slice(0, splitIndex);
  const recentMessages = state.history.slice(splitIndex);
  const summary = await summarizeMessages(state, ui, oldMessages, 'medium');

  state.memorySummary = mergeMemorySummary(state.memorySummary, summary);
  state.history = recentMessages;
  ui?.logEvent?.(state, 'info', state.language === 'es' ? 'Memoria compactada' : 'Memory compacted', shortText(summary, 120));
  await appendTranscriptEntry(state.sessionId, {
    type: 'system',
    content: `${state.language === 'es' ? 'Memoria técnica actualizada' : 'Technical memory updated'}:
${summary}`,
  });
}

async function compactMemory(state, ui, mode = 'medium', options = {}) {
  const compactMode = normalizeCompactMode(mode);
  const force = Boolean(options.force);
  if (compactMode === 'high' && !force) {
    const confirm = typeof state.tuiConfirm === 'function'
      ? await state.tuiConfirm(
          state.language === 'es' ? 'Confirmación de compactación alta' : 'High compaction confirmation',
          t(state.language, 'compactWarningHigh'),
        )
      : true;
    if (!confirm || String(confirm).toLowerCase() === 'n') return { changed: false, mode: compactMode, warned: true };
  }

  if (compactMode === 'low') {
    const nextSummary = compactTextLossless([
      state.memorySummary,
      state.history.map(message => `${message.role.toUpperCase()}: ${compactMessageContent(message, 'low')}`).join('\n'),
    ].filter(Boolean).join('\n\n'));
    const changed = nextSummary !== state.memorySummary;
    state.memorySummary = nextSummary;
    if (changed) {
      await saveState(state);
      ui?.logEvent?.(state, 'info', t(state.language, 'compactDone'), t(state.language, 'compactCommand', { mode: compactMode }));
    } else {
      ui?.logEvent?.(state, 'info', t(state.language, 'compactNoChange'), '');
    }
    return { changed, mode: compactMode };
  }

  const splitIndex = Math.max(1, state.history.length - KEEP_RECENT_MESSAGES);
  const oldMessages = state.history.slice(0, splitIndex);
  const recentMessages = state.history.slice(splitIndex);
  const summary = await summarizeMessages(state, ui, oldMessages, compactMode);
  const nextSummary = mergeMemorySummary(state.memorySummary, summary);
  const changed = nextSummary !== state.memorySummary || recentMessages.length !== state.history.length;
  state.memorySummary = nextSummary;
  state.history = recentMessages;
  ui?.logEvent?.(state, 'info', t(state.language, 'compactDone'), t(state.language, 'compactCommand', { mode: compactMode }));
  await appendTranscriptEntry(state.sessionId, {
    type: 'system',
    content: `${state.language === 'es' ? 'Memoria técnica actualizada' : 'Technical memory updated'}:
${summary}`,
  });
  await saveState(state);
  return { changed, mode: compactMode };
}

async function persistSessionState(state, ui) {
  await compactHistoryIfNeeded(state, ui);
  await saveState(state);
}

async function answerFromToolResult(input, call, result, state, ui) {
  const messages = [
    {
      role: 'system',
      content: `Eres Zyn. Responde de forma técnica y directa basada únicamente en el resultado de la herramienta. Directorio: ${state.cwd}`,
    },
    {
      role: 'user',
      content: `Solicitud: ${input}\n\nResultado de ${call.tool}:\n${result}`,
    },
  ];

  const output = await requestModel(messages, state, ui, {
    label: state.language === 'es' ? 'Procesando resultado' : 'Processing result',
  });
  const parsed = parseAgentResponse(output);
  return parsed.type === 'final' ? normalizeText(parsed.content) : normalizeText(output);
}

async function runAgentTurn(input, state, ui, options = {}) {
  const signal = options.signal;
  state.turnCount += 1;
  if (state.turnCount === 1 && state.title === 'New session') {
    state.title = shortText(input, 60) || state.title;
  }

  const directAction = parseDirectAction(input);
  if (directAction) {
    await appendTranscriptEntry(state.sessionId, { type: 'user', content: input });
    const result = await executeToolCall(directAction, state, ui);
    await appendTranscriptEntry(state.sessionId, { type: 'tool', tool: directAction.tool, args: directAction.args, result });
    const finalAnswer = await answerFromToolResult(input, directAction, result, state, ui);
    state.history.push({ role: 'user', content: input }, { role: 'assistant', content: finalAnswer });
    await appendTranscriptEntry(state.sessionId, { type: 'assistant', content: finalAnswer });
    await persistSessionState(state, ui);
    return { content: finalAnswer, rendered: false };
  }

  const turnMessages = [{ role: 'user', content: input }];
  await appendTranscriptEntry(state.sessionId, { type: 'user', content: input });

  let step = 0;
  let toolUsedThisTurn = false;
  let finalWithoutToolRetries = 0;
  let lastFingerprint = '';
  let repeatCount = 0;
  const turnLanguage = detectLanguage(input, state.language);

  while (true) {
    if (signal?.aborted) throw new Error('Aborted');

    const injected = typeof state.getQueuedMessages === 'function' ? state.getQueuedMessages() : [];
    for (const msg of injected) {
      turnMessages.push({ role: 'user', content: `INPUT_ADICIONAL:\n${msg}` });
    }

    const messages = buildConversationMessages(
      state,
      turnMessages,
      buildSystemPrompt(state.cwd, state, { input, language: turnLanguage }),
    );

    const raw = await requestModel(messages, state, ui, {
      label: step === 0 ? 'Analizando' : `Paso ${step + 1}`,
      signal,
    });

    let parsed = parseAgentResponse(raw);

    if (state.concuerdo && step === 0) {
      const activeKey = state.activeModel || DEFAULT_MODEL_KEY;
      const otherKeys = Object.keys(MODELS).filter(k => k !== activeKey);
      const secondaryResults = await Promise.all(otherKeys.map(k => chatSilent({ messages, modelKey: k, signal }).catch(() => null)));
      
      const suggestions = secondaryResults
        .filter(r => r?.answer)
        .map(r => parseAgentResponse(r.answer));

      const toolSugg = suggestions.filter(s => s.type === 'tool');
      if (parsed.type === 'final' && toolSugg.length >= 2) {
        parsed = toolSugg[0];
      }
    }

    if (parsed.type === 'final') {
      if (looksLikeActionRequest(input) && !toolUsedThisTurn && finalWithoutToolRetries < 2) {
        finalWithoutToolRetries++;
        turnMessages.push({ role: 'assistant', content: parsed.content });
        turnMessages.push({ role: 'user', content: 'No has ejecutado ninguna herramienta técnica para esta solicitud de acción. Por favor, usa las herramientas necesarias para obtener resultados reales antes de concluir.' });
        step++;
        continue;
      }
      turnMessages.push({ role: 'assistant', content: parsed.content });
      state.history.push(...turnMessages);
      await appendTranscriptEntry(state.sessionId, { type: 'assistant', content: parsed.content });
      await persistSessionState(state, ui);
      return { content: parsed.content, rendered: false };
    }

    const fingerprint = `${parsed.tool}:${parsed.args?.path || ''}:${shortText(JSON.stringify(parsed.args || {}), 50)}`;
    if (fingerprint === lastFingerprint) {
      repeatCount++;
      if (repeatCount >= 3) {
        turnMessages.push({ role: 'user', content: 'Estas en un bucle con la misma herramienta y argumentos. Cambia de estrategia o finaliza con el estado actual.' });
        step++;
        continue;
      }
    } else {
      lastFingerprint = fingerprint;
      repeatCount = 0;
    }

    turnMessages.push({ role: 'assistant', content: JSON.stringify({ type: 'tool', tool: parsed.tool, args: sanitizeArgsForModel(parsed) }) });

    try {
      toolUsedThisTurn = true;
      const result = await executeToolCall(parsed, state, ui);
      await appendTranscriptEntry(state.sessionId, { type: 'tool', tool: parsed.tool, args: parsed.args, result });
      turnMessages.push({ role: 'user', content: `TOOL_RESULT\n${buildToolResultMessage(parsed, result)}` });
    } catch (err) {
      turnMessages.push({ role: 'user', content: buildToolErrorMessage(parsed, err.message) });
    }

    step++;
    if (step >= MAX_TOOL_STEPS) {
      const limitMsg = 'Límite de pasos alcanzado. Resumiendo estado actual del sistema.';
      state.history.push(...turnMessages, { role: 'assistant', content: limitMsg });
      await persistSessionState(state, ui);
      return { content: limitMsg, rendered: false };
    }
  }
}

module.exports = { compactMemory, normalizeCompactMode, runAgentTurn };
