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

const BASE = 'https://opencode.ai/zen/v1';

const HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  'Accept': 'text/event-stream',
  'Origin': 'https://opencode.ai',
  'Referer': 'https://opencode.ai/',
};

async function streamCompletion(messages, modelId, onChunk, signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        model: modelId,
        messages,
        stream: true,
        max_tokens: 8192,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Zen ${modelId} fallo (${res.status}): ${text.slice(0, 200)}`);
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

        const delta = parsed?.choices?.[0]?.delta;
        if (!delta) continue;

        const reasoning = delta.reasoning || delta.reasoning_details?.[0]?.text;
        if (reasoning) {
          const next = appendReplacementSafeDelta(thinking, reasoning);
          thinking = next.value;
          if (onChunk && next.delta) onChunk(next.delta, 'thinking');
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

async function zen(messages, modelId, onChunk = null, options = {}) {
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await streamCompletion(messages, modelId, onChunk, options.signal);
      return {
        status: true,
        text: result.text,
        thinking: result.thinking,
      };
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      const isRetryable = err.message?.includes('429')
        || err.message?.includes('503')
        || err.name === 'AbortError';
      if (isRetryable && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

module.exports = { zen };
