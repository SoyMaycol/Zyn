const { REQUEST_TIMEOUT_MS } = require('../../config');

/**
 * Cloudflare Workers AI Provider
 * Endpoint: https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1/chat/completions
 * Auth: Bearer token (Cloudflare API token)
 * Supports both @cf/ models and third-party models (openai/, anthropic/, etc.)
 */
async function cloudflare(messages, modelId, onChunk = null, options = {}) {
  const config = options.config || {};
  const apiKey = String(config.apiKey || process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const accountId = String(config.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();

  if (!apiKey) throw new Error('Cloudflare Workers AI requiere apiKey. Configura: /provider set cloudflare apiKey <token>');
  if (!accountId) throw new Error('Cloudflare Workers AI requiere accountId. Configura: /provider set cloudflare accountId <id>');

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
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
        'Authorization': `Bearer ${apiKey}`,
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
      throw new Error(`Cloudflare Workers AI fallo (${res.status}): ${text.slice(0, 500)}`);
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

module.exports = { cloudflare };
