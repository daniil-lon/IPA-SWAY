import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';
const fixture=await servePlayer({handler:async(req,res,path)=>{
 if(path==='/test-experience'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/sway.css"><main id="root"></main>');return true;}return false;
}});
try{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge',args:['--autoplay-policy=no-user-gesture-required','--mute-audio']}:{})});
  try{
   const page=await browser.newPage({...devices['iPhone 13']});page.setDefaultTimeout(10000);
   async function init(){
    await page.goto('about:blank');
    await page.goto(fixture.origin+'/test-experience#library/playlists');
    await page.evaluate(async tracks=>{
     const {createPlaylists}=await import('/playlists.js');
     const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
     const draw=()=>document.querySelector('#root').innerHTML=lists.view();
     window.lists=createPlaylists({api:()=>{throw Error('Guest must stay local');},html,icon:()=>'<svg></svg>',getTracks:()=>tracks,getUser:()=>null,isOffline:()=>false,onChange:draw,onPlay:()=>{},rows:()=>'',header:(text,back)=>`<a href="${back}">Назад</a><h1>${text}</h1>`,notice:()=>{}});
     await lists.load();addEventListener('hashchange',draw);draw();
    },[track,nextTrack]);
   }
   await init();await page.locator('[data-playlist-new]').first().click();await page.locator('#playlist-dialog input[name=name]').fill('В машину');await page.locator('#playlist-dialog [type=submit]').click();
   await page.locator('[data-folder-new]').click();await page.locator('#playlist-dialog input[name=name]').fill('Дорога');await page.locator('#playlist-dialog [type=submit]').click();
   await page.getByRole('link',{name:/В машину/}).click();await page.locator('[data-folder-choose]').click();await page.locator('[data-folder-target]').filter({hasText:'Дорога'}).click();
   await page.getByRole('link',{name:'Назад',exact:true}).click();assert.equal(await page.getByRole('link',{name:/В машину/}).count(),0,'Filed playlists leave the unfiled list');
   await init();await page.getByRole('link',{name:/Дорога/}).click();await page.getByRole('link',{name:/В машину/}).waitFor();
   await page.locator('[data-folder-rename]').click();await page.locator('#playlist-dialog input[name=name]').fill('Путешествия');await page.locator('#playlist-dialog [type=submit]').click();
   await page.locator('[data-folder-delete]').click();await page.locator('[data-folder-confirm]').click();await page.getByRole('link',{name:/В машину/}).waitFor();
   // Report failures keep entered text; a retry reuses its id and confirms only after success.
   await page.evaluate(async t=>{
    const {createTrackReporter}=await import('/track-report.js');window.reports=[];
    const report=createTrackReporter({html:s=>String(s).replaceAll('<','&lt;'),icon:()=>'',metrics:{snapshot:()=>[]},api:async(path,method,body)=>{reports.push(body);if(reports.length===1)throw Error('offline');return {ok:true};}});report(t);
   },track);
   await page.locator('#track-report-dialog textarea').fill('Звук прерывается');await page.locator('#track-report-dialog [type=submit]').click();
   await page.getByRole('status').filter({hasText:'Не удалось отправить'}).waitFor();assert.equal(await page.locator('#track-report-dialog textarea').inputValue(),'Звук прерывается');
   await page.locator('#track-report-dialog [type=submit]').click();await page.getByRole('status').filter({hasText:'Сообщение отправлено'}).waitFor();
   assert.equal(await page.evaluate(()=>reports.length===2&&reports[0].id===reports[1].id),true);
   // Timing retries retain the batch identity; a prepared element cannot report first sound.
   const measured=await page.evaluate(async()=>{
    const {createPlaybackMetrics}=await import('/playback-metrics.js');
    let now=200,attempts=0;const sent=[],a=new EventTarget(),b=new EventTarget();Object.assign(a,{paused:false,seeking:false,currentTime:1,readyState:4});Object.assign(b,{paused:false,seeking:false,currentTime:1,readyState:4});
    const metrics=createPlaybackMetrics([a,b],()=>a,{clock:()=>now,platform:'ios',send:async(path,init)=>{sent.push(JSON.parse(init.body));if(++attempts===1)throw Error('offline');return {ok:true};}});
    metrics.ready();metrics.ready();metrics.begin();b.dispatchEvent(new Event('playing'));now=600;a.dispatchEvent(new Event('playing'));
    a.dispatchEvent(new Event('waiting'));now=1100;a.dispatchEvent(new Event('playing'));
    a.seeking=true;a.dispatchEvent(new Event('waiting'));a.seeking=false;now=1900;a.dispatchEvent(new Event('playing'));
    await metrics.flush();await metrics.flush();return {samples:metrics.snapshot(),same:sent[0].id===sent[1].id};
   });
   assert.equal(measured.same,true);assert.deepEqual(measured.samples.map(s=>[s.metric,s.ms]),[['startup',200],['first_audio',400],['rebuffer',500]]);
   console.log('PASS '+engine.name()+': guest folder move/reload/rename/delete, report failure/retry, timing isolation and deduplication');
   await page.close();
  }finally{await browser.close();}
 }
}finally{fixture.server.close();}
