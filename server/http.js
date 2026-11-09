'use strict';
/**
 * A very small HTTP toolkit: router, JSON body reader, cookies, security headers,
 * rate limiter and static file server. Written with Node's built-in modules only.
 */
const fs = require('node:fs');
const path = require('node:path');

class HttpError extends Error {
  /** @param {number} status HTTP status  @param {string} message safe, human-readable text  @param {string} [code] machine code */
  constructor(status, message, code) { super(message); this.status = status; this.code = code || ''; }
}

/* ------------------------------------------------------------------ router */
function createRouter() {
  const routes = [];
  return {
    /** add('GET', '/api/workspaces/:id/members', handler) */
    add(method, pattern, handler) {
      const names = [];
      const re = new RegExp('^' + pattern.replace(/:([A-Za-z]+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
      routes.push({ method, re, names, handler });
    },
    match(method, pathname) {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method) continue;
        const params = {};
        r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
        return { handler: r.handler, params };
      }
      return { handler: null, params: null, pathMatched };
    },
  };
}

/* ------------------------------------------------------------------ cookies */
function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function serializeCookie(name, value, o = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
  if (o.maxAgeSec !== undefined) s += `; Max-Age=${Math.floor(o.maxAgeSec)}`;
  if (o.secure) s += '; Secure';
  return s;
}

/* ----------------------------------------------------------- rate limiting */
/** Fixed-window limiter kept in memory. Fine for one server process. */
function createLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> { count, resetAt }
  const timer = setInterval(() => {
    const t = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
  }, Math.min(windowMs, 60_000));
  timer.unref();
  return {
    /** Count one attempt. Returns { ok, retryAfterSec }. */
    hit(key) {
      const t = Date.now();
      let v = hits.get(key);
      if (!v || v.resetAt <= t) { v = { count: 0, resetAt: t + windowMs }; hits.set(key, v); }
      v.count++;
      return { ok: v.count <= max, retryAfterSec: Math.ceil((v.resetAt - t) / 1000) };
    },
    /** Forget a key (e.g. after a successful login). */
    reset(key) { hits.delete(key); },
    stop() { clearInterval(timer); },
  };
}

/* -------------------------------------------------------- security headers */
function securityHeaders(config) {
  const h = {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data: blob:",
      "media-src 'self' blob: data:",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-src blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  if (config.production) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return h;
}

/* ----------------------------------------------------------------- bodies */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'That request is too large.', 'too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* ---------------------------------------------------------- static files */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/** Serve a file from publicDir. Returns true if handled. Blocks path traversal and dotfiles. */
function serveStatic(req, res, publicDir, pathname, headers) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return false; }
  if (rel.includes('\0') || rel.split('/').some((seg) => seg.startsWith('.'))) return false;
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(publicDir, path.normalize(rel));
  if (!file.startsWith(publicDir + path.sep) && file !== publicDir) return false;
  let stat;
  try { stat = fs.statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const cache = ext === '.html' ? 'no-cache' : 'public, max-age=300';
  res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': cache });
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(file).pipe(res);
  return true;
}

module.exports = { HttpError, createRouter, parseCookies, serializeCookie, createLimiter, securityHeaders, readBody, serveStatic };
