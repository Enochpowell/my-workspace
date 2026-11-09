-- Bitwixt Workspace: initial schema.
-- Times are milliseconds since 1970 (JavaScript Date.now()).

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  avatar        TEXT NOT NULL DEFAULT '',            -- small data: URL (jpeg/png/webp)
  password_hash TEXT NOT NULL,                       -- scrypt$N$r$p$salt$hash (never the password)
  is_admin      INTEGER NOT NULL DEFAULT 0,          -- platform admin (the first account)
  disabled      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_login    INTEGER
);

-- Only a SHA-256 hash of each session token is stored, never the token itself.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE workspaces (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('admin','member')),
  joined_at    INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX members_user ON members(user_id);

-- kind 'workspace': joins an existing workspace.  kind 'account': new person with their own workspace.
-- Only a hash of the code is stored; the code is shown once when it is created.
CREATE TABLE invites (
  id           TEXT PRIMARY KEY,
  code_hash    TEXT NOT NULL UNIQUE,
  kind         TEXT NOT NULL CHECK (kind IN ('workspace','account')),
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member',
  email        TEXT COLLATE NOCASE,                  -- if set, only this email can use the code
  created_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  used_by      TEXT,
  used_at      INTEGER
);

-- The workspace data store: one JSON document per path, scoped to a workspace.
-- Example path: "channels/general/msgs/abc123"  ->  parent "channels/general/msgs", id "abc123"
CREATE TABLE docs (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  parent       TEXT NOT NULL,
  id           TEXT NOT NULL,
  data         TEXT NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, path)
);
CREATE INDEX docs_parent ON docs(workspace_id, parent);

CREATE TABLE audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      INTEGER NOT NULL,
  user_id TEXT,
  action  TEXT NOT NULL,
  detail  TEXT
);
