export const COMMONS_API='https://commons.wikimedia.org/w/api.php';
const YANDEX='https://music.yandex.ru';
const AUDIO_HOST='https://upload.wikimedia.org';
const plain=(value,max=280)=>String(value??'').replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/gi,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&nbsp;':' '})[m.toLowerCase()]).replace(/\s+/g,' ').trim().slice(0,max);
function urlOn(value,origin){
 try{const u=new URL(value);return u.origin===origin&&!u.username&&!u.password?u:null;}catch{return null;}
}

// Only the provider's URL is used, even if the supplied value is an HTML snippet.
export function parseYandexLink(value){
 let raw=String(value??'').trim();
 if(/^<iframe\b/i.test(raw))raw=raw.match(/\s+src\s*=\s*(["'])(.*?)\1/is)?.[2]||'';
 const u=urlOn(raw,YANDEX);if(!u)return null;
 const path=u.pathname.replace(/\/$/,''), parts=path.split('/').slice(1), n=/^\d{1,16}$/;
 const owner=/^[a-z0-9][a-z0-9_.-]{0,79}$/i;
 const playlistId=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
 let kind, embed='', original='';
 if(parts[0]==='iframe'){
  const route=parts.length===1?u.hash.slice(1).split('/'):parts.slice(1);
  const [type,a,b,c]=route;
  if(type==='track'&&route.length===3&&n.test(a)&&n.test(b)){kind=type;original='/album/'+b+'/track/'+a;}
  if(type==='album'&&route.length===4&&n.test(a)&&b==='track'&&n.test(c)){kind='track';original='/album/'+a+'/track/'+c;}
  if(type==='album'&&route.length===2&&n.test(a)){kind=type;original='/album/'+a;}
  if(type==='playlist'&&route.length===3&&owner.test(a)&&n.test(b)){kind=type;original='/users/'+a+'/playlists/'+b;}
  if(type==='playlists'&&route.length===2&&playlistId.test(a)){kind='playlist';original='/playlists/'+a;}
  if(kind)embed=parts.length===1?'/iframe/#'+route.join('/'):'/iframe/'+route.join('/');
 }else if(parts[0]==='album'&&n.test(parts[1])){
  if(parts.length===4&&parts[2]==='track'&&n.test(parts[3])){kind='track';embed='/iframe'+path;}
  if(parts.length===2){kind='album';embed='/iframe'+path;}
 }else if(parts[0]==='users'&&parts[2]==='playlists'&&parts.length===4&&owner.test(parts[1])&&n.test(parts[3])){
  kind='playlist';embed='/iframe/playlist/'+parts[1]+'/'+parts[3];
 }else if(parts[0]==='playlists'&&parts.length===2&&playlistId.test(parts[1])){
  kind='playlist';embed='/iframe'+path;
 }else if(parts[0]==='track'&&parts.length===2&&n.test(parts[1])){
  kind='track';
 }
 return kind?{kind,label:{track:'Трек',album:'Альбом',playlist:'Плейлист'}[kind],original:YANDEX+(original||path),embed:embed?YANDEX+embed:null}:null;
}

const formats={ogg:'audio/ogg; codecs="vorbis"',oga:'audio/ogg; codecs="vorbis"',opus:'audio/ogg; codecs="opus"',flac:'audio/flac',wav:'audio/wav',mp3:'audio/mpeg',webm:'audio/webm; codecs="opus"'};
function audioFile(value,canPlay){
 const u=urlOn(value,AUDIO_HOST);
 const ext=u?.pathname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
 if(!u?.pathname.startsWith('/wikipedia/commons/')||!formats[ext]||!canPlay(formats[ext]))return null;
 u.search='';u.hash='';return u.href;
}
function commonsPage(value){
 const u=urlOn(value,'https://commons.wikimedia.org');
 if(!u?.pathname.startsWith('/wiki/File:'))return null;
 u.search='';u.hash='';return u.href;
}
function licenseLink(value){
 const u=urlOn(value,'https://creativecommons.org');
 return u&&/^\/(?:licenses\/by(?:-sa)?\/[1-4]\.\d(?:\/[a-z-]{2,18})?|publicdomain\/zero\/1\.0)\/?$/i.test(u.pathname)?u.origin+u.pathname:null;
}

export function restoreCommonsTrack(record,canPlay){
 if(!record||!/^wm-\d{1,18}$/.test(record.id))return null;
 const audio=audioFile(record.audio,canPlay),source=commonsPage(record.source),licenseUrl=licenseLink(record.licenseUrl);
 const title=plain(record.title,160),artist=plain(record.artist,120),license=plain(record.license,60);
 if(!audio||!source||!licenseUrl||!title||!artist||!license)return null;
 return {id:record.id,title,artist,audio,source,licenseUrl,license,credit:plain(record.credit,380),art:'/art/commons.svg',genre:'Открытая запись',moods:[],seconds:null,provider:'commons',palette:[181,49,31,207]};
}

export async function searchCommons(query,{signal,canPlay=()=>true,fetcher=fetch}={}){
 const u=new URL(COMMONS_API), keywords=query.replace(/[^\p{L}\p{N}\p{M} .'-]/gu,' ').trim().slice(0,100);
 if(keywords.length<2)return [];
 u.search=new URLSearchParams({action:'query',generator:'search',gsrnamespace:'6',gsrsearch:'filetype:audio '+keywords,gsrlimit:'24',prop:'imageinfo',iiprop:'url|mime|extmetadata',iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist|ObjectName|Credit|Attribution|Restrictions',format:'json',formatversion:'2',origin:'*',maxlag:'5'});
 const r=await fetcher(u,{signal,credentials:'omit',headers:{'Api-User-Agent':'Sway/1.0 (licensed audio search; https://tonika-music.905589xx.workers.dev/)'}});
 if(!r.ok)throw new Error('Commons '+r.status);
 const result=await r.json();if(result.error)throw new Error('Commons temporarily unavailable');
 const items=[];
 for(const p of (result.query?.pages||[]).sort((a,b)=>a.index-b.index)){
  const info=p.imageinfo?.[0], data=info?.extmetadata, meta=(k,max)=>plain(data?.[k]?.value,max);
  if(!info||!data||meta('Restrictions')||!(/^(audio\/|application\/ogg)/.test(info.mime||'')))continue;
  const file=plain(p.title?.replace(/^File:/,'').replace(/\.[^.]+$/,''));
  if(/^(?:[a-z]{2,3}[-_]|LL-|Wikt-)|pronunciation|произношение|spoken wikipedia/i.test(file))continue;
  const title=meta('ObjectName',160)||file, artist=meta('Artist',120)||meta('Attribution',120);
  const track=restoreCommonsTrack({id:'wm-'+p.pageid,title,artist,audio:info.url,source:info.descriptionurl,licenseUrl:data.LicenseUrl?.value,license:meta('LicenseShortName',60),credit:meta('Attribution',380)||meta('Credit',380)||artist},canPlay);
  if(track)items.push(track);
 }
 return items;
}

export function mergeMusic(...catalogs){
 const normalize=value=>value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const seen=new Set(), ids=new Set();
 return catalogs.flat().filter(item=>{
  const key=normalize(item.title)+'\n'+normalize(item.artist);
  if(ids.has(item.id)||seen.has(key))return false;
  ids.add(item.id);seen.add(key);return true;
 });
}
