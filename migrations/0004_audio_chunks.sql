CREATE TABLE IF NOT EXISTS custom_audio_chunks (
  track_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (track_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS custom_audio_chunks_track ON custom_audio_chunks(track_id);
