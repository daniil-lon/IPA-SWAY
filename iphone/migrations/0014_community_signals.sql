CREATE TABLE collection_reactions (
 uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('artist-best','artist-radio','album','playlist','editorial')),
 ref TEXT NOT NULL,
 added INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY(uid,kind,ref)
) WITHOUT ROWID;
CREATE INDEX collection_reactions_ref ON collection_reactions(kind,ref);
CREATE TABLE track_languages (
 id TEXT PRIMARY KEY,
 language TEXT NOT NULL,
 source TEXT NOT NULL DEFAULT 'lyrics',
 updated INTEGER NOT NULL DEFAULT (unixepoch())
) WITHOUT ROWID;
