import {readdir, readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

// Applies every migration to an empty in-memory database and verifies the
// schema the worker depends on. Run with: npm run check:migrations
const directory = new URL('../migrations/', import.meta.url);
const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
assert.ok(files.length > 0, 'no migrations found');

const db = new DatabaseSync(':memory:');
for (const file of files) {
  db.exec(await readFile(new URL(file, directory), 'utf8'));
}

const columns = table => db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name).sort();

assert.deepEqual(columns('admin_sessions'), ['created_at', 'expiry', 'hash'], 'admin_sessions must expose the canonical columns');
assert.deepEqual(columns('admin_attempts'), ['attempts', 'ip', 'last_attempt'], 'admin_attempts must expose the canonical columns');
assert.deepEqual(columns('track_lyrics'), ['artist', 'id', 'lines', 'plain', 'synced', 'title', 'updated']);
for (const table of ['users', 'sessions', 'likes', 'playlists', 'playlist_tracks', 'chart_listens', 'user_taste', 'catalog_overrides', 'listening_daily']) {
  assert.ok(columns(table).length > 0, `missing table ${table}`);
}

// Behaviour the worker relies on: hash-only sessions, failure counters, lyrics upsert.
db.exec("INSERT INTO admin_sessions (hash, created_at, expiry) VALUES ('hash', 1, 9999999999)");
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_sessions').get().n, 1);

db.exec("INSERT INTO admin_attempts (ip, attempts, last_attempt) VALUES ('127.0.0.1', 1, 1)");
db.exec(`INSERT INTO admin_attempts (ip, attempts, last_attempt) VALUES ('127.0.0.1', 1, 2)
 ON CONFLICT(ip) DO UPDATE SET attempts = admin_attempts.attempts + 1, last_attempt = 2`);
assert.equal(db.prepare("SELECT attempts FROM admin_attempts WHERE ip='127.0.0.1'").get().attempts, 2);

db.exec("INSERT INTO track_lyrics (id, lines, plain, synced, updated) VALUES ('track', '[]', 'text', 0, 1)");
assert.equal(db.prepare("SELECT plain FROM track_lyrics WHERE id='track'").get().plain, 'text');

db.close();
console.log(`migrations ok: ${files.length} files applied`);
