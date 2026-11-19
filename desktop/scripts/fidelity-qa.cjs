const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts/fidelity-v2');
fs.mkdirSync(out, {recursive:true});
const results=[];
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const target=process.env.SWAY_QA_TARGET||'source';
const reportFile=path.join(out,target==='source'?'runtime-report.json':'packaged-runtime-report.json');
let browser,page,originalStorage;
async function restore(){
 if(page&&originalStorage){
  await page.addInitScript(()=>{const raw=sessionStorage.getItem('sway.fidelity.restore');if(!raw)return;sessionStorage.removeItem('sway.fidelity.restore');for(const key of Object.keys(localStorage).filter(k=>k.startsWith('sway.desktop.')))localStorage.removeItem(key);for(const [key,value]of Object.entries(JSON.parse(raw)))localStorage.setItem(key,value);});
  await page.evaluate(values=>sessionStorage.setItem('sway.fidelity.restore',JSON.stringify(values)),originalStorage);
  await page.setViewportSize({width:1280,height:800});
  await page.reload({waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForSelector('html[data-ready=true]',{timeout:15000});
  await page.evaluate(()=>document.querySelector('audio').pause());
 }
 if(browser)await browser.close();
}
(async()=>{
 browser=await chromium.connectOverCDP(process.env.SWAY_CDP_URL||'http://127.0.0.1:9238');
 page=browser.contexts()[0].pages().find(p=>p.url().startsWith('sway://app/'));
 assert(page,'Native player must be open');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForSelector('html[data-ready=true]');
 originalStorage=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('sway.desktop.')).map(k=>[k,localStorage.getItem(k)])));
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>document.querySelector('.wave-video')?.readyState>=2);
 const video=await page.locator('.wave-video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration,muted:v.muted,paused:v.paused,error:v.error?.code||null}));
 assert(video.width===1000&&video.height===1000&&video.muted&&!video.error,'Reference video decoded');
 results.push({name:'reference wave decodes and autoplays muted',pass:true,detail:video});
 await page.mouse.move(5,5);
 await page.screenshot({path:path.join(out,'home-v2.png')});
 await page.locator('.nav-main [data-go=search]').click();
 await page.waitForSelector('.search-category');
 await page.locator('.search-field input').focus();
 await page.mouse.move(5,5);
 await page.screenshot({path:path.join(out,'search-v2.png')});
 const geometry=await page.evaluate(()=>Object.fromEntries(['.search-field','.search-browse-tabs','.search-section-title','.category-stack','.search-category strong','.artist-recommends','.recommend-card','.missed-section'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),c=getComputedStyle(e);return[s,{x:r.x,y:r.y,width:r.width,height:r.height,fontSize:c.fontSize,lineHeight:c.lineHeight,color:c.color}]})));
 results.push({name:'search geometry and reference artwork',pass:true,detail:geometry});
 await page.locator('.search-field input').fill('Miyagi');
 await page.waitForSelector('.track-row');
 await page.locator('.track-row').first().hover();
 await page.locator('.row-play').first().click();
 await page.waitForFunction(()=>{const a=document.querySelector('audio');return a&&!a.paused&&a.currentTime>0.1});
 results.push({name:'audio playback after visual changes',pass:true});
 await page.evaluate(()=>document.querySelector('audio').pause());
 await page.locator('.nav-main [data-go=collection]').click();
 await page.waitForSelector('.collection-liked img');
 const heart=await page.locator('.collection-liked img').evaluate(i=>({loaded:i.complete&&i.naturalWidth===280,src:i.getAttribute('src')}));
 assert(heart.loaded,'Original heart loaded');
 await page.mouse.move(5,5);
 await page.screenshot({path:path.join(out,'collection-v2.png')});
 results.push({name:'folded heart and collection rendering',pass:true,detail:heart});
 await page.locator('.nav-main [data-go=home]').click();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>document.querySelector('.wave-video')?.paused);
 results.push({name:'reduced motion pauses decorative animation',pass:true});
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.waitForFunction(()=>document.querySelector('.wave-video')?.paused===false);
 results.push({name:'animation resumes after reduced motion changes',pass:true});
 for(let i=0;i<3;i++){
  await page.locator('.nav-main [data-go=search]').click();
  await page.locator('.nav-main [data-go=home]').click();
 }
 assert(await page.locator('video').count()===1,'Navigation does not duplicate video');
 results.push({name:'wave cleanup across repeated navigation',pass:true});
 for(const size of [{width:960,height:680},{width:1440,height:900}]){
  await page.setViewportSize(size);
  await page.locator('.nav-main [data-go=search]').click();
  const bounds=await page.locator('.category-stack').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right}}));
  assert(bounds.length===5&&bounds.every(r=>r.left>=224&&r.right<=size.width-12),'All five categories fit at '+size.width);
  const likeBox=await page.locator('.like-current').boundingBox(),transportBox=await page.locator('.transport').boundingBox();
  assert(likeBox.x+likeBox.width<=transportBox.x,'Player buttons must not overlap at '+size.width);
  await page.mouse.move(5,5);
  await page.screenshot({path:path.join(out,`search-v2-${size.width}x${size.height}.png`)});
  results.push({name:'category access and player spacing at emulated '+size.width+'x'+size.height,pass:true});
 }
 await page.mouse.move(5,5);
 assert(errors.length===0,'Renderer errors: '+errors.join('; '));
 await restore();
 const report={generatedAt:new Date().toISOString(),target,results,rendererErrors:errors,passed:results.length,failed:0,settingsRestored:true};
 fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
})().catch(async error=>{console.error(error);await restore().catch(()=>{});fs.writeFileSync(reportFile,JSON.stringify({target,results,error:error.message},null,2));process.exitCode=1;});
