import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const origin = 'https://tonika-music.905589xx.workers.dev';
const proxy = process.env.https_proxy || 'http://127.0.0.1:2080';

const browser = await chromium.launch({
  channel: process.env.TONIKA_BROWSER || 'msedge',
  proxy: { server: proxy }
});

await mkdir('artifacts', { recursive: true });

const context = await browser.newContext({
  viewport: { width: 393, height: 786 },
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
});

const page = await context.newPage();

try {
  console.log('--- Step 1: Navigate to Live Sway Search on Mobile ---');
  await page.goto(origin + '/#search', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Wait for search input
  const searchInput = page.locator('#search-query');
  await searchInput.waitFor({ state: 'visible', timeout: 15000 });
  
  console.log('--- Step 2: Search for madk1d ---');
  await searchInput.fill('madk1d');
  await page.waitForTimeout(500);

  // Wait for search results
  const madk1dTrackRow = page.locator('#search-results article.row').filter({ hasText: 'madk1d' }).first();
  await madk1dTrackRow.waitFor({ state: 'visible', timeout: 10000 });
  
  const trackName = await madk1dTrackRow.locator('strong').textContent();
  console.log('Found madk1d track:', trackName);
  assert.ok(trackName, 'Track name should not be empty');

  console.log('--- Step 3: Play madk1d Track ---');
  await madk1dTrackRow.locator('.row-track').click();

  // Wait for audio playback to start
  await page.waitForFunction(() => {
    const a = document.querySelector('audio');
    return a && !a.paused && a.currentTime > 0.1;
  }, { timeout: 15000 });
  
  const initialCurrentTime = await page.evaluate(() => document.querySelector('audio').currentTime);
  const initialTitle = await page.locator('#now-title').textContent();
  console.log('Now playing:', initialTitle, 'at time:', initialCurrentTime);
  assert.equal(initialTitle, trackName);

  await page.screenshot({ path: 'artifacts/mobile-madk1d.png' });

  console.log('--- Step 4: Seek Near End of Track ---');
  await page.evaluate(() => {
    const a = document.querySelector('audio');
    a.currentTime = Math.max(a.duration - 4, 1);
  });
  await page.waitForTimeout(1000);
  const seekedTime = await page.evaluate(() => document.querySelector('audio').currentTime);
  console.log('Seeked to:', seekedTime);

  console.log('--- Step 5: Open Full Player Dialog and Click Next Track ---');
  await page.locator('#now-open').click();
  const fullDialog = page.locator('dialog[data-view="full"]');
  await fullDialog.waitFor({ state: 'visible', timeout: 5000 });

  const previousSrc = await page.locator('#audio').evaluate(a => a.currentSrc);
  await page.locator('#dialog').getByRole('button', { name: 'Следующий трек', exact: true }).click();

  // Wait for next track to play and change src
  await page.waitForFunction(src => {
    const a = document.querySelector('audio');
    return a && a.currentSrc !== src && !a.paused && a.currentTime > 0.12;
  }, previousSrc, { timeout: 15000 });

  const nextTitle = await page.locator('#now-title').textContent();
  const nextArtist = await page.locator('#now-artist').textContent();
  console.log('Next track playing:', nextTitle, 'by', nextArtist);
  assert.notEqual(nextTitle, initialTitle, 'Next track should be different');

  await page.screenshot({ path: 'artifacts/mobile-next-track.png' });

  // Close full player dialog
  await page.locator('#dialog .dialog-close').click();
  await fullDialog.waitFor({ state: 'hidden', timeout: 5000 });

  console.log('--- Step 6: Verify Author in Sheet ---');
  // Trigger actions sheet on the madk1d track
  const moreBtn = madk1dTrackRow.locator('button[data-info-track]');
  await moreBtn.click();

  const sheet = page.locator('#sheet');
  await sheet.waitFor({ state: 'visible', timeout: 5000 });

  // Click "Источник и лицензия"
  const creditsBtn = page.locator('#sheet [data-action="track-credits"]');
  await creditsBtn.waitFor({ state: 'visible', timeout: 5000 });
  await creditsBtn.click();

  // Verify credits modal contents
  await page.waitForSelector('#sheet[data-view="credits"]', { timeout: 5000 });
  const sheetBodyText = await page.locator('#sheet-body').textContent();
  console.log('Sheet content:\n', sheetBodyText);

  assert.match(sheetBodyText, /madk1d/i, 'Author should be madk1d');

  await page.screenshot({ path: 'artifacts/mobile-credits.png' });

  console.log('\n🎉 ALL LIVE MOBILE PLAYER & CREDITS CHECKS PASSED!');
} finally {
  await browser.close();
}
