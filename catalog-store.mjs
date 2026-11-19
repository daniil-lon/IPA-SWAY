import {json,readJSON} from './profile-store.mjs';
import aliases from './public/catalog-aliases.json' with {type:'json'};
const clean=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const credits=t=>Array.isArray(t.artists)&&t.artists.length?t.artists:String(t.artist||'').split(/\s*[,;]\s*|\s+(?:&|×|feat\.?|ft\.?)\s+/iu).filter(Boolean);
export function recordingKey(t){return [clean(t.title),credits(t).map(clean).sort().join('|')].join('::');}
export function auditCatalog(tracks){
 const groups=new Map(),missing=[];
 for(const t of tracks){const key=recordingKey(t);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);if(!t.albumTitle&&!t.album||!t.art||!Number(t.seconds)||!t.artists?.length)missing.push({id:t.id,title:t.title,artist:t.artist,album:!(t.albumTitle||t.album),cover:!t.art,duration:!Number(t.seconds),credits:!t.artists?.length});}
 return {total:tracks.length,duplicates:[...groups.values()].filter(g=>g.length>1).map(g=>({key:recordingKey(g[0]),tracks:g.map(t=>({id:t.id,title:t.title,artist:t.artist,seconds:t.seconds}))})),missing:missing.slice(0,100),missingCount:missing.length};
}
export async function applyCatalogOverrides(db,tracks){
 tracks=tracks.map(t=>({...t,artists:credits(t),...(aliases[t.id]?{canonicalId:aliases[t.id]}:{})}));
 if(!db)return tracks;
 const {results}=await db.prepare('SELECT track,metadata FROM catalog_overrides').all();
 const patches=new Map(results.map(r=>[r.track,JSON.parse(r.metadata)]));
 return tracks.map(t=>patches.has(t.id)?{...t,...patches.get(t.id),id:t.id}:t);
}
export async function saveCatalogOverride(req,db,tracks){
 const b=await readJSON(req,12000),original=tracks.find(t=>t.id===b?.id);if(!original)return json({error:'unknown_track'},404);
 const metadata={};
 for(const key of ['title','artist','albumTitle','albumId','version'])if(b[key]!==undefined){if(typeof b[key]!=='string'||b[key].length>180||/[\u0000-\u001f]/.test(b[key])||(['title','artist'].includes(key)&&!b[key].trim()))return json({error:'invalid_metadata'},400);metadata[key]=b[key].trim();}
 for(const key of ['albumYear','discNumber','trackNumber'])if(b[key]!==undefined){if(!Number.isInteger(b[key])||b[key]<0||b[key]>(key==='albumYear'?2100:1000))return json({error:'invalid_metadata'},400);metadata[key]=b[key];}
 if(b.artists!==undefined){if(!Array.isArray(b.artists)||b.artists.length>20||b.artists.some(v=>typeof v!=='string'||!v.trim()||v.length>100))return json({error:'invalid_credits'},400);metadata.artists=[...new Set(b.artists.map(v=>v.trim()))];metadata.artist=metadata.artists.join(', ');}
 if(b.canonicalId!==undefined){if(b.canonicalId!==''&&!tracks.some(t=>t.id===b.canonicalId&&t.id!==original.id&&!t.canonicalId&&recordingKey(t)===recordingKey({...original,...metadata})&&Math.abs(Number(t.seconds)-Number(original.seconds))<3))return json({error:'different_recording'},400);metadata.canonicalId=b.canonicalId;}
 const prior=await db.prepare('SELECT metadata FROM catalog_overrides WHERE track=?').bind(original.id).first();
 await db.prepare('INSERT INTO catalog_overrides(track,metadata,updated) VALUES(?,?,unixepoch()) ON CONFLICT(track) DO UPDATE SET metadata=excluded.metadata,updated=excluded.updated').bind(original.id,JSON.stringify({...JSON.parse(prior?.metadata||'{}'),...metadata})).run();
 return json({ok:true,track:{...original,...metadata}});
}
