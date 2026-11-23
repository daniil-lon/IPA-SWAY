import {json,readJSON} from './profile-store.mjs';
const validName=value=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=80&&!/[\x00-\x1f]/.test(value);
export async function folderRoute(req,path,db,user){
 if(!user)return json({error:'login_required'},401);
 const uid=user.id,method=req.method;
 if(path==='/api/playlist-folders'){
  if(method==='GET'){
   const [folders,items]=await Promise.all([db.prepare('SELECT id,name,created FROM playlist_folders WHERE uid=? ORDER BY created,id').bind(uid).all(),db.prepare('SELECT playlist,folder FROM playlist_folder_items WHERE uid=?').bind(uid).all()]);
   return json({folders:folders.results||[],items:items.results||[]});
  }
  if(method!=='POST')return json({error:'method'},405);
  const body=await readJSON(req);if(!validName(body?.name))return json({error:'name'},400);
  const count=await db.prepare('SELECT COUNT(*) AS n FROM playlist_folders WHERE uid=?').bind(uid).first();if(count.n>=50)return json({error:'limit'},409);
  const id=crypto.randomUUID(),name=body.name.trim();await db.prepare('INSERT INTO playlist_folders(id,uid,name) VALUES(?,?,?)').bind(id,uid,name).run();return json({id,name},201);
 }
 const match=/^\/api\/playlist-folders\/([0-9a-f-]{36})(?:\/playlists\/([0-9a-f-]{36}))?$/.exec(path);
 if(!match)return json({error:'not_found'},404);
 const [,id,playlist]=match,folder=await db.prepare('SELECT id FROM playlist_folders WHERE id=? AND uid=?').bind(id,uid).first();
 if(!folder)return json({error:'not_found'},404);
 if(playlist){
  const access=await db.prepare('SELECT id FROM playlists WHERE id=? AND (uid=? OR EXISTS(SELECT 1 FROM playlist_members WHERE playlist=? AND uid=?))').bind(playlist,uid,playlist,uid).first();
  if(!access)return json({error:'not_found'},404);
  if(method==='PUT')await db.prepare('INSERT INTO playlist_folder_items(uid,playlist,folder) VALUES(?,?,?) ON CONFLICT(uid,playlist) DO UPDATE SET folder=excluded.folder').bind(uid,playlist,id).run();
  else if(method==='DELETE')await db.prepare('DELETE FROM playlist_folder_items WHERE uid=? AND playlist=? AND folder=?').bind(uid,playlist,id).run();
  else return json({error:'method'},405);return json({ok:true});
 }
 if(method==='DELETE'){await db.prepare('DELETE FROM playlist_folders WHERE id=? AND uid=?').bind(id,uid).run();return json({ok:true});}
 if(method==='PATCH'){
  const body=await readJSON(req);if(!validName(body?.name))return json({error:'name'},400);
  await db.prepare('UPDATE playlist_folders SET name=? WHERE id=? AND uid=?').bind(body.name.trim(),id,uid).run();return json({ok:true});
 }
 return json({error:'method'},405);
}
