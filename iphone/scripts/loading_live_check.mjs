import { chromium } from 'playwright';

const origin = 'https://music.academmix.ru';
const browser = await chromium.launch({ channel: process.env.TONIKA_BROWSER || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.on('pageerror', e => console.log('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR: ' + m.text()); });

await page.goto(origin + '/', { waitUntil: 'commit' });
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(5000);
  const state = await page.evaluate(async () => {
    const splash = document.getElementById('sway-splash');
    let importError = null;
    let applied = 0;
    try { await import('/boot.js'); await new Promise(r => setTimeout(r, 4000)); applied = [...document.querySelectorAll('link[data-sway-style]')].filter(l => l.sheet).length; } catch (e) { importError = String(e); }
    return {
      t: Math.round(performance.now()),
      readyState: document.readyState,
      splash: splash ? splash.className : null,
      authGate: document.body.dataset.authGate,
      fonts: document.fonts?.status,
      applied,
      importError,
      mx: !!document.getElementById('mx-wave-root'),
      swController: !!navigator.serviceWorker.controller
    };
  });
  console.log('T+' + ((i + 1) * 5) + 's ' + JSON.stringify(state));
}
await browser.close();
