import {copyFile,link,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,extname} from 'node:path';

const root=resolve('.'),destination=resolve('artifacts/sway-refinement-ship-'+Date.now());
const catalogue=['catalog.json','artists.json','albums.json','wave-pulses.json','track-moods.json'];
const hash=file=>readFile(file).then(body=>createHash('sha256').update(body).digest('hex'));
const metadata=await Promise.all(catalogue.map(file=>readFile(join(root,'public',file))));
const before=metadata.map(body=>createHash('sha256').update(body).digest('hex'));
await mkdir(join(destination,'public'),{recursive:true});
let files=0,linked=0;
async function copyTree(from,to){
 for(const entry of await readdir(from,{withFileTypes:true})){
  const source=join(from,entry.name),target=join(to,entry.name);
  if(entry.isDirectory()){await mkdir(target,{recursive:true});await copyTree(source,target);}
  else if(entry.isFile()){
   if(/\.(mp3|m4a|ogg|opus|wav|flac)$/i.test(extname(source))){try{await link(source,target);linked++;}catch{await copyFile(source,target);}}
   else await copyFile(source,target);
   files++;
  }
 }
}
await copyTree(join(root,'public'),join(destination,'public'));
// Freeze the metadata together; a parallel importer may keep adding new tracks.
await Promise.all(catalogue.map((file,i)=>writeFile(join(destination,'public',file),metadata[i])));
for(const file of (await readdir(root)).filter(file=>file.endsWith('.mjs')))await copyFile(join(root,file),join(destination,file));
await copyFile(join(root,'wrangler.jsonc'),join(destination,'wrangler.jsonc'));
const after=await Promise.all(catalogue.map(file=>hash(join(root,'public',file))));
const snapshot=await Promise.all(catalogue.map(file=>hash(join(destination,'public',file))));
if(before.some((value,i)=>value!==snapshot[i]))throw new Error('Release metadata does not match its snapshot.');
if(before.some((value,i)=>value!==after[i]))console.log('The parallel import continued; this release keeps its frozen catalogue.');
const tracks=JSON.parse(await readFile(join(destination,'public/catalog.json'),'utf8'));
if(tracks.length<1430||new Set(tracks.map(t=>t.id)).size!==tracks.length)throw new Error('Incomplete release catalogue');
const manifest={destination,tracks:tracks.length,files,linked,catalogue:Object.fromEntries(catalogue.map((file,i)=>[file,before[i]]))};
await writeFile('artifacts/sway-refinement-release.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest,null,2));
