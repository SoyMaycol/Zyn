const HF_URL = 'https://router.huggingface.co/novita/v3/openai/chat/completions';
const HF_TOKEN = 'hf_jwt_eyJhbGciOiJIUzI1NiJ9.eyJwZXJtaXNzaW9ucyI6eyJpbmZlcmVuY2Uuc2VydmVybGVzcy53cml0ZSI6dHJ1ZX0sIm9uQmVoYWxmT2YiOnsia2luZCI6InVzZXIiLCJfaWQiOiI2OWMzNTM0ZWM5OGQzNDljMTMzMTViNzMiLCJ1c2VyIjoibWF5Y29sZGV2Iiwic2Vzc2lvbklkIjoiNmEwN2I2ZDI1ZThhMDgwZmU2NDJlNmZlIn0sImlhdCI6MTc3ODg5MTg2OCwic3ViIjoiaHR0cHM6Ly9yb3V0ZXIuaHVnZ2luZ2ZhY2UuY28iLCJleHAiOjE3Nzg4OTU0NjgsImlzcyI6Imh0dHBzOi8vaHVnZ2luZ2ZhY2UuY28ifQ.0ysWl0uzyg-H0CXEcMstVEjdY1XOpIE8mhhMZ-tR4A8';

async function huggingface(messages, modelId, onChunk = null, options = {}) {
  const res = await fetch(HF_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': '@huggingface/inference/4.13.15 Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
    },
    body: JSON.stringify({ messages, stream: true, model: modelId }),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HuggingFace fallo (${res.status}): ${text.slice(0, 200)}`);
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
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (!delta) continue;
      answer += delta;
      if (onChunk) onChunk(delta, 'answer');
    }
  }

  return { status: true, text: answer.trim(), thinking: '' };
}

module.exports = { huggingface };
