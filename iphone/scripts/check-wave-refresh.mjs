import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {servePlayer} from './player-fixture.mjs';
const fixture=await servePlayer();
try{for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge'}:{})});
 try{
  const page=await browser.newPage();await page.goto(fixture.origin+'/wave-deck.js');
  await page.evaluate(async()=>{
   document.body.innerHTML='<div id="frame"><div class="wave-deck" tabindex="0" style="display:flex;width:393px;overflow:auto;position:relative"></div><button data-deck-back></button><button data-deck-next></button></div>';
   const {mountWaveDeck}=await import('/wave-deck.js');let revision=0;
   const frame=document.querySelector('#frame');
   const control=mountWaveDeck(frame,{initial:0,initialKey:'0-0',signal:new AbortController().signal,onCenter(){},maker(slot){const el=document.createElement('div');el.style.cssText='flex:0 0 141px;height:100px';el.dataset.deckItem=slot+'-'+revision;return el;}});
   window.refreshDuringMotion=()=>{control.center(1,true);revision++;control.refresh();};
  });
  await page.waitForFunction(()=>document.querySelector('[data-centered]'));
  await page.evaluate(()=>window.refreshDuringMotion());
  await page.waitForTimeout(650);
  const slot=await page.locator('[data-centered]').getAttribute('data-deck-slot');
  assert.equal(slot,'1',engine.name()+': refreshing changed recommendations must finish the requested movement');
  console.log('PASS '+engine.name()+': recommendation refresh during deck movement');
 }finally{await browser.close();}
}}finally{fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));}
