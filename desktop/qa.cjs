'use strict';
// Connects only to the desktop app launched with --inspect-ui; launches no browser.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const output = path.join(__dirname, 'artifacts', 'qa');
const finalEvidence = process.argv.includes('--final-evidence');
const selectedChecks = (process.argv.find(value => value.startsWith('--only='))?.slice(7) || '').split(',').filter(Boolean);
const reportName = finalEvidence ? 'report-final-evidence.json' : selectedChecks.length ? 'report-targeted.json' : 'report.json';
const results = [];
const errors = [];
let browser, page, originalStorage, pageSession;
const screenshot = async name => {
  const filename = path.join(output, `${name}.png`);
  await page.screenshot({ path: filename, timeout: 15000 });
  return filename;
};
const check = async (name, action) => {
  if (selectedChecks.length && !selectedChecks.some(selected => name.includes(selected))) return;
  try {
    const detail = await action();
    results.push({ name, pass: true, detail });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, pass: false, error: String(error.stack || error) });
    console.log(`FAIL ${name}: ${error.message}`);
    await screenshot(`failure-${results.length}`).catch(() => {});
  }
};
const click = selector => page.locator(selector).first().click();
const closeDialog = async () => {
  await page.keyboard.press('Escape');
  await page.locator('#overlay').waitFor({ state: 'hidden' });
};
const search = async query => {
  await click('.nav-main [data-go="search"]');
  await page.locator('#search-input').fill(query);
  await page.waitForFunction(() => document.querySelectorAll('#search-results .track-row').length > 0);
};

