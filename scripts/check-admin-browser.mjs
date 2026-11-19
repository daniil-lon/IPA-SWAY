import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:8794';
const browser = await chromium.launch({ channel: process.env.TONIKA_BROWSER || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', m => console.log('PAGE LOG:', m.text()));
page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

try {
  console.log('--- E2E Step 1: Navigate to /admin ---');
  await page.goto(origin + '/admin', { waitUntil: 'networkidle' });
  
  // Wait for checkStatus to complete and reveal the appropriate card
  await page.waitForSelector('#setup-card:not(.hidden), #login-card:not(.hidden), #dash:not(.hidden)', { timeout: 10000 });

  const isSetup = await page.locator('#setup-card:not(.hidden)').isVisible();
  const isLogin = await page.locator('#login-card:not(.hidden)').isVisible();
  console.log('Setup visible:', isSetup, 'Login visible:', isLogin);
  assert.ok(isSetup || isLogin, 'Neither setup nor login card is visible');

  const testPass = 'E2EAdminPass2026!';

  if (isSetup) {
    console.log('--- E2E Step 2: Set Master Password ---');
    await page.fill('#setup-pass', testPass);
    await page.fill('#setup-pass-repeat', testPass);
    await page.click('#setup-form button[type="submit"]');
    await page.waitForSelector('#dash:not(.hidden)', { timeout: 5000 });
  } else {
    console.log('--- E2E Step 2: Login to Admin ---');
    await page.fill('#login-pass', testPass);
    await page.click('#login-submit-btn');
    await page.waitForSelector('#dash:not(.hidden)', { timeout: 5000 });
  }

  console.log('--- E2E Step 3: Verify Dashboard Loaded ---');
  const dashBrand = await page.locator('.dash-brand').textContent();
  assert.match(dashBrand, /Sway Admin/);

  const totalText = await page.locator('#stat-total').textContent();
  console.log('Total tracks displayed in dashboard:', totalText);
  assert.ok(Number(totalText) >= 54);

  console.log('--- E2E Step 4: Add New Track via Form ---');
  await page.fill('#t-title', 'Ночной Город');
  await page.fill('#t-artist', 'Тестовый Артист');
  await page.selectOption('#t-genre', 'Электроника');
  await page.fill('#t-seconds', '195');
  await page.fill('#t-audio', 'https://example.com/night-city.mp3');
  
  // Click submit
  await page.click('#save-track-btn');
  
  // Wait for success notice
  await page.waitForSelector('#track-notice:not(.hidden)', { timeout: 5000 });
  const noticeText = await page.locator('#track-notice').textContent();
  console.log('Track notice:', noticeText);
  assert.match(noticeText, /успешно добавлен/);

  console.log('--- E2E Step 5: Verify Track in List ---');
  await page.waitForSelector('.track-item', { timeout: 5000 });
  const trackTitle = await page.locator('.track-item .track-title').first().textContent();
  console.log('First track in custom list:', trackTitle);
  assert.equal(trackTitle, 'Ночной Город');

  console.log('--- E2E Step 6: Verify in Public Catalog ---');
  const catalogRes = await fetch(origin + '/catalog.json');
  const catalog = await catalogRes.json();
  const found = catalog.find(t => t.title === 'Ночной Город');
  assert.ok(found, 'Added track not found in /catalog.json');
  console.log('Found track in public catalog:', found.title, 'by', found.artist);

  console.log('--- E2E Step 7: Delete Track ---');
  page.once('dialog', async dialog => {
    await dialog.accept();
  });
  await page.click('.track-item .btn-danger');
  await page.waitForTimeout(1000);

  const catalogAfter = await (await fetch(origin + '/catalog.json')).json();
  assert.ok(!catalogAfter.find(t => t.title === 'Ночной Город'), 'Track was not deleted');
  console.log('Track successfully deleted from catalog!');

  console.log('--- E2E Step 8: Logout ---');
  await page.click('#logout-btn');
  await page.waitForSelector('#login-card:not(.hidden)', { timeout: 5000 });
  console.log('Successfully logged out, login card is visible again.');

  console.log('\n🎉 ALL BROWSER E2E TESTS FOR ADMIN PANEL PASSED!');
} finally {
  await browser.close();
}
