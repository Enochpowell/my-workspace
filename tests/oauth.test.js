'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, makeAdmin, SETUP_CODE } = require('./helpers');

/** A pretend Google and GitHub. `who` is the person who "signs in" at the provider. */
function provider() {
  const who = { email: 'new.person@example.com', verified: true, name: 'New Person' };
  const srv = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      const json = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/token') return json({ access_token: 'tok-123' });
      if (req.url === '/google/userinfo') return json({ email: who.email, email_verified: who.verified, name: who.name });
      if (req.url === '/github/user') return json({ login: 'newperson', name: who.name });
      if (req.url === '/github/emails') return json([{ email: who.email, primary: true, verified: who.verified }]);
      json({}, 404);
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, who, base: `http://127.0.0.1:${srv.address().port}` })));
}

/** Walk the redirect dance by hand, like a browser would. */
async function dance(base, which, query = '') {
  const start = await fetch(`${base}/api/auth/oauth/${which}/start${query}`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  const loc = new URL(start.headers.get('location'), base);
  const cookie = (start.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
  const cb = await fetch(`${base}/api/auth/oauth/${which}/callback?code=abc&state=${encodeURIComponent(loc.searchParams.get('state') || '')}`, { redirect: 'manual', headers: { Cookie: cookie } });
  const session = (cb.headers.getSetCookie() || []).map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
  return { loc, cb, session, to: cb.headers.get('location') };
}
const whoami = async (base, cookie) => (await fetch(`${base}/api/session`, { headers: { Cookie: cookie } })).json();

test('sign in and sign up with Google and GitHub', async (t) => {
  const prov = await provider();
  t.after(() => prov.srv.close());
  const env = {
    GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', GOOGLE_AUTH_URL: prov.base + '/google/auth', GOOGLE_TOKEN_URL: prov.base + '/token', GOOGLE_USER_URL: prov.base + '/google/userinfo',
    GITHUB_CLIENT_ID: 'hid', GITHUB_CLIENT_SECRET: 'hsecret', GITHUB_AUTH_URL: prov.base + '/github/auth', GITHUB_TOKEN_URL: prov.base + '/token', GITHUB_USER_URL: prov.base + '/github/user', GITHUB_EMAILS_URL: prov.base + '/github/emails',
  };
  const s = await startServer(env);
  t.after(() => s.close());
  const admin = await makeAdmin(s.base);

  await t.test('the buttons are reported ready, and the redirect carries the right details', async () => {
    const r = await (await fetch(`${s.base}/api/auth/oauth/providers`)).json();
    assert.deepEqual(r, { google: true, github: true });
    const d = await dance(s.base, 'google');
    assert.equal(d.loc.origin + d.loc.pathname, prov.base + '/google/auth');
    assert.equal(d.loc.searchParams.get('client_id'), 'gid');
    assert.equal(d.loc.searchParams.get('redirect_uri'), `${s.base}/api/auth/oauth/google/callback`);
    assert.ok(!d.loc.toString().includes('gsecret'));
  });

  await t.test('an existing person can sign in with Google', async () => {
    prov.who.email = 'admin@example.com'; prov.who.name = 'Ada Admin';
    const d = await dance(s.base, 'google');
    assert.equal(d.to, '/');
    const me = await whoami(s.base, d.session);
    assert.equal(me.user.email, 'admin@example.com');
  });

  await t.test('a stranger cannot get in without an invite', async () => {
    prov.who.email = 'stranger@example.com';
    const d = await dance(s.base, 'google', '?mode=signup');
    assert.equal(d.to, '/?oauth=no_account');
    const me = await whoami(s.base, d.session || 'x=y');
    assert.equal(me.user, null);
  });

  await t.test('with a valid invite code, GitHub creates the account', async () => {
    prov.who.email = 'new.person@example.com';
    const inv = await admin.c.post(`/api/workspaces/${admin.wid}/invites`, { email: 'new.person@example.com', role: 'member' });
    const d = await dance(s.base, 'github', `?mode=signup&code=${encodeURIComponent(inv.json.code)}`);
    assert.equal(d.to, '/');
    const me = await whoami(s.base, d.session);
    assert.equal(me.user.email, 'new.person@example.com');
    assert.equal(me.workspaces[0].id, admin.wid);
    const again = await dance(s.base, 'github');
    assert.equal(again.to, '/');
  });

  await t.test('an invite for another email is refused', async () => {
    prov.who.email = 'someone.else@example.com';
    const inv = await admin.c.post(`/api/workspaces/${admin.wid}/invites`, { email: 'meant.for.other@example.com', role: 'member' });
    const d = await dance(s.base, 'google', `?mode=signup&code=${encodeURIComponent(inv.json.code)}`);
    assert.match(d.to, /oauth=wrong_email/);
  });

  await t.test('an unverified email, a wrong state and a cancelled sign-in all go back with a reason', async () => {
    prov.who.email = 'admin@example.com'; prov.who.verified = false;
    assert.equal((await dance(s.base, 'google')).to, '/?oauth=email_unverified');
    prov.who.verified = true;
    const cb = await fetch(`${s.base}/api/auth/oauth/google/callback?code=abc&state=forged`, { redirect: 'manual' });
    assert.equal(cb.headers.get('location'), '/?oauth=bad_state');
    const start = await fetch(`${s.base}/api/auth/oauth/google/start`, { redirect: 'manual' });
    const st = new URL(start.headers.get('location')).searchParams.get('state');
    const cookie = start.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const cancelled = await fetch(`${s.base}/api/auth/oauth/google/callback?error=access_denied&state=${st}`, { redirect: 'manual', headers: { Cookie: cookie } });
    assert.equal(cancelled.headers.get('location'), '/?oauth=cancelled');
  });

  await t.test('a disabled account cannot sign in', async () => {
    prov.who.email = 'new.person@example.com';
    const users = await admin.c.get('/api/admin/users');
    const u = users.json.users.find((x) => x.email === 'new.person@example.com');
    assert.equal((await admin.c.patch(`/api/admin/users/${u.id}`, { disabled: true })).status, 200);
    assert.equal((await dance(s.base, 'github')).to, '/?oauth=disabled');
  });
});

test('without credentials the buttons say not ready', async (t) => {
  const s = await startServer({});
  t.after(() => s.close());
  assert.deepEqual(await (await fetch(`${s.base}/api/auth/oauth/providers`)).json(), { google: false, github: false });
  const r = await fetch(`${s.base}/api/auth/oauth/google/start`, { redirect: 'manual' });
  assert.equal(r.headers.get('location'), '/?oauth=not_ready');
});
