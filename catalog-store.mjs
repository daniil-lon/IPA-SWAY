import {json,readJSON} from './profile-store.mjs';
import aliases from './public/catalog-aliases.json' with {type:'json'};
import languages from './public/track-languages.json' with {type:'json'};
import coverColors from './public/cover-colors.js';
const clean=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const credits=t=>Array.isArray(t.artists)&&t.artists.length?t.artists:String(t.artist||'').split(/\s*[,;]\s*|\s+(?:&|×|feat\.?|ft\.?)\s+/iu).filter(Boolean);
export function recordingKey(t){return [clean(t.title),credits(t).map(clean).sort().join('|')].join('::');}
export function needsAttention(t){
 return (!t.albumTitle&&!t.album)||!t.art||!Number(t.seconds)||!t.artists?.length;
}
export function auditCatalog(tracks){
 const groups=new Map(),missing=[];
 for(const t of tracks){const key=recordingKey(t);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);if(needsAttention(t))missing.push({id:t.id,title:t.title,artist:t.artist,album:!(t.albumTitle||t.album),cover:!t.art,duration:!Number(t.seconds),credits:!t.artists?.length});}
 return {total:tracks.length,duplicates:[...groups.values()].filter(g=>g.length>1).map(g=>({key:recordingKey(g[0]),tracks:g.map(t=>({id:t.id,title:t.title,artist:t.artist,seconds:t.seconds}))})),missing:missing.slice(0,100),missingCount:missing.length};
}
export async function applyCatalogOverrides(db,tracks){
 tracks=tracks.map(t=>({...t,art:coverColors[t.id]?.art||t.art||t.cover||'/art/logo.svg',artists:credits(t),language:t.language||languages[t.id]||'',...(aliases[t.id]?{canonicalId:aliases[t.id]}:{})}));
 if(!db)return tracks;
 const {results}=await db.prepare('SELECT track,metadata FROM catalog_overrides').all();
 const patches=new Map(results.map(r=>[r.track,JSON.parse(r.metadata)]));
 const detected=await db.prepare('SELECT id,language FROM track_languages').all();
 const current=new Map(detected.results.map(r=>[r.id,r.language]));
 return tracks.map(t=>({...t,...(current.has(t.id)?{language:current.get(t.id)}:{}),...patches.get(t.id),id:t.id}));
}
export async function mergeCatalogOverride(db,id,metadata){
 const prior=await db.prepare('SELECT metadata FROM catalog_overrides WHERE track=?').bind(id).first();
 const merged={...JSON.parse(prior?.metadata||'{}'),...metadata};
 await db.prepare('INSERT INTO catalog_overrides(track,metadata,updated) VALUES(?,?,unixepoch()) ON CONFLICT(track) DO UPDATE SET metadata=excluded.metadata,updated=excluded.updated').bind(id,JSON.stringify(merged)).run();
 return merged;
}
export async function saveCatalogOverride(req,db,tracks){
 const b=await readJSON(req,12000),original=tracks.find(t=>t.id===b?.id);if(!original)return json({error:'unknown_track'},404);
 const metadata={};
 if(b.language!==undefined){if(!['','ru','en','foreign','mul','zxx'].includes(b.language))return json({error:'invalid_language'},400);metadata.language=b.language;}
 if(b.albumReleaseDate!==undefined){if(b.albumReleaseDate!==''&&(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(b.albumReleaseDate)||!Number.isFinite(Date.parse(b.albumReleaseDate))))return json({error:'invalid_release_date'},400);metadata.albumReleaseDate=b.albumReleaseDate;metadata.releaseDateVerified=true;}
 for(const key of ['title','artist','albumTitle','albumId','version'])if(b[key]!==undefined){if(typeof b[key]!=='string'||b[key].length>180||/[\u0000-\u001f]/.test(b[key])||(['title','artist'].includes(key)&&!b[key].trim()))return json({error:'invalid_metadata'},400);metadata[key]=b[key].trim();}
 for(const key of ['albumYear','discNumber','trackNumber'])if(b[key]!==undefined){if(!Number.isInteger(b[key])||b[key]<0||b[key]>(key==='albumYear'?2100:1000))return json({error:'invalid_metadata'},400);metadata[key]=b[key];}
 if(b.artists!==undefined){if(!Array.isArray(b.artists)||b.artists.length>20||b.artists.some(v=>typeof v!=='string'||!v.trim()||v.length>100))return json({error:'invalid_credits'},400);metadata.artists=[...new Set(b.artists.map(v=>v.trim()))];metadata.artist=metadata.artists.join(', ');}
 if(b.genre!==undefined){if(typeof b.genre!=='string'||b.genre.length>80)return json({error:'invalid_genre'},400);metadata.genre=b.genre.trim();}
 if(b.license!==undefined){if(typeof b.license!=='string'||b.license.length>80)return json({error:'invalid_license'},400);metadata.license=b.license.trim();}
 if(b.moods!==undefined){if(!Array.isArray(b.moods)||b.moods.length>20||b.moods.some(v=>typeof v!=='string'||!v.trim()||v.length>40))return json({error:'invalid_moods'},400);metadata.moods=[...new Set(b.moods.map(v=>v.trim()))];}
 if(b.hidden!==undefined){if(typeof b.hidden!=='boolean')return json({error:'invalid_hidden'},400);metadata.hidden=b.hidden;}
 if(b.explicit!==undefined||b.isExplicit!==undefined){const value=b.explicit??b.isExplicit;if(typeof value!=='boolean')return json({error:'invalid_explicit'},400);metadata.isExplicit=value;metadata.explicit=value;}
 if(b.canonicalId!==undefined){if(b.canonicalId!==''&&!tracks.some(t=>t.id===b.canonicalId&&t.id!==original.id&&!t.canonicalId&&recordingKey(t)===recordingKey({...original,...metadata})&&Math.abs(Number(t.seconds)-Number(original.seconds))<3))return json({error:'different_recording'},400);metadata.canonicalId=b.canonicalId;}
 const merged=await mergeCatalogOverride(db,original.id,metadata);
 return json({ok:true,track:{...original,...merged}});
}
