const fs=require('node:fs');
const path=require('node:path');
const archive='C:/Users/Даниил/AppData/Local/Programs/YandexMusicMod/resources/app.asar';
const fd=fs.openSync(archive,'r'),header=Buffer.alloc(16);fs.readSync(fd,header,0,16,0);
const json=Buffer.alloc(header.readUInt32LE(12));fs.readSync(fd,json,0,json.length,16);
const start=8+header.readUInt32LE(4),entries=[];
function walk(tree,base=''){for(const[name,item]of Object.entries(tree.files||{})){const file=base+'/'+name;if(item.files)walk(item,file);else entries.push({file,...item});}}
walk(JSON.parse(json));
function read(item){const b=Buffer.alloc(item.size);fs.readSync(fd,b,0,b.length,start+Number(item.offset));return b;}
const wanted=process.argv[2]||'styles';
if(wanted==='styles'){
 const terms=/\.(?:SearchPage|SearchInput|SearchFilters|CollectionPage|CollectionShelf|CollectionPlaylists|VibeAnimation|VibeBlock|VibeSettings|VibeControl|VibePlayer|Vibe_root|Vibe_content|CategoryCard|MixesGrid|MixCard|Shelf|BlockHeader|PlaylistCard|PlayerBarDesktop|Navbar|Navigation|Tab|Typography|Heading|SearchGenre|SearchCategory|SearchSection)[^{}]*\{[^{}]*\}/g;
 const output=[];
 for(const item of entries.filter(x=>x.file.startsWith('/app/')&&x.file.endsWith('.css'))){
  const text=read(item).toString('utf8');const rules=[...text.matchAll(terms)].map(m=>m[0]);
  const variables=[...text.matchAll(/--ym-(?:font-(?:size|line-height|weight|heading|text)[\w-]*|spacer-size-[\w-]*|radius-size-[\w-]*|(?:controls|background|surface|outline)-color-[\w-]+)\s*:\s*[^;}]+/g)].map(m=>m[0]);
  if(rules.length||variables.length)output.push({file:item.file,rules,variables});
 }
 const dir=path.resolve(__dirname,'../artifacts/reference');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'styles.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output.map(x=>({file:x.file,rules:x.rules.length,variables:x.variables.length}))));
}else if(wanted==='rules'){
 const term=new RegExp(process.argv[3]||'Like|Heart|VibePlay');
 const rules=[];
 for(const item of entries.filter(x=>x.file.startsWith('/app/')&&x.file.endsWith('.css'))){
  for(const match of read(item).toString('utf8').matchAll(/([^{}]+)\{([^{}]*)\}/g))if(term.test(match[1]))rules.push(match[0]);
 }
 console.log(rules.join('\n').slice(0,25000));
}else if(wanted==='assets'){
 console.log(JSON.stringify(entries.filter(x=>x.file.startsWith('/app/')&&(/\.(mp4|webm|avif|webp|jpeg|jpg|png|frag|vert|glsl)$/.test(x.file)||/vibe|genre|mood|category|autumn|epoch/i.test(x.file)&&!x.file.endsWith('.js'))).map(x=>({file:x.file,size:x.size})),null,2));
}else if(wanted==='extract'){
 const sources=['/app/media/vibe_animation_fallback/vibe_animation_fallback_dark.jpeg','/app/media/vibe_animation_fallback/vibe_animation_fallback_dark.mp4','/app/_next/static/media/heart.602389ae.png'];
 const dir=path.resolve(__dirname,'../ui/reference-art');fs.mkdirSync(dir,{recursive:true});
 for(const file of sources){const entry=entries.find(x=>x.file===file);if(!entry)continue;const target=path.join(dir,path.basename(file));fs.writeFileSync(target,read(entry));console.log(target);}
}else if(wanted==='visual-data'){
 const out=[];
 for(const item of entries.filter(x=>x.file.startsWith('/app/')&&/\.(js|json|html|txt|css)$/.test(x.file))){
  const text=read(item).toString('utf8');
  for(const term of ['Осенняя','Настроения','Эпохи','CategoryCard','MixCard','vibe_animation_fallback','get-music-misc']){
   let at=text.indexOf(term);if(at<0)continue;
   const limit=term==='get-music-misc'?4:2;let n=0;
   while(at>=0&&n++<limit){out.push({file:item.file,term,excerpt:text.slice(Math.max(0,at-260),at+600)});at=text.indexOf(term,at+term.length);}
  }
 }
 const dir=path.resolve(__dirname,'../artifacts/reference');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'visual-data.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out).slice(0,22000));
}
fs.closeSync(fd);
