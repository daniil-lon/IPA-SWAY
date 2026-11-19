import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';

const { outputFiles: [script] } = await build({
  entryPoints: ['worker.mjs'],
  bundle: true,
  format: 'esm',
  write: false
});

const origin = 'https://tonika.test';
const db = new DatabaseSync(':memory:');
const worker = (await import('data:text/javascript;base64,' + Buffer.from(script.text).toString('base64'))).default;

function prepare(sql, ...params) {
  const statement = db.prepare(sql);
  return {
    bind: (...values) => prepare(sql, ...values),
    first: async () => statement.get(...params),
    all: async () => ({ results: statement.all(...params) }),
    run: async () => statement.run(...params)
  };
}

const DB = {
  prepare,
  batch: async statements => {
    db.exec('BEGIN');
    try {
      for (const statement of statements) await statement.run();
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
};

const ASSETS = {
  fetch: async req => {
    const url = new URL(req.url);
    if (url.pathname === '/admin.html' || url.pathname === '/admin') {
      return new Response('<html><body>Sway Admin HTML</body></html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    return new Response('asset', { headers: { 'Cache-Control': 'public, max-age=86400' } });
  }
};

const env = { DB, ASSETS, REQUIRE_YANDEX_LOGIN: '0', PUBLIC_ORIGIN: origin };
const call = (path, opts = {}) => worker.fetch(new Request(origin + path, { redirect: 'manual', ...opts }), env);
const oneCookie = (r, name) => r.headers.getSetCookie().find(c => c.startsWith(name + '='))?.split(';')[0];

console.log('--- Initializing Migrations ---');
for (const file of ['0001_accounts.sql', '0002_profiles.sql', '0003_custom_tracks_and_admin.sql', '0004_audio_chunks.sql']) {
  db.exec(await readFile('migrations/' + file, 'utf8'));
}

console.log('--- Step 1: Testing /admin route serves HTML ---');
const adminPage = await call('/admin');
assert.equal(adminPage.status, 200);
assert.match(await adminPage.text(), /Sway Admin HTML/);

console.log('--- Step 2: Status before password setup ---');
const statusInitial = await (await call('/api/admin/status')).json();
assert.equal(statusInitial.setupNeeded, true);
assert.equal(statusInitial.loggedIn, false);
assert.ok(statusInitial.totalTracks >= 50);

console.log('--- Step 3: Unauthenticated access blocked ---');
const unauthTracks = await call('/api/admin/tracks');
assert.equal(unauthTracks.status, 401);

console.log('--- Step 4: Password setup ---');
const setupRes = await call('/api/admin/setup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ password: 'SuperMasterPassword2026!' })
});
assert.equal(setupRes.status, 200);
const adminCookieVal = oneCookie(setupRes, 'sway_admin_token');
assert.ok(adminCookieVal);
assert.match(adminCookieVal, /^sway_admin_token=[A-Za-z0-9_-]{43}$/);

console.log('--- Step 5: Duplicate setup rejected ---');
const dupSetup = await call('/api/admin/setup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ password: 'AnotherPassword!' })
});
assert.equal(dupSetup.status, 400);

console.log('--- Step 6: Status after setup (logged in) ---');
const statusLoggedIn = await (await call('/api/admin/status', {
  headers: { Cookie: adminCookieVal }
})).json();
assert.equal(statusLoggedIn.setupNeeded, false);
assert.equal(statusLoggedIn.loggedIn, true);

console.log('--- Step 7: Logout ---');
const logoutRes = await call('/api/admin/logout', {
  method: 'POST',
  headers: { Cookie: adminCookieVal, Origin: origin, 'Content-Type': 'application/json' }
});
assert.equal(logoutRes.status, 200);

// Status after logout
const statusLoggedOut = await (await call('/api/admin/status', {
  headers: { Cookie: adminCookieVal }
})).json();
assert.equal(statusLoggedOut.loggedIn, false);

console.log('--- Step 8: Login with wrong password ---');
const wrongLogin = await call('/api/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ password: 'wrongpassword' })
});
assert.equal(wrongLogin.status, 401);

console.log('--- Step 9: Login with correct password ---');
const loginRes = await call('/api/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ password: 'SuperMasterPassword2026!' })
});
assert.equal(loginRes.status, 200);
const newAdminCookie = oneCookie(loginRes, 'sway_admin_token');
assert.ok(newAdminCookie);

