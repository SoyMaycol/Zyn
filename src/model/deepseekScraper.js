const { REQUEST_TIMEOUT_MS } = require('../config');

const BASE = 'https://deep-seek.ai';
const MODEL = 'deepseek/deepseek-v3.2';
const CSRF_TOKEN = 'Vdr15h7nAPZ6w38PP9RmXzjTpKGXGxbJfQ6dMdqI';

const HEADERS = {
  'Content-Type': 'application/json',
  'X-CSRF-TOKEN': CSRF_TOKEN,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  'Accept': 'text/event-stream',
  'Origin': BASE,
  'Referer': `${BASE}/`,
};

async function streamCompletion(prompt, onChunk) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`DeepSeek fallo (${res.status}): ${text.slice(0, 200)}`);
    }

    let answer = '';
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

        const content = parsed?.choices?.[0]?.delta?.content;
        if (content) {
          answer += content;
          if (onChunk) onChunk(content, 'answer');
        }
      }
    }

    return { text: answer.trim(), thinking: '' };
  } finally {
    clearTimeout(timeout);
  }
}

async function deepseek(prompt, onChunk = null) {
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await streamCompletion(prompt, onChunk);
      return {
        status: true,
        text: result.text,
        thinking: result.thinking,
      };
    } catch (err) {
      const isRetryable = err.message?.includes('429')
        || err.message?.includes('503')
        || err.name === 'AbortError';
      if (isRetryable && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

module.exports = { deepseek };
