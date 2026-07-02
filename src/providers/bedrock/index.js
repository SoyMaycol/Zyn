const { REQUEST_TIMEOUT_MS } = require('../../config');

/**
 * AWS Bedrock Provider (via Chat Completions API)
 * Endpoint: https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke-with-response-stream
 * Or via bedrock-mantle: https://bedrock-mantle.{region}.amazonaws.com/
 * Auth: AWS Signature v4 (simplified with API key approach)
 */
async function bedrock(messages, modelId, onChunk = null, options = {}) {
  const config = options.config || {};
  const apiKey = String(config.apiKey || process.env.BEDROCK_API_KEY || '').trim();
  const region = String(config.region || process.env.AWS_REGION || 'us-east-1').trim();

  if (!apiKey) throw new Error('AWS Bedrock requiere apiKey (Bedrock API Key). Configura: /provider set bedrock apiKey <key>');

  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/invoke-with-response-stream`;
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
        messages,
        max_tokens: 16384,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`AWS Bedrock fallo (${res.status}): ${text.slice(0, 500)}`);
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
        // Bedrock streaming format varies by model
        const content = parsed?.output?.text || parsed?.delta?.text || parsed?.contentBlock?.text;
        if (content) {
          answer += content;
          if (onChunk) onChunk(content, 'answer');
        }
      }
    }

    return { status: true, text: answer.trim(), thinking: thinking.trim() };
  } finally {
    clearTimeout(timeoutId);
    if (options.signal) options.signal.removeEventListener('abort', onAbort);
  }
}

module.exports = { bedrock };
