-- One counted play per listener, track and day: guests (random browser id) and signed-in users alike.
-- The public chart, trends and popular artists are built from this table.
CREATE TABLE IF NOT EXISTS track_plays (
  day INTEGER NOT NULL,
  track TEXT NOT NULL,
  visitor TEXT NOT NULL,
  PRIMARY KEY (day, track, visitor)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS track_plays_track ON track_plays(track, day);
