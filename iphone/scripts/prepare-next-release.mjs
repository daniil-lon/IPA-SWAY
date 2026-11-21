import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {build} from 'esbuild';
const require=createRequire(import.meta.url),root=process.cwd(),native=require('../artifacts/release-tools/node_modules/@napi-rs/blake-hash');
const destination=path.resolve('artifacts/sway-next-ship-'+Date.now()),cacheFile=fs.existsSync('artifacts/next-stage/asset-hashes.json')?'artifacts/next-stage/asset-hashes.json':'artifacts/sway-asset-hashes.json',old=JSON.parse(fs.readFileSync(cacheFile)),audioCache=new Map();
for(const [file,c]of Object.entries(old)){if(!file.includes('\\public\\media\\')||!/^([a-f0-9]{64})$/.test(c.hash||''))continue;const source=path.resolve('public/media',path.basename(file));try{const a=fs.statSync(file),b=fs.statSync(source);if(a.ino===b.ino&&a.dev===b.dev&&a.size===c.size&&a.mtimeMs===c.mtimeMs&&a.ctimeMs===c.ctimeMs)audioCache.set(source,c);}catch{}}
fs.mkdirSync(destination,{recursive:true});for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.mjs')||f==='wrangler.jsonc'))fs.copyFileSync(file,path.join(destination,file));fs.cpSync('migrations',path.join(destination,'migrations'),{recursive:true});
const hashes={},assets={},sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');let files=0,reused=0;
function walk(directory,relative=''){
 for(const e of fs.readdirSync(directory,{withFileTypes:true})){const rel=path.join(relative,e.name),source=path.join(directory,e.name),target=path.join(destination,'public',rel);if(e.isSymbolicLink())throw Error('Unexpected asset symlink');if(e.isDirectory()){fs.mkdirSync(target,{recursive:true});walk(source,rel);continue;}if(!e.isFile())continue;
  const before=fs.statSync(source),entry=audioCache.get(path.resolve(source));let hash;
  if(rel.startsWith('media'+path.sep)){fs.linkSync(source,target);const after=fs.statSync(source);if(after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw Error('Audio changed while freezing');if(entry){hash=entry.hash;reused++;}}
  else{fs.copyFileSync(source,target);assets[rel.replaceAll('\\','/')]=sha(target);}
  if(!hash)hash=Buffer.from(native.blake3(fs.readFileSync(target).toString('base64')+path.extname(target).slice(1))).toString('hex');const st=fs.statSync(target);hashes[target]={size:st.size,mtimeMs:st.mtimeMs,ctimeMs:st.ctimeMs,hash};files++;if(files%3000===0)console.log('Prepared '+files+' assets');
 }
}
fs.mkdirSync(path.join(destination,'public'));walk(path.resolve('public'));
const sources={};for(const f of fs.readdirSync(destination).filter(f=>f.endsWith('.mjs')||f==='wrangler.jsonc'))sources[f]=sha(path.join(destination,f));
await build({entryPoints:[path.join(destination,'worker.mjs')],bundle:true,format:'esm',write:false});
const req=createRequire(path.resolve('node_modules/wrangler/wrangler-dist/cli.js')),wasm=req('blake3-wasm');for(const rel of ['app.js','index.html','downloads/Sway-Android.apk','media/'+fs.readdirSync('public/media')[0]]){const file=path.join(destination,'public',rel);if(hashes[file].hash!==wasm.hash(fs.readFileSync(file).toString('base64')+path.extname(file).slice(1)).toString('hex'))throw Error('Hash mismatch: '+rel);}
const deployments=JSON.parse(fs.readFileSync('artifacts/next-stage/deployments-before.json')).sort((a,b)=>a.created_on.localeCompare(b.created_on));
fs.writeFileSync('artifacts/next-stage/asset-hashes.json',JSON.stringify(hashes));fs.writeFileSync('artifacts/next-stage/release.json',JSON.stringify({destination,files,reused,assets,sources,base:deployments.at(-1),preparedAt:new Date().toISOString()},null,2));console.log(JSON.stringify({destination,files,reused}));
