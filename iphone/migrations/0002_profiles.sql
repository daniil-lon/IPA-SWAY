ALTER TABLE users ADD COLUMN wave_pattern TEXT NOT NULL DEFAULT 'ribbons'
 CHECK (wave_pattern IN ('ribbons','tide','halos','prism','petals'));

CREATE TABLE user_profiles (
 uid TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 handle TEXT UNIQUE,
 bio TEXT NOT NULL DEFAULT '' CHECK (length(bio)<=260),
 visible INTEGER NOT NULL DEFAULT 0 CHECK (visible IN (0,1)),
 profile_track TEXT,
 joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
 cover_zoom INTEGER NOT NULL DEFAULT 100 CHECK (cover_zoom BETWEEN 100 AND 180),
 avatar TEXT,
 cover TEXT
);

CREATE TABLE subscriptions (
 id INTEGER PRIMARY KEY,
 uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 plan TEXT NOT NULL,
 status TEXT NOT NULL CHECK (status IN ('pending','active','expired','canceled')),
 starts_at INTEGER,
 ends_at INTEGER,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 CHECK (ends_at IS NULL OR (starts_at IS NOT NULL AND ends_at>starts_at))
);
CREATE INDEX subscriptions_by_user ON subscriptions(uid,status,ends_at);
