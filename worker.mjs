import {activityRoute} from './activity-store.mjs';
import {applyCatalogOverrides,auditCatalog,saveCatalogOverride} from './catalog-store.mjs';
import {safeEqual,verifyAdminSession} from './admin-store.mjs';
import {media} from './media.mjs';
import chartItems from './public/chart.json';
import {json,profileRoute,readJSON} from './profile-store.mjs';
import {
  adminRoute,
  getCustomTracks,
  serveCustomMedia,
  handlePublicPromo,
  handlePublicEditorialPlaylists,
  handlePublicActiveBroadcasts,
  handleTelegramWebhook
} from './admin-store.mjs';
import {yandexPortraitId} from './yandex-avatar.mjs';
import {normalizeWaveMark} from './public/wave-mark.js';
import {readChart,recordChartListen} from './chart-store.mjs';
import {communitySignals,collectionReaction,clearCommunityCache} from './community-store.mjs';
import {readTaste,writeTaste} from './taste-store.mjs';
import {playlistRoute} from './playlist-store.mjs';
import {importPlaylist} from './playlist-import.mjs';
// The catalog is a 5 MB static asset. Loading it through the assets binding keeps
// it out of the Worker bundle and lets every isolate parse it at most once.
let catalogCache = null, catalogIndexCache = null, catalogViewCache = null;
let maintenanceCache = { at: 0, value: false };
const MAINTENANCE_HTML = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sway — обслуживание</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#100e17;color:#f3f0f7;font:16px/1.6 system-ui,sans-serif;text-align:center;padding:24px"><div><h1 style="font-size:28px;margin:0 0 12px">Sway обновляется</h1><p style="color:#9c95ab;margin:0">Мы вернёмся через несколько минут. Спасибо за терпение.</p></div></body></html>';
async function maintenanceMode(env) {
 if (!env.DB) return false;
 if (Date.now() - maintenanceCache.at < 15000) return maintenanceCache.value;
 try {
  const row = await env.DB.prepare("SELECT value FROM feature_flags WHERE key='maintenance'").first();
  maintenanceCache = { at: Date.now(), value: row?.value === '1' };
 } catch {
  maintenanceCache = { at: Date.now(), value: false };
 }
 return maintenanceCache.value;
}
async function catalogView(env,req){
 if(!catalogViewCache||Date.now()-catalogViewCache.at>10000){
  const pending=(async()=>{
   const tracks=await catalogTracks(env,req),custom=await getCustomTracks(env);
   const merged=await applyCatalogOverrides(env.DB,custom.length?[...tracks,...custom]:tracks);
   const list=merged.filter(track=>!track.hidden),encoder=new TextEncoder();
   const sizes=list.map(t=>encoder.encode(JSON.stringify(t)).length),offsets=[];let offset=0;
   while(offset<list.length){offsets.push(offset);let bytes=0,end=offset;while(end<list.length&&end<offset+24){if(end>offset&&bytes+sizes[end]>10000)break;bytes+=sizes[end++];}offset=end;}
   const digest=await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(list)));
   return {list,sizes,offsets,version:Array.from(new Uint8Array(digest).slice(0,12),v=>v.toString(16).padStart(2,'0')).join('')};
  })();const entry={at:Date.now(),pending};catalogViewCache=entry;pending.catch(()=>{if(catalogViewCache===entry)catalogViewCache=null;});
 }
 return catalogViewCache.pending;
}
async function catalogTracks(env, req) {
 if (!catalogCache) {
  catalogCache = env.ASSETS.fetch(new Request(new URL('/catalog.json', req.url))).then(response => {
   if (!response.ok) throw new Error('catalog_asset_' + response.status);
   return response.json();
  });
 }
 try {
  return await catalogCache;
 } catch (error) {
  catalogCache = null;
  throw error;
 }
}
async function catalogIndex(env, req) {
 if (!catalogIndexCache) {
  catalogIndexCache = (async () => {
   const list = await catalogTracks(env, req), sizes = new Map(), ids = new Set();
   for (const t of list) {
    sizes.set(t.audio, t.bytes);
    try { sizes.set(encodeURI(t.audio), t.bytes); } catch {}
    try { sizes.set(decodeURI(t.audio), t.bytes); } catch {}
    ids.add(t.id);
   }
   return { sizes, ids };
  })().catch(error => { catalogIndexCache = null; throw error; });
 }
 return catalogIndexCache;
}
async function getTrackIds(env, req) {
 const { ids } = await catalogIndex(env, req);
 const custom = await getCustomTracks(env);
 const set = new Set(ids);
 for (const c of custom) set.add(c.id);
 return set;
}
const ttl = 30 * 86400, txName = 'tonika_oauth', sidName = 'tonika_session';
const now = () => Math.floor(Date.now()/1000);
const random = () => base64(crypto.getRandomValues(new Uint8Array(32)));
const base64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const hash = async v => base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))));
const cookieValue = (req, name) => req.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
const cookie = (url, name, value, age) => name+'='+value+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(url.protocol==='https:'?'; Secure':'');
const ready = env => Boolean(env.DB && env.YANDEX_CLIENT_ID && env.YANDEX_CLIENT_SECRET);
const loginRequired=env=>env.REQUIRE_YANDEX_LOGIN==='1';
const patterns=new Set(['ribbons','tide','halos','prism','petals']);
const redirect = (location, ...cookies) => {
 const headers = new Headers({Location:location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
 for(const c of cookies) headers.append('Set-Cookie',c);
 return new Response(null,{status:303,headers});
};
async function identity(req,env){
 const token = cookieValue(req,sidName);
 if(!env.DB || !/^[A-Za-z0-9_-]{43}$/.test(token||'')) return null;
 const key=await hash(token);
 return env.DB.prepare('SELECT u.id,u.name,u.volume,u.autoplay,u.motion,u.crossfade,u.wave_pattern,u.wave_mark FROM sessions s INNER JOIN users u ON u.id=s.uid WHERE s.hash=? AND s.expiry>?').bind(key,now()).first();
}
function yandexFailure(error,fallback){
 if(error==='unauthorized_client'||error==='invalid_client'||error==='invalid_scope')return 'provider_config';
 if(error==='invalid_grant'||error==='bad_verification_code')return 'code_rejected';
 if(error==='access_denied')return 'canceled';
 return fallback;
}
async function auth(req, url, env){
 const origin=env.PUBLIC_ORIGIN || url.origin;
 const callback=origin+'/auth/yandex/callback', clear=cookie(url,txName,'',0);
 const fail = (code,stage,status) => {
  const response=redirect('/?login='+code+'#settings',clear);
  if(stage)response.headers.set('Server-Timing','oauth_'+stage+(status?';desc="'+status+'"':''));
  return response;
 };
 if(!ready(env)) return fail('unavailable');
 if(origin!==url.origin) return fail('unavailable');
 if(req.method!=='GET') return json({error:'method'},405);
 if(url.pathname==='/auth/yandex'){
  const verifier=random(), state=random(), target=new URL('https://oauth.yandex.ru/authorize');
  target.search=new URLSearchParams({client_id:env.YANDEX_CLIENT_ID,response_type:'code',redirect_uri:callback,scope:'login:info',optional_scope:'login:avatar',state,code_challenge:await hash(verifier),code_challenge_method:'S256',force_confirm:'yes'});
  return redirect(target.toString(),cookie(url,txName,state+'.'+verifier,600));
 }
 if(url.pathname!=='/auth/yandex/callback') return json({error:'not_found'},404);
 const [state,verifier] = (cookieValue(req,txName)||'').split('.');
 const code=url.searchParams.get('code');
 if(!state || state!==url.searchParams.get('state') || !verifier) return fail('canceled');
 const denied=url.searchParams.get('error');
 if(denied)return fail(yandexFailure(denied,'provider'));
 if(!code || code.length>512)return fail('canceled');
 let stage='token';
 try{
  const form=new URLSearchParams({grant_type:'authorization_code',code,client_id:env.YANDEX_CLIENT_ID,client_secret:env.YANDEX_CLIENT_SECRET,code_verifier:verifier});
  // Workers supports manual redirects; the non-2xx checks below reject redirects without forwarding credentials.
  const response=await fetch('https://oauth.yandex.ru/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},redirect:'manual',signal:AbortSignal.timeout(8000),body:form.toString()});
  if(!response.ok){
   const error=(await response.json().catch(()=>null))?.error;
   const outcome=yandexFailure(error,'provider');
   console.warn('Sway OAuth',stage,response.status,outcome);
   return fail(outcome,'token',response.status);
  }
  const {access_token}=await response.json();
  if(typeof access_token!=='string' || !access_token) return fail('provider');
  stage='profile';
  const info=await fetch('https://login.yandex.ru/info?format=json',{redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Authorization:'OAuth '+access_token}});
  if(!info.ok){
   console.warn('Sway OAuth',stage,info.status);
   return fail('profile_unavailable','profile',info.status);
  }
  const p=await info.json();
  if(typeof p.id!=='string' || !p.id || p.id.length>128) return fail('profile_unavailable');
  stage='session';
  const name=(typeof p.display_name==='string' && p.display_name.trim().slice(0,80)) || 'Слушатель';
  const token=random(), key=await hash(token);
  const old=cookieValue(req,sidName);
  const db=env.DB, statements=[db.prepare('INSERT INTO users(id,name) VALUES(?,?) ON CONFLICT(id) DO NOTHING').bind(p.id,name),db.prepare('INSERT INTO user_profiles(uid,yandex_avatar_id) VALUES(?,?) ON CONFLICT(uid) DO UPDATE SET yandex_avatar_id=excluded.yandex_avatar_id').bind(p.id,yandexPortraitId(p)),db.prepare('DELETE FROM sessions WHERE expiry<?').bind(now())];
  if(old && old.length===43) statements.push(db.prepare('DELETE FROM sessions WHERE hash=?').bind(await hash(old)));
  statements.push(db.prepare('INSERT INTO sessions(hash,uid,expiry) VALUES(?,?,?)').bind(key,p.id,now()+ttl));
  await db.batch(statements);
  return redirect('/#home',clear,cookie(url,sidName,token,ttl));
 }catch{
  console.error('Sway OAuth',stage,'failed');
  return fail(stage==='session'?'session_failed':stage==='profile'?'profile_unavailable':'provider',stage);
 }
}
export default {async fetch(req,env,ctx){
 const url=new URL(req.url), path=url.pathname, method=req.method;
 try{
  if(path!=='/api/health'&&!path.startsWith('/api/admin/')&&await maintenanceMode(env)){
   if(path.startsWith('/api/'))return json({error:'maintenance'},503);
   return new Response(MAINTENANCE_HTML,{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Retry-After':'300'}});
  }
  if(path==='/api/catalog'||path==='/catalog.json'){
   const required=loginRequired(env);
   if(required&&!await identity(req,env))return json({error:'login_required'},401);
   const view=await catalogView(env,req),{list,sizes,offsets,version}=view;
   if(path==='/api/catalog'){
    const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>list.length)return json({error:'offset'},400);
    if(url.searchParams.has('v')&&url.searchParams.get('v')!==version)return json({error:'catalog_changed'},409);
    const items=[];let bytes=0;for(let i=offset;i<Math.min(list.length,offset+24);i++){if(items.length&&bytes+sizes[i]>10000)break;items.push(list[i]);bytes+=sizes[i];}
    const result={items,total:list.length,next:offset+items.length<list.length?offset+items.length:null,version};
    if(offset===0&&url.searchParams.get('plan')==='1'){
     const pages=offsets.slice(1);if(new TextEncoder().encode(JSON.stringify({...result,pages})).length<13000)result.pages=pages;
    }
    return json(result);
   }
   const headers=new Headers({'Content-Type':'application/json; charset=utf-8'});
   headers.set('Cache-Control',required?'private, no-store':'public, max-age=60');
   return new Response(JSON.stringify(list),{headers});
  }
  if(path.startsWith('/media/')){
   const required=loginRequired(env);
   if(required&&!await identity(req,env))return json({error:'login_required'},401);
   const {sizes}=await catalogIndex(env,req);
   const response=await media(req,env,sizes.get(decodeURIComponent(path))||sizes.get(path));
   if(!required)return response;
   const signed=new Response(response.body,response);
   signed.headers.set('Cache-Control','private, no-store');
   return signed;
  }
  if(path.startsWith('/api/custom-media/')){
   const required=loginRequired(env);
   if(required&&!await identity(req,env))return json({error:'login_required'},401);
   return await serveCustomMedia(req,path,env,{private:required});
  }
  if(path==='/api/admin/catalog'){
   if(!await verifyAdminSession(req,env))return json({error:'unauthorized'},401);
   if(method!=='GET'&&req.headers.get('Origin')!==url.origin)return json({error:'origin'},403);
   const list=await applyCatalogOverrides(env.DB,[...await catalogTracks(env,req),...await getCustomTracks(env)]);
   if(method==='PATCH'){const response=await saveCatalogOverride(req,env.DB,list);if(response.ok)catalogViewCache=null;return response;}
   if(method==='GET'){const a=auditCatalog(list),offset=Math.max(0,Number(url.searchParams.get('offset'))||0);return json({...a,duplicateCount:a.duplicates.length,duplicates:a.duplicates.slice(offset,offset+12),missing:a.missing.slice(0,12),next:offset+12<a.duplicates.length?offset+12:null});}
   return json({error:'method'},405);
  }
  if(path.startsWith('/api/admin/')){
   const loadTracks=async()=>applyCatalogOverrides(env.DB,[...await catalogTracks(env,req),...await getCustomTracks(env)]);
   const response=await adminRoute(req,path,method,url,env,(await catalogTracks(env,req)).length,{ctx,loadTracks});if(method!=='GET'&&response.ok)catalogViewCache=null;return response;
  }
  if(path === '/api/telegram/webhook'){
   const secret=env.TELEGRAM_WEBHOOK_SECRET;
   if(!secret||!safeEqual(req.headers.get('X-Telegram-Bot-Api-Secret-Token')||'',secret))return json({ok:true},401);
   return await handleTelegramWebhook(req, env, (await catalogTracks(env,req)).length);
  }
  if(path === '/api/promo' && method === 'GET'){
   return await handlePublicPromo(env);
  }
  if(path === '/api/editorial-playlists' && method === 'GET'){
   return await handlePublicEditorialPlaylists(env);
  }
  if(path === '/api/broadcasts/active' && method === 'GET'){
   return await handlePublicActiveBroadcasts(env);
  }
  if(path.startsWith('/lyrics/')){
   const match=path.match(/^\/lyrics\/(.+?)\.json$/);
   if(match && env.DB){
    const id=decodeURIComponent(match[1]);
    const row=await env.DB.prepare('SELECT lines, plain, synced, title, artist FROM track_lyrics WHERE id = ?').bind(id).first();
    if(row){
     const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=86400'});
     return new Response(JSON.stringify({
      trackName:row.title,
      artistName:row.artist,
      synced:Boolean(row.synced),
      plain:row.plain||'',
      lines:row.lines?JSON.parse(row.lines):[]
     }),{headers});
    }
   }
   return env.ASSETS.fetch(req);
  }
  if(!path.startsWith('/api/')&&!path.startsWith('/auth/')) return env.ASSETS.fetch(req);
  if(path.startsWith('/auth/')) return await auth(req,url,env);
  if(path==='/api/health' && (method==='GET' || method==='HEAD')){
   const custom=await getCustomTracks(env);
   return json({ok:true,tracks:(await catalogTracks(env,req)).length+custom.length,loginConfigured:ready(env),loginRequired:loginRequired(env)});
  }
  if(method!=='GET' && (req.headers.get('Origin')!==url.origin || !req.headers.get('Content-Type')?.startsWith('application/json'))) return json({error:'origin'},403);
  if(path==='/api/chart' && method==='GET'){
   return json({items:chartItems});
  }
  if(path==='/api/catalog-signals'&&method==='GET'){
   if(loginRequired(env)&&!await identity(req,env))return json({error:'login_required'},401);
   return communitySignals(env.DB,await applyCatalogOverrides(env.DB,[...await catalogTracks(env,req),...await getCustomTracks(env)]));
  }
  if(path==='/api/artwork'&&(method==='GET'||method==='HEAD')){
   const id=url.searchParams.get('id');
   const list=await applyCatalogOverrides(env.DB,[...await catalogTracks(env,req),...await getCustomTracks(env)]);
   const track=list.find(t=>t.id===id);
   if(!track)return json({error:'unknown_track'},404);
   let art=track.art;
   const svg=/^\/art\/([a-z0-9_-]+)\.svg$/i.exec(art||'');if(svg)art=svg[1]==='logo'?'/art/icon-512.png':'/art/system/'+svg[1]+'.png';
   if(typeof art!=='string'||!art.startsWith('/art/')||art.includes('..'))return json({error:'no_artwork'},404);
   const image=await env.ASSETS.fetch(new Request(new URL(art,url.origin),{method}));
   if(!image.ok||!image.headers.get('Content-Type')?.startsWith('image/'))return json({error:'no_artwork'},404);
   const headers=new Headers(image.headers);headers.set('Cache-Control','public, max-age=3600');headers.set('X-Content-Type-Options','nosniff');
   return new Response(image.body,{status:200,headers});
  }
  if(path==='/api/search-lyrics' && method==='GET'){
   if(loginRequired(env)&&!await identity(req,env))return json({error:'login_required'},401);
   const q=url.searchParams.get('q')?.trim()||'';
   if(q.length<3 || !env.DB) return json({results:[]});
   const clean=q.slice(0,60);if(!/[\p{L}\p{N}]/u.test(clean))return json({results:[]});
   try{
    const rows=await env.DB.prepare("SELECT t.id,t.title,t.artist,snippet(lyrics_search,0,'','','…',18) AS excerpt FROM lyrics_search JOIN track_lyrics t ON t.rowid=lyrics_search.rowid WHERE lyrics_search MATCH ? ORDER BY rank LIMIT 15").bind('"'+clean.replaceAll('"','""')+'"').all();
    const results=(rows.results||[]).map(r=>{
     const snippet=r.excerpt.trim().replace(/\r?\n+/g,' ');
     return {id:r.id,title:r.title,artist:r.artist,snippet};
    });
    if(ctx?.waitUntil)ctx.waitUntil(env.DB.prepare('INSERT INTO search_log(query,results) VALUES(?,?)').bind(clean,results.length).run().catch(()=>{}));
    return json({results});
   }catch{
    return json({results:[]});
   }
  }
  if(path==='/api/video-shot' && method==='GET'){
   const artist=url.searchParams.get('artist')?.trim()||'';
   const title=url.searchParams.get('title')?.trim()||'';
   if(!artist && !title) return json({shotUrl:null});
   const q=(artist+' '+title).trim().slice(0,80);
   const yUrl='https://api.music.yandex.net/search?page=0&text='+encodeURIComponent(q)+'&type=track';
   try{
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),3500);
    const resp=await fetch(yUrl,{headers:{'User-Agent':'YandexMusic/2026'},signal:ctrl.signal});
    clearTimeout(timer);
    if(resp.ok){
     const data=await resp.json();
     const tr=data.result?.tracks?.results?.[0];
     if(tr && tr.backgroundVideoUri){
      return new Response(JSON.stringify({shotUrl:tr.backgroundVideoUri,videoId:tr.backgroundVideoId||''}),{
       headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=86400'}
      });
     }
     return json({shotUrl:null, reason:'no_video', foundTitle:tr?.title||null});
    }
    return json({shotUrl:null, status:resp.status, reason:'not_ok'});
   }catch(e){
    console.warn('video-shot failed', e?.name || 'error');
    return json({shotUrl:null, reason:'unavailable'});
   }
  }
  if(path==='/api/import/resolve' && method==='POST')return await importPlaylist(req);
  const user=await identity(req,env);
  if(path==='/api/collection-reactions')return collectionReaction(req,env.DB,user,await applyCatalogOverrides(env.DB,[...await catalogTracks(env,req),...await getCustomTracks(env)]));
  if(path==='/api/me' && method==='GET'){
   if(!user) return json({user:null,loginConfigured:ready(env),loginRequired:loginRequired(env)});
   const allIds=await getTrackIds(env,req);
   const {results}=await env.DB.prepare('SELECT track FROM likes WHERE uid=? ORDER BY added DESC').bind(user.id).all();
   return json({user:{id:user.id,name:user.name,volume:user.volume,autoplay:Boolean(user.autoplay),motion:Boolean(user.motion),crossfade:Boolean(user.crossfade),wavePattern:user.wave_pattern,waveMark:user.wave_mark},taste:await readTaste(env.DB,user.id),likes:results.map(r=>r.track).filter(t=>allIds.has(t)),loginConfigured:ready(env),loginRequired:loginRequired(env)});
  }
  if(!user) return json({error:'login_required'},401);
  const db=env.DB;
  if(path==='/api/taste'){
   if(method==='GET')return json(await readTaste(db,user.id));
   if(method==='PUT')return writeTaste(req,db,user.id);
   return json({error:'method'},405);
  }
  const allIds=await getTrackIds(env,req);
  if(['/api/playback','/api/listening','/api/history','/api/stats'].includes(path))return activityRoute(req,path,db,user,[...await catalogTracks(env,req),...await getCustomTracks(env)]);
  if(path==='/api/playlists'||path.startsWith('/api/playlists/')||path.startsWith('/api/playlist-invites/'))return await playlistRoute(req,path,db,user,allIds);
  if(path==='/api/chart/listen' && method==='POST'){
   const body=await readJSON(req);
   if(typeof body?.track!=='string'||!allIds.has(body.track))return json({error:'unknown_track'},400);
   await recordChartListen(db,user.id,body.track);
   clearCommunityCache();
   return json({ok:true});
  }
  if(path.startsWith('/api/profile')){
   const profile=await profileRoute(req,path,db,user,allIds);if(profile)return profile;
  }
  if(path==='/api/logout' && method==='POST'){
   await db.prepare('DELETE FROM sessions WHERE hash=?').bind(await hash(cookieValue(req,sidName))).run();
   return new Response(null,{status:204,headers:{'Set-Cookie':cookie(url,sidName,'',0),'Cache-Control':'no-store'}});
  }
  if(path==='/api/me' && method==='DELETE'){
   await db.batch([db.prepare('DELETE FROM likes WHERE uid=?').bind(user.id),db.prepare('DELETE FROM sessions WHERE uid=?').bind(user.id),db.prepare('DELETE FROM users WHERE id=?').bind(user.id)]);
   clearCommunityCache();
   return new Response(null,{status:204,headers:{'Set-Cookie':cookie(url,sidName,'',0),'Cache-Control':'no-store'}});
  }
  if(path==='/api/me' && method==='PATCH'){
   const b=await readJSON(req), name=typeof b?.name==='string'?b.name.trim():null, pattern=b?.wavePattern??user.wave_pattern;
   const mark=b?.waveMark===undefined?user.wave_mark:b.waveMark;
   const crossfade=b?.crossfade===undefined?Boolean(user.crossfade):b.crossfade;
   if((name!==null&&(!name||name.length>80))||typeof b?.volume!=='number'||!Number.isFinite(b.volume)||b.volume<0||b.volume>1||typeof b.autoplay!=='boolean'||typeof b.motion!=='boolean'||typeof crossfade!=='boolean'||!patterns.has(pattern)||typeof mark!=='string'||normalizeWaveMark(mark)!==mark)return json({error:'invalid_preferences'},400);
   await db.prepare('UPDATE users SET name=COALESCE(?,name),volume=?,autoplay=?,motion=?,crossfade=?,wave_pattern=?,wave_mark=? WHERE id=?').bind(name,b.volume,+b.autoplay,+b.motion,+crossfade,pattern,mark,user.id).run();
   return json({ok:true});
  }
  const id=decodeURIComponent(path.slice('/api/likes/'.length));
  if(path.startsWith('/api/likes/') && allIds.has(id)){
   if(method==='PUT') await db.prepare('INSERT OR IGNORE INTO likes(uid,track) VALUES(?,?)').bind(user.id,id).run();
   else if(method==='DELETE') await db.prepare('DELETE FROM likes WHERE uid=? AND track=?').bind(user.id,id).run();
   else return json({error:'method'},405);
   clearCommunityCache();
   return json({ok:true});
  }
  return json({error:'not_found'},404);
 }catch(e){console.error('Sway request failed:', e?.message || e?.name, e?.stack);return json({error:'unavailable'},503);}
}};
