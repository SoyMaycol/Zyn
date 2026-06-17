const { REQUEST_TIMEOUT_MS } = require('../../config');

async function custom(messages, model, onChunk = null, options = {}) {
  const config = options.config || {};
  const baseUrl = String(config.baseUrl || '').trim().replace(/\/+$/, '');
  const apiKey = String(config.apiKey || '').trim();
  const modelId = String(model?.modelId || model?.customModel || config.modelId || '').trim();

  if (!baseUrl) {
    throw new Error('Proveedor custom sin baseUrl. Configura /provider set <name> baseUrl <url>.');
  }
  if (!modelId) {
    throw new Error('Proveedor custom sin modelId. Configura /provider set <name> model <id>.');
  }

  const url = `${baseUrl}/chat/completions`;
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
        'Authorization': apiKey ? `Bearer ${apiKey}` : undefined,
        'x-api-key': apiKey || undefined,
        'User-Agent': 'Zyn/1.0',
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
      throw new Error(`Custom provider fallo (${res.status}): ${text.slice(0, 300)}`);
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
        const fullThought = delta.reasoning_content || delta.reasoning_text || delta.reasoning_details?.[0]?.text;
        const incrementalThought = delta.reasoning;
        let newDelta = '';
        if (fullThought && fullThought.length > thinking.length) {
          newDelta = fullThought.slice(thinking.length);
          thinking = fullThought;
        } else if (incrementalThought) {
          newDelta = incrementalThought;
          thinking += incrementalThought;
        }
        if (newDelta && onChunk) onChunk(newDelta, 'thinking');
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
}

module.exports = { custom };
