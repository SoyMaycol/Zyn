const BASE = 'https://opencode.ai/zen/v1';
const { REQUEST_TIMEOUT_MS } = require('../../config');

const HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  'Accept': 'text/event-stream',
  'Origin': 'https://opencode.ai',
  'Referer': 'https://opencode.ai/',
};

const ZEN_STREAM_READ_TIMEOUT_MS = 120000;
const MAX_ZEN_STREAM_RETRIES = 3;

async function fetchZenCompletionWithRetry(messages, modelId, signal) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_ZEN_STREAM_RETRIES; attempt++) {
    const controller = new AbortController();
    const readTimeoutId = setTimeout(() => controller.abort(), ZEN_STREAM_READ_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
          model: modelId,
          messages,
          stream: true,
          max_tokens: 16384,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Zen ${modelId} fallo (${res.status}): ${text.slice(0, 200)}`);
      }
      clearTimeout(readTimeoutId);
      return res;
    } catch (err) {
      clearTimeout(readTimeoutId);
      lastError = err;
      if (err?.name === 'AbortError' && signal?.aborted) throw err;
      if (attempt < MAX_ZEN_STREAM_RETRIES) {
        const backoff = Math.min(2000 * Math.pow(2, attempt), 15000);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw lastError;
    }
  }
}

async function streamCompletion(messages, modelId, onChunk, signal) {
  const res = await fetchZenCompletionWithRetry(messages, modelId, signal);

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
      if (data === '[DONE]') continue;

      let parsed;
      try { parsed = JSON.parse(data); } catch { continue; }

      const delta = parsed?.choices?.[0]?.delta;
      if (!delta) continue;

      const fullReasoning = delta.reasoning_content || delta.reasoning_text || delta.reasoning_details?.[0]?.text || delta.reasoning_final || delta.completion_reasoning || delta.reasoning_summary;
      const incrementalReasoning = delta.reasoning || delta.reasoning_delta || delta.reasoning_chunk;
      if ((fullReasoning || incrementalReasoning) && process.env.ZYN_DEBUG_THINKING) {
        console.error('ZEN_THINKING:', JSON.stringify({ full: fullReasoning?.slice(0, 200), incr: incrementalReasoning?.slice(0, 200), thinkingLen: thinking.length, deltaKeys: Object.keys(delta) }));
      }
      let newDelta = '';
      if (fullReasoning && fullReasoning.length > 0) {
        if (thinking && fullReasoning.startsWith(thinking)) {
          newDelta = fullReasoning.slice(thinking.length);
          thinking = fullReasoning;
        } else {
          newDelta = fullReasoning;
          thinking += fullReasoning;
        }
      } else if (incrementalReasoning && incrementalReasoning.length > 0) {
        newDelta = incrementalReasoning;
        thinking += incrementalReasoning;
      }
      if (newDelta && onChunk) onChunk(newDelta, 'thinking');

      if (delta.content) {
        answer += delta.content;
        if (onChunk) onChunk(delta.content, 'answer');
      }
    }
  }

  return { text: answer.trim(), thinking: thinking.trim() };
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