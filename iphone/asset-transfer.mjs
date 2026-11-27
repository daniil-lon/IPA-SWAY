// Small, version-checked responses keep public assets usable on interrupted links.
// API responses, admin assets and catalog permissions are deliberately separate.
import {isThumb,thumbBytes} from './thumb-packs.mjs';
const partSize=8192,maxSize=32*1024*1024,maxCache=40*1024*1024;
const entries=new Map();let cachedBytes=0;
export function transferableAsset(path){
 try{path=decodeURIComponent(path);}catch{return false;}
 return typeof path==='string'&&path.length<512&&!path.includes('..')&&!/[\\\u0000-\u001f?#]/.test(path)&&(
  path==='/admin-client.js'||/^\/(?!admin)[a-z][a-z0-9-]*\.(?:js|css|json|webmanifest)$/.test(path)&&path!=='/catalog.json'||
  /^\/art\/[\p{L}\p{N}_./$() -]+\.(?:svg|png|jpe?g|webp|avif)$/u.test(path)||path==='/art/cutouts/index.json'
 );
}
export function transferableMedia(path){
 try{path=decodeURIComponent(path);}catch{return false;}
 return typeof path==='string'&&path.length<512&&!path.includes('..')&&!/[\\\u0000-\u001f?#]/.test(path)&&/^\/media\/[^/]+\.(?:mp3|m4a|ogg|opus|flac|wav)$/iu.test(path);
}
export async function mediaFile(path,request,env){
 if(!transferableMedia(path))return {error:404};
 return bytesFor(path,request,env,'identity');
}
async function bytesFor(path,request,env,encoding){
 const key=path+'|'+encoding,existing=entries.get(key);
 if(existing&&Date.now()-existing.at<60000)return existing.pending;
 if(existing){cachedBytes-=existing.size||0;entries.delete(key);}
 const entry={at:Date.now(),size:0};
 entry.pending=(async()=>{
  let data,type;
  if(isThumb(path)){
   const thumb=await thumbBytes(path,request,env);
   if(thumb.error){if(entries.get(key)===entry)entries.delete(key);return thumb;}
   ({data,type}=thumb);
  }else{
   const url=new URL(request.url);url.pathname=path;url.search='';
   const response=await env.ASSETS.fetch(new Request(url,{headers:{'Accept-Encoding':'identity'}}));
   if(response.status!==200||response.headers.has('Content-Encoding')){if(entries.get(key)===entry)entries.delete(key);response.body?.cancel().catch(()=>{});return {error:response.status===200?502:response.status};}
   if(Number(response.headers.get('Content-Length'))>maxSize){response.body?.cancel().catch(()=>{});return {error:413};}
   data=new Uint8Array(await response.arrayBuffer());if(data.length>maxSize)return {error:413};
   type=response.headers.get('Content-Type')||'application/octet-stream';
  }
  const rawSize=data.length;
  if(encoding==='gzip')data=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const version=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
  while(cachedBytes+data.length>maxCache&&entries.size){
   const first=entries.keys().next().value;if(first===key)break;
   cachedBytes-=entries.get(first).size||0;entries.delete(first);
  }
  if(entries.get(key)===entry){entry.size=data.length;cachedBytes+=data.length;}
  return {data,version,type,rawSize,encoding};
 })().catch(error=>{if(entries.get(key)===entry)entries.delete(key);throw error;});
 while(entries.size>=32){const first=entries.keys().next().value;cachedBytes-=entries.get(first).size||0;entries.delete(first);}
 entries.set(key,entry);return entry.pending;
}
export async function assetPart(request,env,{mediaAllowed=false}={}){
 const url=new URL(request.url),path=url.searchParams.get('path'),offset=Number(url.searchParams.get('offset')||0);
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
 if(!transferableAsset(path)&&!(mediaAllowed&&transferableMedia(path)))return new Response(null,{status:404});
 if(!Number.isSafeInteger(offset)||offset<0||!/^\d+$/.test(url.searchParams.get('offset')||'0'))return new Response(null,{status:400});
 const encoding=url.searchParams.get('encoding')==='gzip'?'gzip':'identity';
 const asset=await bytesFor(path,request,env,encoding);if(asset.error)return new Response(null,{status:asset.error});
 const {data,version,type}=asset,expected=url.searchParams.get('v');
 if(expected&&expected!==version)return new Response(null,{status:412,headers:{'Cache-Control':'no-store'}});
 if(offset>=data.length)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+data.length}});
 const end=Math.min(offset+partSize,data.length),headers=new Headers({
  'Content-Type':encoding==='gzip'?'application/octet-stream':type,'Content-Length':String(end-offset),'Content-Range':`bytes ${offset}-${end-1}/${data.length}`,
  'Accept-Ranges':'bytes','ETag':'"'+version+'"','X-Sway-Version':version,'Cache-Control':expected?'public, max-age=31536000, immutable':'public, max-age=30',
  'X-Sway-Encoding':encoding,'X-Sway-Type':type,'X-Sway-Size':String(asset.rawSize),
  'X-Content-Type-Options':'nosniff'
 });
 return new Response(request.method==='HEAD'?null:data.slice(offset,end),{status:206,headers});
}
