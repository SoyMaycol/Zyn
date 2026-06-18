const fs = require('fs');
const path = require('path');
const { REQUEST_TIMEOUT_MS } = require('../../config');

const BASE = 'https://chat.deepseek.com/api/v0';

const HEADERS = {
  'Content-Type': 'application/json',
  'x-client-platform': 'web',
  'x-client-version': '2.0.0',
  'x-client-locale': 'es_US',
  'x-client-timezone-offset': '-18000',
  'x-app-version': '2.0.0',
  'Accept': '*/*',
};

const DEFAULT_KEY = '6BlcX27kt9QGTSn5AffdmdJ9BXNURnT4jeoq8XsmDT4KSB5H4tohd+pDNiDIZO3M';
const DEFAULT_HIFLEIM = 'SXhAGoPAbW0+JcF0K+xyHehWadNjiRCVkCcfHUV98qK7w75MOCUtKhg=.eoSF5HqimVgV7s4q';

let wasmInstance = null;
let wasmInitPromise = null;

async function ensureWasm() {
  if (wasmInstance) return wasmInstance;
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      const wasmPath = path.join(__dirname, 'sha3_wasm_bg.wasm');
      const wasmBuffer = fs.readFileSync(wasmPath);
      const module = await WebAssembly.compile(wasmBuffer);
      const instance = await WebAssembly.instantiate(module, {});
      wasmInstance = instance;
      return instance;
    })();
  }
  return wasmInitPromise;
}

function getApiKey(config) {
  return String(
    config?.apiKey
    || process.env.ZYN_DEEPSEEK_CHAT_KEY
    || process.env.DEEPSEEK_CHAT_KEY
    || process.env.ZYN_CHAT_KEY
    || DEFAULT_KEY
  ).trim();
}

function getHifLeim(config) {
  return String(
    config?.hifLeim
    || process.env.ZYN_HIF_LEIM
    || DEFAULT_HIFLEIM
  ).trim();
}

