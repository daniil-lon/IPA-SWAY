import {json,readJSON} from './profile-store.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const metrics=new Set(['startup','first_audio','next_audio','rebuffer']);
const platforms=new Set(['ios','android','desktop']);
const reasons=new Set(['audio','cover','lyrics','other']);
const rates=new Map();
function allowed(req){
 const key=req.headers.get('CF-Connecting-IP')||'local',minute=Math.floor(Date.now()/60000),value=rates.get(key);
 if(value?.minute===minute){if(++value.n>30)return false;}else rates.set(key,{minute,n:1});
 if(rates.size>2000)rates.delete(rates.keys().next().value);return true;
}
export function validSamples(samples){
 return Array.isArray(samples)&&samples.length>0&&samples.length<=20&&samples.every(e=>e&&metrics.has(e.metric)&&platforms.has(e.platform)&&Number.isFinite(e.ms)&&e.ms>=0&&e.ms<=300000);
}
export async function experienceRoute(req,path,db,{hasTrack=async()=>false,admin=false}={}){
 if(!db)return json({error:'unavailable'},503);
 if(path==='/api/admin/experience'){
  if(!admin)return json({error:'unauthorized'},401);if(req.method!=='GET')return json({error:'method'},405);
  const [timings,reports]=await Promise.all([
   db.prepare("SELECT metric,platform,bucket,SUM(samples) AS samples,SUM(total_ms) AS total_ms,MAX(max_ms) AS max_ms FROM performance_daily WHERE day>=date('now','-30 days') GROUP BY metric,platform,bucket").all(),
   db.prepare('SELECT id,track,reason,comment,diagnostics,created FROM track_reports WHERE resolved IS NULL ORDER BY created DESC LIMIT 100').all()
  ]);return json({timings:timings.results||[],reports:reports.results||[]});
 }
 const reportPath=/^\/api\/admin\/experience\/reports\/([0-9a-f-]+)$/.exec(path);
 if(reportPath){
  if(!admin)return json({error:'unauthorized'},401);if(req.method!=='PATCH')return json({error:'method'},405);
  if(!uuid.test(reportPath[1]))return json({error:'id'},400);
  await db.prepare('UPDATE track_reports SET resolved=unixepoch() WHERE id=?').bind(reportPath[1]).run();return json({ok:true});
 }
 if(req.method!=='POST')return json({error:'method'},405);
 if(!allowed(req))return json({error:'rate'},429);
 const body=await readJSON(req);if(!body||!uuid.test(body.id||''))return json({error:'body'},400);
 if(path==='/api/performance'){
  if(!validSamples(body.samples))return json({error:'samples'},400);
  const day=new Date().toISOString().slice(0,10),statements=body.samples.map(e=>{
   const ms=Math.round(e.ms),bucket=[500,1000,3000,10000,300000].find(n=>ms<=n);
   return db.prepare('INSERT INTO performance_daily(day,metric,platform,bucket,samples,total_ms,max_ms) SELECT ?,?,?,?,1,?,? WHERE NOT EXISTS(SELECT 1 FROM performance_batches WHERE id=?) ON CONFLICT(day,metric,platform,bucket) DO UPDATE SET samples=samples+1,total_ms=total_ms+excluded.total_ms,max_ms=MAX(max_ms,excluded.max_ms)').bind(day,e.metric,e.platform,bucket,ms,ms,body.id);
  });
  statements.push(db.prepare('INSERT OR IGNORE INTO performance_batches(id,day) VALUES(?,?)').bind(body.id,day),db.prepare("DELETE FROM performance_batches WHERE day<date('now','-7 days')"),db.prepare("DELETE FROM performance_daily WHERE day<date('now','-30 days')"));
  await db.batch(statements);return json({ok:true});
 }
 if(path==='/api/track-reports'){
  if(!reasons.has(body.reason)||typeof body.track!=='string'||!await hasTrack(body.track)||typeof body.comment!=='string'||body.comment.length>500)return json({error:'report'},400);
  const diagnostics=validSamples(body.samples)?JSON.stringify(body.samples):'[]';
  await db.prepare('INSERT OR IGNORE INTO track_reports(id,track,reason,comment,diagnostics) VALUES(?,?,?,?,?)').bind(body.id,body.track,body.reason,body.comment.trim(),diagnostics).run();
  return json({ok:true},201);
 }
 return json({error:'not_found'},404);
}
