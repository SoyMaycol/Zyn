const { chatSilent } = require('../providers/scraperClient');
const { parseAgentResponse } = require('../core/prompts');
const { MODELS } = require('../config');

async function runCollaboration(primaryContent, primaryKey, modelMessages, onEvent, isAborted) {
  const otherKeys = Object.keys(MODELS).filter(k => k !== primaryKey);
  if (!otherKeys.length) return null;

  onEvent({ type: 'concuerdo_start', models: otherKeys.map(k => MODELS[k].label) });

  const initialAnswers = await Promise.allSettled(
    otherKeys.map(async (k) => {
      const res = await chatSilent({ messages: modelMessages, modelKey: k }).catch(() => null);
      return { key: k, answer: res?.answer };
    })
  );

  const validAnswers = [{ key: primaryKey, content: primaryContent, label: MODELS[primaryKey].label }];
  for (let i = 0; i < initialAnswers.length; i++) {
    const res = initialAnswers[i];
    if (res.status === 'fulfilled' && res.value.answer) {
      const parsed = parseAgentResponse(res.value.answer);
      if (parsed.type === 'final' && parsed.content) {
        validAnswers.push({
          key: res.value.key,
          content: parsed.content,
          label: MODELS[res.value.key].label
        });
        onEvent({ type: 'concuerdo_model', label: MODELS[res.value.key].label, status: 'ok' });
      }
    }
  }

  if (validAnswers.length <= 1) return null;

  onEvent({ type: 'info', content: 'Iniciando fase de revision cruzada...' });
  const reviews = [];
  for (const reviewer of validAnswers) {
    if (isAborted?.()) return null;
    const others = validAnswers.filter(a => a.key !== reviewer.key);
    const reviewPrompt = [
      {
        role: 'system',
        content: `Eres ${reviewer.label}. Tu tarea es revisar las respuestas de otros modelos y proporcionar correcciones o mejoras si es necesario.`
      },
      {
        role: 'user',
        content: `Pregunta original: ${modelMessages[modelMessages.length - 1].content}\n\n` +
                 others.map(o => `Respuesta de ${o.label}:\n${o.content}`).join('\n\n') +
                 `\n\nAnaliza estas respuestas. Si encuentras errores o puntos de mejora, indícalos brevemente. Si son correctas, di "TODO CORRECTO".`
      }
    ];

    const reviewRes = await chatSilent({ messages: reviewPrompt, modelKey: reviewer.key }).catch(() => null);
    if (reviewRes?.answer) {
      reviews.push({ from: reviewer.label, review: reviewRes.answer });
      onEvent({ type: 'info', content: `${reviewer.label} ha completado su revisión.` });
    }
  }

  onEvent({ type: 'synth_start' });
  const finalPrompt = [
    {
      role: 'system',
      content: 'Eres Zyn. Tu objetivo es crear la mejor respuesta posible basándote en múltiples perspectivas y sus revisiones cruzadas.'
    },
    {
      role: 'user',
      content: `Respuestas iniciales:\n` +
               validAnswers.map(a => `${a.label}: ${a.content}`).join('\n\n') +
               `\n\nRevisiones cruzadas:\n` +
               reviews.map(r => `De ${r.from}: ${r.review}`).join('\n\n') +
               `\n\nCrea la respuesta final unificada, corregida y optimizada. Responde solo con el texto final en español.`
    }
  ];

  const finalRes = await chatSilent({ messages: finalPrompt, modelKey: primaryKey }).catch(() => null);
  return finalRes?.answer || null;
}

module.exports = { runCollaboration };
