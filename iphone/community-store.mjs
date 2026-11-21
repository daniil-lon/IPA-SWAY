import {credits as artistCredits} from './catalog-store.mjs';
const canonical=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru').replace(/ё/g,'е');
const albumRef=t=>t.albumId||String(t.title||'').trim().toLowerCase().replace(/[«»""''„“]/g,'').replace(/[/\\]+/g,'-').replace(/[^a-zа-яё0-9$_\-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,60);
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const kinds=new Set(['artist-best','artist-radio','album','playlist','editorial']);
let cached=null;
export function clearCommunityCache(){cached=null;}
export async function communitySignals(db,tracks){
 if(cached?.db===db&&cached.until>Date.now())return response(cached.data);
 const credits=tracks.map(t=>({id:t.id,canonical:t.canonicalId||t.id,artists:[...new Set(artistCredits(t).map(canonical))]}));
 const month=Math.floor(Date.now()/86400000)-29;
 const [plays,artists,likes,reactions]=await Promise.all([
  db.prepare(`WITH ids AS (SELECT json_extract(value,'$.id') id,json_extract(value,'$.canonical') ref FROM json_each(?))
   SELECT ids.ref track,COUNT(*) plays,COUNT(DISTINCT CASE WHEN l.day>=? THEN l.uid END) listeners
   FROM chart_listens l JOIN ids ON l.track=ids.id GROUP BY ids.ref`).bind(JSON.stringify(credits),month).all(),
  db.prepare(`WITH credits AS (
   SELECT json_extract(t.value,'$.id') track,a.value artist
   FROM json_each(?) t JOIN json_each(t.value,'$.artists') a
  ) SELECT c.artist,COUNT(*) plays,COUNT(DISTINCT CASE WHEN l.day>=? THEN l.uid END) listeners
   FROM chart_listens l JOIN credits c ON c.track=l.track GROUP BY c.artist`).bind(JSON.stringify(credits),month).all(),
  db.prepare(`WITH ids AS (SELECT json_extract(value,'$.id') id,json_extract(value,'$.canonical') ref FROM json_each(?))
   SELECT ids.ref track,COUNT(DISTINCT uid) likes FROM likes JOIN ids ON likes.track=ids.id GROUP BY ids.ref`).bind(JSON.stringify(credits)).all(),
  db.prepare('SELECT kind,ref,COUNT(*) likes FROM collection_reactions GROUP BY kind,ref').all()
 ]);
 const trackStats={},artistStats={},collections={},ids=new Map(credits.map(t=>[t.id,t.canonical]));
 for(const r of plays.results||[]){const key=ids.get(r.track);if(key){const s=trackStats[key]??={plays:0,listeners:0,likes:0};s.plays+=r.plays;s.listeners+=r.listeners;}}
 for(const r of likes.results||[]){const key=ids.get(r.track);if(key)(trackStats[key]??={plays:0,listeners:0,likes:0}).likes+=r.likes;}
 for(const r of artists.results||[])artistStats[r.artist]={plays:r.plays,listeners:r.listeners};
 for(const r of reactions.results||[])collections[r.kind+':'+r.ref]=r.likes;
 const data={tracks:trackStats,artists:artistStats,collections,listenerDays:30,playDefinition:'qualified_listener_track_day'};
 cached={db,data,until:Date.now()+45000};return response(data);
}
export async function collectionReaction(req,db,user,tracks){
 if(!user)return response({error:'login_required'},401);
 if(req.method==='GET'){
  const {results}=await db.prepare('SELECT kind,ref FROM collection_reactions WHERE uid=?').bind(user.id).all();
  return response({liked:results.map(r=>r.kind+':'+r.ref)});
 }
 if(!['PUT','DELETE'].includes(req.method))return response({error:'method'},405);
 let body;try{const raw=await req.text();if(raw.length>1500)return response({error:'size'},413);body=JSON.parse(raw);}catch{return response({error:'body'},400);}
 const {kind,ref}=body||{};if(!kinds.has(kind)||typeof ref!=='string'||!ref||ref.length>240)return response({error:'invalid_collection'},400);
 let exists=false;
 if(kind.startsWith('artist-'))exists=tracks.some(t=>artistCredits(t).some(name=>canonical(name)===ref));
 if(kind==='album')exists=tracks.some(t=>albumRef(t)===ref);
 if(kind==='playlist')exists=!!await db.prepare('SELECT p.id FROM playlists p LEFT JOIN playlist_members m ON m.playlist=p.id AND m.uid=? WHERE p.id=? AND (p.uid=? OR m.uid=?)').bind(user.id,ref,user.id,user.id).first();
 if(kind==='editorial')exists=!!await db.prepare('SELECT id FROM editorial_playlists WHERE id=? AND is_published=1').bind(ref).first();
 if(!exists)return response({error:'not_found'},404);
 if(req.method==='PUT')await db.prepare('INSERT OR IGNORE INTO collection_reactions(uid,kind,ref) VALUES(?,?,?)').bind(user.id,kind,ref).run();
 else await db.prepare('DELETE FROM collection_reactions WHERE uid=? AND kind=? AND ref=?').bind(user.id,kind,ref).run();
 const count=await db.prepare('SELECT COUNT(*) likes FROM collection_reactions WHERE kind=? AND ref=?').bind(kind,ref).first();
 clearCommunityCache();return response({kind,ref,likes:count.likes,liked:req.method==='PUT'});
}
