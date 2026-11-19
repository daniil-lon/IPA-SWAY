import {copyFile,link,mkdir,readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {createHash} from 'node:crypto';

// Publish UI work against the verified live catalogue, while the separate importer runs.
const next=process.argv.includes('--next');
const local=process.argv.includes('--local');
const previous=JSON.parse(await readFile(next?'artifacts/sway-polish-release.json':'artifacts/sway-refinement-release.json','utf8'));
const refresh=process.argv.includes('--refresh');
const existing=refresh?JSON.parse(await readFile('artifacts/sway-polish-release.json','utf8')):null;
const base=local?resolve('.'):resolve(previous.destination),destination=existing?.destination||resolve('artifacts/sway-polish-ship-'+Date.now());
if(!local&&!base.startsWith(resolve('artifacts')+'\\'))throw new Error('Unexpected release base');
if(!destination.startsWith(resolve('artifacts')+'\\sway-polish-ship-'))throw new Error('Unexpected release destination');
const changed=['index.html','collection.css','playlists.js','playlist-match.js','discovery.js','cover-colors.js','system-media.js','audio-transition.js','equalizer.js','offline-storage.js','wave.js','app.js','browse.css','taste-ui.js','taste.css','lyrics.js','lyrics.css','wave-light.js','wave-deck.js','sway-reference.css','sw.js','art/wave-symbols.svg',...['party','flower','bolt','rap','night'].map(name=>'art/wave-'+name+'.svg')];
changed.push('listening-tools.js','loudness.js','wave-filters.js','sleep-timer.js','share-card.js','pwa-prompt.js','manifest.webmanifest','art/logo.svg','art/logo-burst.png','art/logo-burst.webp','art/icon-180.png','art/icon-192.png','art/icon-512.png','art/icon-maskable-512.png','art/system/logo.png');
let files=existing?.files||0,linked=existing?.linked||0;
async function tree(from,to){
 await mkdir(to,{recursive:true});
 for(const entry of await readdir(from,{withFileTypes:true})){
  const source=join(from,entry.name),target=join(to,entry.name);
  if(entry.isDirectory())await tree(source,target);
  else if(entry.isFile()){
   if(/\.(mp3|m4a|ogg|opus|wav|flac)$/i.test(extname(source))){try{await link(source,target);linked++;}catch{await copyFile(source,target);}}
   else await copyFile(source,target);
   files++;
  }
 }
}
if(!refresh){
 await tree(join(base,'public'),join(destination,'public'));
 for(const entry of await readdir(base))if(entry.endsWith('.mjs')||entry==='wrangler.jsonc')await copyFile(join(base,entry),join(destination,entry));
}
for(const file of changed){const target=join(destination,'public',file);if(!await stat(target).catch(()=>null))files++;await copyFile(join('public',file),target);}
for(const file of ['worker.mjs','media.mjs','profile-store.mjs','admin-store.mjs','yandex-avatar.mjs','chart-store.mjs','taste-store.mjs','playlist-store.mjs','playlist-import.mjs','wrangler.jsonc'])await copyFile(file,join(destination,file));
 await mkdir(join(destination,'migrations'),{recursive:true});for(const file of await readdir('migrations'))if(file.endsWith('.sql'))await copyFile(join('migrations',file),join(destination,'migrations',file));
 const tracks=JSON.parse(await readFile(join(destination,'public/catalog.json'),'utf8'));
const expectedTracks=local?JSON.parse(await readFile('public/catalog.json','utf8')).length:existing?.tracks||previous.tracks;
if(tracks.length!==expectedTracks||new Set(tracks.map(t=>t.id)).size!==tracks.length)throw new Error('Catalogue snapshot changed');
const catalogue=local?Object.fromEntries(await Promise.all(['catalog.json','albums.json','artists.json','wave-pulses.json','track-moods.json','chart.json'].map(async file=>[file,createHash('sha256').update(JSON.stringify(JSON.parse(await readFile(join(destination,'public',file),'utf8')))).digest('hex')]))):existing?.catalogue||previous.catalogue;
const assets={};for(const file of changed)assets[file]=createHash('sha256').update(await readFile(join(destination,'public',file))).digest('hex');
const manifest={destination,tracks:tracks.length,files,linked,baseVersion:existing?.baseVersion||previous.version||previous.baseVersion,catalogue,assets,createdAt:new Date().toISOString()};
await writeFile('artifacts/sway-polish-release.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest,null,2));