(async () => {
  await fs.mkdir(output, { recursive: true });
  for (let attempt = 0; attempt < 12; attempt++) {
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9238', { timeout: 3000 }); break; }
    catch (error) {
      if (attempt === 11) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith('sway://app/'));
  assert(page, 'Native Sway window is missing from CDP targets');
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  originalStorage = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('sway.desktop.')).map(key => [key, localStorage.getItem(key)])));
  // Tests remain local and quiet; all Sway settings/collections are restored below.
  await page.evaluate(() => { const audio = document.querySelector('audio'); audio.pause(); audio.volume = .02; });
  pageSession = await page.context().newCDPSession(page);
  // Electron CDP does not implement Browser.getWindowForTarget. Exercise the
  // actual native renderer at emulated viewport sizes; do not mislabel this as
  // a native window-manager resize test.
  async function resize(width, height) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, { width, height });
  }

  if (finalEvidence) {
    await check('latest native media artwork and final visual evidence', async () => {
      await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      await resize(1280, 800);
      await page.locator('#volume').evaluate(input => { input.value = '.02'; input.dispatchEvent(new Event('input', { bubbles: true })); });
      await search('Miyagi');
      await page.locator('#search-results .track-row .track-text strong').nth(1).click();
      await page.waitForFunction(() => navigator.mediaSession.metadata?.artwork[0]?.src.startsWith('blob:'));
      await page.evaluate(() => document.querySelector('audio').pause());
      const metadata = await page.evaluate(async () => {
        const data = navigator.mediaSession.metadata;
        const image = new Image(); image.src = data.artwork[0].src; await image.decode();
        return { title: data.title, playerTitle: document.querySelector('#now-title').textContent, artwork: { scheme: new URL(data.artwork[0].src).protocol, type: data.artwork[0].type, width: image.naturalWidth, height: image.naturalHeight }, paused: document.querySelector('audio').paused };
      });
      assert.equal(metadata.title, metadata.playerTitle); assert.equal(metadata.artwork.scheme, 'blob:'); assert(metadata.artwork.width > 0); assert(metadata.paused);
      await page.waitForTimeout(500);
      assert(!page.isClosed(), 'Native renderer closed after MediaSession update');
      await page.evaluate(snapshot => {
        for (const key of Object.keys(localStorage)) if (key.startsWith('sway.desktop.')) localStorage.removeItem(key);
        for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value);
      }, originalStorage);
      await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      await page.evaluate(() => document.fonts.ready);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(250);
      const geometry = await page.evaluate(() => Object.fromEntries(['.sidebar', '#content', '#player', '.wave-heading', '#player .play-main', '.quick-card'].map(selector => {
        const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
        return [selector, { x, y, width, height, centerX: x + width / 2 }];
      })));
      const homeScreenshot = await screenshot('home-final-1280x800');
      await click('.nav-main [data-go="collection"]');
      const ownCollection = await page.evaluate(() => ({ liked: JSON.parse(localStorage.getItem('sway.desktop.liked') || '[]').length, playlists: JSON.parse(localStorage.getItem('sway.desktop.playlists') || '[]').length }));
      const ownCollectionScreenshot = await screenshot('collection-final-own-data');
      const fixture = await page.evaluate(async () => {
        const tracks = await (await fetch('/catalog.json')).json();
        const chart = await (await fetch('/chart.json')).json();
        const known = new Set(tracks.map(track => track.id));
        const ids = chart.map(track => track.trackId || track.id).filter(id => known.has(id)).slice(0, 8);
        localStorage.setItem('sway.desktop.liked', JSON.stringify(ids));
        return ids;
      });
      await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      await click('.nav-main [data-go="collection"]');
      await page.locator('.collection-tracks .track-row').first().waitFor();
      assert.equal(await page.locator('.collection-tracks .track-row').count(), 8);
      await page.waitForTimeout(250);
      const fixtureScreenshot = await screenshot('collection-final-fixture8');
      return { metadata, rendererAlive: !page.isClosed(), geometry, viewport: { width: 1280, height: 800, mode: 'emulated in actual native renderer' }, ownCollection, screenshots: { homeScreenshot, ownCollectionScreenshot, fixtureScreenshot }, fixtureIds: fixture, fixtureRemovedInFinally: true };
    });
    assert.equal(errors.length, 0, `Renderer errors: ${errors.join('; ')}`);
    return;
  }

  await check('native bridge and local catalogue', async () => {
    const detail = await page.evaluate(async () => ({
      origin: location.origin, bridge: !!window.desktop?.pickAudio,
      tracks: (await (await fetch('/catalog.json')).json()).length,
      font: document.fonts.check('14px YSText'),
    }));
    assert.equal(detail.origin, 'sway://app'); assert(detail.bridge); assert(detail.tracks >= 7000); assert(detail.font);
    return detail;
  });
  await check('home geometry, emulated viewport 1280x800', async () => {
    await resize(1280, 800); await click('.brand');
    await page.waitForTimeout(300);
    const bounds = await page.evaluate(() => Object.fromEntries(['.sidebar', '#content', '#player'].map(selector => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
      return [selector, { x, y, width, height }];
    })));
    assert.equal(bounds['#content'].x, 224); assert.equal(bounds['#content'].y, 32);
    assert.equal(bounds['#player'].x, 224); assert.equal(bounds['#player'].y, 708); assert.equal(bounds['#player'].height, 80);
    return { bounds, screenshot: await screenshot('home-1280x800') };
  });
  await check('search and real audio', async () => {
    await search('Miyagi');
    assert(await page.locator('#search-results .track-row').count() > 0);
    await screenshot('search-miyagi');
    await click('#search-results .track-row .track-text strong');
    await page.waitForFunction(() => {
      const audio = document.querySelector('audio'); return !audio.paused && audio.currentTime > .1 && audio.duration > 0;
    }, { timeout: 20000 });
    return page.evaluate(() => ({ title: document.querySelector('#now-title').textContent, audio: { playing: !document.querySelector('audio').paused, duration: document.querySelector('audio').duration } }));
  });
  await check('pause, seek, resume, next', async () => {
    await click('#player [data-action="play"]');
    assert(await page.locator('audio').evaluate(audio => audio.paused));
    await page.locator('#seek').evaluate(input => { input.value = '250'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => document.querySelector('audio').currentTime / document.querySelector('audio').duration > .24);
    await click('#player [data-action="play"]');
    await page.waitForFunction(() => !document.querySelector('audio').paused);
    const before = await page.locator('#now-title').textContent();
    await click('#player [data-action="next"]');
    await page.waitForFunction(previous => document.querySelector('#now-title').textContent !== previous, before);
    return { before, after: await page.locator('#now-title').textContent() };
  });
  let likedId, playlistId;
  const playlistName = `Проверка Sway ${Date.now()}`;
  await check('favorite persists across reload', async () => {
    await search('Miyagi');
    const first = page.locator('#search-results .track-row').first();
    likedId = await first.getAttribute('data-track-row');
    await first.hover();
    if (!await first.locator('[data-like]').evaluate(button => button.classList.contains('is-liked'))) await first.locator('[data-like]').click();
    assert(await page.evaluate(id => JSON.parse(localStorage.getItem('sway.desktop.liked')).includes(id), likedId));
    await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    await click('[data-go="favorites"]');
    assert(await page.locator('[data-track-row]').evaluateAll((rows, id) => rows.some(row => row.dataset.trackRow === id), likedId));
    return { likedId };
  });
  await check('create playlist and add track', async () => {
    await click('.nav-main [data-go="collection"]');
    await click('[data-action="create-playlist"]');
    await page.locator('#playlist-title').fill(playlistName);
    await click('#playlist-form button[type="submit"]');
    await page.waitForFunction(name => document.querySelector('#content h1')?.textContent === name, playlistName);
    playlistId = await page.evaluate(name => JSON.parse(localStorage.getItem('sway.desktop.playlists')).find(playlist => playlist.title === name).id, playlistName);
    await search('Miyagi');
    await page.locator('#search-results .track-row').first().hover();
    await click('#search-results .track-row [data-menu-track]');
    await page.locator(`[data-add-playlist="${playlistId}"]`).click();
    await page.locator(`[data-open="playlist"][data-id="${playlistId}"]`).first().click();
    assert.equal(await page.locator('#content .track-row').count(), 1);
    await screenshot('playlist');
    return { playlistId, tracks: 1 };
  });
  await check('queue selects next item', async () => {
    await search('Miyagi');
    await page.locator('#search-results .track-row .track-text strong').first().click();
    await page.waitForFunction(() => !document.querySelector('audio').paused);
    await click('#player [data-action="queue"]');
    await page.locator('#queue-panel').waitFor({ state: 'visible' });
    assert(await page.locator('#queue-panel .track-row').count() > 1);
    const row = page.locator('#queue-panel .track-list').nth(1).locator('.track-row').first();
    const expected = await row.locator('.track-text strong').evaluate(node => node.firstChild.textContent);
    await row.locator('.track-text strong').click();
    const actual = await page.locator('#now-title').textContent();
    assert.equal(actual, expected);
    await screenshot('queue'); await click('[data-action="close-queue"]');
    return { title: actual };
  });
  await check('settings volume and repeat persist', async () => {
    await click('#player [data-action="settings"]');
    await page.locator('#settings-volume').evaluate(input => { input.value = '.18'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('#repeat-select').selectOption('2');
    const state = await page.evaluate(() => ({ volume: document.querySelector('audio').volume, savedVolume: JSON.parse(localStorage.getItem('sway.desktop.volume')), repeat: JSON.parse(localStorage.getItem('sway.desktop.repeat')) }));
    assert.equal(state.volume, .18); assert.equal(state.savedVolume, .18); assert.equal(state.repeat, 2);
    await screenshot('settings'); await closeDialog(); return state;
  });
  await check('expanded player follows track changes', async () => {
    await click('#player [data-action="expand"]');
    const before = await page.locator('.expanded-meta h2').textContent();
    await click('.expanded-controls [data-action="next"]');
    await page.waitForFunction(previous => document.querySelector('#now-title').textContent !== previous, before);
    assert.equal(await page.locator('.expanded-meta h2').textContent(), await page.locator('#now-title').textContent());
    await screenshot('expanded-player'); await closeDialog();
  });
  await check('home at emulated viewports 1440x900 and 960x680', async () => {
    await closeDialog(); await click('.brand');
    for (const [width, height] of [[1440, 900], [960, 680]]) {
      await resize(width, height); await page.waitForTimeout(200);
      assert(await page.locator('.wave-heading').isVisible());
      const play = await page.locator('#player [data-action="play"]').boundingBox();
      const tools = await page.locator('.player-tools').boundingBox();
      assert(play.x + play.width <= tools.x, `Transport overlaps tools at ${width}`);
      await screenshot(`home-${width}x${height}`);
    }
  });
  assert.equal(errors.length, 0, `Renderer errors: ${errors.join('; ')}`);
})().catch(error => {
  results.push({ name: 'QA session', pass: false, error: String(error.stack || error) });
  console.error(error.message);
}).finally(async () => {
  if (page && originalStorage) {
    await page.evaluate(snapshot => {
      document.querySelector('audio')?.pause();
      for (const key of Object.keys(localStorage)) if (key.startsWith('sway.desktop.')) localStorage.removeItem(key);
      for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value);
    }, originalStorage).catch(() => {});
    await page.emulateMedia({ reducedMotion: null }).catch(() => {});
    await page.reload().catch(() => {});
    if (pageSession) await pageSession.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
  }
  await fs.mkdir(output, { recursive: true });
  const report = { generatedAt: new Date().toISOString(), selectedChecks, results, rendererErrors: errors, passed: results.filter(result => result.pass).length, failed: results.filter(result => !result.pass).length };
  await fs.writeFile(path.join(output, reportName), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: path.join(output, reportName), passed: report.passed, failed: report.failed }));
  // Do not browser.close(): this is the user's native app, not a test browser.
  process.exitCode = report.failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 100);
});
