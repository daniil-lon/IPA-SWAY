import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Use a real asset binding and a file-backed bundle so failures have readable stacks.
export async function fixtureWorker(name){
 await mkdir('artifacts/verification',{recursive:true});
 const outfile=resolve(`artifacts/verification/${name}-worker.mjs`);
 await build({entryPoints:['worker.mjs'],bundle:true,format:'esm',outfile});
 return (await import(pathToFileURL(outfile).href+'?test='+Date.now())).default;
}
export const fixtureAssets={async fetch(req){
 const url=new URL(req.url),root=pathToFileURL(resolve('public')+'/'),file=new URL(url.pathname==='/'?'index.html':'.'+url.pathname,root);
 if(!file.href.startsWith(root.href))return new Response(null,{status:403});
 try{return new Response(await readFile(file),{headers:{'Content-Type':({json:'application/json',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',svg:'image/svg+xml',js:'text/javascript',css:'text/css',html:'text/html'})[url.pathname.split('.').at(-1)]||'application/octet-stream','Cache-Control':'public, max-age=86400'}});}catch{return new Response(null,{status:404});}
}};
