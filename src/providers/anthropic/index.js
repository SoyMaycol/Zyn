const { REQUEST_TIMEOUT_MS } = require('../../config');

const BASE = 'https://api.anthropic.com/v1';

async function anthropic(messages, modelId, onChunk = null, options = {}) {
  const config = options.config || {};
  const apiKey = String(config.apiKey || process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) throw new Error('Anthropic requiere apiKey. Configura: /provider set anthropic apiKey <key>');

  const url = `${config.baseUrl || BASE}/messages`;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onAbort, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const systemMsg = messages.find(m => m.role === 'system');
  const chatMsgs = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 16384,
        system: systemMsg ? systemMsg.content : undefined,
        messages: chatMsgs,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic fallo (${res.status}): ${text.slice(0, 300)}`);
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

        if (parsed.type === 'content_block_delta') {
          const delta = parsed.delta;
          if (delta.type === 'thinking_delta') {
            thinking += delta.thinking;
            if (onChunk) onChunk(delta.thinking, 'thinking');
          } else if (delta.type === 'text_delta') {
            answer += delta.text;
            if (onChunk) onChunk(delta.text, 'answer');
          }
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
            if (parsed.type === 'content_block_delta') {
              const delta = parsed.delta;
              if (delta.type === 'text_delta' && delta.text) {
                answer += delta.text;
                if (onChunk) onChunk(delta.text, 'answer');
              } else if (delta.type === 'thinking_delta' && delta.thinking) {
                thinking += delta.thinking;
                if (onChunk) onChunk(delta.thinking, 'thinking');
              }
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

module.exports = { anthropic };
