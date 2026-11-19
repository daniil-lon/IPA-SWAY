import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium,webkit,devices} from 'playwright';
import {servePlayer} from './player-fixture.mjs';

const {origin,server}=await servePlayer(),tracks=JSON.parse(await readFile('public/catalog.json','utf8')),results=[];
try{
 for(const engine of ['edge','webkit']){
  const browser=engine==='edge'?await chromium.launch({channel:'msedge'}):await webkit.launch();
  try{
   for(const [width,height] of engine==='edge'?[[320,568],[393,852],[744,1133],[1440,900]]:[[393,852]]){
    const page=await browser.newPage({...(width<731?devices['iPhone 15']:{}),viewport:{width,height},serviceWorkers:'block'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/catalog.json',r=>r.fulfill({json:tracks}));
    await page.goto(origin+'/#discover');await page.locator('.shelf-artists a').first().waitFor();
    await page.waitForFunction(()=>!document.querySelector('#main').getAnimations().some(a=>a.playState==='running'));
    const layout=await page.locator('.discover-view').evaluate(el=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,categories:[...el.querySelectorAll('.catalog-icons a')].map(e=>({width:e.clientWidth,height:e.clientHeight,href:e.getAttribute('href')})),heroHeight:el.querySelector('.discover-callout').clientHeight,mixesTop:el.querySelector('#discover-mixes').getBoundingClientRect().top}));
    assert.equal(layout.overflow,false,JSON.stringify(layout));assert.equal(layout.categories.length,3);assert.ok(layout.categories.every(c=>c.height>=44));
    await page.screenshot({path:'artifacts/sway-discover-'+engine+'-'+width+'.png',scale:'css',fullPage:true});
    const started=Date.now();await page.locator('.discover-search').click();await page.waitForURL('**/#search');
    if(width>=731){
     assert.equal(await page.locator('#search-results .row').count(),80);
     await page.getByRole('button',{name:'Показать ещё',exact:true}).click();
     assert.equal(await page.locator('#search-results .row').count(),160);
     await page.locator('#search-query').fill(tracks.at(-1).title);
     assert.ok(await page.locator('#search-results [data-play="'+tracks.at(-1).id+'"]').count()>0,'the last catalogue track remains searchable');
    }
    assert.deepEqual(errors,[]);const receipt={engine,...layout,searchNavigationMs:Date.now()-started};results.push(receipt);console.log(JSON.stringify(receipt));await page.close();
   }
  }finally{await browser.close();}
 }
 await writeFile('artifacts/sway-discovery-layout-check.json',JSON.stringify(results,null,2));
}finally{server.closeAllConnections();server.close();}
