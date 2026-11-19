import {readFile,readdir,writeFile,copyFile,mkdir,link,stat,unlink} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
const release=JSON.parse(await readFile('artifacts/sway-polish-release.json','utf8'));
const published=JSON.parse(await readFile('artifacts/sway-live-catalog.json','utf8'));
const target=resolve(release.destination,'public'),source=resolve('public');
if(!target.startsWith(resolve('artifacts')+sep+'sway-polish-ship-'))throw new Error('Unexpected destination');
const catalogue=JSON.parse(await readFile(join(published.destination,'catalog.json'),'utf8'));
const current=JSON.parse(await readFile(join(source,'catalog.json'),'utf8'));
if(JSON.stringify(current)!==JSON.stringify(catalogue))throw new Error('The local catalogue moved beyond the captured published version');
const metaFiles=Object.keys(published.hashes),metadata=await Promise.all(metaFiles.map(file=>readFile(join(published.destination,file))));
const own=new Set(Object.keys(release.assets));let copied=0,linked=0;
async function tree(from,to,relative=''){
 await mkdir(to,{recursive:true});
 for(const e of await readdir(from,{withFileTypes:true})){
  const src=join(from,e.name),dest=join(to,e.name),name=(relative?relative+'/':'')+e.name;
  if(e.isDirectory()){await tree(src,dest,name);continue;}
  if(!e.isFile()||own.has(name)||metaFiles.includes(name))continue;
  if(/\.(mp3|m4a|ogg|opus|wav|flac)$/i.test(extname(src))){
   const info=await stat(src),old=await stat(dest).catch(()=>null);
   if(old?.size===info.size)continue;
   if(old)await unlink(dest);
   try{await link(src,dest);linked++;}catch{await copyFile(src,dest);copied++;}
  }else{await copyFile(src,dest);copied++;}
 }
}
await tree(source,target);
for(let i=0;i<metaFiles.length;i++)await writeFile(join(target,metaFiles[i]),metadata[i]);
let audioBytes=0;
for(const t of catalogue){
 if(!t.audio.startsWith('/media/'))continue;
 const file=resolve(target,'.'+decodeURIComponent(t.audio));if(!file.startsWith(target+sep))throw new Error('Unexpected media path');
 const info=await stat(file);if(t.bytes&&info.size!==t.bytes)throw new Error('Incomplete audio: '+t.id);audioBytes+=info.size;
}
let files=0;async function count(path){for(const e of await readdir(path,{withFileTypes:true})){if(e.isDirectory())await count(join(path,e.name));else if(e.isFile())files++;}}await count(target);
release.tracks=catalogue.length;release.files=files;release.linked+=linked;release.catalogue=published.hashes;release.publishedCapture=published.capturedAt;
release.assets=Object.fromEntries(await Promise.all([...own].map(async file=>[file,createHash('sha256').update(await readFile(join(target,file))).digest('hex')])));
await writeFile('artifacts/sway-polish-release.json',JSON.stringify(release,null,2));
console.log(JSON.stringify({tracks:catalogue.length,files,copied,linked,audioBytes},null,2));
