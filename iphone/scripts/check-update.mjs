import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium,devices,webkit} from 'playwright';

const guest=new URL(process.argv[2]||'http://127.0.0.1:8801').origin;
const gated=new URL(process.argv[3]||'http://127.0.0.1:8802').origin;
const fixture=process.argv[4];
const captures='artifacts/sway-update';
await mkdir(captures,{recursive:true});
const browser=await chromium.launch({channel:process.env.TONIKA_BROWSER||'msedge'});
const watchErrors=page=>{
 page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('status of 401'))errors.push(m.text());});
 return errors;
};
const from=(page,url)=>page.goto(url,{waitUntil:'domcontentloaded'});
const save=(page,name)=>page.screenshot({path:captures+'/'+name+'.png',animations:'disabled'});
const settle=(page,selector)=>page.locator(selector).evaluate(e=>Promise.allSettled(e.getAnimations().map(a=>a.finished)));

async function testMotion(){
 const page=await browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
 const errors=watchErrors(page);
 await from(page,guest+'/#home');
 await page.getByRole('heading',{name:'Моя волна',exact:true}).waitFor();
 assert.equal(await page.locator('.mx-wave-brand').count(),0);
 await page.locator('.wave-light[data-ready]').waitFor();
 await save(page,'home-glass');
 const patterns=['ribbons','tide','halos','prism','petals'], samples=[];
 for(const pattern of patterns){
  await from(page,guest+'/#settings');
  const choice=page.locator('input[name=wavePattern][value='+pattern+']');
  if(!await choice.isChecked()){await choice.check();await page.getByText('Сохранено на этом устройстве').waitFor();}
  if(pattern==='petals')await save(page,'settings-phone');
  await from(page,guest+'/#home');
  const canvas=page.locator('.wave-light[data-pattern='+pattern+'][data-ready]');
  await canvas.waitFor();samples.push(await canvas.evaluate(el=>el.toDataURL()));
 }
 assert.equal(new Set(samples).size,5);
 await from(page,guest+'/#settings');
 await page.locator('input[name=motion]').uncheck();
 await from(page,guest+'/#home');
 const canvas=page.locator('.wave-light[data-pattern=petals][data-motion=gentle][data-ready]');
 await canvas.waitFor();
 const paint=await canvas.evaluate(el=>el.toDataURL());
 await page.waitForFunction(paint=>document.querySelector('canvas').toDataURL()!==paint,paint);
 await from(page,guest+'/#search');
 await page.locator('#search-query').fill('Dreamlike');
 assert.equal(await page.getByText('Искать в Яндекс Музыке',{exact:true}).count(),0);
 await from(page,guest+'/#settings/equalizer');
 await page.locator('#eq-curve').waitFor({state:'attached'});
 const flat=await page.locator('#eq-curve').getAttribute('d');
 await page.getByRole('button',{name:'Больше баса'}).click();
 await page.waitForFunction(flat=>document.querySelector('#eq-curve').getAttribute('d')!==flat,flat);
 await save(page,'equalizer-phone');
 assert.deepEqual(errors,[]);
 await page.close();
 console.log('Mobile Edge: all five patterns, gentle mode, navigation and EQ curve');
}

