import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';
const {origin,server}=await servePlayer({catalog:[track,nextTrack,{...nextTrack,id:'test-third',title:'Ещё один трек'}]});
const browser=await chromium.launch({channel:'msedge'});
try{
 const page=await browser.newPage({...devices['iPhone 15'],viewport:{width:393,height:852},locale:'ru-RU'});
 await page.goto(origin);await page.locator('.mx-start').tap();
 await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.1);
 await page.evaluate(()=>['test-next','test-third'].forEach(id=>{const b=document.createElement('button');b.dataset.add=id;document.body.append(b);b.click();b.remove();}));
 await page.locator('#queue-open').dispatchEvent('click');await page.locator('.queue-item').first().waitFor();
 await page.screenshot({path:'artifacts/sway-new-queue.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#sheet .dialog-close').tap();await page.evaluate(()=>location.hash='#settings');
 await page.getByRole('switch',{name:'Ровная громкость',exact:true}).waitFor();
 await page.screenshot({path:'artifacts/sway-new-settings.png'});
 await page.locator('[data-action=install]').tap();await page.locator('#pwa-ios-modal').waitFor();
 await page.screenshot({path:'artifacts/sway-install-iphone.png'});
 assert.equal(await page.locator('#pwa-install-banner').count(),0);
 console.log('Mobile queue/settings fit the viewport; iPhone installation guidance opens without an automatic overlay.');
}finally{await browser.close();server.close();server.closeAllConnections();}
