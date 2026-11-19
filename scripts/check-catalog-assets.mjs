import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {tagCatalog} from '../public/discovery.js';
const root=resolve('public'),raw=JSON.parse(await readFile(resolve(root,'catalog.json'),'utf8'));
const tracks=tagCatalog(raw,JSON.parse(await readFile(resolve(root,'track-moods.json'),'utf8')));
assert.equal(new Set(tracks.map(t=>t.id)).size,tracks.length);
const local=url=>{const path=resolve(root,'.'+decodeURIComponent(url));assert.ok(path.startsWith(root+sep));return path;};
let audioBytes=0;
for(let start=0;start<tracks.length;start+=24)await Promise.all(tracks.slice(start,start+24).map(async t=>{
 assert.equal(t.palette.length,4,t.id);assert.ok(t.palette.every(Number.isFinite),t.id);assert.ok(Array.isArray(t.moods),t.id);
 assert.ok((await stat(local(t.art))).isFile(),t.id+' cover');
 const info=await stat(local(t.audio));assert.ok(info.isFile()&&info.size>0,t.id+' audio');
 if(t.bytes)assert.equal(info.size,t.bytes,t.id+' complete audio');audioBytes+=info.size;
}));
console.log(JSON.stringify({tracks:tracks.length,audioBytes,artwork:'all references resolve',palettes:'finite HSL arrays'}));