async function fetchJson(url, body, extraHeaders) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...HEADERS, ...extraHeaders },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DeepSeek (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function fetchPowChallenge(apiKey) {
  const json = await fetchJson(
    `${BASE}/chat/create_pow_challenge`,
    { target_path: '/api/v0/chat/completion' },
    { 'Authorization': `Bearer ${apiKey}` },
  );
  const challenge = json?.data?.biz_data?.challenge;
  if (!challenge) throw new Error('DeepSeek: no se recibio PoW challenge');
  return challenge;
}

async function solvePow(challenge, salt, expireAt, difficulty) {
  const inst = await ensureWasm();
  const mem = inst.exports.memory;

  const prefix = salt + '_' + expireAt + '_';

  function writeString(str) {
    const encoded = Buffer.from(str, 'utf8');
    const ptr = inst.exports.__wbindgen_export_0(encoded.length, 1);
    const view = new Uint8Array(mem.buffer);
    for (let i = 0; i < encoded.length; i++) view[ptr + i] = encoded[i];
    return { ptr, length: encoded.length };
  }

  const retptr = inst.exports.__wbindgen_add_to_stack_pointer(-16);
  try {
    const chInfo = writeString(challenge);
    const pfxInfo = writeString(prefix);

    inst.exports.wasm_solve(
      retptr,
      chInfo.ptr, chInfo.length,
      pfxInfo.ptr, pfxInfo.length,
      difficulty,
    );

    const view = new Int32Array(mem.buffer);
    const status = view[retptr / 4];
    if (status !== 1) throw new Error('WASM PoW solver: no solution');

    const floatView = new Float64Array(mem.buffer);
    return Math.floor(floatView[(retptr + 8) / 8]);
  } finally {
    inst.exports.__wbindgen_add_to_stack_pointer(16);
  }
}

function buildPowHeader(algorithm, challenge, salt, answer, signature, targetPath) {
  const pow = { algorithm, challenge, salt, answer, signature, target_path: targetPath };
  return Buffer.from(JSON.stringify(pow)).toString('base64');
}

async function createSession(apiKey) {
  const json = await fetchJson(
    `${BASE}/chat_session/create`,
    {},
    { 'Authorization': `Bearer ${apiKey}` },
  );
  const sessionId = json?.data?.biz_data?.chat_session?.id;
  if (!sessionId) throw new Error('DeepSeek: no se pudo crear session');
  return sessionId;
}

const MAX_STREAM_RETRIES = 3;
const STREAM_READ_TIMEOUT_MS = 120000;

async function fetchCompletionWithRetry(apiKey, sessionId, hifLeim, powHeader, prompt, modelId, signal) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_STREAM_RETRIES; attempt++) {
    const controller = new AbortController();
    const readTimeoutId = setTimeout(() => controller.abort(), STREAM_READ_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}/chat/completion`, {
        method: 'POST',
        headers: {
          ...HEADERS,
          'x-ds-pow-response': powHeader,
          'x-hif-leim': hifLeim,
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          chat_session_id: sessionId,
          parent_message_id: null,
          model_type: modelId || 'default',
          prompt,
          ref_file_ids: [],
          thinking_enabled: false,
          search_enabled: false,
          action: null,
          preempt: false,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`DeepSeek chat fallo (${res.status}): ${text.slice(0, 300)}`);
      }
      clearTimeout(readTimeoutId);
      return res;
    } catch (err) {
      clearTimeout(readTimeoutId);
      lastError = err;
      if (err?.name === 'AbortError' && signal?.aborted) throw err;
      if (attempt < MAX_STREAM_RETRIES) {
        const backoff = Math.min(2000 * Math.pow(2, attempt), 15000);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw lastError;
    }
  }
}

async function deepseekChat(messages, modelId, onChunk = null, options = {}) {
  const config = options.config || {};
  const apiKey = getApiKey(config);
  if (!apiKey) {
    throw new Error('DeepSeek Chat no configurado. Define ZYN_CHAT_KEY, ZYN_DEEPSEEK_CHAT_KEY, o /provider set deepseek-chat apiKey <KEY>');
  }

  const pow = await fetchPowChallenge(apiKey);
  const answer = await solvePow(pow.challenge, pow.salt, pow.expire_at, pow.difficulty);
  const powHeader = buildPowHeader(
    pow.algorithm, pow.challenge, pow.salt,
    answer, pow.signature, pow.target_path,
  );
  const sessionId = await createSession(apiKey);
  const hifLeim = getHifLeim(config);

  const prompt = messages.map(m => {
    const role = m.role === 'assistant' ? 'Assistant' : m.role === 'system' ? 'System' : 'User';
    return `[${role}]\n${m.content}`;
  }).join('\n\n');

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetchCompletionWithRetry(apiKey, sessionId, hifLeim, powHeader, prompt, modelId, controller.signal);

    const decoder = new TextDecoder();
    let buf = '';
    let answerText = '';
    let thinkingText = '';
    let currentPath = '';
    let fragmentBuffer = '';
    let lastEmittedLen = 0;
    let seenFirstSnapshot = false;

    function tryEmitContent() {
      let trimmed = fragmentBuffer.trim();
      if (!trimmed.startsWith('{')) {
        if (trimmed.includes('"type":"final"') || trimmed.includes('"type": "final"')) {
          trimmed = '{' + trimmed;
        } else if (trimmed.includes('"type":"tool"') || trimmed.includes('"type": "tool"')) {
          trimmed = '{' + trimmed;
        } else {
          return false;
        }
      }
      let parsed;
      try { parsed = JSON.parse(trimmed); } catch { return false; }
      if (parsed.type === 'final' && typeof parsed.content === 'string') {
        const newContent = parsed.content.slice(lastEmittedLen);
        if (newContent) {
          answerText += newContent;
          if (onChunk) onChunk(newContent, 'answer');
          lastEmittedLen = parsed.content.length;
        }
        return true;
      }
      if (parsed.type === 'tool' && parsed.tool) {
        if (onChunk) onChunk(JSON.stringify(parsed), 'answer');
        return true;
      }
      return false;
    }

    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        const s = line.trim();
        if (!s || s.startsWith('event:') || s.startsWith(':')) continue;
        if (!s.startsWith('data:')) continue;

        const raw = s.slice(5).trim();
        if (!raw) continue;

        let parsed;
        try { parsed = JSON.parse(raw); } catch { continue; }

        if (parsed.v && typeof parsed.v === 'object' && parsed.v.response?.fragments) {
          if (!seenFirstSnapshot) {
            for (const frag of parsed.v.response.fragments) {
              if (frag.type === 'RESPONSE' && frag.content) {
                fragmentBuffer += frag.content;
              }
              if (frag.type === 'THINKING' && frag.content) {
                thinkingText += frag.content;
                if (onChunk) onChunk(frag.content, 'thinking');
              }
            }
            seenFirstSnapshot = true;
            tryEmitContent();
          }
          continue;
        }

        if (parsed.p) currentPath = parsed.p;

        const val = parsed.v;
        if (val !== undefined && currentPath === 'response/fragments/-1/content' && typeof val === 'string') {
          fragmentBuffer += val;
          tryEmitContent();
        }
        if (parsed.p === 'response' && parsed.o === 'BATCH' && Array.isArray(parsed.v)) {
          for (const patch of parsed.v) {
            if (patch.p === 'response/fragments/-1/content' && typeof patch.v === 'string') {
              fragmentBuffer += patch.v;
              tryEmitContent();
            }
          }
        }
      }
    }

    if (!answerText && fragmentBuffer) {
      answerText = fragmentBuffer;
      if (onChunk && lastEmittedLen === 0) onChunk(fragmentBuffer, 'answer');
    }

    return { status: true, text: answerText.trim(), thinking: thinkingText.trim() };
  } finally {
    clearTimeout(timeoutId);
    if (options.signal) options.signal.removeEventListener('abort', onExternalAbort);
  }
}

module.exports = { deepseekChat };
