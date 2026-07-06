const { REQUEST_TIMEOUT_MS } = require('../../config');

const BASE = 'https://api.cohere.com/v2';

async function cohere(messages, modelId, onChunk = null, options = {}) {
  const config = options.config || {};
  const apiKey = String(config.apiKey || process.env.COHERE_API_KEY || '').trim();
  if (!apiKey) throw new Error('Cohere requiere apiKey. Configura: /provider set cohere apiKey <key>');

  const url = `${config.baseUrl || BASE}/chat`;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onAbort, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const systemMsg = messages.find(m => m.role === 'system');
  const chatMsgs = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'chatbot' : 'user',
    message: m.content,
  }));

  try {
    const body = {
      model: modelId,
      messages: chatMsgs,
      stream: true,
    };
    if (systemMsg) {
      body.preamble = systemMsg.content;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Cohere fallo (${res.status}): ${text.slice(0, 300)}`);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';

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

        if (parsed.type === 'content-delta' && parsed.delta?.message?.content?.text) {
          const text = parsed.delta.message.content.text;
          answer += text;
          if (onChunk) onChunk(text, 'answer');
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
            if (parsed.type === 'content-delta' && parsed.delta?.message?.content?.text) {
              const text = parsed.delta.message.content.text;
              answer += text;
              if (onChunk) onChunk(text, 'answer');
            }
          } catch {}
        }
      }
    }

    return { status: true, text: answer.trim(), thinking: '' };
  } finally {
    clearTimeout(timeoutId);
    if (options.signal) options.signal.removeEventListener('abort', onAbort);
  }
}

module.exports = { cohere };