console.log('--- Step 10: Upload Audio Chunk & Verify Streaming ---');
const sampleAudioBytes = Buffer.from('RIFF....WAVEfmt ....data....test-audio-content-1234567890');
const sampleB64 = sampleAudioBytes.toString('base64');
const uploadChunkRes = await call('/api/admin/upload-chunk', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: origin,
    Cookie: newAdminCookie
  },
  body: JSON.stringify({
    trackId: 'chunk-test-1',
    chunkIndex: 0,
    totalChunks: 1,
    data: sampleB64
  })
});
assert.equal(uploadChunkRes.status, 200);

const mediaStreamRes = await call('/api/custom-media/chunk-test-1', {
  headers: { Range: 'bytes=0-15' }
});
assert.equal(mediaStreamRes.status, 206);
assert.equal(mediaStreamRes.headers.get('content-range'), `bytes 0-15/${sampleAudioBytes.length}`);
assert.equal(mediaStreamRes.headers.get('content-type'), 'audio/mpeg');

console.log('--- Step 11: Add Custom Track ---');
const initialCatalog = await (await call('/catalog.json')).json();
const initialHealth = await (await call('/api/health')).json();
assert.equal(initialHealth.tracks, initialCatalog.length);

const testTrack = {
  id: 'chunk-test-1',
  title: 'Тестовый Хит',
  artist: 'Даниил',
  genre: 'Рэп / Хип-хоп',
  seconds: 215,
  audio: '/api/custom-media/chunk-test-1',
  art: 'data:image/svg+xml;utf8,<svg></svg>',
  source: 'Sway',
  license: 'Sway',
  moods: ['bright', 'focus']
};

const addRes = await call('/api/admin/tracks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: origin,
    Cookie: newAdminCookie
  },
  body: JSON.stringify(testTrack)
});
assert.equal(addRes.status, 201);
const addData = await addRes.json();
assert.equal(addData.ok, true);
assert.ok(addData.id);
const createdTrackId = addData.id;

console.log('--- Step 11: Verify Track in Admin Tracks List ---');
const adminTracksRes = await call('/api/admin/tracks', {
  headers: { Cookie: newAdminCookie }
});
assert.equal(adminTracksRes.status, 200);
const adminTracks = await adminTracksRes.json();
assert.equal(adminTracks.tracks.length, 1);
assert.equal(adminTracks.tracks[0].title, 'Тестовый Хит');
assert.equal(adminTracks.tracks[0].artist, 'Даниил');
assert.equal(adminTracks.tracks[0].seconds, 215);

console.log('--- Step 12: Verify Track in Public Catalog & Health ---');
const updatedCatalog = await (await call('/catalog.json')).json();
assert.equal(updatedCatalog.length, initialCatalog.length + 1);
const foundInCatalog = updatedCatalog.find(t => t.id === createdTrackId);
assert.ok(foundInCatalog);
assert.equal(foundInCatalog.title, 'Тестовый Хит');
assert.equal(foundInCatalog.audio, '/api/custom-media/chunk-test-1');

const updatedHealth = await (await call('/api/health')).json();
assert.equal(updatedHealth.tracks, updatedCatalog.length);

console.log('--- Step 13: Delete Track ---');
const delRes = await call('/api/admin/tracks/' + encodeURIComponent(createdTrackId), {
  method: 'DELETE',
  headers: {
    Cookie: newAdminCookie,
    Origin: origin,
    'Content-Type': 'application/json'
  }
});
assert.equal(delRes.status, 200);

const finalCatalog = await (await call('/catalog.json')).json();
assert.equal(finalCatalog.length, initialCatalog.length);
assert.ok(!finalCatalog.find(t => t.id === createdTrackId));

console.log('\n✅ All Admin Panel and Custom Tracks tests PASSED with zero errors!');
