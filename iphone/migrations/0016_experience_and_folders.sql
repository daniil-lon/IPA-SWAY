CREATE TABLE IF NOT EXISTS performance_daily (
 day TEXT NOT NULL, metric TEXT NOT NULL, platform TEXT NOT NULL, bucket INTEGER NOT NULL,
 samples INTEGER NOT NULL, total_ms INTEGER NOT NULL, max_ms INTEGER NOT NULL,
 PRIMARY KEY(day,metric,platform,bucket)
);
CREATE TABLE IF NOT EXISTS performance_batches (id TEXT PRIMARY KEY, day TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS performance_batches_day ON performance_batches(day);
CREATE TABLE IF NOT EXISTS track_reports (
 id TEXT PRIMARY KEY, track TEXT NOT NULL, reason TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '',
 diagnostics TEXT NOT NULL DEFAULT '{}', created INTEGER NOT NULL DEFAULT(unixepoch()), resolved INTEGER
);
CREATE INDEX IF NOT EXISTS track_reports_pending ON track_reports(resolved,created);
CREATE TABLE IF NOT EXISTS playlist_folders (
 id TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL, created INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX IF NOT EXISTS playlist_folders_user ON playlist_folders(uid,created);
CREATE TABLE IF NOT EXISTS playlist_folder_items (
 uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 playlist TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
 folder TEXT NOT NULL REFERENCES playlist_folders(id) ON DELETE CASCADE,
 PRIMARY KEY(uid,playlist)
);
