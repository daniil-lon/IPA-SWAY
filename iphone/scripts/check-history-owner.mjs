import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {servePlayer,track} from './player-fixture.mjs';
const fixture=await servePlayer(),browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const [owner,count]of [['private-owner',0],['guest',1]]){
  const context=await browser.newContext(),page=await context.newPage();
  await page.addInitScript(({id,owner})=>{localStorage.setItem('tonika.recent-tracks',JSON.stringify([id]));localStorage.setItem('tonika.queue-owner',JSON.stringify(owner));},{id:track.id,owner});
  await page.goto(fixture.origin+'/#history');await page.waitForSelector('body[data-page=history]');
  await page.waitForSelector('main .browse-category');
  assert.equal(await page.locator('main [data-row]').count(),count,'Legacy history belongs to '+owner);await context.close();
 }
 console.log('PASS legacy account history stays private and guest history remains available');
}finally{await browser.close();fixture.server.close();}
