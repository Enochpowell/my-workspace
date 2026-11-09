'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, makeAdmin } = require('./helpers');

/** A fake AI service that speaks one provider's streaming format. */
function fakeAi(handler) {
  return new Promise((resolve) => {
    const seen = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => { seen.push({ url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null }); handler(req, res, seen[seen.length - 1]); });
    });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, seen, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) }));
  });
}
const sse = (res, chunks) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); for (const c of chunks) res.write(`data: ${c}\n\n`); res.end(); };

test('AI providers: Gemini, Claude and OpenAI-compatible, plus switching', async (t) => {
  const gem = await fakeAi((req, res) => sse(res, [
    JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello ' }] } }] }),
    JSON.stringify({ candidates: [{ content: { parts: [{ text: 'from Gemini' }] } }] })]));
  const cla = await fakeAi((req, res) => sse(res, [
    JSON.stringify({ type: 'message_start' }),
    JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello from ' } }),
    JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Claude' } })]));
  const oai = await fakeAi((req, res) => sse(res, [
    JSON.stringify({ choices: [{ delta: { content: 'Hello from ' } }] }),
    JSON.stringify({ choices: [{ delta: { content: 'Groq' } }] }), '[DONE]']));
  const bad = await fakeAi((req, res) => { res.writeHead(401); res.end('{"error":"bad key sk-secret"}'); });
  const limited = await fakeAi((req, res) => { res.writeHead(429); res.end('slow down'); });
  t.after(async () => { for (const f of [gem, cla, oai, bad, limited]) await f.close(); });

  const s = await startServer({
    GEMINI_API_KEY: 'gem-key', GEMINI_BASE_URL: gem.url, GEMINI_MODEL: 'gem-model',
    ANTHROPIC_API_KEY: 'cla-key', ANTHROPIC_BASE_URL: cla.url,
    GROQ_API_KEY: 'groq-key', GROQ_BASE_URL: oai.url, GROQ_MODEL: 'groq-model',
    OPENAI_API_KEY: 'bad-key', OPENAI_BASE_URL: bad.url,
    OPENROUTER_API_KEY: 'or-key', OPENROUTER_BASE_URL: limited.url,
    AI_PROVIDER: 'gemini',
  });
  t.after(() => s.close());
  const admin = await makeAdmin(s.base);

  await t.test('the provider list shows what is ready and never reveals keys', async () => {
    const r = await admin.c.get('/api/ai/providers');
    const byId = Object.fromEntries(r.json.providers.map((p) => [p.id, p]));
    assert.equal(byId.gemini.configured, true);
    assert.equal(byId.anthropic.configured, true);
    assert.equal(byId.ollama.configured, false);
    assert.ok(!JSON.stringify(r.json).includes('gem-key'));
    assert.equal(r.json.default, 'gemini');
  });

  await t.test('Gemini streams text and is called with the key in a header', async () => {
    const r = await admin.c.post('/api/ai/chat', { prompt: 'Hi', stream: false });
    assert.equal(r.json.text, 'Hello from Gemini');
    assert.equal(r.json.provider, 'gemini');
    const call = gem.seen[0];
    assert.match(call.url, /\/v1beta\/models\/gem-model:streamGenerateContent\?alt=sse/);
    assert.equal(call.headers['x-goog-api-key'], 'gem-key');
    assert.equal(call.body.contents[0].parts[0].text, 'Hi');
  });

  await t.test('switching to Claude changes which service answers', async () => {
    const r = await admin.c.post('/api/ai/chat', { prompt: 'Hi', provider: 'anthropic', stream: false });
    assert.equal(r.json.text, 'Hello from Claude');
    assert.equal(cla.seen[0].headers['x-api-key'], 'cla-key');
    assert.equal(cla.seen[0].headers['anthropic-version'], '2023-06-01');
    assert.equal(cla.seen[0].body.stream, true);
  });

  await t.test('OpenAI-compatible services (Groq here) work with a bearer key', async () => {
    const r = await admin.c.post('/api/ai/chat', { prompt: 'Hi', provider: 'groq', stream: false });
    assert.equal(r.json.text, 'Hello from Groq');
    assert.equal(oai.seen[0].headers.authorization, 'Bearer groq-key');
    assert.equal(oai.seen[0].body.model, 'groq-model');
    assert.match(oai.seen[0].url, /\/chat\/completions$/);
  });

  await t.test('streaming mode sends Server-Sent Events ending with done', async () => {
    const res = await fetch(s.base + '/api/ai/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'bitwixt', Cookie: await cookieOf(s.base) },
      body: JSON.stringify({ prompt: 'Hi', provider: 'groq', stream: true }),
    });
    const text = await res.text();
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    assert.ok(text.includes('{"text":"Hello from "}') && text.includes('"done":true'));
  });

  await t.test('provider problems become friendly messages without leaking the key', async () => {
    const r1 = await admin.c.post('/api/ai/chat', { prompt: 'Hi', provider: 'openai', stream: false });
    assert.equal(r1.status, 502);
    assert.match(r1.json.error, /rejected the API key/);
    assert.ok(!JSON.stringify(r1.json).includes('sk-secret') && !JSON.stringify(r1.json).includes('bad-key'));
    const r2 = await admin.c.post('/api/ai/chat', { prompt: 'Hi', provider: 'openrouter', stream: false });
    assert.equal(r2.status, 429);
  });

  await t.test('an unconfigured choice falls back to a configured provider; empty prompts are refused', async () => {
    const r = await admin.c.post('/api/ai/chat', { prompt: 'Hi', provider: 'ollama', stream: false });
    assert.equal(r.status, 200, 'falls back to the default (Gemini)');
    assert.equal((await admin.c.post('/api/ai/chat', { prompt: '  ', stream: false })).status, 400);
    assert.equal((await admin.c.post('/api/ai/chat', { prompt: 'x'.repeat(120_001), stream: false })).status, 413);
  });

  await t.test('signed-out visitors cannot use the AI', async () => {
    const { client } = require('./helpers');
    assert.equal((await client(s.base).post('/api/ai/chat', { prompt: 'Hi', stream: false })).status, 401);
  });

  async function cookieOf(base) {
    const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'bitwixt' }, body: JSON.stringify({ email: 'admin@example.com', password: require('./helpers').PW }) });
    return res.headers.getSetCookie()[0].split(';')[0];
  }
});

test('with no AI configured, the app says so clearly', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  const admin = await makeAdmin(s.base);
  const r = await admin.c.post('/api/ai/chat', { prompt: 'Hi', stream: false });
  assert.equal(r.status, 503);
  assert.equal(r.json.code, 'not_configured');
  assert.ok((await admin.c.get('/api/ai/providers')).json.providers.every((p) => !p.configured));
});
