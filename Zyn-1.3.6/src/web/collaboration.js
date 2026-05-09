const { chatSilent } = require('../providers/scraperClient');
const { parseAgentResponse } = require('../core/prompts');
const { MODELS } = require('../config');

async function runCollaboration(primaryContent, primaryKey, modelMessages, onEvent, isAborted, language = 'en') {
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
  for (const result of initialAnswers) {
    if (result.status !== 'fulfilled' || !result.value?.answer) continue;
    const parsed = parseAgentResponse(result.value.answer);
    if (parsed.type === 'final' && parsed.content) {
      validAnswers.push({
        key: result.value.key,
        content: parsed.content,
        label: MODELS[result.value.key].label,
      });
      onEvent({ type: 'concuerdo_model', label: MODELS[result.value.key].label, status: 'ok' });
    }
  }

  if (validAnswers.length <= 1) return null;

  onEvent({ type: 'info', content: 'Iniciando revisión cruzada entre modelos...' });
  const reviews = [];

  for (const reviewer of validAnswers) {
    if (isAborted?.()) return null;
    const others = validAnswers.filter(a => a.key !== reviewer.key);
    const reviewPrompt = [
      {
        role: 'system',
        content: [
          `Eres ${reviewer.label}.`,
          'Tu tarea es auditar respuestas de otros modelos, corregir errores y proponer mejoras directas.',
          'No expliques teoría. Marca lo correcto, lo dudoso y lo incorrecto.',
          'Si algo está mal, corrígelo con precisión.',
          'Si todo está bien, responde TODO CORRECTO.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Pregunta original:\n${modelMessages[modelMessages.length - 1].content}`,
          '',
          ...others.map(o => `Respuesta de ${o.label}:\n${o.content}`),
          '',
          'Revisa estas respuestas y devuelve solo la corrección o confirmación final.',
        ].join('\n'),
      },
    ];

    const reviewRes = await chatSilent({ messages: reviewPrompt, modelKey: reviewer.key }).catch(() => null);
    if (reviewRes?.answer) {
      reviews.push({ from: reviewer.label, review: reviewRes.answer });
      onEvent({ type: 'info', content: `${reviewer.label} finished review.` });
    }
  }

  onEvent({ type: 'synth_start' });
  const finalPrompt = [
    {
      role: 'system',
      content: [
        'You are Zyn.',
        'Your job is to produce one final professional, accurate, and direct answer.',
        'Integrate the cross-reviews and correct any errors.',
        'Do not mention the internal process.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'Initial responses:',
        validAnswers.map(a => `${a.label}: ${a.content}`).join('\n\n'),
        '',
        'Cross-reviews:',
        reviews.map(r => `De ${r.from}: ${r.review}`).join('\n\n'),
        '',
        'Create the final unified, corrected, and optimized response. Respond only with the final text in English.',
      ].join('\n'),
    },
  ];

  const finalRes = await chatSilent({ messages: finalPrompt, modelKey: primaryKey }).catch(() => null);
  return finalRes?.answer || null;
}

module.exports = { runCollaboration };
