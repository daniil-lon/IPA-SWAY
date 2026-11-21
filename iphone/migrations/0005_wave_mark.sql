ALTER TABLE users ADD COLUMN wave_mark TEXT NOT NULL DEFAULT '' CHECK(length(wave_mark)<=96);
