import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import WebSocket from 'ws';
import {fetchMedia} from '../public/media-loader.js';
import {markInterruptedConnection} from '../public/asset-loader.js';

const origin='https://music.academmix.ru',connections=[];
globalThis.WebSocket=class extends WebSocket{constructor(url){super(url,{origin});connections.push(new URL(url));}};
markInterruptedConnection(true);
const catalog=JSON.parse(await readFile('public/catalog.json','utf8')),results=[];
for(const track of [catalog.find(t=>t.artist==='MOT'&&t.title==='День и Ночь'),catalog.find(t=>t.artist==='Toxi$'&&t.title==='CORONA')].filter(Boolean)){
 const original=await readFile('public'+track.audio),at=Date.now(),before=connections.length;
 let start=0;
 if(original.subarray(0,3).toString()==='ID3')start=10+original[6]*2097152+original[7]*16384+original[8]*128+original[9]+(original[3]===4&&original[5]&16?10:0);
 const response=await fetchMedia(new Request(new URL(track.audio,origin),{signal:AbortSignal.timeout(60000)}),{recovery:true,skipMetadata:true});
 assert.equal(response.status,200);
 const chunks=[];let bytes=0,firstMs,bufferMs;
 for await(const chunk of response.body){chunks.push(chunk);bytes+=chunk.length;firstMs??=Date.now()-at;if(bytes>=32768)bufferMs??=Date.now()-at;}
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 assert.equal(sha(Buffer.concat(chunks)),sha(original.subarray(start)),'Every audio byte after metadata must match the original');
 const sockets=connections.slice(before);assert.ok(sockets.every(url=>!url.searchParams.has('stream')),'Do not retry a known interrupted persistent connection');
 const result={track:track.id,firstBytesMs:firstMs,first32KiBMs:bufferMs,totalMs:Date.now()-at,audioBytes:bytes,skippedMetadataBytes:start,shortConnections:sockets.length,identity:'matched'};
 results.push(result);console.log(JSON.stringify(result));
}
await mkdir('artifacts/network-performance',{recursive:true});
await writeFile('artifacts/network-performance/audio-after.json',JSON.stringify({at:new Date().toISOString(),route:'actual Cloudflare path, validated small WebSockets',results},null,2));
