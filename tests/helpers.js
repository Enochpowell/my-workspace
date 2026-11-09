'use strict';
/** Test helpers: start a throw-away server on a random port with an in-memory database. */
const { loadConfig } = require('../server/config');
const { createApp } = require('../server/app');

const SETUP_CODE = 'test-setup-code-1234567890';

async function startServer(overrides = {}) {
  const config = loadConfig({
    __skipDotEnv: true, DB_FILE: ':memory:', PORT: '0', HOST: '127.0.0.1', AUTO_BACKUP: 'false',
    ADMIN_SETUP_CODE: SETUP_CODE, NODE_ENV: 'test', RATE_MULTIPLIER: '100', ...overrides,
  });
  const app = createApp(config);
  const addr = await app.listen();
  return { app, base: `http://127.0.0.1:${addr.port}`, close: () => app.close() };
}

/** A tiny browser: keeps cookies between requests. */
function client(base) {
  let cookie = '';
  const api = {
    get cookie() { return cookie; },
    async req(method, path, body, headers = {}) {
      const res = await fetch(base + path, {
        method,
        headers: { 'X-Requested-With': 'bitwixt', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      for (const c of set) { const kv = c.split(';')[0]; if (/=$/.test(kv)) cookie = ''; else cookie = kv; }
      let json = null;
      try { json = await res.json(); } catch { /* not json */ }
      return { status: res.status, json, headers: res.headers };
    },
    get: (p) => api.req('GET', p),
    post: (p, b) => api.req('POST', p, b ?? {}),
    put: (p, b) => api.req('PUT', p, b),
    patch: (p, b) => api.req('PATCH', p, b),
    del: (p) => api.req('DELETE', p),
  };
  return api;
}

const PW = 'a-good-long-password-1';

/** Create the first admin and return { c: client, wid, user }. */
async function makeAdmin(base, email = 'admin@example.com', name = 'Ada Admin') {
  const c = client(base);
  const r = await c.post('/api/auth/signup', { code: SETUP_CODE, email, name, password: PW, ack: true });
  if (r.status !== 201) throw new Error('admin signup failed: ' + JSON.stringify(r.json));
  return { c, user: r.json.user, wid: r.json.workspaces[0].id };
}
/** Invite someone into a workspace and sign them up. */
async function makeMember(base, admin, email, name, role = 'member') {
  const inv = await admin.c.post(`/api/workspaces/${admin.wid}/invites`, { email, role });
  const c = client(base);
  const r = await c.post('/api/auth/signup', { code: inv.json.code, email, name, password: PW, ack: true });
  if (r.status !== 201) throw new Error('member signup failed: ' + JSON.stringify(r.json));
  return { c, user: r.json.user };
}

module.exports = { startServer, client, makeAdmin, makeMember, SETUP_CODE, PW };
