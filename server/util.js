'use strict';
/**
 * Small helpers shared by the whole server.
 * Nothing here talks to the network or the database.
 */
const crypto = require('node:crypto');

/** Random URL-safe id, e.g. "q3Zk1b0X9wAa". 12 bytes = 96 bits of randomness. */
const newId = () => crypto.randomBytes(12).toString('base64url');

/** SHA-256 of a string as hex. Used to store session tokens and invite codes safely. */
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/** Constant-time string comparison (prevents timing attacks on secrets). */
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) {
    // Still do a comparison so the time taken does not reveal the length.
    crypto.timingSafeEqual(x, x);
    return false;
  }
  return crypto.timingSafeEqual(x, y);
}

/** Human-friendly invite code like "K7QM-2XPD-9TRW" (no 0/O/1/I to avoid mix-ups). */
function newInviteCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i % 4 === 3 && i < 11) out += '-';
  }
  return out;
}

/** Normalise what a person typed as an invite code (case, spaces, dashes). */
const normaliseCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const now = () => Date.now();
const DAY = 24 * 60 * 60 * 1000;

/** Simple levelled logger. Never log passwords, tokens, API keys or invite codes. */
const log = {
  info: (...a) => console.log(new Date().toISOString(), 'INFO ', ...a),
  warn: (...a) => console.warn(new Date().toISOString(), 'WARN ', ...a),
  error: (...a) => console.error(new Date().toISOString(), 'ERROR', ...a),
};

module.exports = { newId, sha256, safeEqual, newInviteCode, normaliseCode, now, DAY, log };
