'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, makeAdmin, makeMember, PW } = require('./helpers');

test('workspaces, members and invites', async (t) => {
  const s = await startServer({ MAX_WORKSPACES_PER_USER: '2' });
  t.after(() => s.close());
  const admin = await makeAdmin(s.base);
  const sam = await makeMember(s.base, admin, 'sam@example.com', 'Sam');

  await t.test('members see names; only admins see emails', async () => {
    const a = (await admin.c.get(`/api/workspaces/${admin.wid}/members`)).json.members;
    assert.ok(a.every((m) => m.email));
    const m = (await sam.c.get(`/api/workspaces/${admin.wid}/members`)).json.members;
    assert.equal(m.find((x) => x.name === 'Ada Admin').email, undefined);
    assert.equal(m.find((x) => x.name === 'Sam').email, 'sam@example.com');
  });

  await t.test('outsiders cannot see a workspace, members cannot invite', async () => {
    const outsider = client(s.base);
    assert.equal((await outsider.get(`/api/workspaces/${admin.wid}/members`)).status, 401);
    const boss2 = await makeAdmin2(s);
    assert.equal((await boss2.c.get(`/api/workspaces/${admin.wid}/members`)).status, 403);
    assert.equal((await sam.c.post(`/api/workspaces/${admin.wid}/invites`, {})).status, 403);
    assert.equal((await sam.c.patch(`/api/workspaces/${admin.wid}`, { name: 'Hacked' })).status, 403);
  });

  await t.test('admins rename the workspace and manage roles; the last admin is protected', async () => {
    assert.equal((await admin.c.patch(`/api/workspaces/${admin.wid}`, { name: 'Bitwixt HQ' })).status, 200);
    assert.equal((await admin.c.patch(`/api/workspaces/${admin.wid}/members/${admin.user.id}`, { role: 'member' })).status, 400);
    assert.equal((await admin.c.del(`/api/workspaces/${admin.wid}/members/${admin.user.id}`)).status, 400);
    assert.equal((await admin.c.patch(`/api/workspaces/${admin.wid}/members/${sam.user.id}`, { role: 'admin' })).status, 200);
    assert.equal((await admin.c.patch(`/api/workspaces/${admin.wid}/members/${sam.user.id}`, { role: 'member' })).status, 200);
  });

  await t.test('workspace creation is limited, and people can create their own', async () => {
    assert.equal((await sam.c.post('/api/workspaces', { name: 'Sam’s own' })).status, 201);
    assert.equal((await sam.c.post('/api/workspaces', { name: 'Second' })).status, 201);
    assert.equal((await sam.c.post('/api/workspaces', { name: 'Third' })).status, 403);
    assert.equal((await sam.c.get('/api/session')).json.workspaces.length, 3);
  });

  await t.test('removing a member cuts off access straight away', async () => {
    const tom = await makeMember(s.base, admin, 'tom@example.com', 'Tom');
    assert.equal((await tom.c.get(`/api/ws/${admin.wid}/doc?path=blobs/x`)).status, 200);
    assert.equal((await admin.c.del(`/api/workspaces/${admin.wid}/members/${tom.user.id}`)).status, 200);
    assert.equal((await tom.c.get(`/api/ws/${admin.wid}/doc?path=blobs/x`)).status, 403);
  });

  await t.test('an invite for an existing person can be accepted while signed in', async () => {
    const other = await makeAdmin2(s, 'other@example.com');
    const inv = await admin.c.post(`/api/workspaces/${admin.wid}/invites`, { email: 'other@example.com' });
    assert.equal((await other.c.post('/api/invites/accept', { code: inv.json.code })).status, 200);
    assert.equal((await other.c.get(`/api/workspaces/${admin.wid}/members`)).status, 200);
    assert.equal((await other.c.post('/api/invites/accept', { code: inv.json.code })).status, 400, 'single use');
  });

  await t.test('the platform admin invites a brand-new person who gets their OWN workspace', async () => {
    const inv = await admin.c.post('/api/admin/invites', { email: 'newbie@example.com' });
    assert.equal(inv.status, 201);
    const c = client(s.base);
    const r = await c.post('/api/auth/signup', { code: inv.json.code, email: 'newbie@example.com', name: 'Newbie', password: PW, ack: true });
    assert.equal(r.status, 201);
    assert.equal(r.json.workspaces.length, 1);
    assert.equal(r.json.workspaces[0].role, 'admin');
    assert.notEqual(r.json.workspaces[0].id, admin.wid, 'not inside the admin’s workspace');
    assert.equal((await c.get(`/api/workspaces/${admin.wid}/members`)).status, 403);
  });

  await t.test('expired invites do not work', async () => {
    const inv = await admin.c.post(`/api/workspaces/${admin.wid}/invites`, {});
    s.app.db.run('UPDATE invites SET expires_at = 1 WHERE id = ?', inv.json.id);
    const r = await client(s.base).post('/api/auth/signup', { code: inv.json.code, email: 'late@example.com', name: 'Late', password: PW, ack: true });
    assert.equal(r.json.code, 'bad_code');
  });
});

/** A second person with their OWN workspace, created through a platform "account" invite. */
async function makeAdmin2(s, email = 'boss2@example.com') {
  const root = client(s.base);
  await root.post('/api/auth/login', { email: 'admin@example.com', password: PW });
  const inv = await root.post('/api/admin/invites', { email });
  const c = client(s.base);
  const r = await c.post('/api/auth/signup', { code: inv.json.code, email, name: 'Boss Two', password: PW, ack: true });
  return { c, user: r.json.user, wid: r.json.workspaces[0].id };
}
