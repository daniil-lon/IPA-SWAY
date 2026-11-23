import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {servePlayer} from './player-fixture.mjs';
import {assetPart} from '../asset-transfer.mjs';

const root=new URL('../public/',import.meta.url),catalog=JSON.parse(await readFile(new URL('catalog.json',root),'utf8'));
const fixture=await servePlayer({catalog,handler:async(req,res,path)=>{
 if(['/track-moods.json','/track-languages.json','/wave-pulses.json'].includes(path)){
  res.writeHead(200,{'Content-Type':'application/json'});res.end(await readFile(new URL('.'+path,root)));return true;
 }
 if(path==='/api/asset-part'){
  const response=await assetPart(new Request('http://localhost'+req.url),{ASSETS:{fetch:async request=>{
   const url=new URL('.'+new URL(request.url).pathname,root);if(!url.href.startsWith(root.href))return new Response(null,{status:404});
   try{return new Response(await readFile(url));}catch{return new Response(null,{status:404});}
  }}});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return true;
 }
 if(path==='/api/catalog'||path==='/api/catalog-signals'){
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify(path==='/api/catalog'?{items:catalog,total:catalog.length,next:null}:{tracks:{},artists:{},collections:{},listenerDays:30}));return true;
 }
 if(!path.startsWith('/media/'))return false;
 try{
  const file=new URL('.'+decodeURIComponent(path),root);if(!file.href.startsWith(root.href))throw new Error('path');
  const size=(await stat(file)).size,match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  const start=match?Number(match[1]):0,end=match?.[2]?Math.min(Number(match[2]),size-1):size-1;
  if(start>end||start>=size){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return true;}
  res.writeHead(match?206:200,{'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Content-Length':String(end-start+1),...(match?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
  if(req.method==='HEAD')res.end();else createReadStream(fileURLToPath(file),{start,end}).pipe(res);
 }catch{res.writeHead(404);res.end();}
 return true;
}});
console.log('iPhone preview: '+fixture.origin);
