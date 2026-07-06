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
  getSetting,
  stripBase64Images,
} = require('../config');
const { chat } = require('../providers/scraperClient');
const {
  KNOWN_TOOLS,
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

async function requestModel(messages, state, ui, options = {}) {
  const {
    label = 'Thinking',
    streamOutput = false,
    signal,
  } = options;

  const maxAttempts = getSetting(state, 'providerMaxAttempts');
  const retryDelay = getSetting(state, 'providerRetryDelayMs');

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) {
      throw new Error(state.language === 'es' ? 'Agente detenido por el usuario' : 'Agent stopped by user');
    }
    const stopThinking = ui.startThinkingIndicator(state, attempt === 0 ? label : `${label} (${state.language === 'es' ? 'reintento' : 'retry'})`);
    let answerStarted = false;
    let thinkingStarted = false;
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();

    if (signal) {
      if (signal.aborted) { stopThinking(); controller.abort(); }
      else {
        signal.addEventListener('abort', () => {
          stopThinking();
          controller.abort();
        }, { once: true });
      }
    }

    try {
      let answerChunks = '';
      let streamStarted = false;
      let suppressFinalStream = false;
      let jsonFinalAlreadyHandled = false;
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
          if (thinkingStarted && !streamStarted) {
            ui.endThinkingStream(state);
            thinkingStarted = false;
          }
          answerChunks += delta;
          const trimmed = answerChunks.trim();
          if (!streamStarted && trimmed.startsWith('{')) {
            const isToolCall = /"type"\s*:\s*"tool"/.test(trimmed);
            if (isToolCall) {
              const toolMatch = trimmed.match(/"tool"\s*:\s*"([\w-]+)"/);
              const prepLabel = turnLanguage === 'es' ? 'Preparando' : 'Preparing';
              if (toolMatch) {
                const toolName = toolMatch[1];
                if (!state.__toolNameShown) {
                  ui.logEvent(state, 'tool', `${prepLabel} ${toolName}`);
                  state.__toolNameShown = true;
                } else if (typeof ui.updateLastEventTitle === 'function') {
                  ui.updateLastEventTitle(`${prepLabel} ${toolName}`);
                }
              } else if (!state.__toolNameShown) {
                ui.logEvent(state, 'tool', `${prepLabel} ...`);
                state.__toolNameShown = true;
              }
              return;
            }
            const hasFinalKey = /"type"\s*:\s*"final"/.test(trimmed);
            if (hasFinalKey) {
              const contentMatch = trimmed.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
              if (contentMatch) {
                stopThinking();
                if (streamOutput) ui.beginAssistantStream(state);
                streamStarted = true;
                answerStarted = true;
                suppressFinalStream = true;
                if (streamOutput) {
                  jsonFinalAlreadyHandled = true;
                  ui.writeAssistantDelta(state, contentMatch[1]);
                }
                answerChunks = '';
                return;
              }
              suppressFinalStream = true;
              return;
            }
            if (trimmed.length > 80) {
              stopThinking();
              if (streamOutput) ui.beginAssistantStream(state);
              streamStarted = true;
              answerStarted = true;
              answerChunks = '';
              return;
            }
            return;
          }
          if (streamStarted && answerStarted && streamOutput && !suppressFinalStream) {
            ui.writeAssistantDelta(state, delta);
          }
        },
      });
      if (streamOutput && streamStarted) {
        ui.endAssistantStream(state);
      }
      ui.pushAction(state, 'ok', state.language === 'es' ? 'Respuesta recibida' : 'Answer received');
      const rawAnswer = result.answer ?? '';
      const rawThinking = result.thinking || '';

      if (!rawAnswer && rawThinking && result.hasContent === false && !options._isFollowUp) {
        console.error(`[AGENT_DEBUG] Thinking-only response detected (${rawThinking.length} chars). Triggering follow-up.`);
        const lang = state.language || 'es';
        const followUpMessages = [
          ...messages.slice(0, -1),
          { role: 'assistant', content: rawThinking },
          { role: 'user', content: lang === 'es'
            ? 'Tu razonamiento anterior es correcto. Ahora genera tu respuesta final como JSON: {"type":"final","content":"tu respuesta aqui"} o la tool call correspondiente.'
            : 'Your previous reasoning is correct. Now generate your final answer as JSON: {"type":"final","content":"your answer here"} or the corresponding tool call.' },
        ];
        try {
          ui.pushAction(state, 'info', lang === 'es' ? 'Generando respuesta...' : 'Generating answer...');
          const followUp = await chat({
            messages: followUpMessages,
            modelKey: state?.activeModel || DEFAULT_MODEL_KEY,
            signal: controller.signal,
            onChunk: streamOutput ? (delta, phase) => {
              if (phase === 'answer') {
                if (!answerStarted) {
                  ui.beginAssistantStream(state);
                  answerStarted = true;
                  streamStarted = true;
                }
                ui.writeAssistantDelta(state, delta);
              }
            } : null,
          }, { _isFollowUp: true });
          if (followUp.answer) {
            if (streamOutput && answerStarted) ui.endAssistantStream(state);
            return { answer: followUp.answer, thinking: rawThinking, usage: followUp.usage || result.usage || null };
          }
        } catch {}
      }

      return { answer: rawAnswer, thinking: rawThinking, usage: result.usage || null, jsonFinalAlreadyHandled };
    } catch (err) {
      const externalAbort = Boolean(signal?.aborted);
      const aborted = controller.signal.aborted || err?.name === 'AbortError';
      if (aborted) throw new Error(state.language === 'es' ? 'Tiempo agotado' : 'Timeout');
      if (!externalAbort && attempt < maxAttempts - 1) {
        const backoff = Math.min(retryDelay * Math.pow(2, attempt), 10000);
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
  const compactThreshold = getSetting(state, 'autoCompactThreshold');
  if (contextLimit > 0 && estimatedTokens > contextLimit * compactThreshold) {
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

async function answerFromToolResult(input, call, result, state, ui, language) {
  const systemPrompt = buildSystemPrompt(state.cwd, state, { input, language });
  const turnMessages = [
    { role: 'user', content: input },
    { role: 'assistant', content: JSON.stringify({ type: 'tool', tool: call.tool, args: call.args }) },
    { role: 'user', content: buildToolResultMessage(call, result, language) },
  ];
  const messages = buildConversationMessages(state, turnMessages, systemPrompt);
  const output = await requestModel(messages, state, ui, {
    label: language === 'es' ? 'Procesando resultado' : 'Processing result',
  });
  const parsed = parseAgentResponse(output.answer || '');
  const answer = parsed.type === 'final' ? normalizeText(parsed.content) : normalizeText(output.answer || '');
  return answer || (language === 'es' ? '(procesado)' : '(processed)');
}

async function runAgentTurn(input, state, ui, options = {}) {
  const signal = options.signal;
  state.turnCount += 1;
  state.__toolNameShown = false;
  if (state.turnCount === 1 && state.title === 'New session') {
    state.title = shortText(input, 60) || state.title;
  }

  const turnLanguage = detectLanguage(input, state.language);

  const directAction = parseDirectAction(input);
  if (directAction) {
    await appendTranscriptEntry(state.sessionId, { type: 'user', content: input });
    const result = await executeToolCall(directAction, state, ui, { signal });
    const cleanResult = stripBase64Images(String(result || ''));
    await appendTranscriptEntry(state.sessionId, { type: 'tool', tool: directAction.tool, args: directAction.args, result: cleanResult });
    const finalAnswer = await answerFromToolResult(input, directAction, cleanResult, state, ui, turnLanguage);
    state.history.push({ role: 'user', content: input }, { role: 'assistant', content: finalAnswer });
    await appendTranscriptEntry(state.sessionId, { type: 'assistant', content: finalAnswer });
    await persistSessionState(state, ui);
    return { content: finalAnswer, rendered: true };
  }

  const turnMessages = [{ role: 'user', content: input }];
  await appendTranscriptEntry(state.sessionId, { type: 'user', content: input });

  let step = 0;
  let toolUsedThisTurn = false;

  try {
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

    if (signal?.aborted) {
      if (turnMessages.length > 0) {
        state.history.push(...turnMessages);
        await persistSessionState(state, ui);
      }
      throw new Error('Aborted');
    }

    const { answer: rawAnswer, usage: rawUsage, jsonFinalAlreadyHandled: jsonHandled } = raw || {};
    if (rawUsage && typeof ui.setTokenUsage === 'function') {
      ui.setTokenUsage(rawUsage);
    }
    let parsed = parseAgentResponse(rawAnswer || '');

    if (parsed.type === 'tool' && !KNOWN_TOOLS.has(parsed.tool)) {
      const invalidToolMsg = turnLanguage === 'en'
        ? `The tool "${parsed.tool}" does not exist. Available tools: ${[...KNOWN_TOOLS].join(', ')}. Use ONE of these exact names.`
        : `La herramienta "${parsed.tool}" no existe. Herramientas disponibles: ${[...KNOWN_TOOLS].join(', ')}. Usa UNO de estos nombres exactos.`;
      turnMessages.push({ role: 'assistant', content: JSON.stringify({ type: 'tool', tool: parsed.tool, args: parsed.args }) });
      turnMessages.push({ role: 'user', content: invalidToolMsg });
      step++;
      continue;
    }

    if (parsed.type === 'final') {
      let safeContent = (parsed.content || '').trim() || '(respuesta vacía)';
      const lastTool = turnMessages.filter(m => m.role === 'assistant' && m.content?.includes('"type":"tool"')).pop();
      const isAfterAskUser = lastTool && lastTool.content?.includes('"tool":"ask_user"');
      if (isAfterAskUser && safeContent.length < 20) {
        const askUserResult = turnMessages.find(m => m.role === 'user' && m.content?.includes('TOOL_RESULT'));
        if (askUserResult) {
          const userResponse = askUserResult.content.replace('TOOL_RESULT\n', '').split('\n')[0];
          safeContent = turnLanguage === 'en'
            ? `The user has responded. Based on their answer "${userResponse}", here is the information:`
            : `El usuario ha respondido. Basado en su respuesta "${userResponse}", aquí está la información:`;
        }
      }
      turnMessages.push({ role: 'assistant', content: safeContent });
      state.history.push(...turnMessages);
      await appendTranscriptEntry(state.sessionId, { type: 'assistant', content: safeContent });
      await persistSessionState(state, ui);
      return { content: safeContent, rendered: jsonHandled ? true : useStream };
    }

    turnMessages.push({ role: 'assistant', content: JSON.stringify({ type: 'tool', tool: parsed.tool, args: sanitizeArgsForModel(parsed) }) });

    try {
      toolUsedThisTurn = true;
      const result = await executeToolCall(parsed, state, ui, { signal });
      await appendTranscriptEntry(state.sessionId, { type: 'tool', tool: parsed.tool, args: parsed.args, result });
      turnMessages.push({ role: 'user', content: `TOOL_RESULT\n${buildToolResultMessage(parsed, result, turnLanguage)}` });
    } catch (err) {
      if (err?.message === 'aborted' && signal?.aborted) {
        throw new Error('aborted');
      }
      turnMessages.push({ role: 'user', content: buildToolErrorMessage(parsed, err.message, turnLanguage) });
    }

    step++;
    const maxSteps = getSetting(state, 'maxToolSteps');
    if (step >= maxSteps) {
      const limitMsg = turnLanguage === 'es' ? 'Limite de pasos alcanzado. Resumiendo estado actual del sistema.' : 'Step limit reached. Summarizing current system state.';
      state.history.push(...turnMessages, { role: 'assistant', content: limitMsg });
      await persistSessionState(state, ui);
      return { content: limitMsg, rendered: false };
    }
  }
  } catch (err) {
    if (turnMessages.length > 1 && err?.message !== 'Aborted') {
      state.history.push(...turnMessages);
      await persistSessionState(state, ui);
    }
    throw err;
  }
}

module.exports = { runAgentTurn };
