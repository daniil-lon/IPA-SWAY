import {open,rename,unlink} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

export function id3Prefix(header,size){
 if(header.length<10||header.toString('ascii',0,3)!=='ID3')return 0;
 if(![2,3,4].includes(header[3])||header[4]===255||[...header.subarray(6,10)].some(n=>n&128))throw Error('Invalid ID3 header');
 const length=10+((header[6]<<21)|(header[7]<<14)|(header[8]<<7)|header[9])+((header[3]===4&&(header[5]&16))?10:0);
 if(length+4>size||length>32*1024*1024)throw Error('Invalid ID3 length');
 return length;
}

export async function optimizeMP3(file,{apply=false}={}){
 const handle=await open(file,'r');let size,offset;
 try{
  size=(await handle.stat()).size;const header=Buffer.alloc(10);await handle.read(header,0,10,0);offset=id3Prefix(header,size);
  if(offset){const frame=Buffer.alloc(4);await handle.read(frame,0,4,offset);if(frame[0]!==255||(frame[1]&224)!==224||(frame[1]&6)===0||(frame[2]&240)===240||(frame[2]&12)===12)throw Error('No MPEG audio after ID3');}
 }finally{await handle.close();}
 if(!offset)return {removed:0,size};
 if(!apply)return {removed:offset,size};
 // Published snapshots share hard links. Replace the directory entry; never truncate it.
 const temp=file+'.'+randomUUID()+'.tmp',hash=createHash('sha256');
 try{
  await pipeline(createReadStream(file,{start:offset}),new Transform({transform(chunk,encoding,done){hash.update(chunk);done(null,chunk);}}),createWriteStream(temp,{flags:'wx'}));
  await rename(temp,file);
 }catch(error){await unlink(temp).catch(()=>{});throw error;}
 return {removed:offset,size,audioBytes:size-offset,audioSHA256:hash.digest('hex')};
}
