'use strict';
/**
 * Builds the HTTP server: security headers, request context, routing, error handling,
 * static files, daily backups. server/index.js starts it; tests call createApp() directly.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openDatabase } = require('./db');
const H = require('./http');
const A = require('./auth');
const { Hub } = require('./store/hub');
const { log } = require('./util');

function createApp(config) {
  const { HttpError } = H;
  const db = openDatabase(config.dbFile);
  require('./ai/custom').applySavedProviders(db, config); // your own AIs and model choices
  require('./ai/keys').applySavedKeys(db, config); // keys saved from Settings override .env
  const router = H.createRouter();
  const hub = new Hub();
  const limiters = {
    login: H.createLimiter({ windowMs: 15 * 60_000, max: 8 }),     // per IP + email
    loginIp: H.createLimiter({ windowMs: 15 * 60_000, max: 40 }),  // per IP
    signup: H.createLimiter({ windowMs: 60 * 60_000, max: 15 * config.rateMultiplier }),
    ai: H.createLimiter({ windowMs: 60_000, max: 20 * config.rateMultiplier }),
    write: H.createLimiter({ windowMs: 60_000, max: 600 * config.rateMultiplier }),
  };
  const deps = { config, db, hub, limiters };
  const add = (method, pattern, handler) => router.add(method, pattern, handler);
  add('GET', '/api/health', (ctx) => ctx.json(200, { ok: true })); // used by hosting services and Docker to check the app is alive
  require('./routes/auth')(add, deps);
  require('./routes/oauth')(add, deps);
  require('./routes/workspaces')(add, deps);
  require('./routes/admin')(add, deps);
  require('./routes/store')(add, deps);
  require('./routes/ai')(add, deps);

  const baseHeaders = H.securityHeaders(config);
  const indexHtml = path.join(config.publicDir, 'index.html');

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const cookies = [];
    let bodyCache;
    const ip = config.trustProxy && req.headers['x-forwarded-for']
      ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress || 'unknown';
    const secure = config.production || !!req.socket.encrypted || (config.trustProxy && req.headers['x-forwarded-proto'] === 'https');
    const ctx = {
      req, res, config, db, hub, limiters, url, ip, secure, baseHeaders, params: {}, user: null, handled: false,
      query: Object.fromEntries(url.searchParams),
      setCookie: (c) => cookies.push(c),
      /** Read the JSON body (must be sent as application/json). */
      async body() {
        if (bodyCache !== undefined) return bodyCache;
        const raw = await H.readBody(req, config.maxBodyBytes);
        if (!raw.length) return (bodyCache = {});
        if (!/^application\/json/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Send JSON.', 'bad_type');
        try { bodyCache = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'That request was not valid JSON.', 'bad_json'); }
        if (bodyCache === null || typeof bodyCache !== 'object') throw new HttpError(400, 'That request was not valid JSON.', 'bad_json');
        return bodyCache;
      },
      bytes(status, buf, type) {
        const headers = { ...baseHeaders, 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store' };
        if (cookies.length) headers['Set-Cookie'] = cookies;
        res.writeHead(status, headers);
        res.end(buf);
        ctx.handled = true;
      },
      redirect(location) {
        const headers = { ...baseHeaders, Location: location, 'Cache-Control': 'no-store' };
        if (cookies.length) headers['Set-Cookie'] = cookies;
        res.writeHead(302, headers);
        res.end();
        ctx.handled = true;
      },
      json(status, obj) {
        const headers = { ...baseHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
        if (cookies.length) headers['Set-Cookie'] = cookies;
        res.writeHead(status, headers);
        res.end(JSON.stringify(obj));
        ctx.handled = true;
      },
    };
    try {
      if (url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          // CSRF defence: a custom header (browsers will not add it cross-site) plus an Origin check.
          if (req.headers['x-requested-with'] !== 'bitwixt') throw new HttpError(403, 'Blocked request.', 'csrf');
          const origin = req.headers.origin;
          if (origin) {
            const ok = new Set([`http://${req.headers.host}`, `https://${req.headers.host}`]);
            if (config.publicUrl) ok.add(config.publicUrl);
            if (!ok.has(origin)) throw new HttpError(403, 'Blocked request.', 'csrf');
          }
        }
        const m = router.match(req.method, url.pathname);
        if (!m.handler) throw new HttpError(m.pathMatched ? 405 : 404, m.pathMatched ? 'Method not allowed.' : 'Not found.', 'not_found');
        ctx.params = m.params;
        ctx.user = A.currentUser(ctx);
        await m.handler(ctx);
        return;
      }
      if (H.serveStatic(req, res, config.publicDir, url.pathname, baseHeaders)) return;
      // Unknown page: let the front end handle it (single-page app).
      if (req.method === 'GET' && !path.extname(url.pathname) && !url.pathname.split('/').some((p) => p.startsWith('.')) && fs.existsSync(indexHtml)) {
        H.serveStatic(req, res, config.publicDir, '/index.html', baseHeaders);
        return;
      }
      throw new HttpError(404, 'Not found.', 'not_found');
    } catch (e) {
      if (ctx.handled || res.headersSent) { try { res.end(); } catch { /* ignore */ } return; }
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) log.error(`${req.method} ${url.pathname}:`, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e);
      const headers = { ...baseHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
      if (e instanceof HttpError && e.code === 'rate_limited') headers['Retry-After'] = '60';
      res.writeHead(status, headers);
      res.end(JSON.stringify({ error: status === 500 ? 'Something went wrong on the server.' : e.message, code: e.code || 'error' }));
    }
  }

  const server = http.createServer((req, res) => { handle(req, res); });

  // ---- daily backups -------------------------------------------------------
  let backupTimer = null;
  function backupNow() {
    const dir = path.join(config.dataDir, 'backups');
    const file = path.join(dir, `bitwixt-${new Date().toISOString().slice(0, 10)}.db`);
    if (fs.existsSync(file)) return null;
    db.backupTo(file);
    const all = fs.readdirSync(dir).filter((f) => /^bitwixt-.*\.db$/.test(f)).sort();
    for (const old of all.slice(0, Math.max(0, all.length - config.backupKeep))) fs.unlinkSync(path.join(dir, old));
    return file;
  }
  if (config.autoBackup && config.dbFile !== ':memory:') {
    try { backupNow(); } catch (e) { log.warn('Backup failed:', e.message); }
    backupTimer = setInterval(() => { try { backupNow(); } catch (e) { log.warn('Backup failed:', e.message); } }, 6 * 3600_000);
    backupTimer.unref();
  }

  return {
    server, db, hub, config, backupNow,
    listen: () => new Promise((resolve) => server.listen(config.port, config.host, () => resolve(server.address()))),
    close: () => new Promise((resolve) => {
      if (backupTimer) clearInterval(backupTimer);
      Object.values(limiters).forEach((l) => l.stop());
      hub.close();
      server.close(() => { try { db.close(); } catch { /* closed */ } resolve(); });
      server.closeAllConnections && server.closeAllConnections();
    }),
  };
}

module.exports = { createApp };
