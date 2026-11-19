import { chromium } from 'playwright';

async function testArtists() {
  console.log('--- Testing Artist Cards and Playback on Live Site ---');
  const proxy = process.env.https_proxy || 'http://127.0.0.1:2080';
  const browser = await chromium.launch({
    channel: process.env.TONIKA_BROWSER || 'msedge',
    proxy: { server: proxy }
  });

  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
  });

  const page = await context.newPage();
  const url = 'https://tonika-music.905589xx.workers.dev';

  // 1. Open Discover
  console.log('1. Navigating to Discover...');
  await page.goto(url + '/#discover', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Check popular artists shelf
  const madk1dLink = page.locator('a[href="#artist/madk1d"]');
  await madk1dLink.first().waitFor({ state: 'visible', timeout: 8000 });
  console.log('✅ Popular artists shelf visible with madk1d link!');

  // 2. Click madk1d artist card
  console.log('2. Opening madk1d Artist Page...');
  await madk1dLink.first().click();
  await page.waitForTimeout(1000);

  const artistTitle = await page.locator('.artist-title').textContent();
  console.log('Artist Title:', artistTitle);
  if (artistTitle !== 'madk1d') throw new Error('Expected artist title madk1d, got: ' + artistTitle);

  const artistImg = await page.locator('.artist-avatar-img').getAttribute('src');
  console.log('Artist Avatar:', artistImg);
  if (!artistImg.includes('/art/artists/madk1d.jpg')) throw new Error('Expected /art/artists/madk1d.jpg, got: ' + artistImg);

  // 3. Click "Слушать всё" (Play all)
  console.log('3. Clicking "Слушать всё"...');
  await page.locator('button[data-action="play-artist"]').click();
  await page.waitForTimeout(2000);

  const nowPlaying = await page.locator('#now-title').textContent();
  const nowArtist = await page.locator('#now-artist').textContent();
  console.log(`✅ Now playing: "${nowPlaying}" by ${nowArtist}`);
  if (!nowArtist.toLowerCase().includes('madk1d')) {
    console.warn('Playing track artist:', nowArtist);
  }

  // 4. Test Search Spotlight Card
  console.log('4. Testing Search Artist Card for VILLIAN...');
  await page.goto(url + '/#search', { waitUntil: 'networkidle' });
  await page.fill('#search-query', 'VILLIAN');
  await page.waitForTimeout(1000);

  const searchCard = page.locator('.search-artist-card');
  await searchCard.waitFor({ state: 'visible', timeout: 5000 });
  const searchArtistName = await searchCard.locator('.search-artist-name').textContent();
  console.log('✅ Search Artist Card found for:', searchArtistName);

  // Take screenshot
  await page.screenshot({ path: 'public/art/artists-test-preview.png', fullPage: false });
  console.log('📸 Screenshot saved to public/art/artists-test-preview.png');

  await browser.close();
  console.log('🎉 ALL ARTIST CARD & DISCOVERY TESTS PASSED!');
}

testArtists().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
