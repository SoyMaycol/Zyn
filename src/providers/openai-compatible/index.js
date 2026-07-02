const { REQUEST_TIMEOUT_MS } = require('../../config');

/**
 * Factory for OpenAI-compatible providers.
 * Creates a streaming chat function compatible with Zyn's pipeline.
 */
function createOpenAICompatible(name, defaultBaseUrl, envKey, defaultMaxTokens = 16384) {
  return async function provider(messages, modelId, onChunk = null, options = {}) {
    const config = options.config || {};
    const apiKey = String(
      config.apiKey
      || (envKey ? process.env[envKey] : '')
      || process.env.ZYN_API_KEY
      || ''
    ).trim();

    const baseUrl = (config.baseUrl || defaultBaseUrl).replace(/\/+$/, '');
    const url = `${baseUrl}/chat/completions`;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', onAbort, { once: true });
    }
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelId,
          messages,
          stream: true,
          max_tokens: defaultMaxTokens,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${name} fallo (${res.status}): ${text.slice(0, 500)}`);
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let answer = '';
      let thinking = '';

      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;
          let parsed;
          try { parsed = JSON.parse(data); } catch { continue; }

          const delta = parsed?.choices?.[0]?.delta;
          if (!delta) continue;

          // Reasoning/thinking support (DeepSeek, Qwen, etc.)
          const thinkContent = delta.reasoning_content || delta.reasoning;
          if (thinkContent) {
            thinking += thinkContent;
            if (onChunk) onChunk(thinkContent, 'thinking');
          }
          if (delta.content) {
            answer += delta.content;
            if (onChunk) onChunk(delta.content, 'answer');
          }
        }
      }

      return { status: true, text: answer.trim(), thinking: thinking.trim() };
    } finally {
      clearTimeout(timeoutId);
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
    }
  };
}

module.exports = { createOpenAICompatible };
