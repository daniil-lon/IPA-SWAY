import fs from 'node:fs';
let p='public/app.js',s=fs.readFileSync(p,'utf8');
s="import {nativeAndroid,connectNativeAudio,nativeEqualizer,nativeQueue} from './native-audio.js';\n"+s;
s=s.replace("const eq=makeEqualizer(audioElements,load('equalizer',{}));", "connectNativeAudio(audioElements);\nconst eq=nativeAndroid?nativeEqualizer(audioElements,load('equalizer',{})):makeEqualizer(audioElements,load('equalizer',{}));");
s=s.replace("const playbackURL=t=>offlineTracks.has(t.id)","const playbackURL=t=>!nativeAndroid&&offlineTracks.has(t.id)");
s=s.replace("accountListening?.changed();", "accountListening?.changed();\n if(nativeAndroid){const at=queue.indexOf(current.id);nativeQueue(audio,tracksFrom(at<0?[current.id]:queue.slice(at)));}");
s=s.replace("function rememberPlayed(){",`window.addEventListener('sway-native-track',event=>{
 const d=event.detail,t=map.get(d.trackId);if(!t||current?.id===t.id)return;const el=audioElements[d.channel];if(el!==audio)return;
 current=t;playing=!d.paused;starting=false;listening={position:d.currentTime,seconds:0,recorded:false,chartRecorded:false};systemMedia.setTrack(t);rememberPlayed();sync();if(page==='home')render();
});
function rememberPlayed(){`);
// Preserve album order from the catalogue, then explicit disc/track numbering when supplied.
s=s.replace("title:t.albumTitle||t.title,", "title:t.albumTitle||t.title,");
s=s.replace("year:t.albumYear||2026,", "year:t.albumYear||'',").replace("releaseDate:t.albumReleaseDate||'2026-01-01',", "releaseDate:t.albumReleaseDate||'',").replace("likes:'17 200'", "likes:''");
s=s.replace("const albumTracks = (album.trackIds || []).map(id => map.get(id)).filter(Boolean);", "const albumTracks = (album.trackIds || []).map(id => map.get(id)).filter(Boolean).sort((a,b)=>(a.discNumber||1)-(b.discNumber||1)||(a.trackNumber||0)-(b.trackNumber||0));");
fs.writeFileSync(p,s);
p='public/native-audio.js';s=fs.readFileSync(p,'utf8').replace("state.loaded='';}});","state.loaded='';if(el.preload!=='none')queueMicrotask(()=>el.load());}});").replace("if(d.ended)el.dispatchEvent", "if(d.ended&&!state.sentEnded)el.dispatchEvent").replace("if(oldId&&d.trackId", "state.sentEnded=d.ended;\n  if(oldId&&d.trackId");fs.writeFileSync(p,s);
p='public/sw.js';s=fs.readFileSync(p,'utf8').replace('sway-shell-v16','sway-shell-v17').replace("const shellPaths=[", "const shellPaths=['/native-audio.js','/catalog-loader.js','/smart-search.js','/listening-account.js','/listening-stats.js','/next-stage.css',");fs.writeFileSync(p,s);
