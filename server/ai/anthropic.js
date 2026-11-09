'use strict';
/** Anthropic Claude (Messages API). Streams "content_block_delta" events. */
const { post, events } = require('./sse');

async function* stream({ settings, prompt, signal, timeoutMs, maxTokens }) {
  const res = await post(`${settings.baseUrl.replace(/\/+$/, '')}/v1/messages`, {
    label: 'Anthropic Claude', signal, timeoutMs,
    headers: { 'x-api-key': settings.key, 'anthropic-version': '2023-06-01' },
    body: { model: settings.model, max_tokens: maxTokens, stream: true, messages: [{ role: 'user', content: prompt }] },
  });
  for await (const data of events(res)) {
    let j;
    try { j = JSON.parse(data); } catch { continue; }
    if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta' && j.delta.text) yield j.delta.text;
  }
}
module.exports = { stream };
