'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer, makeAdmin, makeMember } = require('./helpers');

test('AI keys saved from Settings: admin only, encrypted, never returned, removable', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-keys-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const s = await startServer({ DATA_DIR: dir, AI_PROVIDER: 'gemini' });
  t.after(() => s.close());
  const admin = await makeAdmin(s.base);
  const member = await makeMember(s.base, admin, 'sam@example.com', 'Sam');
  const providers = async (c) => Object.fromEntries((await c.get('/api/ai/providers')).json.providers.map((p) => [p.id, p]));

  await t.test('nothing is configured at first', async () => {
    assert.equal((await providers(admin.c)).gemini.configured, false);
  });

  await t.test('a member cannot save a key', async () => {
    const r = await member.c.put('/api/admin/ai-key/gemini', { key: 'AIzaSecretKey1234567' });
    assert.equal(r.status, 403);
  });

  await t.test('the admin saves a key and the provider becomes ready, without the key ever coming back', async () => {
    const r = await admin.c.put('/api/admin/ai-key/gemini', { key: 'AIzaSecretKey1234567' });
    assert.equal(r.status, 200);
    const list = await admin.c.get('/api/ai/providers');
    assert.equal(list.json.providers.find((p) => p.id === 'gemini').configured, true);
    assert.ok(!JSON.stringify(list.json).includes('AIzaSecretKey1234567'));
  });

  await t.test('the key is stored encrypted, in the database, with a secret file next to it', async () => {
    assert.ok(fs.existsSync(path.join(dir, '.keysecret')));
    const row = s.app.db.get("SELECT v FROM settings WHERE k = 'ai_key_gemini'");
    assert.ok(row && !row.v.includes('AIzaSecretKey1234567'));
  });

  await t.test('bad keys and providers without keys are refused', async () => {
    assert.equal((await admin.c.put('/api/admin/ai-key/gemini', { key: 'has spaces in it' })).status, 400);
    assert.equal((await admin.c.put('/api/admin/ai-key/gemini', { key: 'short' })).status, 400);
    assert.equal((await admin.c.put('/api/admin/ai-key/ollama', { key: 'AIzaSecretKey1234567' })).status, 400);
    assert.equal((await admin.c.put('/api/admin/ai-key/nope', { key: 'AIzaSecretKey1234567' })).status, 400);
  });

  await t.test('the admin can remove the key again', async () => {
    assert.equal((await admin.c.del('/api/admin/ai-key/gemini')).status, 200);
    assert.equal((await providers(admin.c)).gemini.configured, false);
  });
});
