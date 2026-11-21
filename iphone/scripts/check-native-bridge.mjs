import {chromium,devices} from 'playwright';import assert from 'node:assert/strict';import {servePlayer,track,nextTrack} from './player-fixture.mjs';
const fixture=await servePlayer({catalog:[{...track,audio:'/media/test-tone.wav'},{...nextTrack,audio:'/media/test-next.wav'}]}),browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({...devices['Pixel 7']}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{
 window.nativeCommands=[];const channels=[0,1].map(channel=>({channel,currentTime:0,duration:26,readyState:0,paused:true,ended:false,buffered:26,trackId:''}));
 window.SwayAndroid={postMessage(value){const d=JSON.parse(value);window.nativeCommands.push(d);const s=channels[d.channel||0];if(d.action==='load'){s.currentTime=0;s.readyState=4;}if(d.action==='play')s.paused=false;if(d.action==='pause')s.paused=true;if(d.action==='currentTime')s.currentTime=d.value;if(d.action==='queue')s.trackId=d.items[0].id;}};
 setInterval(()=>{for(const s of channels){if(!s.paused)s.currentTime+=.25;window.dispatchEvent(new CustomEvent('sway-native-state',{detail:{...s}}));}},250);
 });
 await page.goto(fixture.origin);await page.locator('.mx-start').tap();await page.waitForFunction(()=>document.querySelector('#audio').currentTime>1.1);await page.waitForFunction(()=>window.nativeCommands.some(d=>d.action==='queue'));
 await page.evaluate(()=>location.hash='#settings/equalizer');await page.getByRole('button',{name:'Больше баса',exact:true}).tap();assert.ok(await page.evaluate(()=>window.nativeCommands.some(d=>d.action==='equalizer'&&d.levels[0]===6)));
 await page.evaluate(()=>document.querySelector('#audio').currentTime=9);assert.ok(await page.evaluate(()=>window.nativeCommands.some(d=>d.action==='currentTime'&&d.value===9)));
 assert.deepEqual(errors,[]);console.log('PASS native bridge: playback clock, prepared queue metadata, seek and six-band equalizer commands. Native device lifecycle remains untested.');
}finally{await browser.close();fixture.server.close();}
