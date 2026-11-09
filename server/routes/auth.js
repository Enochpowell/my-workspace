'use strict';
/**
 * Accounts: sign up (invite only), sign in/out, your profile, password change.
 *
 *   GET   /api/session          who am I? (also says whether first-time setup is needed)
 *   POST  /api/auth/signup      create an account with an invite code (or the one-time setup code)
 *   POST  /api/auth/login
 *   POST  /api/auth/logout
 *   POST  /api/auth/password    change password (signs out other devices)
 *   PATCH /api/me               change your name or photo
 *   POST  /api/invites/accept   join another workspace with a code (when already signed in)
 */
const { HttpError, parseCookies } = require('../http');
const A = require('../auth');
const { newId, sha256, safeEqual, normaliseCode, now } = require('../util');
const { createAccount } = require('../accounts');

const AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Workspaces a person belongs to: [{ id, name, role }]. */
function workspacesOf(db, userId) {
  return db.all(
    `SELECT w.id, w.name, m.role FROM members m JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = ? ORDER BY m.joined_at`, userId);
}
function publicUser(u) { return { id: u.id, email: u.email, name: u.name, avatar: u.avatar, isAdmin: !!u.isAdmin }; }

function createWorkspace(db, name, userId) {
  const id = newId();
  db.run('INSERT INTO workspaces(id,name,created_by,created_at) VALUES (?,?,?,?)', id, name, userId, now());
  db.run('INSERT INTO members(workspace_id,user_id,role,joined_at) VALUES (?,?,?,?)', id, userId, 'admin', now());
  return id;
}

module.exports = function register(add, { config, db, limiters }) {
  add('GET', '/api/session', (ctx) => {
    const setupRequired = db.get('SELECT COUNT(*) AS n FROM users').n === 0;
    if (!ctx.user) return ctx.json(200, { user: null, setupRequired, setupCodeConfigured: config.adminSetupCode.length >= 16 });
    ctx.json(200, { user: publicUser(ctx.user), workspaces: workspacesOf(db, ctx.user.id), setupRequired: false });
  });

  add('POST', '/api/auth/signup', async (ctx) => {
    const lim = limiters.signup.hit(ctx.ip);
    if (!lim.ok) throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(lim.retryAfterSec / 60)} minutes.`, 'rate_limited');
    const b = await ctx.body();
    const email = A.cleanEmail(b.email);
    const name = A.cleanName(b.name);
    const password = A.checkPassword(b.password, email);
    if (b.ack !== true) throw new HttpError(400, 'Please confirm that you have read the security guidance.', 'ack_required');
    const code = normaliseCode(b.code);
    if (!code) throw new HttpError(400, 'Enter your invite code.', 'code_required');
    const passwordHash = await A.hashPassword(password);

    const created = createAccount({ db, config }, { email, name, passwordHash, code });

    ctx.user = { id: created.userId };
    A.audit(ctx, 'signup', created.how);
    A.createSession(ctx, created.userId);
    const u = db.get('SELECT id,email,name,avatar,is_admin AS isAdmin FROM users WHERE id = ?', created.userId);
    ctx.json(201, { user: publicUser(u), workspaces: workspacesOf(db, u.id) });
  });

  add('POST', '/api/auth/login', async (ctx) => {
    const b = await ctx.body();
    const email = String(b.email || '').trim().toLowerCase().slice(0, 254);
    const password = String(b.password || '').slice(0, 200);
    const key = `${ctx.ip}|${email}`;
    const l1 = limiters.login.hit(key);
    const l2 = limiters.loginIp.hit(ctx.ip);
    if (!l1.ok || !l2.ok) {
      throw new HttpError(429, `Too many sign-in attempts. Try again in ${Math.ceil(Math.max(l1.retryAfterSec, l2.retryAfterSec) / 60)} minutes.`, 'rate_limited');
    }
    const user = db.get('SELECT * FROM users WHERE email = ?', email);
    const ok = await A.verifyPassword(password, user ? user.password_hash : A.DUMMY_HASH);
    if (!user || !ok || user.disabled) {
      A.audit(ctx, 'login_failed', email);
      throw new HttpError(401, 'Incorrect email or password.', 'bad_login');
    }
    limiters.login.reset(key);
    db.run('UPDATE users SET last_login = ? WHERE id = ?', now(), user.id);
    ctx.user = { id: user.id };
    A.audit(ctx, 'login');
    A.createSession(ctx, user.id);
    ctx.json(200, { user: publicUser({ ...user, isAdmin: user.is_admin }), workspaces: workspacesOf(db, user.id) });
  });

  add('POST', '/api/auth/logout', (ctx) => {
    A.destroySession(ctx);
    ctx.json(200, { ok: true });
  });

  add('POST', '/api/auth/password', async (ctx) => {
    A.requireUser(ctx);
    const b = await ctx.body();
    const row = db.get('SELECT password_hash FROM users WHERE id = ?', ctx.user.id);
    if (!(await A.verifyPassword(String(b.current || ''), row.password_hash))) throw new HttpError(400, 'Your current password is not correct.', 'bad_password');
    const next = A.checkPassword(b.next, ctx.user.email);
    const hash = await A.hashPassword(next);
    const keep = sha256(parseCookies(ctx.req.headers.cookie)[A.COOKIE] || '');
    db.tx(() => {
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, ctx.user.id);
      db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', ctx.user.id, keep);
    });
    A.audit(ctx, 'password_changed');
    ctx.json(200, { ok: true });
  });

  add('PATCH', '/api/me', async (ctx) => {
    A.requireUser(ctx);
    const b = await ctx.body();
    if (b.name !== undefined) db.run('UPDATE users SET name = ? WHERE id = ?', A.cleanName(b.name), ctx.user.id);
    if (b.avatar !== undefined) {
      const av = String(b.avatar);
      if (av !== '' && (av.length > 80_000 || !AVATAR_RE.test(av))) throw new HttpError(400, 'That photo is not valid or is too large.', 'bad_avatar');
      db.run('UPDATE users SET avatar = ? WHERE id = ?', av, ctx.user.id);
    }
    const u = db.get('SELECT id,email,name,avatar,is_admin AS isAdmin FROM users WHERE id = ?', ctx.user.id);
    ctx.json(200, { user: publicUser(u) });
  });

  add('POST', '/api/invites/accept', async (ctx) => {
    A.requireUser(ctx);
    const lim = limiters.signup.hit(ctx.ip);
    if (!lim.ok) throw new HttpError(429, 'Too many attempts. Try again later.', 'rate_limited');
    const code = normaliseCode((await ctx.body()).code);
    const inv = code && db.get('SELECT * FROM invites WHERE code_hash = ?', sha256(code));
    if (!inv || inv.used_at || inv.expires_at < now() || inv.kind !== 'workspace') throw new HttpError(400, 'That invite code is not valid, has expired, or was already used.', 'bad_code');
    if (inv.email && inv.email.toLowerCase() !== ctx.user.email.toLowerCase()) throw new HttpError(400, 'This invite was made for a different email address.', 'wrong_email');
    db.tx(() => {
      db.run('INSERT OR IGNORE INTO members(workspace_id,user_id,role,joined_at) VALUES (?,?,?,?)', inv.workspace_id, ctx.user.id, inv.role, now());
      db.run('UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?', ctx.user.id, now(), inv.id);
    });
    A.audit(ctx, 'invite_accepted', inv.workspace_id);
    ctx.json(200, { workspaces: workspacesOf(db, ctx.user.id) });
  });
};

module.exports.workspacesOf = workspacesOf;
module.exports.createWorkspace = createWorkspace;
