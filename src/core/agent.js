const {
  DEFAULT_MODEL_KEY,
  KEEP_RECENT_MESSAGES,
  MAX_HISTORY_CHARS,
  MAX_TOOL_STEPS,
  MODELS,
  PROVIDER_TIMEOUT_MAX_ATTEMPTS,
  PROVIDER_TIMEOUT_RETRY_DELAY_MS,
  AUTO_COMPACT_THRESHOLD,
  countTokens,
  estimateContextTokens,
  getContextLimit,
  stripBase64Images,
} = require('../config');
const { chat } = require('../providers/scraperClient');
const {
  buildConversationMessages,
  buildSystemPrompt,
  buildToolErrorMessage,
  buildToolResultMessage,
  parseAgentResponse,
  sanitizeArgsForModel,
  truncateHistory,
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
  return /(haz|hacer|hazme|make|instala|install|run|ejecuta|crea|build|compile|compila|fix|arregla|corrige|update|actualiza|edita|edit|borra|delete|remove|descarga|download|busca|search|prueba|test|verifica|check|configura|setup|mueve|move|import|aplica|apply|deploy|despliega|init|npm|git|docker|qemu)/i.test(sample);
}

async function requestModel(messages, state, ui, options = {}) {
  const {
    label = 'Thinking',
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
      let answerChunks = '';
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
            answerChunks += delta;
            const trimmed = answerChunks.trim();
            if (trimmed.startsWith('{')) {
              const isToolCall = /"type"\s*:\s*"tool"/.test(trimmed);
              if (isToolCall) return;
              const isFinalComplete = /"type"\s*:\s*"final"\s*,\s*"content"\s*:\s*"/.test(trimmed);
              if (isFinalComplete && trimmed.endsWith('"}')) {
                const contentMatch = trimmed.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                if (contentMatch) {
                  stopThinking();
                  ui.beginAssistantStream(state);
                  answerStarted = true;
                  ui.writeAssistantDelta(state, contentMatch[1]);
                  return;
                }
              }
              if (trimmed.length > 50) {
                stopThinking();
                ui.beginAssistantStream(state);
                answerStarted = true;
                const contentMatch = trimmed.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                if (contentMatch) {
                  ui.writeAssistantDelta(state, contentMatch[1]);
                }
                return;
              }
              return;
            }
            stopThinking();
            ui.beginAssistantStream(state);
            answerStarted = true;
          }
          if (streamOutput && answerStarted) {
            answerChunks += delta;
            const contentMatch = answerChunks.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            if (contentMatch) {
              ui.writeAssistantDelta(state, contentMatch[1]);
            } else if (!answerChunks.trim().startsWith('{')) {
              ui.writeAssistantDelta(state, delta);
            }
          }
        },
      });
      ui.pushAction(state, 'ok', state.language === 'es' ? 'Respuesta recibida' : 'Answer received');
      let answer = result.answer ?? '';
      if (!answer && result.thinking) {
        const thinkingTrimmed = result.thinking.trim();
        if (/^\s*\{/.test(thinkingTrimmed) && /"type"\s*:\s*"(tool|final)"/.test(thinkingTrimmed)) {
          answer = thinkingTrimmed;
        } else {
          const extracted = thinkingTrimmed.match(/\{[\s\S]*"type"\s*:\s*"(tool|final)"[\s\S]*\}/);
          if (extracted) {
            answer = extracted[0];
          }
        }
      }
      return answer;
    } catch (err) {
      const externalAbort = Boolean(signal?.aborted);
      const aborted = controller.signal.aborted || err?.name === 'AbortError';
      if (aborted) throw new Error(state.language === 'es' ? 'Tiempo agotado' : 'Timeout');
      if (!externalAbort && attempt < PROVIDER_TIMEOUT_MAX_ATTEMPTS - 1) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
        await waitForRetry(backoff, signal);
        continue;
      }
      throw err;
    } finally {
      if (signal) signal.removeEventListener('abort', onExternalAbort);
      stopThinking();
      if (thinkingStarted) ui.endThinkingStream(state);
      if (streamOutput && answerStarted) ui.endAssistantStream(state);
    }
  }
  throw new Error(state.language === 'es' ? 'Proveedor inalcanzable' : 'Provider unreachable');
}

