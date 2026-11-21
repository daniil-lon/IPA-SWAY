import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const out=path.resolve('artifacts/loading-recovery'),manifest='artifacts/next-stage/release.json',cacheFile='artifacts/next-stage/asset-hashes.json';
const r=JSON.parse(fs.readFileSync(manifest)),cache=JSON.parse(fs.readFileSync(cacheFile)),sha=data=>createHash('sha256').update(data).digest('hex');
const deployments=JSON.parse(fs.readFileSync(path.join(out,'deployments-fresh.json'),'utf8').replace(/^\uFEFF/,''));deployments.sort((a,b)=>a.created_on.localeCompare(b.created_on));
const base=deployments.at(-1);assert.deepEqual(base.versions,[{version_id:'3f005c3b-86fd-4946-a611-b4e6f9928788',percentage:100}]);
fs.mkdirSync(path.join(out,'before-final'),{recursive:true});fs.writeFileSync(path.join(out,'manifest-before-final.json'),JSON.stringify(r,null,2));
const map=JSON.parse(fs.readFileSync(path.join(out,'production-server/worker.js.map'))),preserved=[];
for(let i=0;i<map.sources.length;i++){
 const file=map.sources[i].replaceAll('\\','/'),data=map.sourcesContent[i];
 assert.match(file,/^(?:[a-z0-9-]+\.mjs|public\/[a-z0-9-]+\.(?:js|json))$/);
 assert.equal(sha(fs.readFileSync(file)),sha(data),'Live backend source changed since download: '+file);
 if(file.endsWith('.mjs')){fs.writeFileSync(path.join(r.destination,file),data);r.sources[file]=sha(data);preserved.push(file);}
 else assert.equal(sha(fs.readFileSync(path.join(r.destination,file))),sha(data),'Frozen server data: '+file);
}
const native=createRequire(import.meta.url)('../artifacts/release-tools/node_modules/@napi-rs/blake-hash');
const wasm=createRequire(path.resolve('node_modules/wrangler/wrangler-dist/cli.js'))('blake3-wasm');
const hash=file=>Buffer.from(native.blake3(fs.readFileSync(file).toString('base64')+path.extname(file).slice(1))).toString('hex');
const changes=['index.html','boot.js','asset-loader.js','sw.js'];
const candidates=[...fs.readdirSync('public',{withFileTypes:true}).filter(d=>d.isFile()).map(d=>d.name),...fs.readdirSync('public/admin',{withFileTypes:true}).filter(d=>d.isFile()).map(d=>'admin/'+d.name)]
 .filter(file=>!changes.includes(file)&&sha(fs.readFileSync(path.join('public',file)))!==r.assets[file]);
const publicPreserved=[];
for(const file of candidates){
 const current=hash(path.join('public',file)).slice(0,32),response=await fetch('https://music.academmix.ru/'+file,{method:'HEAD',signal:AbortSignal.timeout(10000)});
 const remote=response.headers.get('ETag')?.replace(/^W\//,'').replace(/^"|"$/g,'');
 assert.equal(response.status,200,'Live asset '+file);assert.equal(remote,current,'Current public asset differs: '+file);publicPreserved.push(file);
}
for(const file of [...publicPreserved,...changes]){
 const target=path.join(r.destination,'public',file);fs.mkdirSync(path.dirname(target),{recursive:true});
 if(fs.existsSync(target)){const backup=path.join(out,'before-final',file);fs.mkdirSync(path.dirname(backup),{recursive:true});fs.copyFileSync(target,backup);}else r.files++;
 fs.copyFileSync(path.join('public',file),target);r.assets[file]=sha(fs.readFileSync(target));
 const stat=fs.statSync(target),digest=hash(target);assert.equal(digest,wasm.hash(fs.readFileSync(target).toString('base64')+path.extname(target).slice(1)).toString('hex'));
 cache[target]={size:stat.size,mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs,hash:digest};
}
await build({entryPoints:[path.join(r.destination,'worker.mjs')],bundle:true,format:'esm',write:false,logLevel:'silent'});
for(const [file,digest] of Object.entries(r.sources))assert.equal(sha(fs.readFileSync(path.join(r.destination,file))),digest,file);
assert.equal(sha(fs.readFileSync(path.join(r.destination,'public/downloads/Sway-Android.apk'))),'b01520b6e2dccf88bbf51e8be5a0c96f36a053c935d7be019fe84758dbb2ddff');
r.base=base;r.publishedVersion=base.versions[0].version_id;r.publishedAt=base.created_on;r.refreshedAt=new Date().toISOString();r.refreshedFiles=changes;
fs.writeFileSync(cacheFile,JSON.stringify(cache));fs.writeFileSync(manifest,JSON.stringify(r,null,2));
const report={at:r.refreshedAt,base:base.id,version:r.publishedVersion,preservedServer:preserved,preservedPublic:publicPreserved,changed:changes,worker:'PASS',apk:'unchanged'};
fs.writeFileSync(path.join(out,'freeze.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
