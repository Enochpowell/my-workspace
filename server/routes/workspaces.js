'use strict';
/**
 * Workspaces, their members and their invites.
 *
 *   POST   /api/workspaces                         create a workspace (you become its admin)
 *   PATCH  /api/workspaces/:id                     rename (admin)
 *   GET    /api/workspaces/:id/members             who is in it
 *   PATCH  /api/workspaces/:id/members/:uid        change someone's role (admin)
 *   DELETE /api/workspaces/:id/members/:uid        remove someone (admin) or leave (yourself)
 *   GET    /api/workspaces/:id/invites             pending and used invites (admin)
 *   POST   /api/workspaces/:id/invites             create an invite code (admin)
 *   DELETE /api/workspaces/:id/invites/:iid        cancel an invite (admin)
 */
const { HttpError } = require('../http');
const A = require('../auth');
const { newId, sha256, newInviteCode, normaliseCode, now, DAY } = require('../util');
const { createWorkspace } = require('./auth');

const cleanWsName = (v) => {
  const n = String(v || '').replace(/\s+/g, ' ').trim();
  if (n.length < 1 || n.length > 50) throw new HttpError(400, 'Give the workspace a name (up to 50 characters).', 'bad_name');
  return n;
};
const adminCount = (db, wid) => db.get("SELECT COUNT(*) AS n FROM members WHERE workspace_id = ? AND role = 'admin'", wid).n;

module.exports = function register(add, { config, db, hub }) {
  add('POST', '/api/workspaces', async (ctx) => {
    A.requireUser(ctx);
    const name = cleanWsName((await ctx.body()).name);
    const owned = db.get('SELECT COUNT(*) AS n FROM workspaces WHERE created_by = ?', ctx.user.id).n;
    if (owned >= config.maxWorkspacesPerUser) throw new HttpError(403, `You can create up to ${config.maxWorkspacesPerUser} workspaces.`, 'limit');
    const id = db.tx(() => createWorkspace(db, name, ctx.user.id));
    A.audit(ctx, 'workspace_created', id);
    ctx.json(201, { id, name, role: 'admin' });
  });

  add('PATCH', '/api/workspaces/:id', async (ctx) => {
    A.requireWorkspaceAdmin(ctx, ctx.params.id);
    const name = cleanWsName((await ctx.body()).name);
    db.run('UPDATE workspaces SET name = ? WHERE id = ?', name, ctx.params.id);
    ctx.json(200, { id: ctx.params.id, name });
  });

  add('GET', '/api/workspaces/:id/members', (ctx) => {
    const role = A.requireMember(ctx, ctx.params.id);
    const rows = db.all(
      `SELECT u.id, u.name, u.avatar, u.email, m.role, m.joined_at AS joinedAt
         FROM members m JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = ? AND u.disabled = 0 ORDER BY m.joined_at`, ctx.params.id);
    // Email addresses are private: only workspace admins see them (and you see your own).
    ctx.json(200, { members: rows.map((r) => ({ id: r.id, name: r.name, avatar: r.avatar, role: r.role, joinedAt: r.joinedAt, email: role === 'admin' || r.id === ctx.user.id ? r.email : undefined })) });
  });

  add('PATCH', '/api/workspaces/:id/members/:uid', async (ctx) => {
    A.requireWorkspaceAdmin(ctx, ctx.params.id);
    const role = (await ctx.body()).role;
    if (role !== 'admin' && role !== 'member') throw new HttpError(400, 'Role must be admin or member.', 'bad_role');
    const target = db.get('SELECT role FROM members WHERE workspace_id = ? AND user_id = ?', ctx.params.id, ctx.params.uid);
    if (!target) throw new HttpError(404, 'That person is not in this workspace.', 'not_found');
    if (target.role === 'admin' && role === 'member' && adminCount(db, ctx.params.id) <= 1) throw new HttpError(400, 'A workspace needs at least one admin.', 'last_admin');
    db.run('UPDATE members SET role = ? WHERE workspace_id = ? AND user_id = ?', role, ctx.params.id, ctx.params.uid);
    A.audit(ctx, 'member_role', `${ctx.params.id}:${ctx.params.uid}:${role}`);
    ctx.json(200, { ok: true });
  });

  add('DELETE', '/api/workspaces/:id/members/:uid', (ctx) => {
    const myRole = A.requireMember(ctx, ctx.params.id);
    const self = ctx.params.uid === ctx.user.id;
    if (!self && myRole !== 'admin') throw new HttpError(403, 'Only a workspace admin can remove people.', 'forbidden');
    const target = db.get('SELECT role FROM members WHERE workspace_id = ? AND user_id = ?', ctx.params.id, ctx.params.uid);
    if (!target) throw new HttpError(404, 'That person is not in this workspace.', 'not_found');
    if (target.role === 'admin' && adminCount(db, ctx.params.id) <= 1) throw new HttpError(400, 'A workspace needs at least one admin. Make someone else an admin first.', 'last_admin');
    db.run('DELETE FROM members WHERE workspace_id = ? AND user_id = ?', ctx.params.id, ctx.params.uid);
    hub.kick(ctx.params.id, ctx.params.uid);
    A.audit(ctx, self ? 'member_left' : 'member_removed', `${ctx.params.id}:${ctx.params.uid}`);
    ctx.json(200, { ok: true });
  });

  add('GET', '/api/workspaces/:id/invites', (ctx) => {
    A.requireWorkspaceAdmin(ctx, ctx.params.id);
    const rows = db.all(
      `SELECT i.id, i.email, i.role, i.created_at AS createdAt, i.expires_at AS expiresAt, i.used_at AS usedAt, u.name AS usedByName
         FROM invites i LEFT JOIN users u ON u.id = i.used_by
        WHERE i.workspace_id = ? AND (i.used_at IS NULL OR i.used_at > ?) ORDER BY i.created_at DESC LIMIT 100`,
      ctx.params.id, now() - 30 * DAY);
    ctx.json(200, { invites: rows });
  });

  add('POST', '/api/workspaces/:id/invites', async (ctx) => {
    A.requireWorkspaceAdmin(ctx, ctx.params.id);
    const b = await ctx.body();
    const email = b.email ? A.cleanEmail(b.email) : null;
    const role = b.role === 'admin' ? 'admin' : 'member';
    const pending = db.get('SELECT COUNT(*) AS n FROM invites WHERE workspace_id = ? AND used_at IS NULL AND expires_at > ?', ctx.params.id, now()).n;
    if (pending >= 50) throw new HttpError(400, 'You have 50 unused invites. Cancel some first.', 'limit');
    const code = newInviteCode();
    const id = newId();
    const expiresAt = now() + config.inviteDays * DAY;
    db.run('INSERT INTO invites(id,code_hash,kind,workspace_id,role,email,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)',
      id, sha256(normaliseCode(code)), 'workspace', ctx.params.id, role, email, ctx.user.id, now(), expiresAt);
    A.audit(ctx, 'invite_created', ctx.params.id);
    // The plain code is shown ONCE, here. Only its hash is stored.
    ctx.json(201, { id, code, email, role, expiresAt });
  });

  add('DELETE', '/api/workspaces/:id/invites/:iid', (ctx) => {
    A.requireWorkspaceAdmin(ctx, ctx.params.id);
    db.run('DELETE FROM invites WHERE id = ? AND workspace_id = ?', ctx.params.iid, ctx.params.id);
    ctx.json(200, { ok: true });
  });
};
