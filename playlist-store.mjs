import {json,readJSON} from './profile-store.mjs';
const nameOf=value=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=80&&!/[\u0000-\u001f]/.test(value)?value.trim():null;
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');

export async function playlistRoute(req,path,db,user,ids){
 const method=req.method;
 const invite=path.match(/^\/api\/playlist-invites\/([a-f0-9]{64})$/);
 if(invite&&method==='POST'){
  const link=await db.prepare('SELECT i.playlist,i.role,p.uid FROM playlist_invites i JOIN playlists p ON p.id=i.playlist WHERE i.hash=? AND i.expiry>unixepoch()').bind(await digest(invite[1])).first();
  if(!link)return json({error:'invite_expired'},404);
  if(link.uid!==user.id)await db.prepare("INSERT INTO playlist_members(playlist,uid,role) VALUES(?,?,?) ON CONFLICT(playlist,uid) DO UPDATE SET role=CASE WHEN role='editor' THEN role ELSE excluded.role END").bind(link.playlist,user.id,link.role).run();
  return json({id:link.playlist});
 }
 if(path==='/api/playlists'){
  if(method==='GET'){
   const {results}=await db.prepare("SELECT p.id,p.name,p.created,p.updated,CASE WHEN p.uid=? THEN 'owner' ELSE m.role END AS role,t.track,u.name AS added_name FROM playlists p LEFT JOIN playlist_members m ON m.playlist=p.id AND m.uid=? LEFT JOIN playlist_tracks t ON t.playlist=p.id LEFT JOIN users u ON u.id=t.added_by WHERE p.uid=? OR m.uid=? ORDER BY p.updated DESC,p.id,t.position").bind(user.id,user.id,user.id,user.id).all();
   const lists=new Map();for(const row of results){if(!lists.has(row.id))lists.set(row.id,{id:row.id,name:row.name,role:row.role,created:row.created,updated:row.updated,tracks:[],addedBy:{}});if(row.track&&ids.has(row.track)){lists.get(row.id).tracks.push(row.track);lists.get(row.id).addedBy[row.track]=row.added_name||'';}}
   return json({playlists:[...lists.values()]});
  }
  if(method==='POST'){
   const body=await readJSON(req,100000),name=nameOf(body?.name),tracks=body?.tracks??[];
   if(!name||!Array.isArray(tracks)||tracks.length>1000||tracks.some(id=>typeof id!=='string'||!ids.has(id)))return json({error:'invalid_playlist'},400);
   const count=await db.prepare('SELECT COUNT(*) AS count FROM playlists WHERE uid=?').bind(user.id).first();
   if(count.count>=100)return json({error:'playlist_limit'},409);
   const id=crypto.randomUUID(),unique=[...new Set(tracks)],stamp=Math.floor(Date.now()/1000);
   // Bulk membership uses json_each so a large import stays within D1's parameter limit.
   const statements=[db.prepare('INSERT INTO playlists(id,uid,name,created,updated) VALUES(?,?,?,?,?)').bind(id,user.id,name,stamp,stamp)];
   if(unique.length)statements.push(db.prepare("INSERT INTO playlist_tracks(playlist,track,position,added_by) SELECT ?,value,CAST(key AS INTEGER),? FROM json_each(?)").bind(id,user.id,JSON.stringify(unique)));
   await db.batch(statements);
   return json({id,name,tracks:unique,role:'owner',addedBy:Object.fromEntries(unique.map(t=>[t,user.name])),created:stamp,updated:stamp},201);
  }
  return json({error:'method'},405);
 }
 const match=path.match(/^\/api\/playlists\/([a-z0-9-]{36})(?:\/(tracks|invites|members)(?:\/([^/]+))?)?$/i);if(!match)return json({error:'not_found'},404);
 const [,id,kind,encoded]=match,access=await db.prepare("SELECT CASE WHEN p.uid=? THEN 'owner' ELSE m.role END AS role FROM playlists p LEFT JOIN playlist_members m ON m.playlist=p.id AND m.uid=? WHERE p.id=? AND (p.uid=? OR m.uid=?)").bind(user.id,user.id,id,user.id,user.id).first();
 if(!access)return json({error:'not_found'},404);
 if(kind==='invites'){
  if(access.role!=='owner')return json({error:'forbidden'},403);
  if(method==='DELETE'){await db.prepare('DELETE FROM playlist_invites WHERE playlist=?').bind(id).run();return json({ok:true});}
  if(method!=='POST')return json({error:'method'},405);
  const role=(await readJSON(req,1000))?.role;if(!['viewer','editor'].includes(role))return json({error:'role'},400);
  const token=(crypto.randomUUID()+crypto.randomUUID()).replaceAll('-',''),expiry=Math.floor(Date.now()/1000)+604800;
  await db.prepare('DELETE FROM playlist_invites WHERE expiry<unixepoch()').run();
  await db.prepare('INSERT INTO playlist_invites(hash,playlist,role,expiry) VALUES(?,?,?,?)').bind(await digest(token),id,role,expiry).run();
  return json({url:new URL(req.url).origin+'/#join/'+token,role,expiry});
 }
 if(kind==='members'){
  if(method==='GET'){const {results}=await db.prepare('SELECT m.uid,m.role,u.name FROM playlist_members m JOIN users u ON u.id=m.uid WHERE m.playlist=? ORDER BY m.joined').bind(id).all();return json({members:results});}
  if(method==='DELETE'&&encoded&&(access.role==='owner'||encoded===user.id)){await db.prepare('DELETE FROM playlist_members WHERE playlist=? AND uid=?').bind(id,encoded).run();return json({ok:true});}
  return json({error:'forbidden'},403);
 }
 if(access.role==='viewer'||(!kind&&access.role!=='owner'))return json({error:'forbidden'},403);
 if(encoded){
  let track;try{track=decodeURIComponent(encoded);}catch{return json({error:'unknown_track'},400);}
  if(!ids.has(track)&&method!=='DELETE')return json({error:'unknown_track'},400);
  if(method==='PUT'){
   const count=await db.prepare('SELECT COUNT(*) AS count FROM playlist_tracks WHERE playlist=?').bind(id).first();
   if(count.count>=1000&&!await db.prepare('SELECT track FROM playlist_tracks WHERE playlist=? AND track=?').bind(id,track).first())return json({error:'playlist_full'},409);
   await db.prepare('INSERT OR IGNORE INTO playlist_tracks(playlist,track,position,added_by) SELECT ?,?,COALESCE(MAX(position),-1)+1,? FROM playlist_tracks WHERE playlist=?').bind(id,track,user.id,id).run();
  }
  else if(method==='DELETE')await db.prepare('DELETE FROM playlist_tracks WHERE playlist=? AND track=?').bind(id,track).run();
  else return json({error:'method'},405);
  await db.prepare('UPDATE playlists SET updated=unixepoch() WHERE id=?').bind(id).run();
  return json({ok:true});
 }
 if(method==='DELETE'){await db.prepare('DELETE FROM playlists WHERE id=? AND uid=?').bind(id,user.id).run();return json({ok:true});}
 if(method==='PATCH'){
  const name=nameOf((await readJSON(req,1000))?.name);if(!name)return json({error:'invalid_playlist'},400);
  await db.prepare('UPDATE playlists SET name=?,updated=unixepoch() WHERE id=? AND uid=?').bind(name,id,user.id).run();return json({ok:true});
 }
 return json({error:'method'},405);
}
