'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, makeAdmin } = require('./helpers');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

function fake(handler) {
  return new Promise((resolve) => {
    const seen = [];
    const srv = http.createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => { seen.push({ url: req.url, headers: req.headers, body: b }); handler(req, res, b); });
    }).listen(0, '127.0.0.1', () => resolve({ srv, seen, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

test('image generation: OpenAI format, Gemini format, errors, no key', async (t) => {
  const oa = await fake((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: [{ b64_json: PNG.toString('base64') }] })); });
  const gm = await fake((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: PNG.toString('base64') } }] } }] })); });
  t.after(() => { oa.srv.close(); gm.srv.close(); });

  await t.test('without a key there is a clear message', async () => {
    const s = await startServer({});
    t.after(() => s.close());
    const a = await makeAdmin(s.base);
    const r = await a.c.post('/api/ai/image', { prompt: 'red shoes' });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /No image service/);
  });

  await t.test('OpenAI: picture comes back, key stays on the server, size is mapped', async () => {
    const s = await startServer({ OPENAI_API_KEY: 'sk-test-123', OPENAI_BASE_URL: oa.base });
    t.after(() => s.close());
    const a = await makeAdmin(s.base);
    const r = await a.c.post('/api/ai/image', { prompt: 'red shoes', size: 'portrait' });
    assert.equal(r.status, 200);
    assert.equal(r.json.b64, PNG.toString('base64'));
    assert.equal(r.json.provider, 'openai');
    assert.ok(!JSON.stringify(r.json).includes('sk-test-123'));
    const sent = oa.seen.at(-1);
    assert.equal(sent.url, '/images/generations');
    assert.equal(sent.headers.authorization, 'Bearer sk-test-123');
    assert.equal(JSON.parse(sent.body).size, '1024x1536');
  });

  await t.test('Gemini: picture is read from inlineData', async () => {
    const s = await startServer({ GEMINI_API_KEY: 'AIzaTest', GEMINI_BASE_URL: gm.base });
    t.after(() => s.close());
    const a = await makeAdmin(s.base);
    const r = await a.c.post('/api/ai/image', { prompt: 'red shoes' });
    assert.equal(r.status, 200);
    assert.equal(r.json.provider, 'gemini');
    assert.equal(r.json.mime, 'image/png');
    assert.match(gm.seen.at(-1).url, /gemini-2\.5-flash-image:generateContent/);
    assert.equal(gm.seen.at(-1).headers['x-goog-api-key'], 'AIzaTest');
  });

  await t.test('a refused key gives a friendly message and never leaks the key', async () => {
    const bad = await fake((req, res) => { res.writeHead(401); res.end('{"error":"bad key sk-test-999"}'); });
    t.after(() => bad.srv.close());
    const s = await startServer({ OPENAI_API_KEY: 'sk-test-999', OPENAI_BASE_URL: bad.base });
    t.after(() => s.close());
    const a = await makeAdmin(s.base);
    const r = await a.c.post('/api/ai/image', { prompt: 'x' });
    assert.equal(r.status, 502);
    assert.ok(!JSON.stringify(r.json).includes('sk-test-999'));
  });

  await t.test('sign-in is required and an empty description is refused', async () => {
    const s = await startServer({ OPENAI_API_KEY: 'sk-x', OPENAI_BASE_URL: oa.base });
    t.after(() => s.close());
    const a = await makeAdmin(s.base);
    assert.equal((await a.c.post('/api/ai/image', { prompt: '  ' })).status, 400);
    const anon = await fetch(`${s.base}/api/ai/image`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'bitwixt' }, body: '{"prompt":"x"}' });
    assert.equal(anon.status, 401);
  });
});

test('image generation: the real reason is shown, the key is hidden, the model can be chosen', async (t) => {
  const quota = await fake((req, res) => { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Quota exceeded: limit 0 for key AIzaSecretXYZ' } })); });
  const ok = await fake((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG.toString('base64') } }] } }] })); });
  t.after(() => { quota.srv.close(); ok.srv.close(); });

  await t.test('a quota error says why, and never shows the key', async () => {
    const s = await startServer({ GEMINI_API_KEY: 'AIzaSecretXYZ', GEMINI_BASE_URL: quota.base });
    t.after(() => s.close());
    const a = await makeAdmin(s.base);
    const r = await a.c.post('/api/ai/image', { prompt: 'shoes' });
    assert.equal(r.status, 429);
    assert.match(r.json.error, /no quota for pictures/);
    assert.match(r.json.error, /Quota exceeded: limit 0/);
    assert.ok(!JSON.stringify(r.json).includes('AIzaSecretXYZ'));
  });

  await t.test('the model can be chosen per request, and the services are listed', async () => {
    const s = await startServer({ GEMINI_API_KEY: 'AIzaOk', GEMINI_BASE_URL: ok.base });
    t.after(() => s.close());
    const a = await makeAdmin(s.base);
    const info = await a.c.get('/api/ai/image-info');
    const g = info.json.services.find((x) => x.id === 'gemini');
    assert.ok(g.configured && g.suggestions.length >= 2);
    assert.equal(info.json.services.find((x) => x.id === 'openai').configured, false);
    const r = await a.c.post('/api/ai/image', { prompt: 'shoes', model: 'gemini-3.1-flash-image-preview' });
    assert.equal(r.status, 200);
    assert.match(ok.seen.at(-1).url, /gemini-3\.1-flash-image-preview:generateContent/);
  });
});
