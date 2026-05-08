const { Buffer } = require('buffer');
const { REQUEST_TIMEOUT_MS } = require('../../config');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
const GEMINI_BASE = 'https://gemini.google.com';
const ANON_COOKIE_URL = `${GEMINI_BASE}/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&hl=en-US&rt=c`;
const STREAM_URL = `${GEMINI_BASE}/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?hl=en-US&rt=c`;

function btoa2(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function atob2(b64) {
  return Buffer.from(b64, 'base64').toString('utf8');
}

function sleep(ms, signal) {
  if (!ms || ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new Error('aborted'));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error('aborted'));
    };
    function cleanup() {
      if (signal) signal.removeEventListener('abort', onAbort);
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

function createTimeoutSignal(signal, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
    },
  };
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutSignal = createTimeoutSignal(options.signal, options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: timeoutSignal.signal,
    });
  } finally {
    timeoutSignal.cleanup();
  }
}

function walkDeep(node, visit, depth = 0, maxDepth = 7) {
  if (depth > maxDepth) return;
  if (visit(node, depth) === false) return;
  if (Array.isArray(node)) {
    for (const x of node) walkDeep(x, visit, depth + 1, maxDepth);
  } else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) walkDeep(node[k], visit, depth + 1, maxDepth);
  }
}

async function getAnonCookie(signal) {
  const res = await fetchWithTimeout(ANON_COOKIE_URL, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'user-agent': UA,
    },
    body: 'f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&',
    signal,
  });

  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('Gemini no devolvió cookies');
  return setCookie.split(';')[0];
}

async function getXsrfToken(cookieHeader, signal) {
  try {
    const res = await fetchWithTimeout(`${GEMINI_BASE}/app`, {
      method: 'GET',
      headers: {
        'user-agent': UA,
        cookie: cookieHeader,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal,
    });
    const html = await res.text();
    const m1 = html.match(/"SNlM0e":"([^"]+)"/);
    if (m1?.[1]) return m1[1];
    const m2 = html.match(/"at":"([^"]+)"/);
    if (m2?.[1]) return m2[1];
  } catch {}
  return null;
}

function isLikelyText(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text) return false;
  if (text.length < 2) return false;
  if (/^https?:\/\//i.test(text)) return false;
  if (/^\/\/www\./i.test(text)) return false;
  if (/maps\/vt\/data/i.test(text)) return false;
  if (/^c_[0-9a-f]{6,}$/i.test(text)) return false;
  if (/^[A-Za-z0-9_\-+/=]{16,}$/.test(text) && !/\s/.test(text)) return false;
  if (/^\{.*\}$/.test(text) || /^\[.*\]$/.test(text)) return false;
  return text.length >= 8 || /\s/.test(text);
}

function pickBestTextFromAny(parsed) {
  const found = [];
  walkDeep(parsed, (node) => {
    if (typeof node === 'string' && isLikelyText(node)) found.push(node.trim());
  });
  found.sort((a, b) => b.length - a.length);
  return found[0] || '';
}

function pickFirstString(parsed, accept) {
  let first = '';
  walkDeep(parsed, (node) => {
    if (first) return false;
    if (typeof node !== 'string') return undefined;
    const text = node.trim();
    if (text && (!accept || accept(text))) first = text;
    if (first) return false;
    return undefined;
  });
  return first;
}

function findInnerPayloadString(outer) {
  const candidates = [];
  const add = (value) => {
    if (typeof value !== 'string') return;
    const text = value.trim();
    if (!text) return;
    candidates.push(text);
  };

  add(outer?.[0]?.[2]);
  add(outer?.[2]);
  add(outer?.[0]?.[0]?.[2]);
  walkDeep(outer, (node) => {
    if (typeof node === 'string') {
      const text = node.trim();
      if ((text.startsWith('[') || text.startsWith('{')) && text.length > 20) add(text);
    }
  }, 0, 5);

  for (const candidate of candidates) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {}
  }
  return null;
}

function parseStream(data) {
  if (typeof data !== 'string' || !data.trim()) throw new Error('Respuesta vacía');

  const chunks = Array.from(
    data.matchAll(/^\d+\r?\n([\s\S]+?)\r?\n(?=\d+\r?\n|$)/gm),
  ).map(match => match[1]).reverse();

  if (!chunks.length) throw new Error('Respuesta inválida');

  let best = { text: '', resumeArray: null, parsed: null };
  for (const chunk of chunks) {
    try {
      const outer = JSON.parse(chunk);
      const inner = findInnerPayloadString(outer);
      if (!inner) continue;
      const parsed = JSON.parse(inner);
      const text = pickBestTextFromAny(parsed);
      const resumeArray = Array.isArray(parsed?.[1]) ? parsed[1] : null;
      if (!best.parsed || (text && text.length > (best.text?.length || 0))) {
        best = { text, resumeArray, parsed };
      }
    } catch {}
  }

  if (!best.parsed) throw new Error('Error de parseo');

  let cleanText = (best.text || '').replace(/\*\*(.+?)\*\*/g, '*$1*').trim();
  if (!cleanText) {
    const accept = text => !/^https?:\/\/|^\/\/www\.|maps\/vt\/data/i.test(text);
    cleanText = (pickFirstString(best.parsed, accept) || pickFirstString(best.parsed)).replace(/\*\*(.+?)\*\*/g, '*$1*').trim();
  }

  return { text: cleanText, resumeArray: best.resumeArray };
}

async function geminiScraper(prompt, previousId = null, options = {}) {
  let resumeArray = null;
  if (previousId) {
    try {
      const json = JSON.parse(atob2(previousId));
      resumeArray = json?.resumeArray || null;
    } catch {}
  }

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (options.signal?.aborted) throw new Error('aborted');
      const cookie = await getAnonCookie(options.signal);
      const xsrf = await getXsrfToken(cookie, options.signal);
      const payload = [[prompt.trim()], ['en-US'], resumeArray];
      const fReq = [null, JSON.stringify(payload)];
      const params = new URLSearchParams({ 'f.req': JSON.stringify(fReq) });
      if (xsrf) params.append('at', xsrf);

      const response = await fetchWithTimeout(STREAM_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent': UA,
          'x-same-domain': '1',
          cookie,
        },
        body: params,
        signal: options.signal,
      });

      const data = await response.text();
      if (!response.ok) throw new Error(`Gemini fallo (${response.status}): ${data.slice(0, 200)}`);
      const parsed = parseStream(data);
      const id = btoa2(JSON.stringify({ resumeArray: parsed.resumeArray }));
      return { status: true, response: parsed.text, id };
    } catch (err) {
      lastErr = err;
      if (options.signal?.aborted) break;
      if (attempt < 3) await sleep(700, options.signal);
    }
  }

  return { status: false, message: lastErr?.message || 'Gemini fallo' };
}

async function gemini(messages, _modelId, onChunk = null, options = {}) {
  const prompt = Array.isArray(messages)
    ? messages.map(message => {
        if (message.role === 'system') return `[Sistema]\n${message.content}`;
        if (message.role === 'assistant') return `[Asistente]\n${message.content}`;
        return `[Usuario]\n${message.content}`;
      }).join('\n\n')
    : String(messages || '');

  const result = await geminiScraper(prompt, options.previousId || null, options);
  if (!result.status) throw new Error(result.message || 'Gemini fallo');
  if (onChunk && result.response) onChunk(result.response, 'answer');
  return { text: result.response || '', thinking: '', id: result.id };
}

module.exports = {
  gemini,
  geminiScraper,
  parseStream,
};
