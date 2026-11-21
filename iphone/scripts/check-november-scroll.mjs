import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium,webkit,devices} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';

const source=JSON.parse(await readFile('public/catalog.json','utf8'));
const art=source.find(t=>t.artist==='MOT'&&t.title==='День и Ночь').art;
const {server,origin}=await servePlayer({catalog:[{...track,art},nextTrack]}),results=[];
try{
 for(const [label,engine] of [['Chromium',chromium],['WebKit',webkit]]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge',args:['--mute-audio']}:{})});
  try{
   const page=await browser.newPage({...devices['iPhone 13'],viewport:{width:393,height:852}});
   await page.route('**/*.css',async route=>{
    const response=await route.fetch(),body=(await response.text()).replace(/env\(safe-area-inset-top(?:\s*,[^)]+)?\)/g,'56px').replace(/env\(safe-area-inset-bottom(?:\s*,[^)]+)?\)/g,'34px');
    await route.fulfill({response,body});
   });
   await page.goto(origin+'/#home');await page.locator('.wave-light[data-ready]').waitFor();
   await page.locator('.mx-start').tap();await page.locator('.mx-track').tap();await page.waitForTimeout(700);
   const frame=await page.locator('.wave-light').evaluate(c=>c.toDataURL());await page.waitForTimeout(250);
   assert.ok(await page.locator('.wave-light').evaluate((c,before)=>c.toDataURL()===before,frame),'Covered home stops repainting');
   await page.locator('#dialog').evaluate(el=>{el.scrollTop=440;});
   await page.waitForFunction(()=>{const dock=document.querySelector('.full-dock'),header=document.querySelector('.mx-full header');return !dock.inert&&+getComputedStyle(dock).opacity>.99&&+getComputedStyle(header,'::before').opacity>.99;});
   const state=await page.locator('.mx-full').evaluate(el=>{
    const dock=el.querySelector('.full-dock'),r=dock.getBoundingClientRect();
    return {scene:el.querySelector('.player-scene').getBoundingClientRect().y,header:el.querySelector('header').getBoundingClientRect().y,top:r.top,bottom:r.bottom,hit:document.elementFromPoint(r.x+40,r.y+20)?.closest('.full-dock')===dock};
   });
   assert.equal(state.scene,0);assert.equal(state.header,0);assert.ok(state.top>0&&state.bottom<=818);assert.ok(state.hit);
   await page.screenshot({path:`artifacts/november-21-reference/final-scroll-${label}.png`,scale:'css'});
   await page.locator('.full-dock-track').tap();await page.waitForFunction(()=>document.querySelector('#dialog').scrollTop<5);
   await page.locator('#dialog .dialog-close').tap();await page.locator('#dialog').waitFor({state:'hidden'});
   await page.waitForFunction(before=>document.querySelector('.wave-light').toDataURL()!==before,frame,{timeout:10000});
   results.push({label,...state,coveredCanvasStopped:true,resumed:true});console.log(label+': PASS sticky header/dock, covered canvas pause and resume');
  }finally{await browser.close();}
 }
 await writeFile('artifacts/november-21-reference/scroll-validation.json',JSON.stringify({at:new Date().toISOString(),results},null,2));
}finally{server.closeAllConnections();server.close();}
