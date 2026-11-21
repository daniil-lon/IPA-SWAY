import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const out=path.resolve('artifacts/loading-recovery'),manifest='artifacts/next-stage/release.json',cacheFile='artifacts/next-stage/asset-hashes.json';
const r=JSON.parse(fs.readFileSync(manifest)),cache=JSON.parse(fs.readFileSync(cacheFile));
const changes=['index.html','boot.js','asset-loader.js','sw.js'],sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const deployments=JSON.parse(fs.readFileSync(path.join(out,'deployments-before.json'),'utf8').replace(/^\uFEFF/,''));deployments.sort((a,b)=>a.created_on.localeCompare(b.created_on));
assert.deepEqual(deployments.at(-1).versions,[{version_id:r.publishedVersion,percentage:100}]);
for(const [file,hash] of Object.entries(r.sources))assert.equal(sha(path.join(r.destination,file)),hash,file);
for(const file of Object.keys(r.assets).filter(f=>!f.includes('/')))assert.equal(sha(path.join(r.destination,'public',file)),r.assets[file],file);
fs.mkdirSync(path.join(out,'before-code'),{recursive:true});fs.writeFileSync(path.join(out,'release-before.json'),JSON.stringify(r,null,2));
const native=createRequire(import.meta.url)('../artifacts/release-tools/node_modules/@napi-rs/blake-hash');
const wasm=createRequire(path.resolve('node_modules/wrangler/wrangler-dist/cli.js'))('blake3-wasm');
for(const file of changes){
 const target=path.join(r.destination,'public',file);if(fs.existsSync(target))fs.copyFileSync(target,path.join(out,'before-code',file));fs.copyFileSync(path.join('public',file),target);r.assets[file]=sha(target);
 const stat=fs.statSync(target),hash=Buffer.from(native.blake3(fs.readFileSync(target).toString('base64')+path.extname(target).slice(1))).toString('hex');
 assert.equal(hash,wasm.hash(fs.readFileSync(target).toString('base64')+path.extname(target).slice(1)).toString('hex'));
 cache[target]={size:stat.size,mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs,hash};
}
// Patch only the public recovery route into the verified production backend.
// The workspace's separate admin changes do not enter this release.
const workerPath=path.join(r.destination,'worker.mjs');fs.copyFileSync(workerPath,path.join(out,'before-code','worker.mjs'));
let worker=fs.readFileSync(workerPath,'utf8');
assert.equal(worker.split("import {media} from './media.mjs';").length,2);
assert.equal(worker.split("  if(path==='/api/catalog'||path==='/catalog.json'){").length,2);
worker=worker.replace("import {media} from './media.mjs';","import {media} from './media.mjs';\nimport {assetPart} from './asset-transfer.mjs';").replace("  if(path==='/api/catalog'||path==='/catalog.json'){","  if(path==='/api/asset-part')return assetPart(req,env);\n  if(path==='/api/catalog'||path==='/catalog.json'){");
fs.writeFileSync(workerPath,worker);fs.copyFileSync('asset-transfer.mjs',path.join(r.destination,'asset-transfer.mjs'));
for(const file of ['worker.mjs','asset-transfer.mjs'])r.sources[file]=sha(path.join(r.destination,file));
await build({entryPoints:[workerPath],bundle:true,format:'esm',write:false,logLevel:'silent'});
assert.equal(sha(path.join(r.destination,'public/downloads/Sway-Android.apk')),'b01520b6e2dccf88bbf51e8be5a0c96f36a053c935d7be019fe84758dbb2ddff');
r.base=deployments.at(-1);r.refreshedAt=new Date().toISOString();r.refreshedFiles=changes;
fs.writeFileSync(cacheFile,JSON.stringify(cache));fs.writeFileSync(manifest,JSON.stringify(r,null,2));
fs.writeFileSync(path.join(out,'freeze.json'),JSON.stringify({at:r.refreshedAt,base:r.base,public:changes,sources:['worker.mjs','asset-transfer.mjs'],workerBundle:'PASS',apk:'unchanged'},null,2));
console.log('PASS: scoped recovery snapshot, previous backend preserved, native asset hashes verified, Worker bundled, APK unchanged');
