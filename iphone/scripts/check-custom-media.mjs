import assert from 'node:assert/strict';
import {serveCustomMedia} from '../admin-store.mjs';
import {downloadableAudio} from '../public/offline-storage.js';
globalThis.location={origin:'https://sway.test'};
assert.equal(downloadableAudio({id:'custom-audit',audio:'/api/custom-media/custom-audit.mp3'},()=>true),'https://sway.test/api/custom-media/custom-audit.mp3','Uploaded tracks must be downloadable for offline use');
const data=new TextEncoder().encode('0123456789abcdef');
const DB={prepare:()=>({bind(){return this;},async all(){return {results:[{chunk_data:Buffer.from(data).toString('base64')}]};}})};
const url='https://sway.test/api/custom-media/test.mp3';
const request=(range,method='GET')=>new Request(url,{method,headers:range?{Range:range}:{}});
for(const range of ['bytes=-0','bytes=9007199254740993-','bytes=5-2','bytes=16-']){
 const response=await serveCustomMedia(request(range),new URL(url).pathname,{DB});
 assert.equal(response.status,416,range);assert.equal(response.headers.get('Content-Range'),'bytes */16');
}
for(const [range,expected] of [['bytes=2-5','2345'],['bytes=-4','cdef'],['bytes=12-','cdef']]){
 const response=await serveCustomMedia(request(range),new URL(url).pathname,{DB},{private:true});
 assert.equal(response.status,206);assert.equal(await response.text(),expected);assert.equal(response.headers.get('Content-Length'),'4');assert.equal(response.headers.get('Cache-Control'),'private, no-store');
}
const MEDIA_BUCKET={async get(){return {size:data.length,range:{offset:2,length:4},body:data.subarray(2,6)};}};
const partial=await serveCustomMedia(request('bytes=2-5'),new URL(url).pathname,{DB,MEDIA_BUCKET});
assert.equal(partial.status,206);assert.equal(partial.headers.get('Content-Range'),'bytes 2-5/16');
assert.equal(partial.headers.get('Content-Length'),'4','R2 range length must describe the returned body, not the entire object');
assert.equal(await partial.text(),'2345');
assert.equal((await serveCustomMedia(request('', 'POST'),new URL(url).pathname,{DB})).status,405);
console.log('PASS: custom media D1 ranges, invalid ranges, private responses, R2 partial Content-Length and read-only methods');
