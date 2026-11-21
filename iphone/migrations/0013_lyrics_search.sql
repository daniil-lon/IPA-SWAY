-- Unicode phrase search over the existing lyrics, without storing another copy
-- of each text. Keep the index in step with imports and changes in the admin UI.
CREATE VIRTUAL TABLE lyrics_search USING fts5(
 plain, content='track_lyrics', content_rowid='rowid', tokenize='unicode61'
);
CREATE TRIGGER lyrics_search_insert AFTER INSERT ON track_lyrics BEGIN
 INSERT INTO lyrics_search(rowid,plain) VALUES(new.rowid,new.plain);
END;
CREATE TRIGGER lyrics_search_delete AFTER DELETE ON track_lyrics BEGIN
 INSERT INTO lyrics_search(lyrics_search,rowid,plain) VALUES('delete',old.rowid,old.plain);
END;
CREATE TRIGGER lyrics_search_update AFTER UPDATE ON track_lyrics BEGIN
 INSERT INTO lyrics_search(lyrics_search,rowid,plain) VALUES('delete',old.rowid,old.plain);
 INSERT INTO lyrics_search(rowid,plain) VALUES(new.rowid,new.plain);
END;
INSERT INTO lyrics_search(lyrics_search) VALUES('rebuild');
