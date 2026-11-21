-- Admin suite: audit log, feature flags, search log and scheduling columns.
-- Additive only: existing columns from 0009/0010 keep working.

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL DEFAULT (unixepoch()),
  actor TEXT NOT NULL DEFAULT 'admin',
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS admin_audit_at ON admin_audit_log(at DESC);

CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated INTEGER NOT NULL DEFAULT (unixepoch())
) WITHOUT ROWID;

INSERT OR IGNORE INTO feature_flags (key, value) VALUES
  ('maintenance', '0'),
  ('signups', '1'),
  ('uploads', '1');

CREATE TABLE IF NOT EXISTS search_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL DEFAULT (unixepoch()),
  query TEXT NOT NULL,
  results INTEGER NOT NULL DEFAULT 0,
  uid TEXT
);
CREATE INDEX IF NOT EXISTS search_log_at ON search_log(at DESC);
CREATE INDEX IF NOT EXISTS search_log_query ON search_log(query);

ALTER TABLE broadcast_messages ADD COLUMN starts_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE promo_banners ADD COLUMN starts_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE promo_banners ADD COLUMN ends_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE editorial_playlists ADD COLUMN starts_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE editorial_playlists ADD COLUMN ends_at INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS listening_daily_day ON listening_daily(day);
CREATE INDEX IF NOT EXISTS listening_daily_track ON listening_daily(track);
CREATE INDEX IF NOT EXISTS likes_added ON likes(added);
CREATE INDEX IF NOT EXISTS users_name ON users(name);
