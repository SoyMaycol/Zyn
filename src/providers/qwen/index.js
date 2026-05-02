const { createHash, randomUUID } = require('crypto');

const {
  QWEN_EMAIL,
  QWEN_PASSWORD,
  REQUEST_TIMEOUT_MS,
} = require('../../config');

const BASE = 'https://chat.qwen.ai';
const MODEL = 'qwen3.6-plus';

const HEADERS = {
  'content-type': 'application/json',
  'accept': 'application/json',
  'source': 'web',
  'version': '0.2.40',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  'origin': BASE,
  'referer': `${BASE}/`,
};

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function parseCookies(setCookieHeaders) {
  const jar = {};
  for (const header of setCookieHeaders) {
    const part = header.split(';')[0].trim();
    const eq = part.indexOf('=');
    if (eq !== -1) {
      jar[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
  }
  return jar;
}

function cookieString(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

let cachedJar = null;

async function signin() {
  if (!QWEN_EMAIL || !QWEN_PASSWORD) {
    throw new Error('Qwen no está configurado. Define ZYN_QWEN_EMAIL y ZYN_QWEN_PASSWORD.');
  }

  const jar = {};
  const res = await fetch(`${BASE}/api/v2/auths/signin`, {
    method: 'POST',
    headers: { ...HEADERS, cookie: cookieString(jar) },
    body: JSON.stringify({
      email: QWEN_EMAIL,
      password: sha256(QWEN_PASSWORD),
    }),
  });

  const setCookies = res.headers.getSetCookie?.() ?? [];
  Object.assign(jar, parseCookies(setCookies));

  let body;
  try { body = await res.json(); } catch { body = {}; }

  if (!res.ok || body?.success === false) {
    throw new Error(`Qwen signin fallo: ${JSON.stringify(body)}`);
  }

  cachedJar = jar;
  return jar;
}

async function ensureAuth() {
  if (cachedJar) return cachedJar;
  return signin();
}

async function createChat(jar, signal, modelId = MODEL) {
  const res = await fetch(`${BASE}/api/v2/chats/new`, {
    method: 'POST',
    headers: { ...HEADERS, cookie: cookieString(jar) },
    body: JSON.stringify({
      title: 'New Chat',
      models: [modelId],
      chat_mode: 'normal',
      chat_type: 't2t',
      timestamp: Date.now(),
      project_id: '',
    }),
    signal,
  });

  const body = await res.json();
  if (!body?.data?.id) {
    throw new Error(`Qwen createChat fallo: ${JSON.stringify(body)}`);
  }
  return body.data.id;
}

async function streamCompletion(chatId, prompt, jar, onChunk, signal) {
  const fid = randomUUID();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const payload = {
    stream: true,
    version: '2.1',
    incremental_output: true,
    chat_id: chatId,
    chat_mode: 'normal',
    model: MODEL,
    parent_id: null,
    messages: [{
      fid,
      parentId: null,
      childrenIds: [],
      role: 'user',
      content: prompt,
      user_action: 'chat',
      files: [],
      timestamp: Math.floor(Date.now() / 1000),
      models: [modelId],
      chat_type: 't2t',
      feature_config: {
        thinking_enabled: true,
        output_schema: 'phase',
        research_mode: 'normal',
        auto_thinking: false,
        thinking_mode: 'Thinking',
        thinking_format: 'summary',
        auto_search: false,
      },
      extra: { meta: { subChatType: 't2t' } },
      sub_chat_type: 't2t',
      parent_id: null,
    }],
    timestamp: Math.floor(Date.now() / 1000),
  };

  try {
    const res = await fetch(`${BASE}/api/v2/chat/completions?chat_id=${chatId}`, {
      method: 'POST',
      headers: {
        ...HEADERS,
        accept: 'text/event-stream',
        'x-accel-buffering': 'no',
        cookie: cookieString(jar),
        referer: `${BASE}/c/${chatId}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401 || res.status === 403) {
        cachedJar = null;
        throw new Error(`Qwen auth expirado (${res.status}): ${text.slice(0, 200)}`);
      }
      throw new Error(`Qwen completion fallo (${res.status}): ${text.slice(0, 200)}`);
    }

    let thinking = '';
    let answer = '';
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') break;

        let parsed;
        try { parsed = JSON.parse(raw); } catch { continue; }

        const delta = parsed?.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.phase === 'thinking_summary') {
          const thought = delta.extra?.summary_thought?.content?.[0];
          if (thought && thought.length > thinking.length) {
            const newDelta = thought.slice(thinking.length);
            thinking = thought;
            if (onChunk) onChunk(newDelta, 'thinking');
          }
        } else if (delta.phase === 'answer' && delta.content) {
          answer += delta.content;
          if (onChunk) onChunk(delta.content, 'answer');
        }
      }
    }

    return { text: answer.trim(), thinking: thinking.trim() };
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}

async function qwen(prompt, onChunk = null, options = {}) {
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const jar = await ensureAuth();
      const modelId = options.modelId || MODEL;
      const chatId = await createChat(jar, options.signal, modelId);
      const result = await streamCompletion(chatId, prompt, jar, onChunk, options.signal);
      return {
        status: true,
        text: result.text,
        thinking: result.thinking,
      };
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      const isAuthError = err.message?.includes('401')
        || err.message?.includes('403')
        || err.message?.includes('auth')
        || err.message?.includes('login');
      if (isAuthError && attempt < MAX_RETRIES) {
        cachedJar = null;
        continue;
      }
      if (isAuthError && /not configured/i.test(err.message || '')) {
        throw err;
      }
      throw err;
    }
  }
}

module.exports = { qwen };
