import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
const xml=await readFile('artifacts/next-stage/android-repository.xml','utf8');
await mkdir('.tools/android-downloads',{recursive:true});
await Promise.all(['platforms;android-35','build-tools;35.0.0','platform-tools'].map(async name=>{
 const block=xml.split('<remotePackage path="'+name+'"')[1]?.split('</remotePackage>')[0],archives=[...block.matchAll(/<archive>([\s\S]*?)<\/archive>/g)].map(x=>x[1]);
 const archive=archives.find(x=>x.includes('<host-os>windows</host-os>'))||archives[0],file=archive.match(/<url>(.*?)<\/url>/)[1];
 const response=await fetch('https://dl.google.com/android/repository/'+file,{signal:AbortSignal.timeout(300000)});if(!response.ok)throw Error(file+': '+response.status);
 await pipeline(Readable.fromWeb(response.body),createWriteStream('.tools/android-downloads/'+file));console.log('Downloaded '+file);
}));
