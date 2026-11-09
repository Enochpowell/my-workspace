'use strict';
/** Creating an account from an invite code (or the one-time setup code). Shared by password and Google/GitHub sign-up. */
const { HttpError } = require('./http');
const { newId, sha256, safeEqual, normaliseCode, now } = require('./util');

function createWorkspace(db, name, userId) {
  const id = newId();
  db.run('INSERT INTO workspaces(id,name,created_by,created_at) VALUES (?,?,?,?)', id, name, userId, now());
  db.run('INSERT INTO members(workspace_id,user_id,role,joined_at) VALUES (?,?,?,?)', id, userId, 'admin', now());
  return id;
}

/** Returns { userId, how }. Throws HttpError with a friendly message when the code or email is not acceptable. */
function createAccount({ db, config }, { email, name, passwordHash, code }) {
  return db.tx(() => {
    if (db.get('SELECT 1 AS x FROM users WHERE email = ?', email)) {
      throw new HttpError(409, 'An account with that email already exists. Try signing in.', 'email_taken');
    }
    const userCount = db.get('SELECT COUNT(*) AS n FROM users').n;
    const userId = newId();
    const insertUser = (isAdmin) => db.run(
      'INSERT INTO users(id,email,name,password_hash,is_admin,created_at,last_login) VALUES (?,?,?,?,?,?,?)',
      userId, email, name, passwordHash, isAdmin ? 1 : 0, now(), now());

    if (userCount === 0) {
      // First ever account: must present the one-time setup code from the server's .env file.
      if (config.adminSetupCode.length < 16) {
        throw new HttpError(503, 'First-time setup is not ready: set ADMIN_SETUP_CODE (16+ characters) in the .env file and restart the server.', 'setup_not_configured');
      }
      if (!safeEqual(normaliseCode(config.adminSetupCode), code)) throw new HttpError(400, 'That setup code is not correct.', 'bad_code');
      insertUser(true);
      createWorkspace(db, 'My workspace', userId);
      return { userId, how: 'admin_setup' };
    }

    const inv = db.get('SELECT * FROM invites WHERE code_hash = ?', sha256(code));
    if (!inv || inv.used_at || inv.expires_at < now()) throw new HttpError(400, 'That invite code is not valid, has expired, or was already used.', 'bad_code');
    if (inv.email && inv.email.toLowerCase() !== email) throw new HttpError(400, 'This invite was made for a different email address.', 'wrong_email');
    insertUser(false);
    if (inv.kind === 'account') {
      createWorkspace(db, 'My workspace', userId);
    } else {
      db.run('INSERT INTO members(workspace_id,user_id,role,joined_at) VALUES (?,?,?,?)', inv.workspace_id, userId, inv.role, now());
    }
    db.run('UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?', userId, now(), inv.id);
    return { userId, how: 'invite' };
  });
}

module.exports = { createAccount, createWorkspace };
