-- Real listeners, guests included. A visitor is a random id the browser keeps; no name, IP or user agent is stored.
CREATE TABLE IF NOT EXISTS listeners (
  visitor TEXT PRIMARY KEY,
  uid TEXT,
  device TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  track TEXT NOT NULL DEFAULT '',
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  days INTEGER NOT NULL DEFAULT 1,
  last_day TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS listeners_last_seen ON listeners(last_seen);
CREATE TABLE IF NOT EXISTS listener_days (
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, visitor)
);
