'use strict';
/**
 * The workspace data store (JSON documents addressed by path) and live updates.
 *
 *   GET    /api/ws/:wid/doc?path=...            read one document
 *   PUT    /api/ws/:wid/doc?path=...            { data }  replace a document
 *   PATCH  /api/ws/:wid/doc?path=...            { data }  merge fields into a document
 *   DELETE /api/ws/:wid/doc?path=...
 *   GET    /api/ws/:wid/col?path=...&order=at:desc&limit=100   list a collection
 *   POST   /api/ws/:wid/col?path=...            { data }  add a document with a new id
 *   GET    /api/events?ws=:wid                  live "this path changed" signals (SSE)
 *
 * Paths have an even number of parts for documents ("channels/general") and an odd
 * number for collections ("channels"). All rules live in ../store/rules.js.
 */
const { HttpError } = require('../http');
const A = require('../auth');
const R = require('../store/rules');
const { newId, now } = require('../util');

const SEG = /^[A-Za-z0-9_.~:@+-]{1,200}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

function parsePath(p, wantDoc) {
  const segs = String(p || '').split('/').filter(Boolean);
  if (!segs.length || segs.length > 10 || !segs.every((s) => SEG.test(s))) throw new HttpError(400, 'Bad path.', 'bad_path');
  if (wantDoc !== undefined && (segs.length % 2 === 0) !== wantDoc) throw new HttpError(400, wantDoc ? 'That path is a collection, not a document.' : 'That path is a document, not a collection.', 'bad_path');
  return segs;
}
function cleanData(config, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Data must be a JSON object.', 'bad_data');
  const text = JSON.stringify(data);
  if (Buffer.byteLength(text) > config.maxDocBytes) throw new HttpError(413, 'That document is too large.', 'too_large');
  return text;
}

module.exports = function register(add, { config, db, hub, limiters }) {
  const context = (ctx) => {
    const role = A.requireMember(ctx, ctx.params.wid);
    return { db, wid: ctx.params.wid, user: ctx.user, role };
  };
  const writeLimit = (ctx) => {
    const l = limiters.write.hit(ctx.user.id);
    if (!l.ok) throw new HttpError(429, 'You are saving too fast. Wait a moment.', 'rate_limited');
  };
  const load = (wid, path) => {
    const r = db.get('SELECT data FROM docs WHERE workspace_id = ? AND path = ?', wid, path);
    return r ? JSON.parse(r.data) : null;
  };

  add('GET', '/api/ws/:wid/doc', (ctx) => {
    const c = context(ctx);
    const segs = parsePath(ctx.query.path, true);
    const data = load(c.wid, segs.join('/'));
    R.authorizeDoc(c, 'get', segs, null, data);
    ctx.json(200, data ? { exists: true, data } : { exists: false });
  });

  const write = (op) => async (ctx) => {
    const c = context(ctx);
    writeLimit(ctx);
    const segs = parsePath(ctx.query.path, true);
    const path = segs.join('/');
    const existing = load(c.wid, path);
    if (op === 'delete') {
      R.authorizeDoc(c, 'delete', segs, null, existing);
      const audience = R.audienceFor(c, segs); // work out who to tell BEFORE it is gone
      db.run('DELETE FROM docs WHERE workspace_id = ? AND path = ?', c.wid, path);
      hub.publish(c.wid, path, audience);
      return ctx.json(200, { ok: true });
    }
    const body = await ctx.body();
    let data = body.data;
    if (op === 'update') {
      if (!existing) throw new HttpError(404, 'That document does not exist.', 'not_found');
      cleanData(config, data);
      R.authorizeDoc(c, 'update', segs, data, existing);
      data = { ...existing, ...data };
    } else {
      cleanData(config, data);
      R.authorizeDoc(c, 'set', segs, data, existing);
    }
    const text = cleanData(config, data);
    db.run(
      `INSERT INTO docs(workspace_id,path,parent,id,data,updated_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(workspace_id,path) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      c.wid, path, segs.slice(0, -1).join('/'), segs[segs.length - 1], text, now());
    hub.publish(c.wid, path, R.audienceFor(c, segs));
    ctx.json(200, { ok: true });
  };
  add('PUT', '/api/ws/:wid/doc', write('set'));
  add('PATCH', '/api/ws/:wid/doc', write('update'));
  add('DELETE', '/api/ws/:wid/doc', write('delete'));

  add('GET', '/api/ws/:wid/col', (ctx) => {
    const c = context(ctx);
    const segs = parsePath(ctx.query.path, false);
    const filter = R.authorizeCollection(c, segs);
    let sql = 'SELECT id, data FROM docs WHERE workspace_id = ? AND parent = ?';
    const params = [c.wid, segs.join('/')];
    if (ctx.query.order) {
      const [field, dir] = String(ctx.query.order).split(':');
      if (!FIELD.test(field)) throw new HttpError(400, 'Bad order field.', 'bad_request');
      sql += ` ORDER BY json_extract(data, ?) ${dir === 'desc' ? 'DESC' : 'ASC'}, id`;
      params.push('$.' + field);
    } else sql += ' ORDER BY id';
    let rows = db.all(sql, ...params);
    if (filter) rows = rows.filter(filter);
    const limit = Math.min(500, Math.max(1, Number.parseInt(ctx.query.limit, 10) || 500));
    rows = rows.slice(0, limit);
    ctx.json(200, { docs: rows.map((r) => ({ id: r.id, data: JSON.parse(r.data) })) });
  });

  add('POST', '/api/ws/:wid/col', async (ctx) => {
    const c = context(ctx);
    writeLimit(ctx);
    const segs = parsePath(ctx.query.path, false);
    const id = newId();
    const docSegs = [...segs, id];
    const data = (await ctx.body()).data;
    const text = cleanData(config, data);
    R.authorizeDoc(c, 'set', docSegs, data, null);
    db.run('INSERT INTO docs(workspace_id,path,parent,id,data,updated_at) VALUES (?,?,?,?,?,?)', c.wid, docSegs.join('/'), segs.join('/'), id, text, now());
    hub.publish(c.wid, docSegs.join('/'), R.audienceFor(c, docSegs));
    ctx.json(201, { id });
  });

  add('GET', '/api/events', (ctx) => {
    const wid = String(ctx.query.ws || '');
    A.requireMember(ctx, wid);
    ctx.res.writeHead(200, {
      ...ctx.baseHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    ctx.res.write('retry: 3000\n\n');
    const remove = hub.add(wid, ctx.user.id, ctx.res);
    ctx.req.on('close', remove);
    ctx.handled = true; // keep the connection open
  });
};
