const {
  DEFAULT_MODEL_KEY,
  KEEP_RECENT_MESSAGES,
  MAX_HISTORY_CHARS,
  MODELS,
  REQUEST_TIMEOUT_MS,
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


function looksLikeActionRequest(text) {
  const sample = normalizeText(String(text || '')).toLowerCase();
  if (!sample) return false;
  return /(instala|instalar|install|run|ejecuta|ejecutar|crea|crear|build|compile|compila|fix|arregla|corrige|update|actualiza|edita|edit|borra|elimina|remove|descarga|download|busca|search|prueba|test|verifica|check|configura|setup|mueve|move|importa|import|aplica|apply)/i.test(sample);
}

async function requestModel(messages, state, ui, options = {}) {
  const {
    label = 'Pensando',
    streamOutput = false,
    signal,
  } = options;

  const stopThinking = ui.startThinkingIndicator(state, label);
  let answerStarted = false;
  let thinkingStarted = false;
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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

        if (streamOutput) {
          ui.writeAssistantDelta(state, delta);
        }
      },
    });

    ui.pushAction(state, 'ok', 'Respuesta del modelo recibida');
    return result.answer ?? '';
  } catch (err) {
    if (controller.signal.aborted || err?.name === 'AbortError') {
      throw new Error(state.language === 'es' ? 'Agente detenido por el usuario o por tiempo agotado' : 'Agent stopped by the user or timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
    stopThinking();
    if (thinkingStarted) ui.endThinkingStream(state);
    if (streamOutput && answerStarted) {
      ui.endAssistantStream(state);
    }
  }
}

async function summarizeMessages(state, ui, messages) {
  const transcript = messages
    .map(message => `${message.role.toUpperCase()}:\n${message.content}`)
    .join('\n\n');

  const prompt = [
    {
      role: 'system',
      content: [
        state.language === 'es' ? 'Resume la conversacion para memoria persistente.' : 'Summarize the conversation for persistent memory.',
        state.language === 'es' ? 'Escribe en espanol.' : 'Write in English.',
        state.language === 'es' ? 'Incluye objetivos, decisiones, archivos, comandos, restricciones y pendientes importantes.' : 'Include goals, decisions, files, commands, constraints, and important pending items.',
        'Max 12 lines.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        state.memorySummary ? `Memoria previa:\n${state.memorySummary}\n` : '',
        'Conversacion a compactar:',
        transcript,
      ].join('\n'),
    },
  ];

  return normalizeText(await requestModel(prompt, state, ui, {
    label: state.language === 'es' ? 'Compactando memoria' : 'Compacting memory',
  }));
}

async function compactHistoryIfNeeded(state, ui) {
  if (estimateHistoryChars(state.history) <= MAX_HISTORY_CHARS) {
    return;
  }

  if (state.history.length <= KEEP_RECENT_MESSAGES) {
    return;
  }

  const splitIndex = Math.max(2, state.history.length - KEEP_RECENT_MESSAGES);
  const oldMessages = state.history.slice(0, splitIndex);
  const recentMessages = state.history.slice(splitIndex);
  const summary = await summarizeMessages(state, ui, oldMessages);

  state.memorySummary = summary;
  state.history = recentMessages;
  ui.logEvent(state, 'info', state.language === 'es' ? 'Memoria compactada' : 'Memory compacted', shortText(summary, 100));
  await appendTranscriptEntry(state.sessionId, {
    type: 'system',
    content: `Memoria compactada:\n${summary}`,
  });
}

async function persistSessionState(state, ui) {
  await compactHistoryIfNeeded(state, ui);
  await saveState(state);
}

async function answerFromToolResult(input, call, result, state, ui) {
  const messages = [
    {
      role: 'system',
      content: [
        'You are Zyn.',
        state.language === 'es' ? 'Responde en espanol, directo y solo con la respuesta final.' : 'Respond in English, direct and only with the final answer.',
        state.language === 'es' ? 'Usa solo los datos del resultado de herramienta dado.' : 'Use only the data from the provided tool result.',
        `Directorio actual: ${state.cwd}`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'Solicitud original del usuario:',
        input,
        '',
        `Resultado de la herramienta ${call.tool}:`,
        result,
      ].join('\n'),
    },
  ];

  const output = await requestModel(messages, state, ui, {
    label: state.language === 'es' ? 'Resumiendo resultado' : 'Summarizing result',
    streamOutput: true,
  });
  return normalizeText(output);
}

async function runAgentTurn(input, state, ui, options = {}) {
  const signal = options.signal;
  state.turnCount += 1;
  if (state.turnCount === 1 && state.title === 'New session') {
    state.title = shortText(input, 60) || state.title;
  }
  ui.logEvent(state, 'info', `${state.language === 'es' ? 'Turno' : 'Turn'} ${state.turnCount}`);

  let toolUsedThisTurn = false;
  let finalWithoutToolRetries = 0;

  const directAction = parseDirectAction(input);
  if (directAction) {
    await appendTranscriptEntry(state.sessionId, { type: 'user', content: input });
    toolUsedThisTurn = true;
    const result = await executeToolCall(directAction, state, ui);
    await appendTranscriptEntry(state.sessionId, {
      type: 'tool',
      tool: directAction.tool,
      args: directAction.args,
      result,
    });
    const finalAnswer = await answerFromToolResult(input, directAction, result, state, ui);
    state.history.push({ role: 'user', content: input });
    state.history.push({ role: 'assistant', content: finalAnswer });
    await appendTranscriptEntry(state.sessionId, {
      type: 'assistant',
      content: finalAnswer,
    });
    ui.logEvent(state, 'ok', state.language === 'es' ? 'Respuesta lista' : 'Response ready');
    await persistSessionState(state, ui);
    return { content: finalAnswer, rendered: true };
  }

  const turnMessages = [{ role: 'user', content: input }];
  await appendTranscriptEntry(state.sessionId, { type: 'user', content: input });

  let lastFingerprint = '';
  let repeatCount = 0;
  let step = 0;
  const turnLanguage = detectLanguage(input, state.language);
  state.language = turnLanguage;

  while (true) {
    if (signal?.aborted) {
      throw new Error(state.language === 'es' ? 'Agente detenido por el usuario' : 'Agent stopped by the user');
    }

    const injected = typeof state.getQueuedMessages === 'function'
      ? state.getQueuedMessages()
      : [];
    for (const msg of injected) {
      const note = `MENSAJE_ADICIONAL_DEL_USUARIO:\n${msg}`;
      turnMessages.push({ role: 'user', content: note });
      ui.logEvent(state, 'info', state.language === 'es' ? 'Mensaje recibido en vivo' : 'Live message received', shortText(msg, 60));
    }

    const messages = buildConversationMessages(
      state,
      turnMessages,
      buildSystemPrompt(state.cwd, state, { input, language: detectLanguage(input, state.language) }),
    );

    const primaryPromise = requestModel(messages, state, ui, {
      label: step === 0 ? (state.language === 'es' ? 'Pensando' : 'Thinking') : `${state.language === 'es' ? 'Paso' : 'Step'} ${step + 1}`,
      signal,
    });

    let secondaryResults = [];
    if (state.concuerdo) {
      const activeKey = state.activeModel || DEFAULT_MODEL_KEY;
      const otherKeys = Object.keys(MODELS).filter(k => k !== activeKey);
      const CONCUERDO_TIMEOUT = 30000;
      const withTimeout = (promise) => Promise.race([
        promise,
        new Promise(r => setTimeout(() => r(null), CONCUERDO_TIMEOUT)),
      ]);
      const secondaryPromises = otherKeys.map(k =>
        withTimeout(chatSilent({ messages, modelKey: k, signal }).catch(() => null))
      );
      secondaryResults = secondaryPromises.map((p, i) => ({ promise: p, key: otherKeys[i] }));
    }

    const raw = await primaryPromise;
    let parsed = parseAgentResponse(raw);

    if (secondaryResults.length > 0) {
      const settled = await Promise.allSettled(secondaryResults.map(s => s.promise));
      const extras = [];
      let toolSuggestions = [];

      for (let i = 0; i < settled.length; i += 1) {
        const val = settled[i].status === 'fulfilled' ? settled[i].value : null;
        const label = MODELS[secondaryResults[i].key]?.label || secondaryResults[i].key;

        if (!val?.answer) {
          ui.logEvent(state, 'info', `${label} — ${state.language === 'es' ? 'sin respuesta' : 'no response'}`);
          continue;
        }

        const altParsed = parseAgentResponse(val.answer);

        if (altParsed.type === 'tool') {
          toolSuggestions.push({ parsed: altParsed, label });
          ui.logEvent(state, 'info', `${label} ${state.language === 'es' ? 'sugiere' : 'suggests'} ${altParsed.tool}`);
        } else if (altParsed.type === 'final' && altParsed.content?.trim()) {
          extras.push({ content: altParsed.content, label });
          ui.logEvent(state, 'info', `${label} ${state.language === 'es' ? 'respondió' : 'responded'}`);
        }
      }

      if (parsed.type === 'final' && toolSuggestions.length >= 2) {
        parsed = toolSuggestions[0].parsed;
        ui.logEvent(state, 'info', `${toolSuggestions.length} ${state.language === 'es' ? 'modelos concuerdan' : 'models agree'}: ${parsed.tool}`);
      } else if (parsed.type === 'final' && extras.length > 0) {
        const activeLabel = MODELS[state.activeModel || DEFAULT_MODEL_KEY]?.label || (state.language === 'es' ? 'Primario' : 'Primary');
        ui.logEvent(state, 'info', `${state.language === 'es' ? 'Sintetizando' : 'Synthesizing'}: ${[activeLabel, ...extras.map(e => e.label)].join(' + ')}`);

        const synthMessages = [
          {
            role: 'system',
            content: [
              state.language === 'es' ? 'Eres Zyn. Varios modelos IA analizaron la misma pregunta del usuario.' : 'You are Zyn. Several AI models analyzed the same user request.',
              state.language === 'es' ? 'Tu trabajo: crear UNA SOLA respuesta final unificada.' : 'Your job: create ONE unified final answer.',
              'Rules:',
              state.language === 'es' ? '- NO repitas informacion que ya este cubierta por otro modelo' : '- Do not repeat information already covered by another model',
              state.language === 'es' ? '- Integra las perspectivas unicas de cada uno naturalmente' : "- Blend each model's unique insights naturally",
              state.language === 'es' ? '- Si todos dicen lo mismo, da UNA respuesta limpia sin redundancia' : '- If they all say the same thing, give one clean non-redundant answer',
              state.language === 'es' ? '- Se directo y conciso' : '- Be direct and concise',
              state.language === 'es' ? '- Responde en español' : '- Respond in English',
              state.language === 'es' ? '- NO menciones que estas sintetizando ni que hay multiples modelos' : '- Do not mention that you are synthesizing or that multiple models are involved',
              state.language === 'es' ? '- NO uses separadores --- ni secciones por modelo' : '- Do not use --- separators or per-model sections',
              state.language === 'es' ? '- Responde como si fueras un solo agente dando la mejor respuesta posible' : '- Respond like a single agent giving the best possible answer',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              `Respuesta de ${activeLabel}:\n${parsed.content}`,
              '',
              ...extras.map(e => `Respuesta de ${e.label}:\n${e.content}`),
              '',
              'Crea la respuesta final unificada:',
            ].join('\n'),
          },
        ];

        try {
          const synthesis = await requestModel(synthMessages, state, ui, {
            label: 'Concuerdo — unificando',
            signal,
          });
          if (synthesis?.trim()) {
            parsed = { type: 'final', content: synthesis.trim() };
            ui.logEvent(state, 'info', state.language === 'es' ? '🤝 Respuesta unificada lista' : '🤝 Unified response ready');
          }
        } catch {
        }
      } else if (parsed.type === 'tool' && toolSuggestions.length > 0) {
        const matching = toolSuggestions.filter(t => t.parsed.tool === parsed.tool);
        if (matching.length > 0) {
          ui.logEvent(state, 'info', `🤝 ${matching.length + 1} modelos concuerdan: ${parsed.tool}`);
        }
      }
    }

    if (parsed.type === 'final') {
      const content = parsed.content.trim();
      if (looksLikeActionRequest(input) && !toolUsedThisTurn && finalWithoutToolRetries < 2) {
        finalWithoutToolRetries += 1;
        ui.logEvent(state, 'warn', turnLanguage === 'es' ? 'Sin prueba real todavía' : 'No real attempt yet', turnLanguage === 'es' ? 'Primero intenta una herramienta antes de concluir.' : 'Try a real tool before concluding.');
        turnMessages.push({ role: 'assistant', content: content || raw.trim() });
        turnMessages.push({
          role: 'user',
          content: [
            turnLanguage === 'es'
              ? 'Aun no has probado nada. No des una conclusion ni pasos teoricos.'
              : 'You have not actually tried anything yet. Do not give a conclusion or theory steps.',
            turnLanguage === 'es'
              ? 'Primero intenta una herramienta real adecuada para la tarea.'
              : 'First try a real tool that fits the task.',
            turnLanguage === 'es'
              ? 'Si ninguna herramienta aplica, dilo explicitamente con una sola frase corta y honesta.'
              : 'If no tool applies, say so explicitly in one short honest sentence.',
          ].join(' '),
        });
        step += 1;
        continue;
      }
      turnMessages.push({ role: 'assistant', content: content || raw.trim() });
      state.history.push(...turnMessages);
      await appendTranscriptEntry(state.sessionId, {
        type: 'assistant',
        content,
      });
      ui.logEvent(state, 'ok', state.language === 'es' ? 'Respuesta lista' : 'Response ready');
      await persistSessionState(state, ui);
      return { content, rendered: false };
    }

    const fingerprint = `${parsed.tool}:${parsed.args?.path || ''}:${(parsed.args?.content || parsed.args?.search || '').length}`;
    if (fingerprint === lastFingerprint) {
      repeatCount += 1;
      if (repeatCount >= 2) {
        ui.logEvent(state, 'warn', 'Loop detectado', `${parsed.tool} repetido ${repeatCount + 1}x`);
        turnMessages.push({
          role: 'user',
          content: 'ATENCION: Estas repitiendo la misma operacion. La operacion anterior ya fue exitosa. Responde con type=final confirmando lo que hiciste.',
        });
        step += 1;
        continue;
      }
    } else {
      lastFingerprint = fingerprint;
      repeatCount = 0;
    }

    turnMessages.push({
      role: 'assistant',
      content: JSON.stringify(
        {
          type: 'tool',
          tool: parsed.tool,
          args: sanitizeArgsForModel(parsed),
        },
        null,
        2,
      ),
    });

    try {
      toolUsedThisTurn = true;
      const result = await executeToolCall(parsed, state, ui);
      await appendTranscriptEntry(state.sessionId, {
        type: 'tool',
        tool: parsed.tool,
        args: parsed.args,
        result,
      });
      turnMessages.push({
        role: 'user',
        content: `TOOL_RESULT\n${buildToolResultMessage(parsed, result)}`,
      });
    } catch (err) {
      ui.logEvent(state, 'error', 'Fallo de herramienta', err.message);
      await appendTranscriptEntry(state.sessionId, {
        type: 'tool_error',
        tool: parsed.tool,
        args: parsed.args,
        error: err.message,
      });
      turnMessages.push({
        role: 'user',
        content: buildToolErrorMessage(parsed, err.message),
      });
    }

    step += 1;
  }
}

module.exports = {
  runAgentTurn,
};
