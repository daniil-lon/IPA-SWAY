import {json,readJSON} from './profile-store.mjs';
const changes=r=>r.meta?.changes??r.changes??0;
export async function activityRoute(req,path,db,user,tracks){
 const ids=new Set(tracks.map(t=>t.id)),uid=user.id;
 if(path==='/api/playback'){
  if(req.method==='GET'){
   const row=await db.prepare('SELECT revision,device,snapshot,updated FROM playback_state WHERE uid=?').bind(uid).first();
   return json(row?{...row,snapshot:JSON.parse(row.snapshot)}:{revision:0,snapshot:null});
  }
  if(req.method!=='PUT')return json({error:'method'},405);
  const b=await readJSON(req,600000),s=b?.snapshot;
  if(!b||!/^[\w-]{8,80}$/.test(b.device||'')||!Number.isSafeInteger(b.revision)||b.revision<0||!s||!Array.isArray(s.queue)||s.queue.length>2000||s.queue.some(id=>!ids.has(id))||!s.queue.includes(s.current)||!ids.has(s.current)||!Number.isFinite(s.position)||s.position<0||s.position>86400)return json({error:'invalid_snapshot'},400);
  const mix=s.waveMix&&typeof s.waveMix==='object'?Object.fromEntries(['key','title','genre','seedId'].filter(k=>typeof s.waveMix[k]==='string').map(k=>[k,s.waveMix[k].slice(0,180)])):null;
  const snapshot=JSON.stringify({queue:s.queue,current:s.current,position:s.position,mode:String(s.mode||'').slice(0,80),shuffle:!!s.shuffle,repeat:['all','one'].includes(s.repeat)?s.repeat:s.repeat===true?'one':'off',original:s.shuffle&&Array.isArray(s.original)?s.original.filter(id=>ids.has(id)).slice(0,2000):null,nextUp:ids.has(s.nextUp)?s.nextUp:'',source:typeof s.source==='string'?s.source.slice(0,80):'',waveMood:String(s.waveMood||'').slice(0,40),waveMix:mix});
  const result=b.revision===0?await db.prepare('INSERT OR IGNORE INTO playback_state(uid,device,snapshot) VALUES(?,?,?)').bind(uid,b.device,snapshot).run():await db.prepare('UPDATE playback_state SET revision=revision+1,device=?,snapshot=?,updated=unixepoch() WHERE uid=? AND revision=?').bind(b.device,snapshot,uid,b.revision).run();
  if(!changes(result))return json({error:'revision_conflict'},409);
  return json({revision:b.revision+1});
 }
 if(path==='/api/listening'&&req.method==='POST'){
  const b=await readJSON(req,2000);
  if(!b||!/^[\w-]{8,120}$/.test(b.id||'')||!ids.has(b.track)||!Number.isFinite(b.seconds)||b.seconds<=0||b.seconds>90)return json({error:'invalid_listen'},400);
  const stamp=Number.isFinite(b.at)&&b.at>Date.now()-90*86400000&&b.at<Date.now()+120000?b.at:Date.now(),day=new Date(stamp).toISOString().slice(0,10);
  await db.batch([
   db.prepare('INSERT OR IGNORE INTO listening_events(uid,id,track,seconds,day,started) VALUES(?,?,?,?,?,?)').bind(uid,b.id,b.track,b.seconds,day,b.started?1:0),
   db.prepare('INSERT INTO listening_daily(uid,day,track,seconds,plays) SELECT ?,?,?,?,? WHERE changes()>0 ON CONFLICT(uid,day,track) DO UPDATE SET seconds=seconds+excluded.seconds,plays=plays+excluded.plays,updated=unixepoch()').bind(uid,day,b.track,b.seconds,b.started?1:0)
  ]);
  return json({ok:true});
 }
 if(path==='/api/history'){
  if(req.method==='DELETE'){await db.prepare('INSERT INTO history_cutoffs(uid) VALUES(?) ON CONFLICT(uid) DO UPDATE SET stamp=unixepoch()').bind(uid).run();return json({ok:true});}
  if(req.method!=='GET')return json({error:'method'},405);
  const {results}=await db.prepare('SELECT track,MAX(updated) AS last FROM listening_daily WHERE uid=? AND updated>COALESCE((SELECT stamp FROM history_cutoffs WHERE uid=?),0) GROUP BY track ORDER BY last DESC LIMIT 200').bind(uid,uid).all();return json({tracks:results.map(r=>r.track)});
 }
 if(path==='/api/stats'&&req.method==='GET'){
  const period=new URL(req.url).searchParams.get('period')||'week',days={week:7,month:30,year:365}[period]||7,from=new Date(Date.now()-(days-1)*86400000).toISOString().slice(0,10);
  const [{results:totals},{results:daily},{results:first}]=await Promise.all([
   db.prepare('SELECT track,SUM(seconds) AS seconds,SUM(plays) AS plays FROM listening_daily WHERE uid=? AND day>=? GROUP BY track ORDER BY seconds DESC').bind(uid,from).all(),
   db.prepare('SELECT day,SUM(seconds) AS seconds FROM listening_daily WHERE uid=? AND day>=? GROUP BY day ORDER BY day').bind(uid,from).all(),
   db.prepare('SELECT track,MIN(day) AS day FROM listening_daily WHERE uid=? GROUP BY track HAVING MIN(day)>=?').bind(uid,from).all()
  ]);
  const artists=new Map(),byId=new Map(tracks.map(t=>[t.id,t]));
  for(const row of totals){const t=byId.get(row.track);if(!t)continue;const names=Array.isArray(t.artists)?t.artists.map(a=>typeof a==='string'?a:a.name):t.artist.split(/,| feat\. |; /i);for(const name of names.filter(Boolean))artists.set(name,(artists.get(name)||0)+row.seconds/names.length);}
  return json({period,days,from,seconds:Math.round(totals.reduce((n,t)=>n+t.seconds,0)),plays:totals.reduce((n,t)=>n+t.plays,0),discoveries:first.length,tracks:totals.slice(0,10),artists:[...artists].map(([name,seconds])=>({name,seconds})).sort((a,b)=>b.seconds-a.seconds).slice(0,8),daily});
 }
 return json({error:'not_found'},404);
}
