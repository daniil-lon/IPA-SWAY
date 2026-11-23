import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,link,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {id3Prefix,optimizeMP3} from './mp3-metadata.mjs';
const root=await mkdtemp(join(tmpdir(),'sway-id3-'));
assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('sway-id3-'));
try{
 const audio=Buffer.concat([Buffer.from([255,251,144,0]),Buffer.alloc(30000,73)]),header=Buffer.from([73,68,51,3,0,0,0,0,8,0]);
 const original=Buffer.concat([header,Buffer.alloc(1024,65),audio]),file=join(root,'song.mp3'),frozen=join(root,'published.mp3');
 await writeFile(file,original);await link(file,frozen);
 assert.equal((await optimizeMP3(file)).removed,1034);assert.deepEqual(await readFile(file),original,'Inventory cannot mutate media');
 const result=await optimizeMP3(file,{apply:true});assert.equal(result.audioSHA256,createHash('sha256').update(audio).digest('hex'));
 assert.deepEqual(await readFile(file),audio);assert.deepEqual(await readFile(frozen),original,'Published hard-link snapshot stays byte exact');
 assert.notEqual((await stat(file)).ino,(await stat(frozen)).ino);assert.equal((await optimizeMP3(file,{apply:true})).removed,0,'Idempotent rerun');
 const invalid=Buffer.from(header);invalid[6]=128;assert.throws(()=>id3Prefix(invalid,original.length));
 assert.throws(()=>id3Prefix(header,100));
 await writeFile(file,Buffer.concat([header,Buffer.alloc(1024),Buffer.alloc(10)]));const before=await readFile(file);
 await assert.rejects(optimizeMP3(file,{apply:true}),/MPEG/);assert.deepEqual(await readFile(file),before);
 console.log('PASS: MP3 audio bytes unchanged, published hard links preserved, malformed tags rejected, idempotent optimization');
}finally{await rm(root,{recursive:true,force:true});}
const catalog=JSON.parse(await readFile('public/catalog.json','utf8'));
for(const track of catalog){
 const size=(await stat(resolve('public','.'+decodeURIComponent(track.audio)))).size;
 assert.equal(track.bytes,size,'Catalogue size matches optimized media: '+track.id);
}
console.log('PASS: all '+catalog.length+' catalogue byte sizes match actual audio files');
