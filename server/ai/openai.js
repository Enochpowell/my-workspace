'use strict';
/**
 * "OpenAI-compatible" chat completions. The same code serves OpenAI, Groq, OpenRouter, Ollama
 * and many others, because they all copy OpenAI's format. Only the base URL, key and model differ.
 */
const { post, events } = require('./sse');

async function* stream({ settings, prompt, signal, timeoutMs, maxTokens, providerId }) {
  const headers = settings.key ? { Authorization: `Bearer ${settings.key}` } : {};
  const res = await post(`${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    label: providerId === 'ollama' ? 'Ollama' : providerId.charAt(0).toUpperCase() + providerId.slice(1), signal, timeoutMs, headers,
    body: { model: settings.model, stream: true, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] },
  });
  for await (const data of events(res)) {
    if (data === '[DONE]') return;
    let j;
    try { j = JSON.parse(data); } catch { continue; }
    const t = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
    if (t) yield t;
  }
}
module.exports = { stream };
