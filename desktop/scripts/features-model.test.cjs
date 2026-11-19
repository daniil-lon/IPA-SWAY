const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {LocalLibrary}=require('../local-library.cjs');
const model=import('../ui/playback-model.mjs');

test('duplicate queue occurrences can move, jump and be removed independently',async()=>{
 const {PlaybackQueue}=await model,q=new PlaybackQueue(()=>.2).set(['a','b','a','c'],2);
 assert.equal(q.remove(0),true);assert.deepEqual(q.ids,['b','a','c']);assert.equal(q.index,1);
 q.append(['a'],true);assert.deepEqual(q.ids,['b','a','a','c']);
 q.move(2,3);assert.deepEqual(q.ids,['b','a','c','a']);assert.equal(q.index,1);
 q.jump(3);assert.equal(q.index,3);assert.equal(q.remove(3),false);
 assert.equal(q.next({automatic:true,repeat:2}),3);
 assert.equal(q.next(),-1);assert.equal(q.next({repeat:1}),0);
});
test('shuffle visits every occurrence once, supports back and forward, then stops',async()=>{
 const {PlaybackQueue}=await model,q=new PlaybackQueue(()=>.3).set(['a','a','b','c']);const visited=[0];
 for(let i=0;i<3;i++)visited.push(q.next({shuffle:true}));
 assert.equal(new Set(visited).size,4);assert.equal(q.next({shuffle:true}),-1);
 const last=q.index,previous=q.next({shuffle:true,direction:-1});assert.notEqual(previous,last);
 assert.equal(q.next({shuffle:true}),last);assert.notEqual(q.next({shuffle:true,repeat:1}),-1);
});
test('queue edits preserve the current occurrence, and invalid edits do nothing',async()=>{
 const {PlaybackQueue}=await model,q=new PlaybackQueue().set(['a','b','c','d'],2);
 q.move(0,3);assert.equal(q.ids[q.index],'c');q.move(3,0);assert.equal(q.ids[q.index],'c');
 assert.equal(q.move(-1,2),false);assert.equal(q.jump(9),false);assert.equal(q.remove(NaN),false);
});
test('lyrics accept malformed rows and LRC offsets with multiple time stamps',async()=>{
 const {parseLyrics,activeLyricIndex}=await model;
 assert.deepEqual(parseLyrics({lines:[null,'broken',{text:'no time'},{at:0,text:'first'},{time:'3.5',text:'second'}]}).timed,[{at:0,text:'first'},{at:3.5,text:'second'}]);
 const lyrics=parseLyrics({synced:'[offset:-500]\n[00:01.20][00:03.400]one\n[01:02:50]two'});
 assert.deepEqual(lyrics.timed.map(l=>l.at),[.7,2.9,62]);
 assert.equal(activeLyricIndex(lyrics.timed,.69),-1);assert.equal(activeLyricIndex(lyrics.timed,3),1);
 assert.equal(parseLyrics({plain:'plain text'}).plain,'plain text');
});
test('local recommendations enforce exclusions, mood and lyric-language filters',async()=>{
 const {recommendTracks}=await model;
 const tracks=[{id:'a',artist:'A',moods:['calm']},{id:'b',artist:'B',moods:['bright']},{id:'c',artist:'C',moods:['calm']}];
 const result=recommendTracks(tracks,{excluded:new Set(['a']),mood:'calm',language:'ru',languages:{a:'ru',b:'en',c:'ru'},random:()=>.5});
 assert.deepEqual(result.map(t=>t.id),['c']);
});
test('import registry survives restart, resolves only selected files and never deletes originals',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sway-library-test-'));const audio=path.join(directory,'original.wav'),bad=path.join(directory,'private.txt');
 try{
  await fs.writeFile(audio,Buffer.from('RIFF original audio'));await fs.writeFile(bad,'not audio');
  const registry=await new LocalLibrary(path.join(directory,'profile')).load();const items=await registry.add([audio,bad],'book');assert.equal(items.length,1);assert.equal(items[0].format,'WAV');
  const id=items[0].id;await registry.updateDuration(id,123.5);const again=await new LocalLibrary(path.join(directory,'profile')).load();
  assert.equal(again.list()[0].id,id);assert.equal(again.list()[0].seconds,123.5);assert.equal(again.list()[0].kind,'book');assert.equal((await again.add([audio],'book')).length,1);assert.equal(again.list().length,1);
  assert.equal((await again.resolve(id.slice(6))).file,await fs.realpath(audio));assert.equal(await again.resolve('unselected'),null);
  await again.remove(id);assert.equal(await again.resolve(id.slice(6)),null);assert.equal((await fs.readFile(audio)).toString(),'RIFF original audio');
 }finally{if(directory.startsWith(path.join(os.tmpdir(),'sway-library-test-')))await fs.rm(directory,{recursive:true,force:true});}
});
