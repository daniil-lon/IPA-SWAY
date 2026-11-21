import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const file='artifacts/next-stage/release.json',r=JSON.parse(fs.readFileSync(file)),cacheFile='artifacts/next-stage/asset-hashes.json',cache=JSON.parse(fs.readFileSync(cacheFile));
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const native=createRequire(import.meta.url)('../artifacts/release-tools/node_modules/@napi-rs/blake-hash');
for(const name of Object.keys(r.assets).filter(name=>/^sw-part-[a-f0-9]{16}\.js$/.test(name))){
 const target=path.join(r.destination,'public',name);if(fs.existsSync(target))fs.unlinkSync(target);delete r.assets[name];delete cache[target];
}
for(const name of ['index.html','boot.js','app.js','app-bundle.js','styles.css','sway.css','style.css','mobile.css','wave.css','browse.css','player.css','sway-glass.css','sway-reference.css','collection.css','refinements.css','asset-loader.js','media-loader.js','playback-recovery.js','catalog-loader.js','sw.js','_headers']){
 const target=path.join(r.destination,'public',name);fs.copyFileSync(path.join('public',name),target);r.assets[name]=sha(target);
 const stat=fs.statSync(target),hash=Buffer.from(native.blake3(fs.readFileSync(target).toString('base64')+path.extname(target).slice(1))).toString('hex');
 cache[target]={size:stat.size,mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs,hash};
}
fs.copyFileSync('service-worker.mjs',path.join(r.destination,'service-worker.mjs'));r.sources['service-worker.mjs']=sha('service-worker.mjs');
for(const name of ['worker.mjs','worker-startup.mjs','wrangler.jsonc','asset-socket.mjs','asset-transfer.mjs','catalog-recovery.mjs','published-catalog-state.json']){
 const target=path.join(r.destination,name);
 if(r.sources[name])assert.equal(sha(target),r.sources[name],name+' changed in snapshot');
 fs.copyFileSync(name,target);r.sources[name]=sha(target);
}
for(const [name,hash] of Object.entries(r.sources))assert.equal(sha(path.join(r.destination,name)),hash,name);
r.refreshedAt=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(r,null,2));fs.writeFileSync(cacheFile,JSON.stringify(cache));
console.log('PASS: final standalone worker, deferred boot/styles/images and current backend frozen');
