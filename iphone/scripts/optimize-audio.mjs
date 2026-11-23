import {readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {optimizeMP3} from './mp3-metadata.mjs';
import {syncMediaSizes} from './sync-media-sizes.mjs';
const root=resolve('public/media'),apply=process.argv.includes('--apply'),files=(await readdir(root)).filter(f=>f.endsWith('.mp3'));
const entries=[],errors=[];let cursor=0;
await Promise.all(Array.from({length:4},async()=>{
 while(cursor<files.length){const file=files[cursor++];try{const result=await optimizeMP3(resolve(root,file),{apply});if(result.removed)entries.push({file,...result});}catch(error){errors.push({file,error:error.message});}}
}));
const catalogUpdated=apply?await syncMediaSizes():0;
const report={at:new Date().toISOString(),apply,scanned:files.length,optimized:entries.length,catalogUpdated,savedBytes:entries.reduce((n,e)=>n+e.removed,0),entries,errors};
await mkdir('artifacts/audio-optimization',{recursive:true});await writeFile('artifacts/audio-optimization/'+(apply?'applied':'inventory')+'.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,entries:undefined}));if(errors.length)process.exitCode=1;
