'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, makeAdmin, SETUP_CODE, PW } = require('./helpers');

test('first-time setup, invites, sessions and limits', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  const anon = client(s.base);

  await t.test('the health check answers without signing in', async () => {
    const r = await anon.get('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
  });

  await t.test('secret files and source code are never served', async () => {
    for (const p of ['/.env', '/%2e%2e/.env', '/server/index.js', '/data/bitwixt.db', '/package.json', '/.git/config']) {
      const r = await fetch(s.base + p);
      const body = await r.text();
      assert.ok(r.status === 404 || !/ADMIN_SETUP_CODE|require\(|SQLite format/.test(body), p + ' must not leak');
    }
    assert.equal((await fetch(s.base + '/.env')).status, 404);
  });

  await t.test('before any account exists, setup is required', async () => {
    const r = await anon.get('/api/session');
    assert.equal(r.json.user, null);
    assert.equal(r.json.setupRequired, true);
  });

  await t.test('sign-up needs the security acknowledgement, a strong password and the right code', async () => {
    const body = { code: SETUP_CODE, email: 'admin@example.com', name: 'Ada', password: PW, ack: true };
    assert.equal((await anon.post('/api/auth/signup', { ...body, ack: false })).status, 400);
    assert.equal((await anon.post('/api/auth/signup', { ...body, password: 'short' })).status, 400);
    assert.equal((await anon.post('/api/auth/signup', { ...body, password: 'password1234' })).status, 400);
    assert.equal((await anon.post('/api/auth/signup', { ...body, code: 'wrong-code-wrong-code' })).json.code, 'bad_code');
    assert.equal((await anon.post('/api/auth/signup', { ...body, email: 'not-an-email' })).status, 400);
  });

  let admin;
  await t.test('the setup code creates the first admin and a workspace', async () => {
    admin = await makeAdmin(s.base);
    assert.equal(admin.user.isAdmin, true);
    const me = await admin.c.get('/api/session');
    assert.equal(me.json.workspaces.length, 1);
    assert.equal(me.json.workspaces[0].role, 'admin');
  });

  await t.test('the setup code stops working once an account exists', async () => {
    const r = await client(s.base).post('/api/auth/signup', { code: SETUP_CODE, email: 'x@example.com', name: 'X', password: PW, ack: true });
    assert.equal(r.status, 400);
    assert.equal(r.json.code, 'bad_code');
  });

  await t.test('invites are single-use and can be locked to one email', async () => {
    const inv = await admin.c.post(`/api/workspaces/${admin.wid}/invites`, { email: 'sam@example.com' });
    assert.equal(inv.status, 201);
    const wrong = await client(s.base).post('/api/auth/signup', { code: inv.json.code, email: 'other@example.com', name: 'Other', password: PW, ack: true });
    assert.equal(wrong.json.code, 'wrong_email');
    const ok = await client(s.base).post('/api/auth/signup', { code: inv.json.code.toLowerCase().replace(/-/g, ' '), email: 'sam@example.com', name: 'Sam', password: PW, ack: true });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.workspaces[0].id, admin.wid);
    assert.equal(ok.json.workspaces[0].role, 'member');
    const again = await client(s.base).post('/api/auth/signup', { code: inv.json.code, email: 'sam2@example.com', name: 'Sam2', password: PW, ack: true });
    assert.equal(again.json.code, 'bad_code');
  });

  await t.test('duplicate email is refused', async () => {
    const inv = await admin.c.post(`/api/workspaces/${admin.wid}/invites`, {});
    const r = await client(s.base).post('/api/auth/signup', { code: inv.json.code, email: 'ADMIN@example.com', name: 'Dup', password: PW, ack: true });
    assert.equal(r.status, 409);
  });

  await t.test('login, wrong password, logout', async () => {
    const c = client(s.base);
    assert.equal((await c.post('/api/auth/login', { email: 'admin@example.com', password: 'wrong-password-xx' })).status, 401);
    const ok = await c.post('/api/auth/login', { email: 'Admin@Example.com', password: PW });
    assert.equal(ok.status, 200);
    assert.equal((await c.get('/api/session')).json.user.email, 'admin@example.com');
    await c.post('/api/auth/logout');
    assert.equal((await c.get('/api/session')).json.user, null);
  });

  await t.test('sessions use an HttpOnly SameSite cookie and no password hash is ever returned', async () => {
    const c = client(s.base);
    const r = await c.post('/api/auth/login', { email: 'admin@example.com', password: PW });
    const cookie = r.headers.getSetCookie()[0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.ok(!JSON.stringify(r.json).includes('scrypt'));
  });

  await t.test('requests that change data need the CSRF header and a matching Origin', async () => {
    const noHeader = await fetch(s.base + '/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(noHeader.status, 403);
    const badOrigin = await fetch(s.base + '/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'bitwixt', Origin: 'https://evil.example' }, body: '{}' });
    assert.equal(badOrigin.status, 403);
  });

  await t.test('password change signs out other devices', async () => {
    const a = client(s.base), b = client(s.base);
    await a.post('/api/auth/login', { email: 'admin@example.com', password: PW });
    await b.post('/api/auth/login', { email: 'admin@example.com', password: PW });
    const bad = await a.post('/api/auth/password', { current: 'nope-nope-nope', next: 'another-long-password-2' });
    assert.equal(bad.status, 400);
    assert.equal((await a.post('/api/auth/password', { current: PW, next: 'another-long-password-2' })).status, 200);
    assert.equal((await b.get('/api/session')).json.user, null, 'the other device is signed out');
    assert.ok((await a.get('/api/session')).json.user, 'this device stays signed in');
    // put it back for later tests
    await a.post('/api/auth/password', { current: 'another-long-password-2', next: PW });
    // the admin's own session was (correctly) ended by the change, so sign in again for later tests
    await admin.c.post('/api/auth/login', { email: 'admin@example.com', password: PW });
  });

  await t.test('too many wrong passwords are blocked', async () => {
    const c = client(s.base);
    let last;
    for (let i = 0; i < 10; i++) last = await c.post('/api/auth/login', { email: 'brute@example.com', password: 'wrong-password-xx' });
    assert.equal(last.status, 429);
  });

  await t.test('a disabled person cannot sign in and is signed out immediately', async () => {
    const inv = await admin.c.post(`/api/workspaces/${admin.wid}/invites`, {});
    const c = client(s.base);
    const su = await c.post('/api/auth/signup', { code: inv.json.code, email: 'leaver@example.com', name: 'Leaver', password: PW, ack: true });
    const id = su.json.user.id;
    assert.equal((await admin.c.patch(`/api/admin/users/${id}`, { disabled: true })).status, 200);
    assert.equal((await c.get('/api/session')).json.user, null);
    assert.equal((await client(s.base).post('/api/auth/login', { email: 'leaver@example.com', password: PW })).status, 401);
    assert.equal((await admin.c.patch(`/api/admin/users/${admin.user.id}`, { disabled: true })).status, 400, 'cannot disable yourself');
  });

  await t.test('only the platform admin can use admin tools', async () => {
    const inv = await admin.c.post(`/api/workspaces/${admin.wid}/invites`, {});
    const c = client(s.base);
    await c.post('/api/auth/signup', { code: inv.json.code, email: 'plain@example.com', name: 'Plain', password: PW, ack: true });
    assert.equal((await c.get('/api/admin/users')).status, 403);
    assert.equal((await client(s.base).get('/api/admin/users')).status, 401);
  });
});

test('setup is refused when ADMIN_SETUP_CODE is missing or too short', async (t) => {
  const s = await startServer({ ADMIN_SETUP_CODE: 'short' });
  t.after(() => s.close());
  const r = await client(s.base).post('/api/auth/signup', { code: 'short', email: 'a@example.com', name: 'A', password: PW, ack: true });
  assert.equal(r.status, 503);
});
