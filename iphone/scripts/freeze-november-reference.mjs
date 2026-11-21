import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {build} from 'esbuild';

const out=path.resolve('artifacts/november-21-reference');
const manifest='artifacts/next-stage/release.json',cacheFile='artifacts/next-stage/asset-hashes.json';
const r=JSON.parse(fs.readFileSync(manifest)),cache=JSON.parse(fs.readFileSync(cacheFile));
const changed=['app.js','player-scene.js','refinements.css','wave-light.js','sw.js'];
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.ok(r.destination.startsWith(path.resolve('artifacts')+path.sep+'sway-next-ship-'));
const deployments=JSON.parse(fs.readFileSync(path.join(out,'deployments-before.json'),'utf8').replace(/^\uFEFF/,''));
deployments.sort((a,b)=>a.created_on.localeCompare(b.created_on));
assert.deepEqual(deployments.at(-1).versions,[{version_id:r.publishedVersion,percentage:100}]);
// Reuse the verified backend and catalogue snapshot while unrelated admin work continues locally.
for(const [file,hash] of Object.entries(r.sources))assert.equal(sha(path.join(r.destination,file)),hash,file);
const codeAssets=Object.keys(r.assets).filter(f=>!f.includes('/')||f.startsWith('admin/'));
for(const file of codeAssets)assert.equal(sha(path.join(r.destination,'public',file)),r.assets[file],file);
fs.mkdirSync(path.join(out,'before-code'),{recursive:true});
fs.writeFileSync(path.join(out,'release-before.json'),JSON.stringify(r,null,2));
const native=createRequire(import.meta.url)('../artifacts/release-tools/node_modules/@napi-rs/blake-hash');
for(const file of changed){
 const target=path.join(r.destination,'public',file);
 fs.copyFileSync(target,path.join(out,'before-code',file));fs.copyFileSync(path.join('public',file),target);
 r.assets[file]=sha(target);
 const stat=fs.statSync(target),hash=Buffer.from(native.blake3(fs.readFileSync(target).toString('base64')+path.extname(target).slice(1))).toString('hex');
 cache[target]={size:stat.size,mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs,hash};
}
const wasm=createRequire(path.resolve('node_modules/wrangler/wrangler-dist/cli.js'))('blake3-wasm');
for(const file of changed){
 const target=path.join(r.destination,'public',file);
 assert.equal(cache[target].hash,wasm.hash(fs.readFileSync(target).toString('base64')+path.extname(target).slice(1)).toString('hex'));
}
for(const file of codeAssets)assert.equal(sha(path.join(r.destination,'public',file)),r.assets[file],file);
await build({entryPoints:[path.join(r.destination,'worker.mjs')],bundle:true,format:'esm',write:false,logLevel:'silent'});
assert.equal(sha(path.join(r.destination,'public/downloads/Sway-Android.apk')),'b01520b6e2dccf88bbf51e8be5a0c96f36a053c935d7be019fe84758dbb2ddff');
r.base=deployments.at(-1);r.refreshedAt=new Date().toISOString();r.refreshedFiles=changed;
fs.writeFileSync(cacheFile,JSON.stringify(cache));fs.writeFileSync(manifest,JSON.stringify(r,null,2));
const report={at:r.refreshedAt,base:r.base.id,baseVersion:r.publishedVersion,files:changed,sourceFiles:Object.keys(r.sources).length,codeAssets:codeAssets.length,tracks:JSON.parse(fs.readFileSync(path.join(r.destination,'public/catalog.json'))).length,apk:'unchanged',hashCompatibility:'Wrangler matched',workerBundle:'PASS'};
fs.writeFileSync(path.join(out,'freeze.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
