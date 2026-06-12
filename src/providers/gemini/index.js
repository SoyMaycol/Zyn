const { parseAgentResponse } = require('../../core/prompts');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function getApiKey(config) {
  const key = String(
    config?.apiKey
    || process.env.ZYN_GEMINI_API_KEY
    || process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || '',
  ).trim();
  return key;
}

function toGeminiMessages(messages) {
  const systemParts = [];
  const contents = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const role = String(m.role || '').toLowerCase();
    const text = String(m.content || '').trim();
    if (!text) continue;
    if (role === 'system' || role === 'developer') {
      systemParts.push({ text });
      continue;
    }
    const geminiRole = role === 'assistant' ? 'model' : 'user';
    contents.push({ role: geminiRole, parts: [{ text }] });
  }
  return { systemInstruction: systemParts.length ? { parts: systemParts } : undefined, contents };
}

function extractStreamChunk(json) {
  const candidate = json?.candidates?.[0];
  if (!candidate) return null;
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return null;

  let text = '';
  let thought = '';
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    const piece = String(part.text || '');
    if (!piece) continue;
    if (part.thought === true) thought += piece;
    else text += piece;
  }
  if (candidate.finishReason === 'SAFETY') {
    return { text: text + '\n[blocked by safety filter]', thought, finish: 'safety' };
  }
  if (!text && !thought) return null;
  return { text, thought, finish: candidate.finishReason || null };
}

async function gemini(messages, modelId, onChunk = null, options = {}) {
  const config = options.config || {};
  const apiKey = getApiKey(config);
  if (!apiKey) {
    throw new Error('Gemini no esta configurado. Define una API Key con /provider set gemini apiKey <KEY> o ZYN_GEMINI_API_KEY.');
  }

  const model = String(modelId || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  const { systemInstruction, contents } = toGeminiMessages(messages);
  const body = {
    contents,
    generationConfig: {
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    },
  };
  if (systemInstruction) body.systemInstruction = systemInstruction;

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gemini fallo (${res.status}): ${text.slice(0, 400)}`);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let thinking = '';
    const parser = (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const raw = trimmed.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const json = JSON.parse(raw);
          const extracted = extractStreamChunk(json);
          if (!extracted) continue;
          if (extracted.text) {
            answer += extracted.text;
            if (onChunk) onChunk(extracted.text, 'answer');
          }
          if (extracted.thought) {
            thinking += extracted.thought;
            if (onChunk) onChunk(extracted.thought, 'thinking');
          }
        } catch {}
      }
    };

    for await (const chunk of res.body) {
      parser(decoder.decode(chunk, { stream: true }));
    }
    parser(decoder.decode());

    const text = parseAgentResponse(answer.trim())?.content || answer.trim();
    return { text, thinking: thinking.trim() };
  } finally {
    if (options.signal) options.signal.removeEventListener('abort', onExternalAbort);
  }
}

module.exports = { gemini, toGeminiMessages, extractStreamChunk };