async function persistSessionState(state, ui) {
  const contextLimit = getContextLimit(state.activeModel);
  const estimatedTokens = estimateContextTokens(state);
  if (contextLimit > 0 && estimatedTokens > contextLimit * AUTO_COMPACT_THRESHOLD) {
    if (typeof state.__compacting !== 'boolean' || !state.__compacting) {
      state.__compacting = true;
      try {
        const compactMsg = `Contexto aproximadamente ${estimatedTokens.toLocaleString()}/${contextLimit.toLocaleString()} tokens. Compactando historial automaticamente.`;
        ui.pushAction(state, 'info', state.language === 'es' ? 'Comprimiendo memoria...' : 'Compacting memory...', compactMsg);
        truncateHistory(state);
        ui.pushAction(state, 'ok', state.language === 'es' ? 'Memoria compactada' : 'Memory compacted', `~${countTokens(state.memorySummary)} tokens resumidos, ${state.history.length} mensajes recientes`);
      } finally {
        state.__compacting = false;
      }
    }
  }
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
  const answer = parsed.type === 'final' ? normalizeText(parsed.content) : normalizeText(output);
  return answer || '(procesado)';
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
    const result = await executeToolCall(directAction, state, ui, { signal });
    const cleanResult = stripBase64Images(String(result || ''));
    await appendTranscriptEntry(state.sessionId, { type: 'tool', tool: directAction.tool, args: directAction.args, result: cleanResult });
    const finalAnswer = await answerFromToolResult(input, directAction, cleanResult, state, ui);
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
    if (signal?.aborted) {
      if (turnMessages.length > 0) {
        state.history.push(...turnMessages);
        await persistSessionState(state, ui);
      }
      throw new Error('Aborted');
    }

    const injected = typeof state.getQueuedMessages === 'function' ? state.getQueuedMessages() : [];
    for (const msg of injected) {
      turnMessages.push({ role: 'user', content: `INPUT_ADICIONAL:\n${msg}` });
    }

    truncateHistory(state);

    const messages = buildConversationMessages(
      state,
      turnMessages,
      buildSystemPrompt(state.cwd, state, { input, language: turnLanguage }),
    );

    const useStream = !!state.tuiConfirm;
    const raw = await requestModel(messages, state, ui, {
      label: step === 0 ? (state.language === 'es' ? 'Analizando' : 'Analyzing') : (state.language === 'es' ? `Paso ${step + 1}` : `Step ${step + 1}`),
      signal,
      streamOutput: useStream,
    });

    let parsed = parseAgentResponse(raw);

    if (parsed.type === 'final') {
      const safeContent = (parsed.content || '').trim() || '(respuesta vacía)';
      if (looksLikeActionRequest(input) && !toolUsedThisTurn && finalWithoutToolRetries < 2) {
        finalWithoutToolRetries++;
        turnMessages.push({ role: 'assistant', content: safeContent });
        turnMessages.push({ role: 'user', content: 'No has ejecutado ninguna herramienta técnica para esta solicitud de acción. Por favor, usa las herramientas necesarias para obtener resultados reales antes de concluir.' });
        step++;
        continue;
      }
      turnMessages.push({ role: 'assistant', content: safeContent });
      state.history.push(...turnMessages);
      await appendTranscriptEntry(state.sessionId, { type: 'assistant', content: safeContent });
      await persistSessionState(state, ui);
      return { content: safeContent, rendered: useStream };
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
      const result = await executeToolCall(parsed, state, ui, { signal });
      await appendTranscriptEntry(state.sessionId, { type: 'tool', tool: parsed.tool, args: parsed.args, result });
      turnMessages.push({ role: 'user', content: `TOOL_RESULT\n${buildToolResultMessage(parsed, result)}` });
    } catch (err) {
      if (err?.message === 'aborted' && signal?.aborted) {
        throw new Error('aborted');
      }
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

module.exports = { runAgentTurn };
