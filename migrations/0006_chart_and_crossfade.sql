ALTER TABLE users ADD COLUMN crossfade INTEGER NOT NULL DEFAULT 1 CHECK(crossfade IN (0,1));

CREATE TABLE chart_listens (
 day INTEGER NOT NULL,
 track TEXT NOT NULL,
 uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(day,track,uid)
) WITHOUT ROWID;
CREATE INDEX chart_listens_user ON chart_listens(uid);
