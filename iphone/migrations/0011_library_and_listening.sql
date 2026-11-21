CREATE TABLE playback_state (
 uid TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL DEFAULT 1,
 device TEXT NOT NULL,
 snapshot TEXT NOT NULL,
 updated INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE listening_events (
 uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 track TEXT NOT NULL,
 seconds REAL NOT NULL CHECK(seconds>0 AND seconds<=90),
 day TEXT NOT NULL,
 started INTEGER NOT NULL DEFAULT 0,
 at INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY(uid,id)
);
CREATE INDEX listening_events_day ON listening_events(uid,day);
CREATE TABLE history_cutoffs (
 uid TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 stamp INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE listening_daily (
 uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 day TEXT NOT NULL,
 track TEXT NOT NULL,
 seconds REAL NOT NULL DEFAULT 0,
 plays INTEGER NOT NULL DEFAULT 0,
 updated INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY(uid,day,track)
);
CREATE TABLE playlist_members (
 playlist TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
 uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('viewer','editor')),
 joined INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY(playlist,uid)
);
CREATE TABLE playlist_invites (
 hash TEXT PRIMARY KEY,
 playlist TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('viewer','editor')),
 expiry INTEGER NOT NULL,
 created INTEGER NOT NULL DEFAULT (unixepoch())
);
ALTER TABLE playlist_tracks ADD COLUMN added_by TEXT NOT NULL DEFAULT '';
CREATE TABLE catalog_overrides (
 track TEXT PRIMARY KEY,
 metadata TEXT NOT NULL,
 updated INTEGER NOT NULL DEFAULT (unixepoch())
);
