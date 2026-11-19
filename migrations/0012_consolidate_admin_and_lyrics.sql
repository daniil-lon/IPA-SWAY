-- Consolidate the admin tables with the schema the worker actually uses and
-- create the lyrics table that previously existed only in ad-hoc scripts.
--
-- Background: migrations/0003 already declares admin_sessions(hash, created_at,
-- expiry) and admin_attempts(ip, attempts, last_attempt). Some deployments had
-- extra legacy columns (token, expires_at, timestamp, success) that made inserts
-- fail. Rebuilding the tables gives every environment one canonical shape.

CREATE TABLE IF NOT EXISTS admin_sessions_next (
 hash TEXT PRIMARY KEY,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 expiry INTEGER NOT NULL
);

INSERT OR REPLACE INTO admin_sessions_next (hash, created_at, expiry)
 SELECT hash, created_at, expiry
 FROM admin_sessions
 WHERE hash IS NOT NULL AND expiry > 0;

DROP TABLE IF EXISTS admin_sessions;
ALTER TABLE admin_sessions_next RENAME TO admin_sessions;
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expiry);

DROP TABLE IF EXISTS admin_attempts;
CREATE TABLE admin_attempts (
 ip TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL DEFAULT 1,
 last_attempt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS track_lyrics (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL DEFAULT '',
 artist TEXT NOT NULL DEFAULT '',
 lines TEXT NOT NULL DEFAULT '[]',
 plain TEXT NOT NULL DEFAULT '',
 synced INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0,1)),
 updated INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS track_lyrics_synced ON track_lyrics(synced);
CREATE INDEX IF NOT EXISTS likes_track ON likes(track);
