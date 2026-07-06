const BASE = 'https://opencode.ai/zen/v1';
const { REQUEST_TIMEOUT_MS } = require('../../config');

const HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  'Accept': 'text/event-stream',
  'Origin': 'https://opencode.ai',
  'Referer': 'https://opencode.ai/',
};

const ZEN_STREAM_READ_TIMEOUT_MS = 60000;
const MAX_ZEN_STREAM_RETRIES = 3;

async function fetchZenCompletionWithRetry(messages, modelId, signal, options = {}) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_ZEN_STREAM_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new Error('Aborted');
    }
    const controller = new AbortController();
    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const readTimeoutId = setTimeout(() => controller.abort(), ZEN_STREAM_READ_TIMEOUT_MS);
    try {
      const body = {
        model: modelId,
        messages,
        stream: true,
        max_tokens: 65536,
      };
      if (options?.reasoning_effort) {
        body.reasoning_effort = options.reasoning_effort;
      }
      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(body),
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
      if (err?.name === 'AbortError' && (signal?.aborted || controller.signal.aborted)) throw err;
      if (attempt < MAX_ZEN_STREAM_RETRIES) {
        const backoff = Math.min(2000 * Math.pow(2, attempt), 15000);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw lastError;
    }
  }
}

async function streamCompletion(messages, modelId, onChunk, signal, options = {}) {
  const res = await fetchZenCompletionWithRetry(messages, modelId, signal, options);

  let answer = '';
  let thinking = '';
  let usage = null;
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

      if (parsed?.usage) {
        usage = {
          promptTokens: parsed.usage.prompt_tokens || 0,
          completionTokens: parsed.usage.completion_tokens || 0,
          totalTokens: parsed.usage.total_tokens || 0,
        };
      }

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

  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith('data:')) {
      const data = trimmed.slice(5).trim();
      if (data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data);
          if (parsed?.usage) {
            usage = {
              promptTokens: parsed.usage.prompt_tokens || 0,
              completionTokens: parsed.usage.completion_tokens || 0,
              totalTokens: parsed.usage.total_tokens || 0,
            };
          }
          const delta = parsed?.choices?.[0]?.delta;
          if (delta?.content) {
            answer += delta.content;
            if (onChunk) onChunk(delta.content, 'answer');
          }
        } catch {}
      }
    }
  }

  if (!answer.trim() && thinking.trim()) {
    console.error(`[ZEN_DEBUG] Model ${modelId} produced thinking (${thinking.length} chars) but NO content. Stream ended without delta.content.`);
  }
  return { text: answer.trim(), thinking: thinking.trim(), usage, hasContent: answer.trim().length > 0 };
}

async function zen(messages, modelId, onChunk = null, options = {}) {
  const result = await streamCompletion(messages, modelId, onChunk, options.signal, options);
  return {
    status: true,
    text: result.text,
    thinking: result.thinking,
    usage: result.usage,
    hasContent: result.hasContent,
  };
}

let _freeModelsCache = null;
let _freeModelsCacheTime = 0;
const FREE_MODELS_CACHE_TTL_MS = 5 * 60 * 1000;
const FREE_MODELS_TIMEOUT_MS = 10000;

async function fetchFreeModels() {
  const now = Date.now();
  if (_freeModelsCache && (now - _freeModelsCacheTime) < FREE_MODELS_CACHE_TTL_MS) {
    return _freeModelsCache;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FREE_MODELS_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE}/models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return _freeModelsCache || [];
    }

    const data = await res.json();
    const models = (data.data || data.models || [])
      .filter(m => (m.id || '').toLowerCase().includes('free'))
      .map(m => ({ id: m.id, label: m.name || m.id }));

    _freeModelsCache = models;
    _freeModelsCacheTime = now;
    return models;
  } catch {
    clearTimeout(timeoutId);
    return _freeModelsCache || [];
  }
}

module.exports = { zen, fetchFreeModels };