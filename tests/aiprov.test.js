'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer, makeAdmin, makeMember } = require('./helpers');

function fakeChat() {
  return new Promise((resolve) => {
    const seen = [];
    const srv = http.createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        seen.push({ url: req.url, auth: req.headers.authorization, body: b ? JSON.parse(b) : null });
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'hi from fake' } }] }) + '\n\n');
        res.end('data: [DONE]\n\n');
      });
    }).listen(0, '127.0.0.1', () => resolve({ srv, seen, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

test('more AIs, model choice and your own AI', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-prov-'));
  const fake = await fakeChat();
  t.after(() => { fake.srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const s = await startServer({ DATA_DIR: dir, TOGETHER_BASE_URL: fake.base, AI_PROVIDER: 'together' });
  t.after(() => s.close());
  const admin = await makeAdmin(s.base);
  const member = await makeMember(s.base, admin, 'sam@example.com', 'Sam');
  const list = async () => (await admin.c.get('/api/ai/providers')).json.providers;

  await t.test('there are 25 or more AIs to choose from, in groups', async () => {
    const p = await list();
    assert.ok(p.length >= 25);
    assert.ok(p.some((x) => x.group === 'main') && p.some((x) => x.group === 'more'));
    assert.ok(p.find((x) => x.id === 'openrouter').aggregator);
  });

  await t.test('a key makes a preset ready, and the model can be changed', async () => {
    assert.equal((await list()).find((x) => x.id === 'together').configured, false);
    assert.equal((await admin.c.put('/api/admin/ai-key/together', { key: 'tg-test-key-123' })).status, 200);
    assert.equal((await list()).find((x) => x.id === 'together').configured, true);
    assert.equal((await admin.c.put('/api/admin/ai-model/together', { model: 'my/model:v2' })).status, 200);
    const r = await admin.c.post('/api/ai/chat', { prompt: 'hello', provider: 'together', stream: false });
    assert.equal(r.status, 200);
    assert.equal(r.json.text, 'hi from fake');
    const sent = fake.seen.at(-1);
    assert.equal(sent.body.model, 'my/model:v2');
    assert.equal(sent.auth, 'Bearer tg-test-key-123');
  });

  await t.test('your own AI: add, use, and remove', async () => {
    const r = await admin.c.put('/api/admin/ai-provider', { label: 'My Gateway', baseUrl: fake.base + '/', model: 'gw-1', key: 'gw-secret-key' });
    assert.equal(r.status, 200);
    const id = r.json.id;
    assert.match(id, /^c_/);
    const mine = (await list()).find((x) => x.id === id);
    assert.ok(mine && mine.custom && mine.configured && mine.label === 'My Gateway');
    assert.ok(!JSON.stringify(await list()).includes('gw-secret-key'));
    const c = await admin.c.post('/api/ai/chat', { prompt: 'hey', provider: id, stream: false });
    assert.equal(c.status, 200);
    assert.equal(fake.seen.at(-1).auth, 'Bearer gw-secret-key');
    assert.equal(fake.seen.at(-1).body.model, 'gw-1');
    assert.equal((await admin.c.del('/api/admin/ai-provider/' + id)).status, 200);
    assert.ok(!(await list()).some((x) => x.id === id));
  });

  await t.test('only admins can change AIs, and bad input is refused', async () => {
    assert.equal((await member.c.put('/api/admin/ai-provider', { label: 'X', baseUrl: fake.base, model: 'm' })).status, 403);
    assert.equal((await member.c.put('/api/admin/ai-model/together', { model: 'm' })).status, 403);
    assert.equal((await admin.c.put('/api/admin/ai-provider', { label: 'Bad', baseUrl: 'not a url', model: 'm' })).status, 400);
    assert.equal((await admin.c.put('/api/admin/ai-provider', { label: 'Bad', baseUrl: 'http://169.254.169.254/', model: 'm' })).status, 400);
    assert.equal((await admin.c.put('/api/admin/ai-provider', { label: 'Bad', baseUrl: fake.base, model: 'has space' })).status, 400);
    assert.equal((await admin.c.del('/api/admin/ai-provider/openai')).status, 400);
  });

  await t.test('your choices survive a restart', async () => {
    const r = await admin.c.put('/api/admin/ai-provider', { label: 'Keeper', baseUrl: fake.base, model: 'k-1', key: 'keeper-key-1' });
    const id = r.json.id;
    const cfg = s.app.config;
    delete cfg.ai.providers[id];
    require('../server/ai/index').PROVIDERS[id] && delete require('../server/ai/index').PROVIDERS[id];
    require('../server/ai/custom').applySavedProviders(s.app.db, cfg);
    require('../server/ai/keys').applySavedKeys(s.app.db, cfg);
    assert.equal(cfg.ai.providers[id].model, 'k-1');
    assert.equal(cfg.ai.providers[id].key, 'keeper-key-1');
    assert.equal(cfg.ai.providers.together.model, 'my/model:v2');
  });
});
