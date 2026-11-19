import {readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),blake=require('blake3-wasm');
const file='artifacts/sway-polish-release.json',release=JSON.parse(await readFile(file,'utf8'));
const deployments=JSON.parse((await readFile('artifacts/sway-deployments-before-listening.json','utf8')).replace(/^\uFEFF/,'')),latest=deployments.sort((a,b)=>a.created_on.localeCompare(b.created_on)).at(-1);
assert.equal(latest.versions.length,1);assert.equal(latest.versions[0].percentage,100);
assert.equal(latest.versions[0].version_id,'52ec32ce-f279-4825-9a91-b633b90d2abc');
const admin=await readFile('public/admin.html'),response=await fetch('https://music.academmix.ru/admin.html',{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(15000)});
if(response.status===200)assert.equal(response.headers.get('etag')?.replace(/^W\//,'').replaceAll('"',''),blake.hash(admin.toString('base64')+'html').toString('hex').slice(0,32),'Preserve the admin UI already published on the domain');
else {assert.ok([301,302,307,308].includes(response.status));assert.equal(new URL(response.headers.get('location'),'https://music.academmix.ru').pathname,'/admin');}
const files=['worker.mjs','admin-store.mjs','wrangler.jsonc','public/admin.html'];
for(const relative of files){assert.ok((await stat(relative)).mtimeMs<Date.parse(latest.created_on),'Root source predates the newly detected publication: '+relative);}
const worker=await readFile('worker.mjs','utf8');for(const marker of ["path==='/api/playlists'","path==='/api/import/resolve'",'handlePublicEditorialPlaylists','user:{id:user.id'])assert.ok(worker.includes(marker),marker);
release.supersededUpload='71e8d3ab-6fad-4185-8a9b-d1085ca956fc';release.originalBaseVersion=release.baseVersion;release.baseVersion=latest.versions[0].version_id;
release.backendRebasedAt=new Date().toISOString();release.backendRebasedFiles={};
release.existingAdminRedirect={status:response.status,location:response.headers.get('location'),note:'The current live admin page redirects to /admin. Preserve the independent admin work; full admin validation is outside this listening release.'};
for(const relative of files){await copyFile(relative,join(release.destination,relative));release.backendRebasedFiles[relative]=createHash('sha256').update(await readFile(relative)).digest('hex');}
release.assets['admin.html']=release.backendRebasedFiles['public/admin.html'];
for(const relative of ['worker.mjs','admin-store.mjs','playlist-store.mjs','playlist-import.mjs'])release.backend[relative]=createHash('sha256').update(await readFile(join(release.destination,relative))).digest('hex');
await writeFile(file,JSON.stringify(release,null,2));console.log('Preserved the live admin UI and the unchanged server source that predates version 54. Listening APIs remain included.');
