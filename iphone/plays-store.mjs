// Public listening statistics: what people actually play in Sway.
// A play counts once per listener, track and day after 30 seconds of listening, so a
// single visitor cannot push a track up the chart by replaying it.
import fallbackChart from './public/chart.json';

const DAY=86400000, CACHE_MS=5*60000, NOW_WINDOW=300;
const today=()=>Math.floor(Date.now()/DAY);
let cache=null, writes={minute:0,count:0};

export async function recordPlay(env,visitor,track){
 const minute=Math.floor(Date.now()/60000);if(minute!==writes.minute)writes={minute,count:0};
 if(++writes.count>900||!env.DB||!visitor||!track)return;
 try{await env.DB.prepare('INSERT OR IGNORE INTO track_plays(day,track,visitor) VALUES(?,?,?)').bind(today(),track,visitor).run();}
 catch(error){console.warn('Sway play counter unavailable',String(error?.message||error).slice(0,120));}
}

const credits=artist=>String(artist||'').split(/\s*(?:,|&|\bfeat\.?|\bft\.?|×|\sx\s)\s*/i).map(s=>s.trim()).filter(Boolean);

export async function playStats(env,tracks){
 if(cache&&cache.until>Date.now()&&cache.size===tracks.length)return cache.data;
 const byId=new Map(tracks.map(t=>[t.id,t]));
 const all=async(sql,...args)=>{try{return (await env.DB.prepare(sql).bind(...args).all()).results||[];}catch{return [];}};
 const d=today(), stamp=Math.floor(Date.now()/1000);
 const [week,prev,recent,earlier,now,month]=env.DB?await Promise.all([
  all('SELECT track, COUNT(*) AS c FROM track_plays WHERE day>? GROUP BY track ORDER BY c DESC LIMIT 300',d-7),
  all('SELECT track, COUNT(*) AS c FROM track_plays WHERE day>? AND day<=? GROUP BY track ORDER BY c DESC LIMIT 300',d-14,d-7),
  all('SELECT track, COUNT(*) AS c FROM track_plays WHERE day>? GROUP BY track',d-3),
  all('SELECT track, COUNT(*) AS c FROM track_plays WHERE day>? AND day<=? GROUP BY track',d-10,d-3),
  all("SELECT track, COUNT(*) AS c FROM listeners WHERE last_seen>=? AND track<>'' GROUP BY track ORDER BY c DESC LIMIT 40",stamp-NOW_WINDOW),
  all('SELECT track, COUNT(*) AS c FROM track_plays WHERE day>? GROUP BY track ORDER BY c DESC LIMIT 400',d-30)
 ]):[[],[],[],[],[],[]];
 const known=rows=>rows.filter(r=>byId.has(r.track)).map(r=>({id:r.track,c:Number(r.c)||0}));
 const live=known(week), before=new Map(known(prev).map((r,i)=>[r.id,i+1]));
 // Live plays lead; the editorial chart fills the rest so the list is never short while statistics grow.
 const items=[], seen=new Set();
 for(const r of live){
  const position=items.length+1, last=before.get(r.id);
  items.push({id:r.id,plays:r.c,progress:!last?'new':last>position?'up':last<position?'down':'same',shift:last?last-position:0});
  seen.add(r.id);if(items.length>=100)break;
 }
 for(const t of fallbackChart){
  if(items.length>=100)break;
  const id=t.id||t.trackId;if(seen.has(id)||!byId.has(id))continue;
  items.push({id});seen.add(id);
 }
 // Trends: tracks whose daily plays in the last three days beat their previous week's pace.
 const earlierMap=new Map(known(earlier).map(r=>[r.id,r.c]));
 const trends=known(recent).map(r=>{const was=(earlierMap.get(r.id)||0)/7*3;return {id:r.id,plays:r.c,growth:(r.c+1)/(was+1)};})
  .filter(r=>r.plays>=2&&r.growth>1.15).sort((a,b)=>b.growth-a.growth||b.plays-a.plays).slice(0,20).map(({id,plays})=>({id,plays}));
 const nowItems=known(now).slice(0,20).map(r=>({id:r.id,people:r.c}));
 const artistScores=new Map();
 for(const r of known(month))for(const name of credits(byId.get(r.id).artist))artistScores.set(name,(artistScores.get(name)||0)+r.c);
 const artists=[...artistScores].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([name,plays])=>({name,plays}));
 const data={items,trends,now:nowItems,nowCount:nowItems.reduce((s,r)=>s+r.people,0),artists,livePlays:live.reduce((s,r)=>s+r.c,0),updated:Date.now()};
 cache={until:Date.now()+CACHE_MS,size:tracks.length,data};
 return data;
}

// Admin view: top tracks and artists with daily totals.
export async function playsReport(env,tracks){
 const byId=new Map(tracks.map(t=>[t.id,t]));
 const all=async(sql,...args)=>{try{return (await env.DB.prepare(sql).bind(...args).all()).results||[];}catch{return [];}};
 const d=today();
 const [top,daily,totals]=await Promise.all([
  all('SELECT track, COUNT(*) AS c, COUNT(DISTINCT visitor) AS people FROM track_plays WHERE day>? GROUP BY track ORDER BY c DESC LIMIT 50',d-30),
  all('SELECT day, COUNT(*) AS c FROM track_plays WHERE day>? GROUP BY day ORDER BY day',d-30),
  all('SELECT SUM(day=?) AS today, SUM(day>?) AS week, COUNT(*) AS month FROM track_plays WHERE day>?',d,d-7,d-30)
 ]);
 const artistScores=new Map();
 const topTracks=top.filter(r=>byId.has(r.track)).map(r=>{const t=byId.get(r.track);for(const n of credits(t.artist))artistScores.set(n,(artistScores.get(n)||0)+Number(r.c));return {id:t.id,title:t.title,artist:t.artist,art:t.art||'',plays:Number(r.c)||0,people:Number(r.people)||0};});
 return {
  totals:{today:Number(totals[0]?.today)||0,week:Number(totals[0]?.week)||0,month:Number(totals[0]?.month)||0},
  daily:daily.map(r=>({day:new Date(Number(r.day)*DAY).toISOString().slice(0,10),plays:Number(r.c)||0})),
  tracks:topTracks.slice(0,30),
  artists:[...artistScores].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([name,plays])=>({name,plays}))
 };
}
