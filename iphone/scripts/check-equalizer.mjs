import assert from 'node:assert/strict';
import {chromium,devices,webkit} from 'playwright';
import {servePlayer,toneRates} from './player-fixture.mjs';

const {origin,server}=await servePlayer();
try{
 for(const [name,engine,launch,profile] of [['Edge with iPhone profile',chromium,{channel:'msedge'},devices['iPhone 15']],['Edge desktop',chromium,{channel:'msedge'},{viewport:{width:1100,height:860}}],['WebKit Windows with iPhone profile',webkit,{},devices['iPhone 15']]]){
  const browser=await engine.launch(launch);
  try{
   const page=await browser.newPage({...profile,locale:'ru-RU'});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(({mobile,toneRates})=>{
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)return;
    const info=window.eqCheck={sourceCount:0,blocked:false,analyser:null};
    const proto=Context.prototype;
    const source=proto.createMediaElementSource;
    proto.createMediaElementSource=function(element){const node=source.call(this,element);info.sourceCount++;return node;};
    const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(destination,...args){
     const result=connect.call(this,destination,...args);
     if(this instanceof BiquadFilterNode&&this.type==='highshelf'&&destination===this.context.destination){
      info.context=this.context;
      info.analyser=this.context.createAnalyser();info.analyser.fftSize=8192;info.analyser.smoothingTimeConstant=0;
      connect.call(this,info.analyser);
     }
     return result;
    };
    if(mobile){
     // Model iOS, where element.volume is fixed and only the Web Audio gain can mix.
     Object.defineProperty(HTMLMediaElement.prototype,'volume',{configurable:true,get(){return 1;},set(){}});
     info.mixCurves=0;const curve=AudioParam.prototype.setValueCurveAtTime;
     AudioParam.prototype.setValueCurveAtTime=function(...args){info.mixCurves++;return curve.apply(this,args);};
     let nativeState=proto;while(nativeState&&!Object.getOwnPropertyDescriptor(nativeState,'state'))nativeState=Object.getPrototypeOf(nativeState);
     const getState=Object.getOwnPropertyDescriptor(nativeState,'state').get, resume=proto.resume;
     Object.defineProperty(proto,'state',{get(){return info.blocked?'suspended':getState.call(this);},configurable:true});
     proto.resume=function(){return info.blocked?new Promise(()=>{}):resume.call(this);};
    }
    info.sample=()=>{
     const a=info.analyser;if(!a)return [-1000,-1000];
     const data=new Float32Array(a.frequencyBinCount);a.getFloatFrequencyData(data);
     return toneRates.map(hz=>{const k=Math.round(hz*a.fftSize/a.context.sampleRate);return Math.max(...data.slice(k-1,k+2));});
    };
   },{mobile:!!profile.hasTouch,toneRates});
   const choose=async label=>{
    const b=page.getByRole('button',{name:label,exact:true});
    if(profile.hasTouch)await b.tap();else await b.click();
   };
   const go=async hash=>{await page.evaluate(h=>location.hash=h,hash);};
   const plays=()=>page.waitForFunction(()=>{const a=document.querySelector('#audio');return !a.paused&&a.currentTime>.36;},{},{timeout:7000});
   await page.goto(origin+'/#settings/equalizer',{waitUntil:'domcontentloaded'});
   const toggle=page.getByRole('switch',{name:'Эквалайзер'});
   await toggle.waitFor();
   if(!await page.evaluate(()=>!!window.eqCheck)){
    assert.equal(await toggle.isEnabled(),false,name+': this WebKit build does not expose AudioContext');
    await go('#home');await choose('Слушать волну');await plays();
    assert.deepEqual(errors,[]);
    console.log(name+': Web Audio unavailable; ordinary playback works');
    continue;
   }
   assert.equal(await toggle.isEnabled(),true,name+': the built-in equalizer must not be disabled on supported browsers');
   if(profile.hasTouch)await page.evaluate(()=>window.eqCheck.blocked=true);
   await choose('Ровно');
   await go('#home');await choose('Слушать волну');await plays();
   if(profile.hasTouch){
    assert.equal(await page.evaluate(()=>window.eqCheck.sourceCount),0,'refused Web Audio must not take the still-playing native stream');
    await page.evaluate(()=>window.eqCheck.blocked=false);
    await go('#settings/equalizer');await choose('Ровно');
   }
   await page.waitForFunction(()=>window.eqCheck.sample().every(db=>db>-55),{},{timeout:7000});
   const [lowFlat,highFlat]=await page.evaluate(()=>window.eqCheck.sample());
   await go('#settings/equalizer');await choose('Больше баса');
   await page.waitForFunction(flat=>{const [low,high]=window.eqCheck.sample();return low>-55&&high>-65&&low-high>flat+2;},lowFlat-highFlat,{timeout:7000});
   const [lowBass,highBass]=await page.evaluate(()=>window.eqCheck.sample());
   console.log(`${name}: bass preset changed the output by ${(lowBass-highBass-lowFlat+highFlat).toFixed(1)} dB relative to treble`);
   if(profile.hasTouch){
    const snapshot=()=>page.locator('#audio').evaluate(el=>el.currentTime);
    const before=await snapshot();
    await page.evaluate(async()=>{
     window.eqCheck.original=document.querySelector('#audio');
     window.eqCheck.blocked=true;
     await window.eqCheck.context.suspend();
     document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(offset=>{const a=document.querySelector('#audio');return a!==window.eqCheck.original&&!a.paused&&a.currentTime>offset-.12;},before,{timeout:7000});
    assert.equal(await page.locator('#audio-next').evaluate(a=>a.paused&&!a.getAttribute('src')),true);
    await page.evaluate(()=>window.eqCheck.blocked=false);
    await choose('Больше баса');
    await page.waitForFunction(()=>!document.querySelector('#audio').paused&&window.eqCheck.sample().every(db=>db>-65),{},{timeout:7000});
    const beforeOff=await snapshot();
    await toggle.tap();
    await page.waitForFunction(offset=>{const a=document.querySelector('#audio');return !a.paused&&a.currentTime>offset-.12&&Math.abs(window.eqCheck.sample()[0]-window.eqCheck.sample()[1])<3;},beforeOff,{timeout:7000});
    assert.equal(await toggle.isChecked(),false);
    console.log(name+': failed resume and manual bypass both preserved the track and position');
    const previous=await page.locator('#audio').evaluate(a=>{a.currentTime=a.duration-4;return a.currentSrc;});
    await page.waitForFunction(()=>{const a=document.querySelector('#audio-next');return !a.paused&&a.currentTime>.1&&window.eqCheck.mixCurves>=2;},{},{timeout:7000});
    await page.waitForFunction(src=>{const a=document.querySelector('#audio');return a.currentSrc!==src&&!a.paused&&a.currentTime>2;},previous,{timeout:10000});
    console.log(name+': Web Audio crossfade works while element.volume remains fixed at 1');
   }else{
    const previous=await page.locator('#audio').evaluate(a=>{a.currentTime=a.duration-4;return a.currentSrc;});
    await page.waitForFunction(()=>{const standby=document.querySelector('#audio-next');return !standby.paused&&standby.currentTime>.15;},{},{timeout:7000});
    await page.waitForFunction(src=>{const a=document.querySelector('#audio');return a.currentSrc&&a.currentSrc!==src&&!a.paused&&a.currentTime>2&&window.eqCheck.sample().every(db=>db>-65);},previous,{timeout:10000});
    console.log(name+': equalized playback survived the two-stream crossfade');
   }
   assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 }
}finally{server.close();server.closeAllConnections();}
