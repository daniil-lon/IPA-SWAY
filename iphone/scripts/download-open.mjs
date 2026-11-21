import {stat,rename,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const files=[["back-to-nature","back_to_nature.mp3"],["bells-of-winter","bells_of_winter.mp3"],["fairy-lights","fairy_lights.mp3"],["homestead","homestead.mp3"],["jaunt","jaunt.mp3"],["snow-day","snow_day.mp3"],["wandering-woodlands","wandering_woodlands.mp3"],["mindstream","DST-MindStream.mp3"],["our-expanse","our_expanse_-_with_tail-version-.mp3"]];
await mkdir('public/media',{recursive:true});
await mkdir('artifacts',{recursive:true});
const failures=[];
for(let i=0;i<files.length;i+=3)await Promise.all(files.slice(i,i+3).map(async ([id,file])=>{
 try{
 const target='public/media/'+id+'.mp3', temp='artifacts/'+id+'.mp3.part';
 if(await stat(target).then(x=>x.size>100000).catch(()=>false))return;
 await exec(process.platform==='win32'?'curl.exe':'curl',['-fsSL','--max-time','35','-o',temp,'https://opengameart.org/sites/default/files/'+encodeURIComponent(file)]);
 const size=(await stat(temp)).size;if(size<100000)throw Error('incomplete');
 await rename(temp,target);
 console.log(id,size);
 }catch(e){failures.push(id);console.error(id,e.stderr||e.message);}
}));
if(failures.length)process.exitCode=1;
