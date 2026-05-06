const { REQUEST_TIMEOUT_MS } = require('../../config');

function appendReplacementSafeDelta(previous, next) {
  const current = String(previous || '');
  const incoming = String(next || '');
  if (!incoming) return { value: current, delta: '' };
  if (!current) return { value: incoming, delta: incoming };
  if (incoming.startsWith(current)) {
    return { value: incoming, delta: incoming.slice(current.length) };
  }
  if (current.endsWith(incoming)) return { value: current, delta: '' };
  return { value: incoming, delta: '\n' + incoming };
}

const DEFAULT_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

async function streamCompletion(messages, modelId, onChunk, signal, baseUrl = DEFAULT_BASE_URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/x-ndjson',
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama ${modelId} fallo (${res.status}): ${text.slice(0, 200)}`);
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
        if (!trimmed) continue;
        let parsed;
        try { parsed = JSON.parse(trimmed); } catch { continue; }
        const delta = parsed?.message?.content || '';
        if (delta) {
          answer += delta;
          if (onChunk) onChunk(delta, 'answer');
        }
        const reason = parsed?.thinking || parsed?.message?.thinking || '';
        if (reason) {
          const next = appendReplacementSafeDelta(thinking, reason);
          thinking = next.value;
          if (onChunk && next.delta) onChunk(next.delta, 'thinking');
        }
      }
    }

    return { text: answer.trim(), thinking: thinking.trim() };
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}

async function ollama(messages, modelId, onChunk = null, options = {}) {
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  return {
    status: true,
    ...(await streamCompletion(messages, modelId, onChunk, options.signal, baseUrl)),
  };
}

module.exports = { ollama };
