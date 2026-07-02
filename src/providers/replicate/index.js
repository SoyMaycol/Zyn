const { REQUEST_TIMEOUT_MS } = require('../../config');

/**
 * Replicate Provider
 * Uses predictions API with streaming via SSE
 * Endpoint: https://api.replicate.com/v1/models/{owner}/{model}/predictions
 */
async function replicate(messages, modelId, onChunk = null, options = {}) {
  const config = options.config || {};
  const apiKey = String(config.apiKey || process.env.REPLICATE_API_TOKEN || '').trim();
  if (!apiKey) throw new Error('Replicate requiere apiKey. Configura: /provider set replicate apiKey <token>');

  // Convert messages to prompt format Replicate expects
  const prompt = messages.map(m => {
    if (m.role === 'system') return `[System]\n${m.content}`;
    if (m.role === 'assistant') return `[Assistant]\n${m.content}`;
    return `[User]\n${m.content}`;
  }).join('\n\n');

  const url = `https://api.replicate.com/v1/models/${modelId}/predictions`;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onAbort, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Create prediction
    const createRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: { prompt },
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!createRes.ok) {
      const text = await createRes.text().catch(() => '');
      throw new Error(`Replicate fallo (${createRes.status}): ${text.slice(0, 500)}`);
    }

    const prediction = await createRes.json();
    const streamUrl = prediction?.urls?.stream;
    if (!streamUrl) throw new Error('Replicate: no stream URL returned');

    // Stream from the stream URL
    const streamRes = await fetch(streamUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
    });

    if (!streamRes.ok) {
      const text = await streamRes.text().catch(() => '');
      throw new Error(`Replicate stream fallo (${streamRes.status}): ${text.slice(0, 500)}`);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';

    for await (const chunk of streamRes.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        let parsed;
        try { parsed = JSON.parse(data); } catch { continue; }
        if (parsed.event === 'output' && parsed.data) {
          const text = Array.isArray(parsed.data) ? parsed.data.join('') : parsed.data;
          answer += text;
          if (onChunk) onChunk(text, 'answer');
        }
      }
    }

    return { status: true, text: answer.trim(), thinking: '' };
  } finally {
    clearTimeout(timeoutId);
    if (options.signal) options.signal.removeEventListener('abort', onAbort);
  }
}

module.exports = { replicate };
