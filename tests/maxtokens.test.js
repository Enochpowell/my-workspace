'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, makeAdmin } = require('./helpers');

test('a request can ask for a longer answer, within limits', async (t) => {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => { seen.push(JSON.parse(b)); res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: 'ok' } }] }) + '\n\ndata: [DONE]\n\n'); });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.close());
  const s = await startServer({ OPENAI_API_KEY: 'sk-x', OPENAI_BASE_URL: `http://127.0.0.1:${srv.address().port}`, AI_PROVIDER: 'openai' });
  t.after(() => s.close());
  const a = await makeAdmin(s.base);
  await a.c.post('/api/ai/chat', { prompt: 'a', stream: false });
  assert.equal(seen.at(-1).max_tokens, 2048);
  await a.c.post('/api/ai/chat', { prompt: 'a', stream: false, maxTokens: 8000 });
  assert.equal(seen.at(-1).max_tokens, 8000);
  await a.c.post('/api/ai/chat', { prompt: 'a', stream: false, maxTokens: 999999 });
  assert.equal(seen.at(-1).max_tokens, 16384);
  await a.c.post('/api/ai/chat', { prompt: 'a', stream: false, maxTokens: 5 });
  assert.equal(seen.at(-1).max_tokens, 256);
});
