'use strict';
/** Google Gemini (Generative Language API). Streams with ?alt=sse. */
const { post, events } = require('./sse');

async function* stream({ config, settings, prompt, signal, timeoutMs, maxTokens }) {
  const base = config.ai.geminiBaseUrl.replace(/\/+$/, '');
  const url = `${base}/v1beta/models/${encodeURIComponent(settings.model)}:streamGenerateContent?alt=sse`;
  const res = await post(url, {
    label: 'Google Gemini', signal, timeoutMs,
    headers: { 'x-goog-api-key': settings.key },
    body: { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } },
  });
  for await (const data of events(res)) {
    let j;
    try { j = JSON.parse(data); } catch { continue; }
    const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
    if (parts) { const t = parts.map((p) => p.text || '').join(''); if (t) yield t; }
  }
}
module.exports = { stream };
