import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import WebSocket from 'ws';
import {fetchAsset} from '../public/asset-loader.js';
import {fetchMedia} from '../public/media-loader.js';

const origin='https://music.academmix.ru';
const connections=[];
globalThis.WebSocket=class extends WebSocket{constructor(url){super(url,{origin});connections.push(new URL(url));}};
const release=JSON.parse(await readFile('artifacts/next-stage/release.json','utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),results=[];
async function readLiveAsset(file){
 for(let attempt=0;;attempt++){
  try{
   const direct=file==='index.html'||file.startsWith('admin/');
   const request=new Request(origin+(file==='index.html'?'/':'/'+file),{cache:'no-store',headers:direct?{Connection:'close'}:{},signal:AbortSignal.timeout(25000)});
   const response=await (direct?fetch(request):fetchAsset(request));
   return {response,bytes:Buffer.from(await response.arrayBuffer())};
  }catch(error){
   if(attempt>=2)throw error;
   console.log('Retrying network transfer '+file+': '+(error.cause?.code||error.name));
  }
 }
}
for(const file of ['index.html','sw.js','boot.js','app-bundle.js','style.css','system-media.js','audio-transition.js','player-scene.js','playback-metrics.js','playlist-folders.js','track-report.js','progressive-playback.js','asset-loader.js','track-accents.js','wave-pulses-000.json','wave-stations.js','wave-deck.js','offline-storage.js','admin/app.js','admin/sections/catalog.js','admin/sections/analytics.js','admin/sections/experience.js']){
 console.log('Checking '+file);
 const at=Date.now(),{response,bytes}=await readLiveAsset(file);
 assert.equal(response.status,200,file);
 assert.equal(sha(bytes),release.assets[file],file+' frozen identity');
 if(file==='sw.js'){assert.match(bytes.toString(),/sway-shell-v36/);assert.match(response.headers.get('Content-Type'),/javascript/);}
 if(file==='index.html'){assert.match(response.headers.get('Content-Security-Policy'),/sha256-/);assert.ok(bytes.toString().trimEnd().endsWith('</html>'));}
 results.push({asset:file,bytes:bytes.length,ms:Date.now()-at,identity:'matched'});
 console.log('Matched '+file+' in '+(Date.now()-at)+' ms');
}
const catalog=JSON.parse(await readFile('public/catalog.json','utf8'));
const song=catalog.find(t=>t.artist==='MOT'&&t.title==='День и Ночь')||catalog[0];
const optimized=JSON.parse(await readFile('artifacts/audio-optimization/applied.json','utf8')).entries.find(e=>e.removed>=131072&&e.audioBytes>=262144&&e.audioBytes<4*1024*1024);
const optimizedSong=catalog.find(t=>decodeURIComponent(t.audio).endsWith('/'+optimized.file));assert.ok(optimizedSong);
for(const [item,expectedAudio] of [[song,null],[optimizedSong,optimized.audioSHA256]]){
 const local=await readFile('public'+decodeURIComponent(item.audio)),expected=sha(local),started=Date.now(),before=connections.length;
 if(expectedAudio)assert.equal(expected,expectedAudio,'The optimized file still matches the original audio payload hash');
 const response=await fetchMedia(new Request(new URL(item.audio,origin),{signal:AbortSignal.timeout(90000)}),{recovery:true});
 assert.equal(response.status,200);assert.equal(Number(response.headers.get('Content-Length')),local.length);
 const delivered=Buffer.from(await response.arrayBuffer());assert.equal(sha(delivered),expected);
 const media=connections.slice(before).filter(url=>url.pathname==='/api/media-socket');
 const transfer={bytes:delivered.length,ms:Date.now()-started,sha256:'matched',optimized:!!expectedAudio,persistentSessions:media.filter(url=>url.searchParams.get('stream')==='1').length,shortParts:media.filter(url=>!url.searchParams.has('stream')).length};
 results.push({media:item.id,...transfer});
}
const artworkAt=Date.now(),artwork=await fetch(new Request(origin+'/api/artwork?id='+encodeURIComponent(song.id),{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(15000)}));
assert.equal(artwork.status,200);assert.match(artwork.headers.get('Content-Type'),/^image\//);
results.push({api:'public-system-artwork-head',status:200,ms:Date.now()-artworkAt});
await writeFile('artifacts/next-stage/live-iphone-release.json',JSON.stringify({at:new Date().toISOString(),version:release.publishedVersion,results},null,2));
console.log('PASS: live iPhone release identity, CSP, complete service worker and byte-exact full song through the real recovery path');
console.log(JSON.stringify(results));
