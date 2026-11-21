import {webkit,devices} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const expected=await readFile('public/sw.js');
const browser=await webkit.launch({headless:true}),context=await browser.newContext({...devices['iPhone 13']}),page=await context.newPage(),responses=[];
context.on('response',r=>{
 if(!r.url().endsWith('/sw.js'))return;
 const record={url:r.url(),status:r.status(),headers:r.headers()};responses.push(record);
 r.body().then(body=>{record.size=body.length;record.hash=hash(body);record.first=body.subarray(0,100).toString();record.last=body.subarray(-150).toString();console.log('Worker response: '+body.length+' bytes, hash match '+(record.hash===hash(expected)));}).catch(e=>record.error=e.message);
});
let result;
try{
 await page.goto('https://music.academmix.ru/',{waitUntil:'commit',timeout:20000});
 await page.waitForFunction(()=>document.body?.dataset.workerError||document.body?.dataset.loadStage==='application'||document.body?.dataset.loadStage==='ready',null,{timeout:70000});
 result=await page.evaluate(()=>({...document.body.dataset}));console.log(JSON.stringify(result));
}catch(e){result={error:e.message};console.log(e.message);}
finally{await writeFile('artifacts/mobile-loading/worker-response.json',JSON.stringify({expected:{size:expected.length,hash:hash(expected)},result,responses},null,2));await browser.close();}
