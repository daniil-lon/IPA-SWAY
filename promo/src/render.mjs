// Renders every <section id> in banners.html to promo/<id>.png at its own pixel size.
import {chromium} from 'playwright';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({channel:'msedge'});
const page=await browser.newPage({viewport:{width:1400,height:1000},deviceScaleFactor:1});
await page.goto(pathToFileURL(join(here,'banners.html')).href,{waitUntil:'networkidle'});
await page.evaluate(()=>document.fonts.ready);
const broken=await page.evaluate(()=>[...document.images].filter(i=>!i.naturalWidth).map(i=>i.getAttribute('src')));
if(broken.length)console.warn('missing images:',broken.join(', '));
for(const id of await page.$$eval('section[id]',s=>s.map(x=>x.id))){
 await page.locator('#'+id).screenshot({path:join(here,'..',id+'.png')});
 console.log('rendered',id);
}
await browser.close();
