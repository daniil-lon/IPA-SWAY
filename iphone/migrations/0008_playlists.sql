CREATE TABLE IF NOT EXISTS playlists (
 id TEXT PRIMARY KEY,
 uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 created INTEGER NOT NULL DEFAULT (unixepoch()),
 updated INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS playlists_owner ON playlists(uid, updated DESC);
CREATE TABLE IF NOT EXISTS playlist_tracks (
 playlist TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
 track TEXT NOT NULL,
 position INTEGER NOT NULL,
 PRIMARY KEY(playlist, track)
);
CREATE INDEX IF NOT EXISTS playlist_track_order ON playlist_tracks(playlist, position);
