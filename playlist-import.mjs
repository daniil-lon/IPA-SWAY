import {json,readJSON} from './profile-store.mjs';
const decode=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#\d+|#x[a-f0-9]+);/gi,m=>{
 const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' ','&#39;':"'"};if(named[m.toLowerCase()])return named[m.toLowerCase()];
 const n=parseInt(m.slice(m[2]?.toLowerCase()==='x'?3:2,-1),m[2]?.toLowerCase()==='x'?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
}).replace(/\s+/g,' ').trim().slice(0,300);
export function publicPlaylistURL(value){
 let u;try{u=new URL(value);}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const yandex=u.hostname==='music.yandex.ru'&&/^\/(?:users\/[a-z0-9_.-]{1,80}\/playlists\/\d{1,16}|playlists\/[a-f0-9-]{36})\/?$/i.test(u.pathname);
 const vk=['vk.com','m.vk.com','vk.ru'].includes(u.hostname)&&/^\/(?:music\/(?:album|playlist)\/?|audio_playlist)-?\d{1,16}_\d{1,16}(?:_[a-z0-9]+)?\/?$/i.test(u.pathname);
 if(!yandex&&!vk)return null;
 u.search='';u.hash='';return {url:u.href,provider:yandex?'Яндекс Музыка':'VK'};
}
export function parsePublicPlaylist(html,provider){
 let name='',total=null;const tracks=[];
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const raw=JSON.parse(match[1]);for(const data of Array.isArray(raw)?raw:[raw,...(raw['@graph']||[])]){
   if(data['@type']==='MusicPlaylist'){name=decode(data.name);total=Number(data.numTracks)||null;}
   const entries=data.track?.itemListElement||data.track||data.itemListElement||[];
   for(const item of Array.isArray(entries)?entries:[]){const t=item.item||item;if(t['@type']==='MusicRecording'&&t.name&&t.byArtist){const artists=Array.isArray(t.byArtist)?t.byArtist:[t.byArtist];tracks.push({title:decode(t.name),artist:artists.map(a=>decode(a.name)).filter(Boolean).join(', ')});}}
  }}catch{}
 }
 if(provider==='Яндекс Музыка'&&!tracks.length){
  const rows=[...html.matchAll(/<a\b[^>]*aria-label="Трек ([^"]+)"[^>]*href="\/album\/\d+\/track\/\d+"[^>]*>/g)];
  for(let i=0;i<rows.length;i++){
   const fragment=html.slice(rows[i].index,Math.min(rows[i+1]?.index||html.length,rows[i].index+18000));
   const artists=[...fragment.matchAll(/aria-label="Артист ([^"]+)"/g)].map(m=>decode(m[1]));
   if(artists.length)tracks.push({title:decode(rows[i][1]),artist:[...new Set(artists)].join(', ')});
  }
 }
 if(!name)name=decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]).replace(/^Плейлист\s+/,'').split(' — слушать')[0];
 const unique=[...new Map(tracks.filter(t=>t.artist&&t.title).map(t=>[t.artist+'|'+t.title,t])).values()].slice(0,1000);
 return {name:name.slice(0,80)||'Импортированный плейлист',tracks:unique,total:total||unique.length,partial:total?unique.length<total:true,provider};
}
export async function importPlaylist(req,fetcher=fetch){
 const source=publicPlaylistURL((await readJSON(req,3000))?.url);if(!source)return json({error:'invalid_playlist_link'},400);
 try{
  // Only the publicly shared HTML page. No cookies, access tokens, private API or redirect traversal.
  const response=await fetcher(source.url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:'text/html'}});
  if(response.status!==200||!response.headers.get('Content-Type')?.includes('text/html'))return json({error:'playlist_not_public',provider:source.provider},422);
  const reader=response.body.getReader(),decoder=new TextDecoder();let text='',bytes=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2000000){await reader.cancel();return json({error:'playlist_too_large'},422);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
  const result=parsePublicPlaylist(text,source.provider);
  if(!result.tracks.length)return json({error:'playlist_metadata_unavailable',provider:source.provider},422);
  return json({...result,source:source.url});
 }catch{return json({error:'provider_unavailable',provider:source.provider},502);}
}
