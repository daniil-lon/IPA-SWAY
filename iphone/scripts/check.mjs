import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {checkWave} from './check-wave.mjs';
const origin=(process.argv[2]||'http://127.0.0.1:8794').replace(/\/$/,'');
const get=async (path,init)=>await fetch(origin+path,{signal:AbortSignal.timeout(10000),...init});
let catalog;if(process.env.TONIKA_BROWSER_ONLY){catalog=JSON.parse(await readFile('public/catalog.json','utf8'));}else{
const [health,remoteCatalog]=await Promise.all(['/api/health','/catalog.json'].map(p=>get(p).then(r=>{assert.equal(r.status,200);return r.json();})));
catalog=remoteCatalog;
assert.equal(health.ok,true);
assert.equal(health.tracks,catalog.length);
 assert.ok(catalog.length>=29);
assert.equal(new Set(catalog.map(t=>t.id)).size,catalog.length);
const icon=await get('/art/icon-192.png');
assert.match(icon.headers.get('content-type'),/image\/png/);
const login=await get('/auth/yandex',{redirect:'manual'});
assert.equal(login.status,303);
assert.match(login.headers.get('location'),health.loginConfigured?/^https:\/\/oauth\.yandex\.ru\//:/^\/\?login=unavailable/);
const me=await get('/api/me').then(r=>r.json());
assert.equal(me.user,null);
const unauth=await get('/api/me',{method:'PATCH',headers:{'Content-Type':'application/json',Origin:origin},body:'{}'});
assert.equal(unauth.status,401);
for(const t of catalog){
 const r=await get(t.audio,{headers:{Range:'bytes=0-511'}});
 assert.equal(r.status,206,t.id);
 assert.equal((await r.arrayBuffer()).byteLength,512);
 assert.match(r.headers.get('content-type'),/audio\//);
}
}
const browser=await chromium.launch({channel:process.env.TONIKA_BROWSER||'msedge'});
await mkdir('artifacts',{recursive:true});
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:960}],['mobile',{width:393,height:786}]]){
  const p=await browser.newPage({viewport,isMobile:name==='mobile',hasTouch:name==='mobile'});
  const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.goto(origin);await (name==='mobile'?p.locator('.mx-idle h1'):p.getByRole('heading',{name:'Моя волна'})).waitFor();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.evaluate(async()=>{await Promise.all([...document.images].filter(img=>img.loading!=='lazy').map(img=>img.decode()));});
  // Reference frame scaled to 393 CSS px, with iOS chrome excluded.
  const near=async (selector,coordinates,gap=5)=>{
   await p.locator('main').evaluate(el=>Promise.allSettled(el.getAnimations().map(a=>a.finished)));
   const box=await p.locator(selector).first().boundingBox();
   assert.ok(box,selector);
   for(const [key,expected] of Object.entries(coordinates)){
    assert.ok(Math.abs(box[key]-expected)<=gap,selector+' '+key+': '+box[key]+' expected '+expected);
   }
  };
  if(name==='mobile'){
   await near('.mx-start',{x:149,y:271,width:94,height:94});
   await near('.mx-wave-bar',{x:31,y:377,width:331,height:55});
  }
  await p.screenshot({path:'artifacts/'+name+'.png'});
  await p.getByRole('button',{name:'Слушать волну'}).click();
  await p.waitForFunction(()=>{const a=document.querySelector('audio');return !a.paused&&a.currentTime>.12;});
  if(name==='mobile'){
   await p.locator('.mx-live h1').waitFor();
   await p.waitForFunction(()=>+getComputedStyle(document.querySelector('.mx-live')).opacity>.999);
   await near('.mx-wave-cover',{x:149,y:271,width:94,height:94});
   await p.screenshot({path:'artifacts/mobile-playing.png'});
  }
  await p.locator(name==='mobile'?'.mx-wave .mx-track':'#now-open').click();
  await p.locator('dialog[open]').waitFor();
  if(name==='mobile'){
   const full=p.locator('dialog[data-view="full"]');
   await full.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
   assert.equal(Math.round((await full.boundingBox()).width),viewport.width);
   await p.locator('.full-cover').evaluate(img=>img.decode());
   await near('.full-cover',{x:24,y:74,width:348,height:355});
   await near('.mx-full-meta',{x:24,y:454,height:51});
   await near('.mx-full-ctrl .mx-yellow',{y:577,width:64,height:64});
   await p.screenshot({path:'artifacts/mobile-player.png'});
   await full.getByRole('button',{name:'Очередь',exact:true}).click();
   await p.locator('#sheet[data-view="queue"] .row').first().waitFor();
   await p.locator('#sheet .dialog-close').click();
   await p.locator('#sheet').waitFor({state:'hidden'});
   await full.waitFor();
  }
  await p.locator('.full-seek').focus();
  await p.locator('.full-seek').evaluate(el=>{el.value='500';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await p.waitForFunction(()=>document.querySelector('audio').currentTime>10);
  if(name==='mobile'){
   const previous=await p.locator('#audio').evaluate(audio=>audio.currentSrc);
   await p.locator('#dialog').getByRole('button',{name:'Следующий трек',exact:true}).click();
   await p.waitForFunction(src=>{
    const audio=document.querySelector('audio');
    return audio.currentSrc!==src&&!audio.paused&&audio.currentTime>.12;
   },previous);
  }
  await p.locator('#dialog .dialog-close').click();
  await p.locator('#dialog').waitFor({state:'hidden'});

  await p.goto(origin+'/#search');
  await p.locator('#search-query').fill(catalog[0].title);
  assert.equal(await p.locator('#search-results [data-row]').count(),1);
  if(name==='mobile'){
   await p.locator('#search-results [data-info-track]').click();
   await p.locator('#sheet [data-like]').click();
   await p.locator('#sheet .dialog-close').click();
   await p.locator('#sheet').waitFor({state:'hidden'});
  }else await p.locator('#search-results [data-like]').click();
  await p.goto(origin+'/#library');
  assert.equal(await p.locator('[data-row]').getAttribute('data-row'),catalog[0].id);
  if(name==='mobile'){
   await near('.collection-mix .mx-mix',{x:16,y:48,width:361,height:64});
   await near('.collection-favorites .shelf-shortcut',{x:16,y:163,width:361,height:64});
   await p.screenshot({path:'artifacts/mobile-library.png'});
   await p.locator('[data-info-track]').click();
   assert.equal(await p.locator('#sheet .mx-info-top h2').textContent(),catalog[0].title);
   assert.ok(await p.locator('#sheet').getByRole('button',{name:'Добавить в очередь'}).isVisible());
   await p.locator('#sheet').getByRole('button',{name:'Источник и лицензия'}).click();
   assert.equal(await p.locator('#sheet').getByRole('link',{name:catalog[0].license}).getAttribute('href'),catalog[0].licenseUrl);
   await p.locator('#sheet .dialog-close').click();
   await p.locator('#sheet').waitFor({state:'hidden'});
  }
  await p.goto(origin+'/#settings');
  if(name==='mobile'){
   await p.goto(origin+'/#discover');
   await p.getByRole('heading',{name:'Что послушать',exact:true}).waitFor();
   await near('.catalog-icons',{y:71,width:393});
   await p.locator('#discover-chart .scc-list li').first().waitFor();
   await p.screenshot({path:'artifacts/mobile-discover.png'});
   assert.equal(await p.locator('.mobile-nav a[data-nav="discover"]').getAttribute('aria-current'),'page');
   await p.getByRole('button',{name:'по настроению',exact:true}).click();
   assert.equal(await p.locator('#discover-mixes [data-wave-mood]').count(),4);
   await p.getByRole('link',{name:'Жанры',exact:true}).click();
   await p.getByRole('link',{name:catalog[0].genre,exact:true}).click();
   await p.getByRole('heading',{name:catalog[0].genre,exact:true}).waitFor();
   assert.ok(await p.locator('main [data-row="'+catalog[0].id+'"]').count());
   await p.goto(origin+'/#history');
   await p.locator('main [data-row]').first().waitFor();
   await p.goto(origin+'/#liked');
   await p.getByRole('heading',{name:'Мне нравится'}).waitFor();
   await near('.mx-heart-actions .mx-yellow',{y:332,height:64});
   await near('.mx-filters',{y:453});
   assert.equal(await p.locator('main .row').count(),1);
   await p.getByRole('button',{name:'Скачать треки',exact:true}).click();
   const download=await p.locator('#sheet [download]').getAttribute('href');
   assert.equal(download,catalog[0].audio);
   await p.locator('#sheet .dialog-close').click();
   await p.locator('#sheet').waitFor({state:'hidden'});
   await p.getByRole('button',{name:'Бодрое',exact:true}).click();
   assert.equal(await p.locator('main .row').count(),0);
   await p.getByRole('button',{name:'Всё',exact:true}).click();
   assert.equal(await p.locator('main .row').count(),1);
   await p.goto(origin+'/#profile');
   await p.getByRole('link',{name:'Настройки'}).filter({visible:true}).click();
  }
  await p.locator('input[name="autoplay"]').setChecked(false);
  await p.getByText('Сохранено на этом устройстве',{exact:true}).waitFor();
  const slider=p.locator('input[name="volume"]');
  await slider.press('End');
  await slider.press('ArrowLeft');
  assert.equal(await p.locator('#setting-volume-value').textContent(),'99%');
  if(name==='mobile'){
   assert.equal(await p.locator('.mobile-nav a').count(),3);
   assert.equal(await p.locator('.mobile-nav a[data-nav="library"]').getAttribute('aria-current'),'page');
  }
  await p.reload();
  await p.locator('input[name="autoplay"]').waitFor();
  assert.equal(await p.locator('input[name="autoplay"]').isChecked(),false);
  assert.equal(await p.locator('input[name="volume"]').inputValue(),'99');
  if(name==='mobile'){
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await p.screenshot({path:'artifacts/mobile-settings.png'});
   await p.getByRole('link',{name:/^Эквалайзер/}).click();
   await p.getByRole('button',{name:'Больше баса'}).click();
   await p.locator('[data-eq-band="0"]').press('ArrowUp');
   assert.equal(await p.locator('[data-eq-band="0"]').inputValue(),'7');
   await p.reload();
   await p.getByRole('switch',{name:/Эквалайзер/}).waitFor();
   assert.ok(await p.locator('#eq-enabled').isChecked());
   assert.equal(await p.locator('[data-eq-band="0"]').inputValue(),'7');
   await p.goto(origin+'/#home');
   await p.getByRole('button',{name:'Слушать волну'}).click();
   await p.waitForFunction(()=>!document.querySelector('audio').paused&&document.querySelector('audio').currentTime>.2);
   await p.locator('.mx-pause').click();
  }
  if(name==='desktop'){
   const details=await p.evaluate(async ({list})=>{
    const results=[];
    for(const t of list){
     const audio=document.createElement('audio');
     audio.preload='metadata';
     const result=await new Promise(resolve=>{
      const timeout=setTimeout(()=>resolve({id:t.id,error:'timeout'}),9000);
      audio.addEventListener('loadedmetadata',()=>{clearTimeout(timeout);resolve({id:t.id,duration:audio.duration});},{once:true});
      audio.addEventListener('error',()=>{clearTimeout(timeout);resolve({id:t.id,error:audio.error?.message});},{once:true});
      audio.src=t.audio;
     });
     audio.removeAttribute('src');audio.load();results.push(result);
    }
    return results;
   },{list:catalog});
   for(const [i,detail] of details.entries()){
    assert.ok(Number.isFinite(detail.duration)&&detail.duration>20,JSON.stringify(detail));
    if(catalog[i].seconds)assert.ok(Math.abs(detail.duration-catalog[i].seconds)<3,JSON.stringify(detail));
   }
   console.log('Metadata and duration confirmed for '+details.length+' audio files');
  }
  if(name==='mobile'){
   for(const [width,height] of [[360,800],[393,852],[430,932]]){
    await p.setViewportSize({width,height});
    await p.goto(origin+'/#home');
    await p.locator('.mx-idle h1').waitFor();
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(Math.round((await p.locator('.mobile-nav').boundingBox()).width),Math.min(620,width-28));
   }
  }
  assert.deepEqual(errors,[]);
  console.log(name+': layout, audio, seek, search, likes and settings passed');
  await p.close();
 }
 await checkWave(browser,origin,catalog);
}finally{await browser.close();}
