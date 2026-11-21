import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';

const {origin,server}=await servePlayer();
const shared={...track,id:'1-kla-музыка-нас-связала',title:'Музыка нас связала',artist:'1.Kla$'};
try{
 for(const [name,engine,options] of [['Edge',chromium,{channel:'msedge'}],['WebKit',webkit,{}]]){
  const browser=await engine.launch(options);
  try{
   const context=await browser.newContext({...devices['iPhone 15'],serviceWorkers:'block'});
   await context.route('**/catalog.json',r=>r.fulfill({json:[shared,nextTrack]}));
   await context.route('**/albums.json',r=>r.fulfill({json:[]}));
   await context.route('**/artists.json',r=>r.fulfill({json:[]}));
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/#search/'+encodeURIComponent(shared.id));
   const query=page.locator('#search-query');await query.waitFor();
   assert.equal(await query.inputValue(),shared.title);
   await page.locator('[data-play="'+shared.id+'"]:visible').first().tap();
   await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.1);
   await page.goto(origin+'/#search/%E0%A4');await page.locator('#search-query').waitFor();
   assert.equal(await page.locator('body').getAttribute('data-page'),'search');
   assert.deepEqual(errors,[]);
   console.log(name+': encoded Cyrillic track link opens the matching song, plays it, and malformed URLs do not crash search.');
  }finally{await browser.close();}
 }
}finally{server.closeAllConnections();server.close();}
