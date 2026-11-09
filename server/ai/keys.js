'use strict';
/**
 * AI API keys that a platform admin saves from Settings, stored encrypted in the database.
 *
 * The encryption secret is a random file (data/.keysecret) created the first time a key is saved.
 * Someone who copies only the database file cannot read the keys. Keep the data folder private,
 * and back up the .keysecret file with the database or the saved keys cannot be decrypted.
 * A key saved here overrides the same key in .env. Keys are never sent to the browser.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { now } = require('../util');

const PREFIX = 'ai_key_';

function secretFor(config) {
  const file = path.join(config.dataDir, '.keysecret');
  try {
    const hex = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(hex)) return Buffer.from(hex, 'hex');
  } catch { /* create below */ }
  fs.mkdirSync(config.dataDir, { recursive: true });
  const hex = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, hex + '\n', { mode: 0o600 });
  return Buffer.from(hex, 'hex');
}

function encrypt(config, text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', secretFor(config), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

function decrypt(config, packed) {
  const [iv, tag, enc] = packed.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', secretFor(config), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

/** Copy every saved key onto config.ai.providers so the AI code uses it. */
function applySavedKeys(db, config) {
  for (const row of db.all('SELECT k, v FROM settings WHERE k LIKE ?', PREFIX + '%')) {
    const id = row.k.slice(PREFIX.length);
    const s = config.ai.providers[id];
    if (!s) continue;
    try { s.key = decrypt(config, row.v); } catch { /* a key that cannot be decrypted is ignored */ }
  }
}

function saveKey(db, config, id, key) {
  db.run('INSERT INTO settings(k,v,updated_at) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at',
    PREFIX + id, encrypt(config, key), now());
  config.ai.providers[id].key = key;
}

function removeKey(db, config, id) {
  db.run('DELETE FROM settings WHERE k = ?', PREFIX + id);
  config.ai.providers[id].key = (config.ai.envKeys || {})[id] || undefined;
}

module.exports = { applySavedKeys, saveKey, removeKey };
