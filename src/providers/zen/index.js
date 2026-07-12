const BASE = 'https://opencode.ai/zen/v1';
const { REQUEST_TIMEOUT_MS } = require('../../config');

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:136.0) Gecko/20100101 Firefox/136.0',
];

const ACCEPT_LANG_POOL = [
  'en-US,en;q=0.9',
  'en-US,en;q=0.9,es;q=0.8',
  'en-GB,en;q=0.9',
  'en-CA,en;q=0.9,fr;q=0.8',
  'de-DE,de;q=0.9,en;q=0.8',
  'fr-FR,fr;q=0.9,en;q=0.8',
  'ja-JP,ja;q=0.9,en;q=0.8',
  'pt-BR,pt;q=0.9,en;q=0.8',
];

let _currentHeaders = buildHeaders();

function buildHeaders() {
  const ua = UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
  const lang = ACCEPT_LANG_POOL[Math.floor(Math.random() * ACCEPT_LANG_POOL.length)];
  const secChUa = `"Chromium";v="1${Math.floor(Math.random() * 50)}", "Google Chrome";v="1${Math.floor(Math.random() * 50)}"`;
  const platform = Math.random() > 0.5 ? '"Windows"' : '"macOS"';
  return {
    'Content-Type': 'application/json',
    'User-Agent': ua,
    'Accept': 'text/event-stream',
    'Accept-Language': lang,
    'Origin': 'https://opencode.ai',
    'Referer': 'https://opencode.ai/' + (Math.random() > 0.5 ? '' : 'chat'),
    'Sec-Ch-Ua': secChUa,
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': platform,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache',
  };
}

function rotateFingerprint() {
  _currentHeaders = buildHeaders();
}

function getDispatcher() {
  const proxyUrl = process.env.ZEN_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
  if (!proxyUrl) return undefined;
  try {
    const { ProxyAgent } = require('undici');
    return new ProxyAgent(proxyUrl);
  } catch { return undefined; }
}

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
      const dispatcher = getDispatcher();
      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: _currentHeaders,
        body: JSON.stringify(body),
        signal: controller.signal,
        dispatcher,
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
  rotateFingerprint();
  refreshZenModels().catch(() => {});
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

let _lastModelRefresh = 0;
const MODEL_REFRESH_INTERVAL = 60000;

async function refreshZenModels() {
  const now = Date.now();
  if (now - _lastModelRefresh < MODEL_REFRESH_INTERVAL) return;
  _lastModelRefresh = now;

  try {
    const dispatcher = getDispatcher();
    const res = await fetch(`${BASE.replace('/v1', '')}/v1/models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'User-Agent': _currentHeaders['User-Agent'] },
      signal: AbortSignal.timeout(10000),
      dispatcher,
    });
    if (!res.ok) return;
    const data = await res.json();
    const models = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
    for (const m of models) {
      if (!m.id) continue;
      const key = `zen-${m.id}`;
      const label = m.name || m.id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const { MODELS } = require('../../config');
      if (!MODELS[key]) {
        MODELS[key] = {
          key,
          label,
          provider: 'zen',
          zenModel: m.id,
          contextLength: Number(m.context_length || m.max_tokens || m.max_context_length || 0) || 128000,
        };
      }
    }
  } catch {}
}

module.exports = { zen, refreshZenModels };