async function testAudio(engine,options,expectFade,label){
 const page=await engine.newPage(options);
 const errors=watchErrors(page);
 await from(page,guest+'/#home');
 await page.getByRole('button',{name:'Слушать волну'}).click();
 await page.waitForFunction(()=>{const a=document.querySelector('#audio');return !a.paused&&a.currentTime>.1&&Number.isFinite(a.duration);});
 const old=await page.locator('#audio').evaluate(el=>el.currentSrc);
 const seek=async seconds=>page.locator('#audio').evaluate((a,seconds)=>{a.currentTime=a.duration-seconds;},seconds);
 if(expectFade){
  await seek(4.6);
  await page.waitForFunction(()=>{const a=document.querySelector('#audio'),b=document.querySelector('#audio-next');return !b.paused&&b.currentTime>.25&&b.volume>.01&&a.volume<.79;});
  let [a,b]=await page.evaluate(()=>['#audio','#audio-next'].map(s=>document.querySelector(s).volume));
  assert.ok(Math.abs(a+b-.8)<.04,'overlap should preserve the volume setting');
  await page.locator('#toggle').click();
  await page.waitForFunction(()=>document.querySelector('#audio').paused&&document.querySelector('#audio-next').paused);
  assert.ok(await page.locator('#audio-next').getAttribute('src')===null);
  await page.locator('#toggle').click();
  await seek(5.8);
  await page.waitForFunction(()=>{const a=document.querySelector('#audio'),b=document.querySelector('#audio-next');return !b.paused&&b.currentTime>.3&&a.volume<.79;});
  const result=await page.waitForFunction(old=>{const a=document.querySelector('#audio');return a.currentSrc&&a.currentSrc!==old&&a.currentTime>3&&a.currentTime<7&&!a.paused;},old,{timeout:15000});
  assert.ok(await result.jsonValue());
  assert.ok(await page.locator('#audio-next').evaluate(a=>a.paused&&!a.getAttribute('src')));
  await page.locator('#queue-open').click();
  const tail=page.locator('#sheet[data-view=queue] .row-track').last();
  const tailId=await tail.getAttribute('data-play');await tail.click();
  await page.locator('#sheet .dialog-close').click();
  await page.waitForFunction(id=>{const a=document.querySelector('#audio');return a.currentSrc?.endsWith('/'+id+'.mp3')&&a.currentTime>.15&&!a.paused&&Number.isFinite(a.duration);},tailId);
  const finalTrack=await page.locator('#audio').evaluate(a=>a.currentSrc);
  await seek(5.8);
  await page.waitForFunction(()=>{const a=document.querySelector('#audio-next');return !a.paused&&a.currentTime>.3;});
  await page.waitForFunction(previous=>{const a=document.querySelector('#audio');return a.currentSrc&&a.currentSrc!==previous&&!a.paused&&a.currentTime>3;},finalTrack,{timeout:15000});
  assert.ok(await page.locator('#audio-next').evaluate(a=>a.paused&&!a.getAttribute('src')));
  await from(page,guest+'/#settings');
  await page.locator('input[name=autoplay]').uncheck();
  await seek(.9);
  await page.waitForFunction(()=>document.querySelector('#audio').ended);
  assert.ok(await page.locator('#audio-next').evaluate(a=>a.paused&&!a.getAttribute('src')));
 }else{
  await page.evaluate(()=>{
   window.swayStandbyPlayed=false;
   document.querySelector('#audio-next').addEventListener('play',()=>{window.swayStandbyPlayed=true;});
  });
  await seek(2.2);
  await page.waitForFunction(old=>{const a=document.querySelector('#audio');return a.currentSrc&&a.currentSrc!==old&&a.currentTime>.07&&!a.paused;},old,{timeout:9000});
  assert.ok(await page.locator('#audio-next').evaluate(a=>a.paused&&!a.getAttribute('src')&&!window.swayStandbyPlayed));
 }
 assert.deepEqual(errors,[]);
 await page.close();
 console.log(label+': '+(expectFade?'overlap, handoff past 3 seconds, looping mixes, pause cancellation, and autoplay disable':'sequential native playback with a single active stream'));
}

