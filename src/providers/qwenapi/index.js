const BASE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen-plus';

const HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Zyn/1.0',
};

function getApiKey(config) {
  const key = String(
    config?.apiKey
    || process.env.ZYN_QWEN_API_KEY
    || process.env.QWEN_API_KEY
    || process.env.DASHSCOPE_API_KEY
    || '',
  ).trim();
  return key;
}

async function streamCompletion(messages, modelId, apiKey, onChunk, signal) {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Authorization': `Bearer ${apiKey}`,
      },
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
      throw new Error(`Qwen API fallo (${res.status}): ${text.slice(0, 300)}`);
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

        const reasoning = delta.reasoning || delta.reasoning_content || delta.reasoning_details?.[0]?.text;
        if (reasoning && reasoning.length > thinking.length) {
          const newDelta = reasoning.slice(thinking.length);
          thinking = reasoning;
          if (onChunk) onChunk(newDelta, 'thinking');
        }

        if (delta.content) {
          answer += delta.content;
          if (onChunk) onChunk(delta.content, 'answer');
        }
      }
    }

    return { text: answer.trim(), thinking: thinking.trim() };
  } finally {
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}

async function qwenapi(messages, modelId, onChunk = null, options = {}) {
  const config = options.config || {};
  const apiKey = getApiKey(config);
  if (!apiKey) {
    throw new Error('Qwen API no configurado. Define ZYN_QWEN_API_KEY o configura con /provider set qwenapi apiKey <KEY>.');
  }

  const model = String(modelId || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await streamCompletion(messages, model, apiKey, onChunk, options.signal);
      return {
        status: true,
        text: result.text,
        thinking: result.thinking,
      };
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

module.exports = { qwenapi, getApiKey };
