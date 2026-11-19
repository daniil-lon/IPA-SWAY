// Verify deployed static identity without downloading large responses on a throttled connection.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(resolve('node_modules/wrangler/wrangler-dist/cli.js')),blake3=require('blake3-wasm');
const release=JSON.parse(await readFile('artifacts/sway-polish-release.json','utf8')),base='https://music.academmix.ru';
const metadata=['albums.json','artists.json','wave-pulses.json','track-moods.json','chart.json'];
const preflight=process.argv.includes('--preflight'),files=preflight?metadata:[...new Set([...metadata,...Object.keys(release.assets)])];
const health=await(await fetch(base+'/api/health',{signal:AbortSignal.timeout(15000)})).json();assert.equal(health.tracks,release.tracks);
const catalog=JSON.parse(await readFile(join(release.destination,'public/catalog.json'),'utf8'));
const baseline=JSON.parse(await readFile(join(release.backendFrom,'public/catalog.json'),'utf8'));
assert.deepEqual(catalog,baseline,'The 7000-track source snapshot remains unchanged');
let count=0;
for(let at=0;at<files.length;at+=4)await Promise.all(files.slice(at,at+4).map(async file=>{
 const bytes=await readFile(join(release.destination,'public',file)),extension=file.split('.').at(-1);
 const expected=blake3.hash(bytes.toString('base64')+extension).toString('hex').slice(0,32);
 const response=await fetch(base+'/'+(file==='index.html'?'':file),{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(file==='admin.html'&&release.existingAdminRedirect?.status&&response.status!==200){assert.equal(response.status,release.existingAdminRedirect.status);return;}
 assert.equal(response.status,200,file);assert.equal(response.headers.get('etag')?.replace(/^W\//,'').replaceAll('"',''),expected,file+' asset identity');count++;
}));
const summary={at:new Date().toISOString(),base,tracks:health.tracks,verifiedStaticAssets:count,catalogSourceUnchanged:true,fullCatalogDownload:'inconclusive: current network stops near 18 KB',physicalPhone:'not tested',independentAdmin:release.existingAdminRedirect||null};
if(!preflight){
 const me=await(await fetch(base+'/api/me',{signal:AbortSignal.timeout(15000)})).json();assert.equal(me.user,null);
 const privatePlaylists=await fetch(base+'/api/playlists',{signal:AbortSignal.timeout(15000)});assert.equal(privatePlaylists.status,401);
 const track=catalog.find(t=>t.audio&&t.bytes>100000),audio=await fetch(new URL(track.audio,base),{headers:{Range:'bytes=0-8191'},signal:AbortSignal.timeout(15000)});
 assert.equal(audio.status,206);assert.equal((await audio.arrayBuffer()).byteLength,8192);summary.audioRange='passed';summary.anonymousPlaylistIsolation='passed';
}
await writeFile('artifacts/sway-listening-'+(preflight?'header-preflight':'published')+'.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
