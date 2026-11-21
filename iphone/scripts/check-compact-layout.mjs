import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium,webkit} from 'playwright';
import {servePlayer} from './player-fixture.mjs';

const out='artifacts/mobile-loading';await mkdir(out,{recursive:true});
const fixture=await servePlayer({handler:async(req,res,path)=>{
 if(path==='/'){
  const csp=(await readFile('public/_headers','utf8')).match(/Content-Security-Policy: ([^\r\n]+)/)[1];
  res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':csp});res.end(await readFile('public/index.html'));return true;
 }
 if(path!=='/splash-test')return false;
 const html=(await readFile('public/index.html','utf8')).replace('<script defer src="/boot.js"></script>','').replace(/<!-- sway:boot:start -->[\s\S]*?<!-- sway:boot:end -->/,'').replaceAll('data-sway-style=','rel="stylesheet" href=').replaceAll('data-sway-srcset=','srcset=').replaceAll('data-sway-src=','src=');
 res.writeHead(200,{'Content-Type':'text/html'});res.end(html);return true;
}});
const engine=process.env.SWAY_COMPACT_WEBKIT?webkit:chromium;
const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge',args:['--mute-audio']}:{})});
const report={engine:engine===webkit?'webkit':'chromium',screens:[],errors:[]};
try{
 const context=await browser.newContext({viewport:{width:393,height:852}}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(fixture.origin+'/splash-test');
 const splash=await page.locator('#sway-splash').evaluate(el=>{const logo=el.querySelector('.splash-logo-wrap').getBoundingClientRect(),text=el.querySelector('.splash-text').getBoundingClientRect();return {gap:text.top-logo.bottom,center:(logo.top+text.bottom)/2,screen:innerHeight,blend:getComputedStyle(el.querySelector('.splash-logo')).mixBlendMode};});
 report.splash=splash;
 try{assert.ok(splash.gap>=0&&splash.gap<45,'Loading text must stay directly below its logo');assert.ok(Math.abs(splash.center-splash.screen/2)<80,'Loading logo and text must be centered together');assert.equal(splash.blend,'screen','The supplied black logo background must blend into the splash');}catch(e){report.splashError=e.message;process.exitCode=1;}
 await page.screenshot({path:out+'/splash-'+report.engine+'.png'});
 await page.goto(fixture.origin);await page.locator('.mx-start').waitFor({timeout:20000});
 for(const viewport of [{width:393,height:852},{width:852,height:393},{width:1440,height:900}]){
  await page.setViewportSize(viewport);
  const state=await page.evaluate(()=>({sidebar:getComputedStyle(document.querySelector('.sidebar')).display,nav:getComputedStyle(document.querySelector('.mobile-nav')).display,accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),scroll:document.documentElement.scrollWidth,screen:innerWidth,titleTop:document.querySelector('.mx-idle h1').getBoundingClientRect().top,headerBottom:document.querySelector('.mx-head').getBoundingClientRect().bottom}));
  report.screens.push({viewport,...state});
  try{assert.equal(state.sidebar,'none','The sidebar must stay absent at '+viewport.width);assert.notEqual(state.nav,'none','Bottom navigation must stay visible');assert.ok(state.scroll<=state.screen+1,'The compact view must fit the viewport');assert.ok(state.titleTop>=state.headerBottom-2,'The title must stay below the header when rotated');}catch(e){report.layoutError=e.message;process.exitCode=1;}
  await page.screenshot({path:out+'/home-'+viewport.width+'-'+report.engine+'.png'});
 }
 await page.locator('.mx-start').click();await page.locator('.mx-track').click();await page.locator('#dialog[open]').waitFor();
 const compact=await page.locator('.mx-full').count();report.compactPlayer=compact;
 try{assert.equal(compact,1,'Wide screens must use the same full player');assert.deepEqual(report.errors,[]);}catch(e){report.playerError=e.message;process.exitCode=1;}
 console.log(process.exitCode?'FAIL: '+JSON.stringify(report):'PASS: centered splash and one compact interface across portrait, landscape and desktop');
}finally{await writeFile(out+'/layout-'+report.engine+'.json',JSON.stringify(report,null,2));await browser.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));}
