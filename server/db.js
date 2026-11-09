'use strict';
/**
 * SQLite access using Node's built-in "node:sqlite" module (no npm packages).
 * Requires Node 22.13 or newer. The module is marked "experimental" by Node,
 * which only means its API may change in future Node versions.
 *
 * Migrations: every file in server/migrations/*.sql is applied once, in name order.
 */
const fs = require('node:fs');
const path = require('node:path');

// Silence only the "experimental" notice for node:sqlite; other warnings still show.
const origEmit = process.emitWarning;
process.emitWarning = function (warning, ...args) {
  const text = typeof warning === 'string' ? warning : warning && warning.message;
  if (text && /SQLite is an experimental feature/.test(text)) return;
  return origEmit.call(process, warning, ...args);
};
const { DatabaseSync } = require('node:sqlite');
process.emitWarning = origEmit;

function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  migrate(raw);

  const cache = new Map(); // SQL text -> prepared statement
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = raw.prepare(sql); cache.set(sql, s); }
    return s;
  };

  return {
    raw,
    /** First matching row or undefined. Use "?" placeholders. */
    get: (sql, ...p) => stmt(sql).get(...p),
    /** All matching rows. */
    all: (sql, ...p) => stmt(sql).all(...p),
    /** Run INSERT/UPDATE/DELETE. Returns { changes }. */
    run: (sql, ...p) => stmt(sql).run(...p),
    /** Run fn() inside one transaction (all-or-nothing). */
    tx(fn) {
      raw.exec('BEGIN IMMEDIATE');
      try { const r = fn(); raw.exec('COMMIT'); return r; }
      catch (e) { try { raw.exec('ROLLBACK'); } catch { /* already rolled back */ } throw e; }
    },
    /** Consistent copy of the whole database into another file. */
    backupTo(file) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file)) fs.unlinkSync(file);
      raw.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    },
    close() { cache.clear(); raw.close(); },
  };
}

function migrate(raw) {
  raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const dir = path.join(__dirname, 'migrations');
  const done = new Set(raw.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name));
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    raw.exec('BEGIN');
    try {
      raw.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
      raw.prepare('INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)').run(f, Date.now());
      raw.exec('COMMIT');
    } catch (e) { raw.exec('ROLLBACK'); throw new Error(`Migration ${f} failed: ${e.message}`); }
  }
}

module.exports = { openDatabase };
