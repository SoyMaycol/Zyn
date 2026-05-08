const { Buffer } = require('buffer');
const { REQUEST_TIMEOUT_MS } = require('../../config');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
const GEMINI_BASE = 'https://gemini.google.com';
const GEMINI_COOKIE_URL = `${GEMINI_BASE}/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&hl=en-US&rt=c`;
const GEMINI_APP_URL = `${GEMINI_BASE}/app`;
const GEMINI_STREAM_URL = `${GEMINI_BASE}/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?hl=en-US&rt=c`;
const GEMINI_MODEL_ID = 'gemini-flash';

function btoa2(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function atob2(b64) {
  return Buffer.from(b64, 'base64').toString('utf8');
}

function walkDeep(node, visit, depth = 0, maxDepth = 7) {
  if (depth > maxDepth) return;
  if (visit(node, depth) === false) return;
  if (Array.isArray(node)) {
    for (const x of node) walkDeep(x, visit, depth + 1, maxDepth);
  } else if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) walkDeep(node[key], visit, depth + 1, maxDepth);
  }
}

function createTimeoutSignal(externalSignal, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || REQUEST_TIMEOUT_MS));
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    },
  };
}

async function fetchWithTimeout(url, options = {}) {
  const { signal, timeoutMs, ...fetchOptions } = options;
  const controlled = createTimeoutSignal(signal, timeoutMs);
  try {
    return await fetch(url, {
      ...fetchOptions,
      signal: controlled.signal,
    });
  } finally {
    controlled.cleanup();
  }
}

async function getAnonCookie(signal) {
  const response = await fetchWithTimeout(GEMINI_COOKIE_URL, {
    method: 'POST',
    redirect: 'manual',
    signal,
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'user-agent': UA,
    },
    body: 'f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&',
  });
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('Gemini no devolvió cookies');
  return setCookie.split(';')[0];
}

async function getXsrfToken(cookieHeader, signal) {
  const response = await fetchWithTimeout(GEMINI_APP_URL, {
    method: 'GET',
    signal,
    headers: {
      'user-agent': UA,
      cookie: cookieHeader,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  const html = await response.text();
  const snlm0e = html.match(/"SNlM0e":"([^"]+)"/);
  if (snlm0e?.[1]) return snlm0e[1];
  const at = html.match(/"at":"([^"]+)"/);
  if (at?.[1]) return at[1];
  return null;
}

function isLikelyText(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text || text.length < 2) return false;
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
  walkDeep(parsed, node => {
    if (typeof node === 'string' && isLikelyText(node)) found.push(node.trim());
  });
  found.sort((a, b) => b.length - a.length);
  return found[0] || '';
}

function pickFirstString(parsed, accept) {
  let first = '';
  walkDeep(parsed, node => {
    if (first) return false;
    if (typeof node !== 'string') return undefined;
    const text = node.trim();
    if (text && (!accept || accept(text))) first = text;
    return first ? false : undefined;
  });
  return first;
}

function findInnerPayloadString(outer) {
  const candidates = [];
  const add = value => {
    if (typeof value !== 'string') return;
    const text = value.trim();
    if (text) candidates.push(text);
  };
  add(outer?.[0]?.[2]);
  add(outer?.[2]);
  add(outer?.[0]?.[0]?.[2]);
  walkDeep(outer, node => {
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
    cleanText = (pickFirstString(best.parsed, accept) || pickFirstString(best.parsed))
      .replace(/\*\*(.+?)\*\*/g, '*$1*')
      .trim();
  }
  return { text: cleanText, resumeArray: best.resumeArray };
}

async function geminiScraper(prompt, previousId = null, options = {}) {
  let resumeArray = null;
  if (previousId) {
    try {
      const decoded = JSON.parse(atob2(previousId));
      resumeArray = decoded?.resumeArray || null;
    } catch {}
  }

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const cookie = await getAnonCookie(options.signal);
      const xsrf = await getXsrfToken(cookie, options.signal).catch(() => null);
      const payload = [[String(prompt || '').trim()], ['en-US'], resumeArray];
      const fReq = [null, JSON.stringify(payload)];
      const params = new URLSearchParams({ 'f.req': JSON.stringify(fReq) });
      if (xsrf) params.append('at', xsrf);

      const response = await fetchWithTimeout(GEMINI_STREAM_URL, {
        method: 'POST',
        signal: options.signal,
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent': UA,
          'x-same-domain': '1',
          cookie,
        },
        body: params,
      });
      const data = await response.text();
      if (!response.ok) throw new Error(`Gemini fallo (${response.status}): ${data.slice(0, 200)}`);
      const parsed = parseStream(data);
      const id = btoa2(JSON.stringify({ resumeArray: parsed.resumeArray }));
      return { status: true, response: parsed.text, id };
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      lastErr = err;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 700));
    }
  }
  return { status: false, message: lastErr?.message || 'Gemini fallo' };
}

async function gemini(prompt, onChunk = null, options = {}) {
  const result = await geminiScraper(prompt, options.previousId || null, options);
  if (!result.status) {
    throw new Error(result.message || 'Gemini fallo');
  }
  const text = result.response || '';
  if (onChunk && text) onChunk(text, 'answer');
  return {
    status: true,
    text: text.trim(),
    thinking: '',
    id: result.id,
    model: GEMINI_MODEL_ID,
  };
}

module.exports = { gemini, geminiScraper, parseStream };
