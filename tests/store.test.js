'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, client, makeAdmin, makeMember } = require('./helpers');

const doc = (wid, p) => `/api/ws/${wid}/doc?path=${encodeURIComponent(p)}`;
const col = (wid, p, q = '') => `/api/ws/${wid}/col?path=${encodeURIComponent(p)}${q}`;
const msg = (by, text) => ({ data: { by, text, at: Date.now() } });

test('workspace data store and chat privacy', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  const admin = await makeAdmin(s.base);
  const sam = await makeMember(s.base, admin, 'sam@example.com', 'Sam');
  const kim = await makeMember(s.base, admin, 'kim@example.com', 'Kim');
  const W = admin.wid;
  const dmId = (a, b) => 'dm_' + [a, b].sort().join('.');

  await t.test('documents: write, read, merge, delete', async () => {
    assert.equal((await admin.c.put(doc(W, 'blobs/ws-quotes_0'), { data: { s: '[]' } })).status, 200);
    assert.deepEqual((await sam.c.get(doc(W, 'blobs/ws-quotes_0'))).json, { exists: true, data: { s: '[]' } });
    assert.equal((await sam.c.patch(doc(W, 'blobs/ws-quotes_0'), { data: { n: 1 } })).status, 200);
    assert.deepEqual((await sam.c.get(doc(W, 'blobs/ws-quotes_0'))).json.data, { s: '[]', n: 1 });
    assert.equal((await sam.c.patch(doc(W, 'blobs/missing'), { data: { a: 1 } })).status, 404);
    assert.equal((await sam.c.del(doc(W, 'blobs/ws-quotes_0'))).status, 200);
    assert.equal((await sam.c.get(doc(W, 'blobs/ws-quotes_0'))).json.exists, false);
  });

  await t.test('strangers and signed-out visitors get nothing', async () => {
    const stranger = client(s.base);
    assert.equal((await stranger.get(doc(W, 'blobs/a'))).status, 401);
    const other = await makeAdminElsewhere(s);
    assert.equal((await other.get(doc(W, 'blobs/a'))).status, 403);
    assert.equal((await other.put(doc(W, 'blobs/a'), { data: { x: 1 } })).status, 403);
  });

  await t.test('data from one workspace is invisible in another', async () => {
    const other = await makeAdminElsewhere(s);
    const sess = (await other.get('/api/session')).json;
    const ow = sess.workspaces[0].id;
    await other.put(doc(ow, 'blobs/secret'), { data: { v: 'theirs' } });
    await admin.c.put(doc(W, 'blobs/secret'), { data: { v: 'ours' } });
    assert.equal((await other.get(doc(ow, 'blobs/secret'))).json.data.v, 'theirs');
    assert.equal((await admin.c.get(doc(W, 'blobs/secret'))).json.data.v, 'ours');
    assert.equal((await admin.c.get(doc(ow, 'blobs/secret'))).status, 403);
  });

  await t.test('only known collections are allowed, paths are validated, size is limited', async () => {
    assert.equal((await admin.c.put(doc(W, 'users/x'), { data: { a: 1 } })).status, 403);
    assert.equal((await admin.c.get(doc(W, '../etc/passwd'))).status, 400);
    assert.equal((await admin.c.get(doc(W, 'blobs'))).status, 400, 'a collection path is not a document');
    assert.equal((await admin.c.put(doc(W, 'blobs/big'), { data: { s: 'x'.repeat(1_000_000) } })).status, 413);
    assert.equal((await admin.c.put(doc(W, 'blobs/arr'), { data: [1, 2] })).status, 400);
  });

  await t.test('collections: ordering and limits', async () => {
    for (const n of [3, 1, 2]) await admin.c.put(doc(W, `comments/c1/msgs/m${n}`), msg(admin.user.id, 'hi ' + n).data ? { data: { by: admin.user.id, text: 'hi ' + n, at: n } } : null);
    const r = await sam.c.get(col(W, 'comments/c1/msgs', '&order=at:desc&limit=2'));
    assert.deepEqual(r.json.docs.map((d) => d.data.at), [3, 2]);
    assert.equal((await sam.c.get(col(W, 'comments/c1/msgs', '&order=bad field'))).status, 400);
  });

  await t.test('chat: messages must be sent as yourself and cannot be edited', async () => {
    assert.equal((await sam.c.put(doc(W, 'channels/general'), { data: { name: 'General', kind: 'group', members: null, at: 1, lastAt: 0 } })).status, 200);
    assert.equal((await sam.c.post(col(W, 'channels/general/msgs').replace('/col', '/col'), msg(admin.user.id, 'spoof'))).status, 403);
    const ok = await sam.c.post(col(W, 'channels/general/msgs'), msg(sam.user.id, 'hello'));
    assert.equal(ok.status, 201);
    const id = ok.json.id;
    assert.equal((await sam.c.patch(doc(W, `channels/general/msgs/${id}`), { data: { text: 'edited' } })).status, 403);
    assert.equal((await kim.c.del(doc(W, `channels/general/msgs/${id}`))).status, 403, 'other members cannot delete it');
    assert.equal((await admin.c.del(doc(W, `channels/general/msgs/${id}`))).status, 200, 'an admin can');
    assert.equal((await sam.c.post(col(W, 'channels/general/msgs'), { data: { by: sam.user.id, text: '', at: 1 } })).status, 400);
  });

  await t.test('direct messages are private, even from workspace admins', async () => {
    const id = dmId(sam.user.id, kim.user.id);
    assert.equal((await sam.c.put(doc(W, `channels/${id}`), { data: { kind: 'dm', members: [sam.user.id, kim.user.id], at: 1, lastAt: 1, lastBy: sam.user.id } })).status, 200);
    assert.equal((await sam.c.post(col(W, `channels/${id}/msgs`), msg(sam.user.id, 'psst'))).status, 201);
    assert.equal((await kim.c.get(col(W, `channels/${id}/msgs`))).json.docs.length, 1);
    assert.equal((await admin.c.get(col(W, `channels/${id}/msgs`))).status, 403, 'the admin cannot read it');
    assert.equal((await admin.c.get(doc(W, `channels/${id}`))).status, 403);
    assert.equal((await admin.c.post(col(W, `channels/${id}/msgs`), msg(admin.user.id, 'let me in'))).status, 403);
    const list = (await admin.c.get(col(W, 'channels'))).json.docs.map((d) => d.id);
    assert.ok(!list.includes(id), 'the admin does not even see that it exists');
    assert.ok((await kim.c.get(col(W, 'channels'))).json.docs.some((d) => d.id === id));
  });

  await t.test('nobody can forge a direct message between two other people', async () => {
    const id = dmId(sam.user.id, kim.user.id);
    const fake = dmId(admin.user.id, kim.user.id);
    assert.equal((await sam.c.put(doc(W, `channels/${fake}`), { data: { kind: 'dm', members: [admin.user.id, kim.user.id], at: 1 } })).status, 403);
    assert.equal((await sam.c.put(doc(W, 'channels/dm_x.y'), { data: { kind: 'dm', members: ['x', 'y'], at: 1 } })).status, 403);
    void id;
  });

  await t.test('private groups: only listed members (and admins) can read', async () => {
    assert.equal((await sam.c.put(doc(W, 'channels/team1'), { data: { name: 'Design', kind: 'group', members: [sam.user.id], by: sam.user.id, at: 1, lastAt: 0 } })).status, 200);
    assert.equal((await sam.c.post(col(W, 'channels/team1/msgs'), msg(sam.user.id, 'secret plans'))).status, 201);
    assert.equal((await kim.c.get(col(W, 'channels/team1/msgs'))).status, 403);
    assert.equal((await admin.c.get(col(W, 'channels/team1/msgs'))).status, 200);
    assert.equal((await kim.c.put(doc(W, 'channels/team1'), { data: { name: 'Mine now', kind: 'group', members: null, by: kim.user.id, at: 1 } })).status, 403);
    assert.equal((await kim.c.del(doc(W, 'channels/team1'))).status, 403);
    assert.equal((await sam.c.patch(doc(W, 'channels/team1'), { data: { name: 'Design team' } })).status, 200);
    assert.equal((await sam.c.del(doc(W, 'channels/team1'))).status, 200);
  });

  await t.test('live updates: a member is told when something changes, and strangers are not', async () => {
    // Use a raw SSE connection with Sam's cookie.
    const jar = await rawLogin(s.base, 'sam@example.com');
    const events = [];
    const req = http.get(`${s.base}/api/events?ws=${W}`, { headers: { Cookie: jar } }, (res) => {
      res.on('data', (d) => events.push(d.toString()));
    });
    await new Promise((r) => setTimeout(r, 150));
    await admin.c.put(doc(W, 'blobs/live'), { data: { a: 1 } });
    await new Promise((r) => setTimeout(r, 200));
    req.destroy();
    assert.ok(events.join('').includes('"p":"blobs/live"'), 'Sam received the change signal');
    const outsider = await new Promise((resolve) => http.get(`${s.base}/api/events?ws=${W}`, (res) => resolve(res.statusCode)));
    assert.equal(outsider, 401);
  });
});

const elsewhere = new Map();
async function makeAdminElsewhere(s) {
  if (elsewhere.has(s.base)) return elsewhere.get(s.base);
  const root = client(s.base);
  await root.post('/api/auth/login', { email: 'admin@example.com', password: require('./helpers').PW });
  const inv = await root.post('/api/admin/invites', { email: 'elsewhere@example.com' });
  const c = client(s.base);
  await c.post('/api/auth/signup', { code: inv.json.code, email: 'elsewhere@example.com', name: 'Elsewhere', password: require('./helpers').PW, ack: true });
  elsewhere.set(s.base, c);
  return c;
}
async function rawLogin(base, email) {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'bitwixt' }, body: JSON.stringify({ email, password: require('./helpers').PW }) });
  return res.headers.getSetCookie()[0].split(';')[0];
}
