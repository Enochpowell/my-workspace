'use strict';
/**
 * Passwords, sessions and permission checks.
 *
 * - Passwords are hashed with scrypt (built into Node) with a random salt.
 * - Session tokens are random 256-bit values. Only their SHA-256 hash is stored.
 * - The cookie is HttpOnly (scripts cannot read it) and SameSite=Lax.
 */
const crypto = require('node:crypto');
const { HttpError, parseCookies, serializeCookie } = require('./http');
const { newId, sha256, now, DAY } = require('./util');

const COOKIE = 'hub_sid';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/* ---------------------------------------------------------------- passwords */
function scrypt(password, salt, o) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, o.keylen, { N: o.N, r: o.r, p: o.p, maxmem: 128 * o.N * o.r * 2 }, (e, k) => (e ? reject(e) : resolve(k))));
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}
async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const o = { N: +parts[1], r: +parts[2], p: +parts[3], keylen: Buffer.from(parts[5], 'base64').length };
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(parts[4], 'base64'), o);
  return crypto.timingSafeEqual(key, Buffer.from(parts[5], 'base64'));
}
/** A real-looking hash used to make "unknown email" take as long as "wrong password". */
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

/* ------------------------------------------------------------- validation */
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const COMMON = new Set(['password123', '1234567890', 'qwertyuiop', 'password1234', 'iloveyou123', 'letmein1234', 'welcome1234', 'admin12345', 'changeme123']);

function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 254) throw new HttpError(400, 'Please enter a valid email address.', 'bad_email');
  return e;
}
function cleanName(v) {
  const n = String(v || '').replace(/\s+/g, ' ').trim();
  if (n.length < 1 || n.length > 40) throw new HttpError(400, 'Please enter your name (up to 40 characters).', 'bad_name');
  return n;
}
function checkPassword(pw, email) {
  const p = String(pw || '');
  if (p.length < 10) throw new HttpError(400, 'Use a password of at least 10 characters.', 'weak_password');
  if (p.length > 128) throw new HttpError(400, 'That password is too long (128 characters at most).', 'weak_password');
  if (COMMON.has(p.toLowerCase()) || (email && p.toLowerCase() === String(email).toLowerCase())) {
    throw new HttpError(400, 'That password is too easy to guess. Pick something less common.', 'weak_password');
  }
  return p;
}

/* ---------------------------------------------------------------- sessions */
function createSession(ctx, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = now();
  const expires = t + ctx.config.sessionDays * DAY;
  ctx.db.run('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,user_agent) VALUES (?,?,?,?,?)',
    sha256(token), userId, t, expires, String(ctx.req.headers['user-agent'] || '').slice(0, 200));
  ctx.setCookie(serializeCookie(COOKIE, token, { maxAgeSec: ctx.config.sessionDays * DAY / 1000, secure: ctx.secure }));
}
function destroySession(ctx) {
  const token = parseCookies(ctx.req.headers.cookie)[COOKIE];
  if (token) ctx.db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  ctx.setCookie(serializeCookie(COOKIE, '', { maxAgeSec: 0, secure: ctx.secure }));
}
/** Find the signed-in user for a request (or null). Extends sessions that are over half used. */
function currentUser(ctx) {
  const token = parseCookies(ctx.req.headers.cookie)[COOKIE];
  if (!token) return null;
  const hash = sha256(token);
  const row = ctx.db.get(
    `SELECT u.id, u.email, u.name, u.avatar, u.is_admin AS isAdmin, s.expires_at AS expiresAt
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`, hash, now());
  if (!row) return null;
  const life = ctx.config.sessionDays * DAY;
  if (row.expiresAt - now() < life / 2) ctx.db.run('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', now() + life, hash);
  return { id: row.id, email: row.email, name: row.name, avatar: row.avatar, isAdmin: !!row.isAdmin };
}

/* ------------------------------------------------------------ permissions */
function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Please sign in.', 'unauthenticated');
  return ctx.user;
}
/** Returns the person's role in the workspace ("admin" | "member") or throws 403. */
function requireMember(ctx, workspaceId) {
  requireUser(ctx);
  const m = ctx.db.get('SELECT role FROM members WHERE workspace_id = ? AND user_id = ?', workspaceId, ctx.user.id);
  if (!m) throw new HttpError(403, 'You are not a member of this workspace.', 'forbidden');
  return m.role;
}
function requireWorkspaceAdmin(ctx, workspaceId) {
  if (requireMember(ctx, workspaceId) !== 'admin') throw new HttpError(403, 'Only a workspace admin can do that.', 'forbidden');
}
function requirePlatformAdmin(ctx) {
  requireUser(ctx);
  if (!ctx.user.isAdmin) throw new HttpError(403, 'Only the platform admin can do that.', 'forbidden');
}

function audit(ctx, action, detail) {
  try { ctx.db.run('INSERT INTO audit_log(at,user_id,action,detail) VALUES (?,?,?,?)', now(), ctx.user ? ctx.user.id : null, action, detail ? String(detail).slice(0, 300) : null); } catch { /* auditing must never break a request */ }
}

module.exports = {
  COOKIE, hashPassword, verifyPassword, DUMMY_HASH, cleanEmail, cleanName, checkPassword,
  createSession, destroySession, currentUser,
  requireUser, requireMember, requireWorkspaceAdmin, requirePlatformAdmin, audit, newId,
};
