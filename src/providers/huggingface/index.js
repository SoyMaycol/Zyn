const path = require('path');
const fs = require('fs');
const { HUGGINGFACE_TOKEN } = require('../../config');
const { PERSISTENT_CONFIG_FILE } = require('../../config');

const HF_INFERENCE_URL = 'https://api-inference.huggingface.co';

function loadPersistentProviderConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(PERSISTENT_CONFIG_FILE, 'utf8'));
    const providers = raw?.providers && typeof raw.providers === 'object' ? raw.providers : {};
    return providers;
  } catch {
    return {};
  }
}

function resolveApiKey(config) {
  return String(
    config?.apiKey
    || loadPersistentProviderConfig().huggingface?.apiKey
    || HUGGINGFACE_TOKEN
    || process.env.HUGGINGFACE_API_KEY
    || process.env.HF_API_KEY
    || process.env.HF_TOKEN
    || '',
  ).trim();
}

function resolveBaseUrl(config, modelId) {
  const customUrl = String(
    config?.baseUrl
    || loadPersistentProviderConfig().huggingface?.baseUrl
    || '',
  ).trim();
  if (customUrl) return customUrl;
  if (modelId) return `${HF_INFERENCE_URL}/models/${encodeURIComponent(modelId)}/v1/chat/completions`;
  return `${HF_INFERENCE_URL}/v1/chat/completions`;
}

function resolveModelId(config, modelId) {
  return String(
    config?.huggingfaceModel
    || config?.modelId
    || modelId
    || '',
  ).trim();
}

async function huggingface(messages, modelId, onChunk = null, options = {}) {
  const config = options.config || {};
  const apiKey = resolveApiKey(config);
  const finalModel = resolveModelId(config, modelId);
  const baseUrl = resolveBaseUrl(config, finalModel);

  if (!apiKey) {
    throw new Error('HuggingFace no esta configurado. Define una API Key con /provider set huggingface apiKey <KEY> o ZYN_HUGGINGFACE_TOKEN.');
  }
  if (!finalModel) {
    throw new Error('HuggingFace requiere un modelId. Configura el modelo con /provider set huggingface model <id>.');
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Zyn/1.0',
      },
      body: JSON.stringify({
        messages,
        stream: true,
        model: finalModel,
        max_tokens: 8192,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');

      if (res.status === 401 || res.status === 403) {
        throw new Error(`HuggingFace: API Key invalida (${res.status}). Verifica ZYN_HUGGINGFACE_TOKEN.`);
      }
      if (res.status === 404) {
        throw new Error(`HuggingFace: modelo "${finalModel}" no encontrado (404). Verifica el modelId.`);
      }

      throw new Error(`HuggingFace fallo (${res.status}): ${text.slice(0, 300)}`);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let thinking = '';

    for await (const chunk of res.body) {
      if (controller.signal.aborted) break;
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
        const thought = delta.reasoning || delta.reasoning_details?.[0]?.text;
        if (thought && thought.length > thinking.length) {
          const newDelta = thought.slice(thinking.length);
          thinking = thought;
          if (onChunk) onChunk(newDelta, 'thinking');
        }
        if (delta.content) {
          answer += delta.content;
          if (onChunk) onChunk(delta.content, 'answer');
        }
      }
    }

    if (controller.signal.aborted) throw new Error('aborted');

    return { status: true, text: answer.trim(), thinking: thinking.trim() };
  } finally {
    if (options.signal) options.signal.removeEventListener('abort', onAbort);
  }
}

module.exports = { huggingface };
