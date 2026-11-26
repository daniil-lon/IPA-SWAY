// Apple Music's Russian top-100, trimmed to the fields the app shows.
// Apple's own hosts are unreliable from Russian networks and our responses get cut past ~16 KB,
// so the worker gathers the chart once, caches it, and serves it in pages that stay under 10 KB.
// Covers still load from Apple's image CDN, which stays reachable.
const FEED='https://rss.marketingtools.apple.com/api/v2/ru/music/most-played/100/songs.json';
const LOOKUP='https://itunes.apple.com/lookup?country=ru&entity=song&id=';
const TTL=6*3600, PAGE_BYTES=9000;
let memory=null;

const apple=(url,host)=>{try{const u=new URL(url);return u.protocol==='https:'&&host.test(u.hostname)?u.href:'';}catch{return '';}};
const clip=(s,n)=>String(s||'').slice(0,n);

async function gather(){
 const feed=(await (await fetch(FEED,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)})).json())?.feed;
 const results=(feed?.results||[]).filter(r=>/^\d{1,15}$/.test(String(r.id||''))).slice(0,100);
 if(!results.length)throw new Error('empty feed');
 // Previews only exist in the lookup API; the chart still works without them.
 const previews=new Map();
 try{
  const data=await (await fetch(LOOKUP+results.map(r=>r.id).join(','),{signal:AbortSignal.timeout(8000)})).json();
  for(const r of data.results||[])if(r.kind==='song')previews.set(String(r.trackId),{preview:apple(r.previewUrl,/\.apple\.com$/),explicit:r.trackExplicitness==='explicit'});
 }catch{}
 const items=results.map(r=>({id:String(r.id),title:clip(r.name,120),artist:clip(r.artistName,120),
  art:apple(r.artworkUrl100,/\.mzstatic\.com$/),apple:apple(r.url,/^music\.apple\.com$/),...(previews.get(String(r.id))||{preview:'',explicit:r.contentAdvisoryRating==='Explict'})}));
 const pages=[];let page=[],bytes=0;
 for(const item of items){const size=new TextEncoder().encode(JSON.stringify(item)).length+1;if(page.length&&bytes+size>PAGE_BYTES){pages.push(page);page=[];bytes=0;}page.push(item);bytes+=size;}
 if(page.length)pages.push(page);
 return {updated:feed.updated||'',pages};
}

export async function russiaChart(url,ctx){
 const index=Math.max(0,Math.min(20,Number(url.searchParams.get('page'))|0));
 if(!memory||Date.now()-memory.at>TTL*1000){
  const cache=globalThis.caches?.default, key=new Request('https://sway.internal/russia-chart-v2');
  const hit=await cache?.match(key).catch(()=>null);
  if(hit)memory={at:Date.now(),chart:await hit.json()};
  else try{
   const chart=await gather();
   memory={at:Date.now(),chart};
   ctx?.waitUntil?.(cache?.put(key,new Response(JSON.stringify(chart),{headers:{'Cache-Control':'public, max-age='+TTL}})).catch(()=>{}));
  }catch{
   if(!memory)return new Response('{"error":"chart_unavailable"}',{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
  }
 }
 const {updated,pages}=memory.chart;
 const body={updated,items:pages[index]||[],next:index+1<pages.length?index+1:null};
 return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=1800'}});
}
