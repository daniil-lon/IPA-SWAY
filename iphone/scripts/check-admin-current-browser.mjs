import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {servePlayer} from './player-fixture.mjs';
let overviewReads=0;
const fixture=await servePlayer({handler:async(req,res,path)=>{
 if(path==='/admin'){
  res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:"});
  res.end(await readFile('public/admin.html'));return true;
 }
 if(!path.startsWith('/api/admin/'))return false;
 let value={};
 if(path.endsWith('/status'))value={authenticated:true,configured:true};
 if(path.endsWith('/overview'))value=++overviewReads===1?null:{stats:{totalTracks:7000,staticTracks:7000,customTracks:0}};
 if(path.endsWith('/system'))value={flags:{uploads:'1'},secrets:{},database:{tables:[]}};
 if(path.endsWith('/analytics'))value={daily:[],topTracks:[]};
 if(path.endsWith('/audit'))value={items:[]};
 if(path.endsWith('/catalog/facets'))value={genres:[],moods:[],artists:[],missing:0};
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));return true;
}});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();page.setDefaultTimeout(10000);
 await page.goto(fixture.origin+'/admin');
 await page.locator('[data-retry]').click();
 await page.waitForFunction(()=>document.querySelector('#overview-body .stat-card'));
 assert.equal(overviewReads,2,'Retry must rerun the current section after a render failure');
 const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 for(const view of ['catalog','lyrics','content','analytics','users','settings']){
  await page.locator('#nav [data-view="'+view+'"]').click();
  await page.waitForFunction(view=>document.querySelector('#nav .active')?.dataset.view===view,view);
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('[data-retry]').count(),0,view+' renders');
 }
 assert.deepEqual(errors,[],'Admin sections must finish without runtime or API errors');
 await mkdir('artifacts/project-audit',{recursive:true});await page.screenshot({path:'artifacts/project-audit/admin-current.png'});
 console.log('PASS: current admin navigation, retry after failed render, strict script policy and all seven sections');
}finally{await browser.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));}
