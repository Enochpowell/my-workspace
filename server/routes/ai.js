'use strict';
/**
 *   GET  /api/ai/providers     which AI services are ready (no keys are ever returned)
 *   POST /api/ai/chat          { prompt, provider?, stream? }
 *        stream:true  -> Server-Sent Events:  data: {"text":"..."}  ...  data: {"done":true}
 *        stream:false -> JSON: { text, provider }
 *   POST /api/ai/image         { prompt, size?: square|portrait|landscape, provider? } -> { mime, b64, provider }
 */
const { HttpError } = require('../http');
const A = require('../auth');
const AI = require('../ai');
const { generateImage, imageServices } = require('../ai/image');
const V = require('../ai/video');

module.exports = function register(add, { config, limiters }) {
  add('POST', '/api/ai/video', async (ctx) => {
    A.requireUser(ctx);
    const lim = limiters.ai.hit(ctx.user.id);
    if (!lim.ok) throw new HttpError(429, 'You are asking the AI too fast. Wait a moment.', 'rate_limited');
    const b = await ctx.body();
    const prompt = String(b.prompt || '').trim();
    if (!prompt) throw new HttpError(400, 'Describe the video first.', 'bad_request');
    if (prompt.length > 1500) throw new HttpError(413, 'That description is too long.', 'too_large');
    ctx.json(200, await V.startVideo(config, ctx.user.id, { prompt, aspect: b.aspect, model: typeof b.model === 'string' ? b.model : '' }));
  });
  add('GET', '/api/ai/video/:id', async (ctx) => {
    A.requireUser(ctx);
    ctx.json(200, await V.checkVideo(config, ctx.user.id, ctx.params.id));
  });
  add('GET', '/api/ai/video/:id/file', (ctx) => {
    A.requireUser(ctx);
    ctx.bytes(200, V.videoFile(ctx.user.id, ctx.params.id), 'video/mp4');
  });

  add('GET', '/api/ai/image-info', (ctx) => {
    A.requireUser(ctx);
    ctx.json(200, { services: imageServices(config), video: { configured: !!(config.ai.providers.gemini && config.ai.providers.gemini.key), model: config.ai.videoModel, suggestions: ['veo-3.1-generate-preview', 'veo-3.0-generate-001'] } });
  });

  add('POST', '/api/ai/image', async (ctx) => {
    A.requireUser(ctx);
    const lim = limiters.ai.hit(ctx.user.id);
    if (!lim.ok) throw new HttpError(429, 'You are asking the AI too fast. Wait a moment.', 'rate_limited');
    const b = await ctx.body();
    const prompt = String(b.prompt || '').trim();
    if (!prompt) throw new HttpError(400, 'Describe the picture first.', 'bad_request');
    if (prompt.length > 1500) throw new HttpError(413, 'That description is too long.', 'too_large');
    const abort = new AbortController();
    ctx.res.on('close', () => abort.abort());
    ctx.json(200, await generateImage(config, { prompt, size: b.size, provider: b.provider, model: typeof b.model === 'string' ? b.model : '' }, abort.signal));
  });

  add('GET', '/api/ai/providers', (ctx) => {
    A.requireUser(ctx);
    ctx.json(200, { providers: AI.listProviders(config), default: config.ai.defaultProvider });
  });

  add('POST', '/api/ai/chat', async (ctx) => {
    A.requireUser(ctx);
    const lim = limiters.ai.hit(ctx.user.id);
    if (!lim.ok) throw new HttpError(429, 'You are asking the AI too fast. Wait a moment.', 'rate_limited');
    const b = await ctx.body();
    const maxTokens = Number.isInteger(b.maxTokens) ? Math.max(256, Math.min(16384, b.maxTokens)) : undefined;
    const prompt = String(b.prompt || '').trim();
    if (!prompt) throw new HttpError(400, 'Type a question first.', 'bad_request');
    if (prompt.length > config.ai.maxPromptChars) throw new HttpError(413, 'That question is too long.', 'too_large');
    const provider = AI.resolveProvider(config, b.provider);

    const abort = new AbortController();
    ctx.res.on('close', () => abort.abort());

    if (b.stream === false) {
      let text = '';
      for await (const piece of AI.streamChat(config, provider, prompt, { signal: abort.signal, maxTokens })) text += piece;
      return ctx.json(200, { text, provider });
    }

    ctx.res.writeHead(200, { ...ctx.baseHeaders, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    ctx.handled = true;
    const send = (o) => { try { ctx.res.write(`data: ${JSON.stringify(o)}\n\n`); } catch { /* client left */ } };
    try {
      for await (const piece of AI.streamChat(config, provider, prompt, { signal: abort.signal, maxTokens })) send({ text: piece });
      send({ done: true, provider });
    } catch (e) {
      if (!abort.signal.aborted) send({ error: e instanceof HttpError ? e.message : 'The AI could not answer. Try again.', code: e.code || 'ai_error' });
    }
    ctx.res.end();
  });
};
