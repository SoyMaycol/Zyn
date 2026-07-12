const { REQUEST_TIMEOUT_MS } = require('../../config');

/**
 * Azure OpenAI Provider
 * Endpoint: https://{resource}.openai.azure.com/openai/v1/chat/completions
 * Auth: api-key header
 */
async function azure(messages, modelId, onChunk = null, options = {}) {
  const config = options.config || {};
  const apiKey = String(config.apiKey || process.env.AZURE_OPENAI_API_KEY || '').trim();
  const resource = String(config.resource || process.env.AZURE_OPENAI_RESOURCE || '').trim();
  const apiVersion = String(config.apiVersion || process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview').trim();

  if (!apiKey) throw new Error('Azure OpenAI requiere apiKey. Configura: /provider set azure apiKey <key>');
  if (!resource) throw new Error('Azure OpenAI requiere resource. Configura: /provider set azure resource <resource-name>');

  const url = `https://${resource}.openai.azure.com/openai/v1/chat/completions?api-version=${apiVersion}`;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onAbort, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
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
      throw new Error(`Azure OpenAI fallo (${res.status}): ${text.slice(0, 500)}`);
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

    // Flush remaining SSE buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        const data = trimmed.slice(5).trim();
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta;
            if (delta?.content) {
              answer += delta.content;
              if (onChunk) onChunk(delta.content, 'answer');
            }
            if (delta?.reasoning_content) {
              thinking += delta.reasoning_content;
              if (onChunk) onChunk(delta.reasoning_content, 'thinking');
            } else if (delta?.reasoning) {
              thinking += delta.reasoning;
              if (onChunk) onChunk(delta.reasoning, 'thinking');
            }
          } catch {}
        }
      }
    }

    return { status: true, text: answer.trim(), thinking: thinking.trim() };
  } finally {
    clearTimeout(timeoutId);
    if (options.signal) options.signal.removeEventListener('abort', onAbort);
  }
}

module.exports = { azure };
