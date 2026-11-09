'use strict';
/**
 * Image generation through OpenAI (or any OpenAI-compatible images endpoint) or Gemini.
 * The model names are settings (OPENAI_IMAGE_MODEL, GEMINI_IMAGE_MODEL) because providers rename
 * their image models often. If generation fails with "model not found", change the setting.
 * Returns { mime, b64 }. Keys never leave the server.
 */
const { HttpError } = require('../http');

const SIZES = {
  openai: { square: '1024x1024', portrait: '1024x1536', landscape: '1536x1024' },
};
const MAX_BYTES = 12 * 1024 * 1024;

async function upstreamMessage(res, config, ids) {
  let text = '';
  try { text = await res.text(); } catch { /* ignore */ }
  let msg = text;
  try { const j = JSON.parse(text); msg = (j.error && (j.error.message || j.error)) || j.message || text; } catch { /* plain text */ }
  msg = String(typeof msg === 'string' ? msg : JSON.stringify(msg)).replace(/\s+/g, ' ').trim();
  for (const id of ids) { const k = config.ai.providers[id] && config.ai.providers[id].key; if (k) msg = msg.split(k).join('[key]'); }
  return msg.length > 260 ? msg.slice(0, 257) + '...' : msg;
}

async function friendly(res, config, ids, name) {
  const status = res.status, said = await upstreamMessage(res, config, ids);
  const tail = said ? ` ${name} said: "${said}"` : '';
  if (status === 401 || status === 403) return new HttpError(502, `${name} refused the request. Check the API key in Settings, AI. Some services also need the account verified or billing switched on before they make pictures.${tail}`, 'ai_key');
  if (status === 429) return new HttpError(429, `${name} says there is no quota for pictures right now. A free key often has none: switch on billing for the key, or use a different key.${tail}`, 'rate_limited');
  if (status === 404) return new HttpError(502, `${name} does not know that picture model. Change the picture model in the Make a picture box.${tail}`, 'ai_model');
  return new HttpError(502, `${name} could not make that picture. Try a different description, or a different model.${tail}`, 'ai_error');
}

async function viaOpenAI(config, prompt, size, signal) {
  const s = config.ai.providers.openai;
  const res = await fetch(`${s.baseUrl.replace(/\/+$/, '')}/images/generations`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.key}` },
    body: JSON.stringify({ model: config.ai.imageModels.openai, prompt, n: 1, size: SIZES.openai[size] || SIZES.openai.square }),
  });
  if (!res.ok) throw await friendly(res, config, ['openai'], 'OpenAI');
  const j = await res.json();
  const d = j && j.data && j.data[0];
  if (d && d.b64_json) return { mime: 'image/png', b64: d.b64_json };
  if (d && d.url) {
    const img = await fetch(d.url, { signal });
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new HttpError(502, 'The picture was too large.', 'ai_error');
    return { mime: img.headers.get('content-type') || 'image/png', b64: buf.toString('base64') };
  }
  throw new HttpError(502, 'OpenAI answered, but with no picture in it.', 'ai_error');
}

async function viaGemini(config, prompt, size, signal) {
  const s = config.ai.providers.gemini;
  const hint = { square: 'Square 1:1 picture.', portrait: 'Tall vertical 3:4 picture.', landscape: 'Wide horizontal 16:9 picture.' }[size] || '';
  const url = `${config.ai.geminiBaseUrl.replace(/\/+$/, '')}/v1beta/models/${encodeURIComponent(config.ai.imageModels.gemini)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.key },
    body: JSON.stringify({ contents: [{ parts: [{ text: `${prompt}\n${hint}` }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
  });
  if (!res.ok) throw await friendly(res, config, ['gemini'], 'Gemini');
  const j = await res.json();
  const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  const p = parts.find((x) => x.inlineData && x.inlineData.data);
  if (!p) {
    const why = parts.map((x) => x.text).filter(Boolean).join(' ').slice(0, 220);
    throw new HttpError(502, `Gemini answered with no picture.${why ? ` It said: "${why}"` : ' Try a different description, or a model that makes pictures.'}`, 'ai_error');
  }
  return { mime: p.inlineData.mimeType || 'image/png', b64: p.inlineData.data };
}

function pickProvider(config, wanted) {
  const ok = (id) => (id === 'openai' || id === 'gemini') && config.ai.providers[id] && config.ai.providers[id].key;
  if (wanted && ok(wanted)) return wanted;
  const id = ['openai', 'gemini'].find(ok);
  if (!id) throw new HttpError(400, 'No image service is set up. Add an OpenAI or Gemini key in Settings, AI.', 'no_provider');
  return id;
}

const MODELS = {
  openai: ['gpt-image-1', 'gpt-image-1-mini', 'dall-e-3'],
  gemini: ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'],
};
function imageServices(config) {
  return ['openai', 'gemini'].map((id) => ({
    id, label: id === 'openai' ? 'OpenAI' : 'Gemini', configured: !!(config.ai.providers[id] && config.ai.providers[id].key),
    model: config.ai.imageModels[id], suggestions: MODELS[id],
  }));
}

async function generateImage(config, { prompt, size, provider, model }, signal) {
  if (model && /^[\w./:@+-]{1,80}$/.test(model)) {
    const id0 = pickProvider(config, provider);
    config = { ...config, ai: { ...config.ai, imageModels: { ...config.ai.imageModels, [id0]: model } } };
  }
  const id = pickProvider(config, provider);
  const sz = ['square', 'portrait', 'landscape'].includes(size) ? size : 'square';
  const out = id === 'openai' ? await viaOpenAI(config, prompt, sz, signal) : await viaGemini(config, prompt, sz, signal);
  return { ...out, provider: id };
}

module.exports = { generateImage, imageServices };
