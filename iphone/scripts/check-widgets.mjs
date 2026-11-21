import { chromium } from 'playwright';
const origin = process.argv[2] || 'http://127.0.0.1:8792';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, locale: 'ru-RU', hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto(origin + '/', { waitUntil: 'commit' });
await page.locator('.mx-start').waitFor({ timeout: 60000 });

const before = await page.evaluate(() => ({
  caption: document.querySelector('.mx-wave-caption')?.textContent,
  captionVisible: (() => { const el = document.querySelector('.mx-wave-caption'); return el ? getComputedStyle(el).display + '/' + getComputedStyle(el).visibility : null; })(),
  header: document.querySelector('.mx-head')?.innerHTML.slice(0, 300),
  shortcuts: [...document.querySelectorAll('[data-deck-shortcut]')].filter(el => !el.hidden).map(el => el.textContent.trim()),
  insight: document.querySelector('[data-wave-insight], .wave-insight, .ai-insight')?.textContent || null,
  bar: document.querySelector('.wave-filter-bar')?.textContent || null
}));
console.log('BEFORE ' + JSON.stringify(before, null, 2));

const station = page.locator('.wave-deck-item [data-wave-station]').first();
console.log('station count', await page.locator('.wave-deck-item [data-wave-station]').count());
await station.click();
await page.waitForTimeout(4000);
const after = await page.evaluate(() => ({
  caption: document.querySelector('.mx-wave-caption')?.textContent,
  selection: document.querySelector('.wave-selection')?.textContent,
  shortcuts: [...document.querySelectorAll('[data-deck-shortcut]')].filter(el => !el.hidden).map(el => el.textContent.trim()),
  track: document.querySelector('.mx-track')?.textContent,
  playing: !document.querySelector('#audio')?.paused,
  time: document.querySelector('#audio')?.currentTime,
  insight: document.querySelector('[data-wave-insight], .wave-insight, .ai-insight')?.textContent || null
}));
console.log('AFTER-CLICK ' + JSON.stringify(after, null, 2));
await page.screenshot({ path: 'artifacts/iphone-station.png' });

const deck = page.locator('.wave-deck');
const box = await deck.boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.55);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) { await page.mouse.move(box.x + box.width * 0.7 - i * 25, box.y + box.height * 0.55, { steps: 2 }); }
  await page.mouse.up();
  await page.waitForTimeout(1200);
  console.log('AFTER-SWIPE ' + JSON.stringify(await page.evaluate(() => ({
    scroll: document.querySelector('.wave-deck')?.scrollLeft,
    selection: document.querySelector('.wave-selection')?.textContent,
    pressed: [...document.querySelectorAll('.wave-deck-button[aria-pressed=true]')].map(el => el.textContent.trim())
  }))));
}
console.log('ERRORS ' + JSON.stringify(errors));
await browser.close();
