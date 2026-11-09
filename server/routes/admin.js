'use strict';
/**
 * Platform-admin tools (only the first account, or anyone you promote in the database).
 *
 *   GET    /api/admin/users              everyone with an account
 *   PATCH  /api/admin/users/:id          { disabled: true|false }  (blocks sign-in and signs the person out)
 *   GET    /api/admin/invites            "own workspace" invites
 *   POST   /api/admin/invites            { email? } make a code for a NEW person who gets their own workspace
 *   DELETE /api/admin/invites/:id
 *   GET    /api/admin/audit              recent security events
 *   PUT    /api/admin/ai-key/:provider   { key } save an AI API key (stored encrypted, never returned)
 *   DELETE /api/admin/ai-key/:provider   remove a saved key
 */
const { HttpError } = require('../http');
const A = require('../auth');
const { newId, sha256, newInviteCode, normaliseCode, now, DAY } = require('../util');
const Keys = require('../ai/keys');
const { PROVIDERS } = require('../ai');
const Custom = require('../ai/custom');

module.exports = function register(add, { config, db, hub }) {
  add('PUT', '/api/admin/ai-model/:provider', async (ctx) => {
    A.requirePlatformAdmin(ctx);
    const id = ctx.params.provider;
    if (!PROVIDERS[id]) throw new HttpError(404, 'That AI was not found.', 'not_found');
    const b = await ctx.body();
    if (b.model === '' || b.model === null) Custom.resetModel(db, config, id); else Custom.saveModel(db, config, id, b.model);
    A.audit(ctx, 'ai_model_changed', id);
    ctx.json(200, { ok: true, model: config.ai.providers[id].model });
  });

  add('PUT', '/api/admin/ai-provider', async (ctx) => {
    A.requirePlatformAdmin(ctx);
    const b = await ctx.body();
    const id = Custom.saveCustom(db, config, b);
    if (typeof b.key === 'string' && b.key.trim()) {
      const key = b.key.trim();
      if (key.length < 4 || key.length > 400 || /\s/.test(key)) throw new HttpError(400, 'That does not look like an API key. Paste it again, with no spaces.', 'bad_request');
      Keys.saveKey(db, config, id, key);
    }
    A.audit(ctx, 'ai_provider_saved', id);
    ctx.json(200, { ok: true, id });
  });

  add('DELETE', '/api/admin/ai-provider/:id', (ctx) => {
    A.requirePlatformAdmin(ctx);
    if (!String(ctx.params.id).startsWith('c_')) throw new HttpError(400, 'Only AIs you added yourself can be removed.', 'bad_request');
    Custom.removeCustom(db, config, ctx.params.id);
    A.audit(ctx, 'ai_provider_removed', ctx.params.id);
    ctx.json(200, { ok: true });
  });

  add('PUT', '/api/admin/ai-key/:provider', async (ctx) => {
    A.requirePlatformAdmin(ctx);
    const id = ctx.params.provider;
    if (!PROVIDERS[id] || PROVIDERS[id].local || id === 'ollama') throw new HttpError(400, 'That AI does not use an API key.', 'bad_request');
    const b = await ctx.body();
    const key = typeof b.key === 'string' ? b.key.trim() : '';
    if (key.length < 8 || key.length > 400 || /\s/.test(key)) throw new HttpError(400, 'That does not look like an API key. Paste it again, with no spaces.', 'bad_request');
    Keys.saveKey(db, config, id, key);
    A.audit(ctx, 'ai_key_saved', id);
    ctx.json(200, { ok: true });
  });

  add('DELETE', '/api/admin/ai-key/:provider', (ctx) => {
    A.requirePlatformAdmin(ctx);
    const id = ctx.params.provider;
    if (!PROVIDERS[id] || PROVIDERS[id].local || id === 'ollama') throw new HttpError(400, 'That AI does not use an API key.', 'bad_request');
    Keys.removeKey(db, config, id);
    A.audit(ctx, 'ai_key_removed', id);
    ctx.json(200, { ok: true });
  });

  add('GET', '/api/admin/users', (ctx) => {
    A.requirePlatformAdmin(ctx);
    const rows = db.all(
      `SELECT u.id, u.email, u.name, u.is_admin AS isAdmin, u.disabled, u.created_at AS createdAt, u.last_login AS lastLogin,
              (SELECT COUNT(*) FROM members m WHERE m.user_id = u.id) AS workspaces
         FROM users u ORDER BY u.created_at`);
    ctx.json(200, { users: rows.map((r) => ({ ...r, isAdmin: !!r.isAdmin, disabled: !!r.disabled })) });
  });

  add('PATCH', '/api/admin/users/:id', async (ctx) => {
    A.requirePlatformAdmin(ctx);
    const b = await ctx.body();
    if (typeof b.disabled !== 'boolean') throw new HttpError(400, 'Send { "disabled": true } or false.', 'bad_request');
    if (ctx.params.id === ctx.user.id) throw new HttpError(400, 'You cannot disable your own account.', 'bad_request');
    const target = db.get('SELECT id FROM users WHERE id = ?', ctx.params.id);
    if (!target) throw new HttpError(404, 'No such person.', 'not_found');
    db.tx(() => {
      db.run('UPDATE users SET disabled = ? WHERE id = ?', b.disabled ? 1 : 0, ctx.params.id);
      if (b.disabled) db.run('DELETE FROM sessions WHERE user_id = ?', ctx.params.id);
    });
    if (b.disabled) hub.kickEverywhere(ctx.params.id);
    A.audit(ctx, b.disabled ? 'user_disabled' : 'user_enabled', ctx.params.id);
    ctx.json(200, { ok: true });
  });

  add('GET', '/api/admin/invites', (ctx) => {
    A.requirePlatformAdmin(ctx);
    const rows = db.all(
      `SELECT i.id, i.email, i.created_at AS createdAt, i.expires_at AS expiresAt, i.used_at AS usedAt, u.name AS usedByName
         FROM invites i LEFT JOIN users u ON u.id = i.used_by WHERE i.kind = 'account' ORDER BY i.created_at DESC LIMIT 100`);
    ctx.json(200, { invites: rows });
  });

  add('POST', '/api/admin/invites', async (ctx) => {
    A.requirePlatformAdmin(ctx);
    const b = await ctx.body();
    const email = b.email ? A.cleanEmail(b.email) : null;
    const code = newInviteCode();
    const id = newId();
    const expiresAt = now() + config.inviteDays * DAY;
    db.run('INSERT INTO invites(id,code_hash,kind,workspace_id,role,email,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)',
      id, sha256(normaliseCode(code)), 'account', null, 'admin', email, ctx.user.id, now(), expiresAt);
    A.audit(ctx, 'account_invite_created');
    ctx.json(201, { id, code, email, expiresAt });
  });

  add('DELETE', '/api/admin/invites/:id', (ctx) => {
    A.requirePlatformAdmin(ctx);
    db.run("DELETE FROM invites WHERE id = ? AND kind = 'account'", ctx.params.id);
    ctx.json(200, { ok: true });
  });

  add('GET', '/api/admin/audit', (ctx) => {
    A.requirePlatformAdmin(ctx);
    const rows = db.all(
      `SELECT a.at, a.action, a.detail, u.name AS who FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 100`);
    ctx.json(200, { events: rows });
  });
};
