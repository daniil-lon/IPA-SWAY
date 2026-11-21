import {yandexPortraitURL} from './yandex-avatar.mjs';

export const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const handlePattern=/^[a-z0-9_]{3,24}$/;
const fields='u.name,p.handle,p.bio,p.visible,p.profile_track,p.joined_at,p.cover_zoom,p.avatar IS NOT NULL AS has_avatar,p.cover IS NOT NULL AS has_cover';
const ownFields=fields+',p.yandex_avatar_id IS NOT NULL AS has_yandex_avatar';
const output=(row,own=false)=>({
 name:row.name,handle:row.handle||'',bio:row.bio||'',visible:!!row.visible,profileTrack:row.profile_track||'',
 joinedAt:row.joined_at||null,coverZoom:row.cover_zoom||100,hasAvatar:!!row.has_avatar,hasCover:!!row.has_cover,
 ...(own?{hasYandexAvatar:!!row.has_yandex_avatar}:{})
});

export async function readJSON(req,limit=4096){
 if(!req.body||Number(req.headers.get('Content-Length'))>limit)return null;
 const reader=req.body.getReader(), decoder=new TextDecoder();
 let raw='',length=0;
 try{
  for(;;){
   const {value,done}=await reader.read();if(done)break;
   length+=value.byteLength;if(length>limit){await reader.cancel();return null;}
   raw+=decoder.decode(value,{stream:true});
  }
  const x=JSON.parse(raw+decoder.decode());
  return x&&typeof x==='object'&&!Array.isArray(x)?x:null;
 }catch{return null;}
 finally{reader.releaseLock();}
}

const imageBytes=(b64)=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
function decodeUpload(value,type){
 if(value===undefined)return {replace:0,data:null};
 if(value===null)return {replace:1,data:null};
 if(typeof value!=='string'||value.length>(type==='avatar'?240000:480000)||!/^data:image\/jpeg;base64,[a-z0-9+/]+={0,2}$/i.test(value))return null;
 const data=value.slice('data:image/jpeg;base64,'.length);
 try{
  const bytes=imageBytes(data), end=bytes.length;
  return end>48&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff&&bytes[end-2]===0xff&&bytes[end-1]===0xd9?{replace:1,data}:null;
 }catch{return null;}
}

export async function profileRoute(req,path,db,user,trackIds){
 if(path==='/api/profile'){
  if(req.method==='GET'){
   const row=await db.prepare('SELECT '+ownFields+' FROM users u LEFT JOIN user_profiles p ON p.uid=u.id WHERE u.id=?').bind(user.id).first();
   return json(output(row,true));
  }
  if(req.method!=='PATCH')return json({error:'method'},405);
  const b=await readJSON(req,745000);
  const name=typeof b?.name==='string'?b.name.trim():'', handle=typeof b?.handle==='string'?b.handle.trim().toLowerCase():null;
  const bio=typeof b?.bio==='string'?b.bio.replace(/\r\n/g,'\n').trim():null, zoom=b?.coverZoom;
  if(!name||name.length>80||handle===null||(handle&&!handlePattern.test(handle))||bio===null||bio.length>260||
     typeof b.visible!=='boolean'||(b.visible&&!handle)||typeof b.profileTrack!=='string'||(b.profileTrack&&!trackIds.has(b.profileTrack))||
     !Number.isInteger(zoom)||zoom<100||zoom>180)return json({error:'invalid_profile'},400);
  const avatar=decodeUpload(b.avatar,'avatar'),cover=decodeUpload(b.cover,'cover');
  if(!avatar||!cover)return json({error:'invalid_image'},400);
  try{
   await db.batch([
    db.prepare('UPDATE users SET name=? WHERE id=?').bind(name,user.id),
    db.prepare('INSERT INTO user_profiles(uid,handle,bio,visible,profile_track,cover_zoom,avatar,cover) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(uid) DO UPDATE SET handle=excluded.handle,bio=excluded.bio,visible=excluded.visible,profile_track=excluded.profile_track,cover_zoom=excluded.cover_zoom,avatar=CASE WHEN ? THEN excluded.avatar ELSE user_profiles.avatar END,cover=CASE WHEN ? THEN excluded.cover ELSE user_profiles.cover END')
     .bind(user.id,handle||null,bio,+b.visible,b.profileTrack||null,zoom,avatar.data,cover.data,avatar.replace,cover.replace)
   ]);
  }catch(error){
   if(handle&&/UNIQUE.*user_profiles\.handle/i.test(String(error?.message)))return json({error:'handle_taken'},409);
   throw error;
  }
  const row=await db.prepare('SELECT '+ownFields+' FROM users u JOIN user_profiles p ON p.uid=u.id WHERE u.id=?').bind(user.id).first();
  return json(output(row,true));
 }
 if(path==='/api/profile/yandex-avatar'){
  if(req.method!=='GET')return json({error:'method'},405);
  const row=await db.prepare('SELECT yandex_avatar_id FROM user_profiles WHERE uid=?').bind(user.id).first();
  const location=yandexPortraitURL(row?.yandex_avatar_id);
  return location?new Response(null,{status:302,headers:{Location:location,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}}):json({error:'not_found'},404);
 }
 const own=/^\/api\/profile\/(avatar|cover)$/.exec(path);
 const other=/^\/api\/profiles\/([a-z0-9_]{3,24})(?:\/(avatar|cover))?$/.exec(path);
 if(!own&&!other)return null;
 if(req.method!=='GET')return json({error:'method'},405);
 const kind=own?.[1]||other?.[2];
 if(kind){
  // "kind" comes from the literal two-value route pattern above.
  const row=own?await db.prepare('SELECT '+kind+' AS image FROM user_profiles WHERE uid=?').bind(user.id).first():
   await db.prepare('SELECT '+kind+' AS image FROM user_profiles WHERE handle=? AND visible=1').bind(other[1]).first();
  if(!row?.image)return json({error:'not_found'},404);
  return new Response(imageBytes(row.image),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 const row=await db.prepare('SELECT '+fields+' FROM users u JOIN user_profiles p ON p.uid=u.id WHERE p.handle=? AND p.visible=1').bind(other[1]).first();
 return row?json(output(row)):json({error:'not_found'},404);
}
