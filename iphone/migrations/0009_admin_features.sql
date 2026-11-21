-- Admin Features: Editorial Playlists, Promo Banners, Broadcasts
CREATE TABLE IF NOT EXISTS editorial_playlists (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 100),
  description TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  track_ids TEXT NOT NULL DEFAULT '[]',
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS editorial_playlists_active ON editorial_playlists(is_active, order_index);

CREATE TABLE IF NOT EXISTS promo_banners (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  subtitle TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL DEFAULT 'Промо',
  link TEXT NOT NULL DEFAULT '',
  bg_gradient TEXT NOT NULL DEFAULT 'linear-gradient(135deg, #7928ca, #ff0080)',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS promo_banners_active ON promo_banners(is_active);

CREATE TABLE IF NOT EXISTS broadcast_messages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 500),
  link TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS broadcast_messages_expiry ON broadcast_messages(expires_at);

-- Initial default editorial playlist
INSERT OR IGNORE INTO editorial_playlists (id, title, description, cover, track_ids, order_index, is_active)
VALUES (
  'choice-of-the-week',
  'Выбор редакции',
  'Самые яркие и свежие треки недели в идеальном миксе',
  '/art/logo.svg',
  '[]',
  1,
  1
);
