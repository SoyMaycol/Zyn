const { REQUEST_TIMEOUT_MS } = require('../../config');

/**
 * Google Vertex AI / Gemini Provider (OpenAI-compatible endpoint)
 * Endpoint: https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/{location}/endpoints/openapi/chat/completions
 * Auth: Bearer token (Google Cloud auth token)
 */
async function vertex(messages, modelId, onChunk = null, options = {}) {
  const config = options.config || {};
  const apiKey = String(
    config.apiKey
    || process.env.GOOGLE_CLOUD_API_KEY
    || process.env.GEMINI_API_KEY
    || process.env.VERTEX_API_KEY
    || ''
  ).trim();
  const project = String(config.project || process.env.GOOGLE_CLOUD_PROJECT || '').trim();
  const location = String(config.location || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim();

  if (!apiKey) throw new Error('Google Vertex AI requiere apiKey. Configura: /provider set vertex apiKey <key>');

  const baseUrl = config.baseUrl || `https://aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/endpoints/openapi`;
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
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId.startsWith('google/') ? modelId : `google/${modelId}`,
        messages,
        stream: true,
        max_tokens: 16384,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google Vertex AI fallo (${res.status}): ${text.slice(0, 500)}`);
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

module.exports = { vertex };