async function testProfile(){
 const browserOrigin=new URL(gated);
 assert.ok(['localhost','127.0.0.1'].includes(browserOrigin.hostname),'session fixtures must only be used on a local Worker');
 const mobile={viewport:{width:393,height:852},isMobile:true,hasTouch:true};
 const signedOut=await browser.newPage(mobile);
 const skipped=[];
 signedOut.on('request',r=>{if(new URL(r.url()).pathname==='/catalog.json')skipped.push(r.url());});
 await from(signedOut,gated+'/#profile');
 await signedOut.getByRole('heading',{name:'Войти в Sway'}).waitFor();
 assert.equal(await signedOut.locator('.mobile-nav').isVisible(),false);assert.deepEqual(skipped,[]);
 for(const path of ['/catalog.json','/media/dreamlike.mp3','/api/profile'])assert.equal((await signedOut.request.get(gated+path)).status(),401);
 await save(signedOut,'login-phone');await signedOut.close();
 if(!fixture)return;
 const owner=await browser.newPage(mobile), viewer=await browser.newPage();
 const errors=watchErrors(owner);
 for(const [page,key] of [[owner,'owner'],[viewer,'viewer']]){
  const value=(await readFile(join(fixture,'sway-qa-'+key+'.token'),'utf8')).trim();
  assert.match(value,/^[\w-]{43}$/);
  await page.context().addCookies([{name:'tonika_session',value,url:gated,httpOnly:true,sameSite:'Lax'}]);
 }
 await from(owner,gated+'/#profile');
 const edit=owner.getByRole('button',{name:'Изменить профиль'});
 await edit.click();
 const modal=owner.locator('#profile-editor[open]');
 await settle(owner,'#profile-editor');
 await modal.locator('input[name=name]').fill('Даниил Слушает');
 await modal.locator('input[name=handle]').fill('sway_studio');
 await modal.locator('textarea[name=bio]').fill('Сохраняю всё, что хочется переслушать.');
 await modal.locator('select[name=profileTrack]').selectOption('dreamlike');
 const cover=await owner.evaluate(()=>{
  const image=document.createElement('canvas');image.width=780;image.height=420;
  const c=image.getContext('2d'), g=c.createLinearGradient(0,0,780,410);g.addColorStop(0,'#393c88');g.addColorStop(.58,'#1b9a88');g.addColorStop(1,'#e4ae7c');
  c.fillStyle=g;c.fillRect(0,0,780,420);
  c.strokeStyle='#f4fffab0';c.lineWidth=4;for(let i=0;i<14;i++){c.beginPath();c.ellipse(400+i*4,215-i*4,60+i*17,23+i*8,-.48,0,Math.PI*2);c.stroke();}
  return image.toDataURL().split(',')[1];
 });
 const image={name:'glass.png',mimeType:'image/png',buffer:Buffer.from(cover,'base64')};
 await modal.locator('[data-profile-file=cover]').setInputFiles(image);
 await modal.locator('[data-profile-preview=cover]').waitFor();
 await modal.locator('[name=coverZoom]').press('End');
 await modal.locator('[data-profile-file=avatar]').setInputFiles(image);
 await modal.locator('[data-profile-preview=avatar]').waitFor();
 await modal.locator('input[name=name]').scrollIntoViewIfNeeded();
 await save(owner,'profile-editor-phone');
 await modal.getByRole('button',{name:'Сохранить',exact:true}).click();
 await modal.waitFor({state:'hidden'});
 await owner.reload();await owner.getByRole('heading',{name:'Даниил Слушает'}).waitFor();
 assert.equal(await owner.locator('.sway-profile-cover').getAttribute('data-profile-zoom'),'1.8');
 await owner.locator('.sway-profile-cover img').evaluate(i=>i.decode());
 await owner.locator('.sway-profile-avatar img').evaluate(i=>i.decode());
 await save(owner,'profile-phone');
 assert.equal((await viewer.request.get(gated+'/api/profiles/sway_studio')).status(),404);
 await edit.click();
 await modal.getByRole('switch',{name:/Доступ по ссылке/}).check();
 await modal.getByRole('button',{name:'Сохранить',exact:true}).click();
 await modal.waitFor({state:'hidden'});
 await from(viewer,gated+'/#u/sway_studio');
 await viewer.getByRole('heading',{name:'Даниил Слушает'}).waitFor();
 assert.deepEqual(await viewer.locator('[data-action=profile-edit]').count(),0);
 const range=await owner.request.get(gated+'/media/dreamlike.mp3',{headers:{Range:'bytes=0-511'}});
 assert.equal(range.status(),206);assert.equal((await range.body()).length,512);
 await from(owner,gated+'/#home');
 await owner.getByRole('button',{name:'Слушать волну'}).click();
 await owner.waitForFunction(()=>document.querySelector('#audio').currentTime>.2);
 await from(owner,gated+'/#settings');
 await owner.locator('input[name=wavePattern][value=prism]').check();
 await owner.getByText('Сохранено',{exact:true}).waitFor();
 await owner.reload();await owner.locator('input[name=wavePattern][value=prism]').waitFor();
 assert.ok(await owner.locator('input[name=wavePattern][value=prism]').isChecked());
 await from(owner,gated+'/#profile');
 await owner.getByRole('button',{name:'Выйти',exact:true}).click();
 await owner.getByRole('heading',{name:'Войти в Sway'}).waitFor();
 assert.ok(await owner.locator('#audio').evaluate(a=>a.paused&&!a.getAttribute('src')));
 assert.deepEqual(errors,[]);
 await Promise.all([owner.close(),viewer.close()]);
 console.log('Local D1 / Edge: sign-in gate, protected audio, image crop and persistence, shared profile, preferences and logout');
}

try{
 const ios=async()=>{
  if(!process.env.SWAY_WEBKIT)return;
  const engine=await webkit.launch();
  try{await testAudio(engine,devices['iPhone 15'],false,'WebKit iPhone profile');}finally{await engine.close();}
 };
 await testMotion();
 await testAudio(browser,{viewport:{width:1200,height:870}},true,'Desktop Edge');
 await ios();
 await testProfile();
}finally{await browser.close();}
