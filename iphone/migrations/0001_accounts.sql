CREATE TABLE users (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 volume REAL NOT NULL DEFAULT 0.8 CHECK(volume BETWEEN 0 AND 1),
 autoplay INTEGER NOT NULL DEFAULT 1 CHECK(autoplay IN (0,1)),
 motion INTEGER NOT NULL DEFAULT 1 CHECK(motion IN (0,1))
);
CREATE TABLE sessions (
 hash TEXT PRIMARY KEY,
 uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expiry INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expiry);
CREATE INDEX sessions_uid ON sessions(uid);
CREATE TABLE likes (
 uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 track TEXT NOT NULL,
 added INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY(uid,track)
);
