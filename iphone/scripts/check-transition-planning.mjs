import assert from 'node:assert/strict';
import {makeTransition,transitionPlan,transitionGains,pulseTempo} from '../public/audio-transition.js';
import {parseLRC,matchingLyrics} from '../public/lyrics.js';
import {rankWave} from '../public/wave.js';

const accents=offset=>Array.from({length:160},(_,i)=>[Math.round((i*.5+offset)*100),85]).flat();
const pulses={a:accents(0),b:accents(.13)};
assert.ok(Math.abs(pulseTempo(pulses.a).bpm-120)<=1);
const rhythmic=transitionPlan({id:'a'},{id:'b'},{duration:48,nextDuration:52,accents:id=>pulses[id]});
assert.equal(rhythmic.rhythmic,true);assert.ok(rhythmic.seconds>7&&rhythmic.seconds<9);
const gentle=transitionPlan({id:'quiet'},{id:'other'},{duration:48,nextDuration:50});
assert.equal(gentle.rhythmic,false);assert.equal(gentle.seconds,10);
const short=transitionPlan(null,null,{duration:8,nextDuration:5});assert.ok(short.seconds<=2.1);
for(const level of [.2,.7,1]){
 let old=level,next=0;
 for(let i=0;i<=100;i++){
  const [a,b]=transitionGains(i/100,level);
  assert.ok(a<=old+1e-9&&b>=next-1e-9,'gains progress without a volume reversal');
  assert.ok(a+b<=1.000001,'two full-scale streams stay below the ceiling');
  if(level<=.7)assert.ok(Math.abs(a*a+b*b-level*level)<1e-8,'equal power without a midpoint hole');
  old=a;next=b;
 }
}
class FakeAudio extends EventTarget{
 volume=.8;paused=false;ended=false;seeking=false;duration=48;currentTime=1;readyState=4;preload='';src='';error=null;bufferEnd=48;playCalls=0;
 buffered={length:1,start:()=>0,end:()=>this.bufferEnd};
 play(){this.playCalls++;this.paused=false;return Promise.resolve();}pause(){this.paused=true;}load(){}removeAttribute(){this.src='';}
}
const first=new FakeAudio(),second=new FakeAudio();second.paused=true;second.duration=50;
let committed=null;
const mix=makeTransition([first,second],{getCurrent:()=>({id:'quiet'}),onCommit:(audio,t)=>{committed={audio,t};}});
const candidate={id:'next',audio:'/next.mp3'};
mix.setVolume(.7);mix.tick(candidate);assert.equal(mix.preparedId,undefined,'preloading waits for the current track to start');
first.currentTime=4;mix.tick(candidate);assert.equal(mix.preparedId,'next');assert.equal(second.playCalls,0);
first.currentTime=43;second.bufferEnd=2;mix.tick(candidate);assert.equal(second.playCalls,0,'never mix an unbuffered intro');
second.bufferEnd=50;mix.tick(candidate);await Promise.resolve();assert.equal(second.playCalls,1);
first.currentTime=45;second.currentTime=2;mix.tick(candidate);assert.ok(first.volume<.7&&second.volume>0);
mix.rewind();assert.equal(second.paused,true);assert.equal(second.currentTime,0);assert.equal(first.volume,.7);
mix.tick(candidate);await Promise.resolve();first.currentTime=48;second.currentTime=3;
assert.equal(mix.finish(candidate),true);assert.equal(committed.audio,second);assert.equal(committed.t.id,'next');assert.equal(second.volume,.7);assert.equal(first.paused,true);
mix.cancel();
assert.deepEqual(parseLRC('[offset:100]\n[00:01.50][00:02.50]A\n[00:03.000]B'),[{at:1.6,text:'A'},{at:2.6,text:'A'},{at:3.1,text:'B'}]);
const song={title:'Песня',artist:'Первый, Второй',seconds:190};
assert.equal(matchingLyrics({trackName:'Песня',artistName:'Второй',duration:191},song),true);
assert.equal(matchingLyrics({trackName:'Песня',artistName:'Первый',duration:210},song),false);
const catalog=[{id:'a',artist:'Первый, Второй',moods:['calm'],genre:'Поп'},{id:'b',artist:'Третий',moods:['calm'],genre:'Поп'}];
assert.equal(rankWave(catalog,{preferredArtists:new Set(['Второй']),random:()=>.5})[0].id,'a');
console.log('Passed: beat planning, short tracks, equal-power envelopes, buffering, rewind, handoff, timed lyrics and artist affinity.');
