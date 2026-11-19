'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { libraryRoot, assetResponse } = require('../local-assets.cjs');

(async () => {
  const catalog = JSON.parse(await fs.readFile(path.join(libraryRoot(), 'catalog.json'), 'utf8'));
  assert.ok(catalog.length >= 1);
  const track = catalog.find(value => value.audio.startsWith('/media/'));
  {
    const origin = 'sway://app';
    const response = await assetResponse(new Request(origin + encodeURI(track.audio), { headers: { Range: 'bytes=0-511' } }));
    assert.equal(response.status, 206);
    assert.equal((await response.arrayBuffer()).byteLength, 512);
    assert.match(response.headers.get('content-range'), /^bytes 0-511\//);
    const suffix = await assetResponse(new Request(origin + encodeURI(track.audio), { headers: { Range: 'bytes=-32' } }));
    assert.equal(suffix.status, 206);
    assert.equal((await suffix.arrayBuffer()).byteLength, 32);
    const invalid = await assetResponse(new Request(origin + encodeURI(track.audio), { headers: { Range: 'bytes=999999999999999-' } }));
    assert.equal(invalid.status, 416);
    for (const url of ['/../package.json', '/%2e%2e/package.json', '/%2e%2e%5cpackage.json', '/lyrics/%2e%2e%5cpackage.json', '/.data/Preferences', '/%00']) {
      const denied = await assetResponse(new Request('sway://app' + url));
      assert.equal(denied.status, 404, url);
    }
    const write = await assetResponse(new Request('sway://app/catalog.json', { method: 'POST' }));
    assert.equal(write.status, 405);
    const lyricsDirectory = path.join(path.dirname(libraryRoot()), 'lyrics_archive');
    const lyricName = (await fs.readdir(lyricsDirectory)).find(name => name.endsWith('.json'));
    if (lyricName) {
      const lyrics = await assetResponse(new Request(origin + '/lyrics/' + encodeURIComponent(lyricName)));
      assert.equal(lyrics.status, 200);
      const data = await lyrics.json();
      assert.ok(typeof data.plain === 'string' || Array.isArray(data.lines));
    }
    console.log(`PASS: desktop library (${catalog.length} tracks), partial audio, suffix seek, invalid ranges, path boundaries, read-only assets.`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
