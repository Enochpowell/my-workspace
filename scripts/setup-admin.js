'use strict';
/**
 * Creates (or resets) the first admin from the command line, without the web page:
 *     npm run setup:admin
 * You will be asked for your name, email and password (the password is hidden as you type).
 * Handy if you lose access, or prefer not to use ADMIN_SETUP_CODE.
 */
const readline = require('node:readline');
const { loadConfig } = require('../server/config');
const { openDatabase } = require('../server/db');
const A = require('../server/auth');
const { newId, now } = require('../server/util');

/**
 * One readline interface for the whole script. Lines are queued so that it works both when you
 * type (password hidden) and when input is piped in (useful for scripts and tests).
 */
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let muted = false;
rl._writeToOutput = (text) => { if (!muted) rl.output.write(text); };
const queue = [];
let waiting = null;
rl.on('line', (line) => { if (waiting) { const w = waiting; waiting = null; w(line); } else queue.push(line); });
function ask(q, hidden) {
  process.stdout.write(q);
  muted = !!hidden;
  return new Promise((resolve) => {
    const done = (line) => { muted = false; if (hidden && process.stdin.isTTY) process.stdout.write('\n'); resolve(line); };
    if (queue.length) done(queue.shift()); else waiting = done;
  });
}

(async () => {
  const config = loadConfig();
  const db = openDatabase(config.dbFile);
  console.log('Create an admin account for My workspace\n');
  const name = A.cleanName(await ask('Your name: '));
  const email = A.cleanEmail(await ask('Email: '));
  const password = A.checkPassword(await ask('Password (10+ characters, hidden): ', true), email);
  const again = await ask('Type the password again: ', true);
  if (again !== password) { console.error('The passwords did not match.'); process.exit(1); }
  const hash = await A.hashPassword(password);
  const existing = db.get('SELECT id FROM users WHERE email = ?', email);
  db.tx(() => {
    if (existing) {
      db.run('UPDATE users SET password_hash = ?, is_admin = 1, disabled = 0, name = ? WHERE id = ?', hash, name, existing.id);
      db.run('DELETE FROM sessions WHERE user_id = ?', existing.id);
      console.log('\nUpdated the existing account and made it an admin.');
    } else {
      const id = newId(), wid = newId();
      db.run('INSERT INTO users(id,email,name,password_hash,is_admin,created_at) VALUES (?,?,?,?,1,?)', id, email, name, hash, now());
      db.run('INSERT INTO workspaces(id,name,created_by,created_at) VALUES (?,?,?,?)', wid, 'My workspace', id, now());
      db.run('INSERT INTO members(workspace_id,user_id,role,joined_at) VALUES (?,?,?,?)', wid, id, 'admin', now());
      console.log('\nAdmin account created. You can now sign in.');
    }
  });
  db.close();
  rl.close();
})().catch((e) => { console.error('\n' + (e.message || e)); process.exit(1); });
