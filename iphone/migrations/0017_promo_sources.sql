-- Where listeners come from (a Telegram post, a story, the bot). One row per day and source, no personal data.
CREATE TABLE IF NOT EXISTS promo_visits (
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  installs INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, source)
);
