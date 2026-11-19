'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const extensions=new Set(['.mp3','.m4a','.flac','.wav','.ogg','.opus','.aac']);
const kinds=new Set(['music','book','podcast']);

/** Only paths approved by the native file picker enter this registry. */
class LocalLibrary{
 constructor(directory){this.directory=directory;this.file=path.join(directory,'imported-library.json');this.entries=[];this.writing=Promise.resolve();}
 async load(){
  try{const data=JSON.parse(await fs.readFile(this.file,'utf8'));if(data.version===1&&Array.isArray(data.entries))this.entries=data.entries.filter(e=>typeof e.id==='string'&&/^local-[a-f0-9-]{36}$/.test(e.id)&&typeof e.path==='string'&&path.isAbsolute(e.path)&&extensions.has(path.extname(e.path).toLowerCase())&&kinds.has(e.kind)).slice(0,10000);}catch{}
  return this;
 }
 persist(){
  const payload=JSON.stringify({version:1,entries:this.entries},null,2);
  this.writing=this.writing.catch(()=>{}).then(async()=>{await fs.mkdir(this.directory,{recursive:true});const temp=this.file+'.tmp';await fs.writeFile(temp,payload);await fs.rename(temp,this.file);});return this.writing;
 }
 view(entry){return {id:entry.id,title:entry.title,artist:entry.artist||'С компьютера',audio:`sway://app/imported/${entry.id.slice(6)}`,art:'/art/icon-512.png',seconds:Number(entry.seconds)||0,format:path.extname(entry.path).slice(1).toUpperCase(),kind:entry.kind,local:true,addedAt:entry.addedAt};}
 list(){return this.entries.map(e=>this.view(e));}
 async add(paths,kind='music'){
  if(!kinds.has(kind))throw new Error('Unknown media type');
  const imported=[];
  for(const input of paths.slice(0,250)){
   try{
    const file=await fs.realpath(input),stat=await fs.stat(file);
    if(!stat.isFile()||!extensions.has(path.extname(file).toLowerCase()))continue;
    let entry=this.entries.find(e=>e.path.toLowerCase()===file.toLowerCase());
    if(!entry){entry={id:'local-'+randomUUID(),path:file,title:path.basename(file,path.extname(file)).slice(0,240),kind,addedAt:Date.now()};this.entries.push(entry);}
    else entry.kind=kind;
    imported.push(this.view(entry));
   }catch{}
  }
  await this.persist();return imported;
 }
 async resolve(token){
  const entry=this.entries.find(e=>e.id==='local-'+token);if(!entry)return null;
  try{const file=await fs.realpath(entry.path);if(file.toLowerCase()!==entry.path.toLowerCase())return null;const stat=await fs.stat(file);return stat.isFile()?{file,stat}:null;}catch{return null;}
 }
 async remove(id){this.entries=this.entries.filter(e=>e.id!==id);await this.persist();}
 async updateDuration(id,value){const entry=this.entries.find(e=>e.id===id);if(entry&&Number.isFinite(value)&&value>=0&&value<=604800){entry.seconds=value;await this.persist();}}
}
module.exports={LocalLibrary};
