CREATE TABLE IF NOT EXISTS custom_tracks (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 150),
 artist TEXT NOT NULL CHECK(length(artist) BETWEEN 1 AND 150),
 genre TEXT NOT NULL CHECK(length(genre) BETWEEN 1 AND 80),
 seconds INTEGER NOT NULL CHECK(seconds > 0),
 moods TEXT NOT NULL DEFAULT '["bright"]',
 art TEXT NOT NULL,
 audio TEXT NOT NULL,
 source TEXT NOT NULL DEFAULT '',
 license TEXT NOT NULL DEFAULT '',
 license_url TEXT NOT NULL DEFAULT '',
 bytes INTEGER NOT NULL DEFAULT 0,
 palette TEXT,
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS custom_tracks_created ON custom_tracks(created_at DESC);

CREATE TABLE IF NOT EXISTS admin_config (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
 hash TEXT PRIMARY KEY,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 expiry INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expiry);

CREATE TABLE IF NOT EXISTS admin_attempts (
 ip TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL DEFAULT 1,
 last_attempt INTEGER NOT NULL DEFAULT (unixepoch())
);
