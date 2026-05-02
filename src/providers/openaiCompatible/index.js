const { REQUEST_TIMEOUT_MS } = require('../../config');

const DEFAULT_BASE_URL = process.env.OPENAI_COMPAT_BASE_URL || process.env.OPENAI_BASE_URL || '';
const DEFAULT_API_KEY = process.env.OPENAI_COMPAT_API_KEY || process.env.OPENAI_API_KEY || '';

function buildUrl(baseUrl) {
  return baseUrl.replace(/\/$/, '') + '/chat/completions';
}

async function streamCompletion(messages, modelId, onChunk, signal, options = {}) {
  const baseUrl = options.baseUrl || options.model?.baseUrl || DEFAULT_BASE_URL;
  const apiKey = options.apiKey || options.model?.apiKey || DEFAULT_API_KEY;
  if (!baseUrl) {
    throw new Error('openai-compatible no está configurado. Define OPENAI_COMPAT_BASE_URL.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetch(buildUrl(baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`openai-compatible ${modelId} fallo (${res.status}): ${text.slice(0, 200)}`);
    }

    let answer = '';
    let thinking = '';
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') break;
        let parsed;
        try { parsed = JSON.parse(data); } catch { continue; }
        const delta = parsed?.choices?.[0]?.delta || {};
        if (delta.reasoning) {
          const reason = String(delta.reasoning);
          if (reason.length > thinking.length) {
            const newDelta = reason.slice(thinking.length);
            thinking = reason;
            if (onChunk) onChunk(newDelta, 'thinking');
          }
        }
        if (delta.content) {
          answer += delta.content;
          if (onChunk) onChunk(delta.content, 'answer');
        }
      }
    }

    return { text: answer.trim(), thinking: thinking.trim() };
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}

async function openaiCompatible(messages, modelId, onChunk = null, options = {}) {
  const result = await streamCompletion(messages, modelId, onChunk, options.signal, options);
  return {
    status: true,
    text: result.text,
    thinking: result.thinking,
  };
}

module.exports = { openaiCompatible };
