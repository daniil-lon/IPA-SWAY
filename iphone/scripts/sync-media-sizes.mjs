import {readFile,writeFile,stat,rename,unlink} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

export async function syncMediaSizes({catalogFile=resolve('public/catalog.json'),mediaRoot=resolve('public/media')}={}){
 const catalog=JSON.parse(await readFile(catalogFile,'utf8'));let updated=0,cursor=0;
 await Promise.all(Array.from({length:4},async()=>{
  while(cursor<catalog.length){
   const track=catalog[cursor++],url=new URL(track.audio,'https://sway.local');
   if(url.origin!=='https://sway.local'||!url.pathname.startsWith('/media/'))continue;
   const file=resolve(mediaRoot,decodeURIComponent(url.pathname.slice(7)));
   if(!file.startsWith(resolve(mediaRoot)+sep))throw Error('Media path escaped its directory');
   const size=(await stat(file)).size;if(track.bytes!==size){track.bytes=size;updated++;}
  }
 }));
 if(updated){
  const temp=catalogFile+'.'+randomUUID()+'.tmp';
  try{await writeFile(temp,JSON.stringify(catalog,null,2)+'\n',{flag:'wx'});await rename(temp,catalogFile);}
  catch(error){await unlink(temp).catch(()=>{});throw error;}
 }
 return updated;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log('Updated catalogue byte sizes: '+await syncMediaSizes());
