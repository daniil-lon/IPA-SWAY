// Who is actually listening, guests included. The player pings about every two minutes while music plays;
// the gap between two pings becomes listening time. A visitor is a random browser id, nothing personal.
const PING_MIN=50, PING_MAX=200, NOW_WINDOW=300;
let window_=0, count=0;

const deviceOf=(ua,app)=>{
 const kind=/iPhone|iPad|iPod/.test(ua)?'iPhone':/Android/.test(ua)?'Android':/Mobile/.test(ua)?'Телефон':'Компьютер';
 return kind+(app?' · приложение':'');
};

export async function recordListen(req,env,identity){
 const minute=Math.floor(Date.now()/60000);if(minute!==window_){window_=minute;count=0;}
 if(++count>600||!env.DB)return new Response(null,{status:204});
 let body;try{body=JSON.parse((await req.text()).slice(0,600));}catch{return new Response(null,{status:204});}
 const visitor=typeof body?.visitor==='string'&&/^[a-f0-9]{32}$/.test(body.visitor)?body.visitor:'';
 if(!visitor)return new Response(null,{status:204});
 const track=typeof body.track==='string'?body.track.slice(0,160):'';
 const source=typeof body.source==='string'&&/^[a-z0-9_-]{1,32}$/.test(body.source)?body.source:'';
 const device=deviceOf(req.headers.get('User-Agent')||'',body.app===true);
 const stamp=Math.floor(Date.now()/1000), day=new Date().toISOString().slice(0,10);
 const uid=(await identity().catch(()=>null))?.id||null;
 // Credit the gap since the previous ping only when it looks like continuous playback.
 const gap='COALESCE((SELECT CASE WHEN ?1-last_seen BETWEEN '+PING_MIN+' AND '+PING_MAX+' THEN ?1-last_seen ELSE 0 END FROM listeners WHERE visitor=?2),0)';
 try{
  await env.DB.batch([
   env.DB.prepare('INSERT INTO listener_days(day,visitor,seconds) VALUES(?3,?2,'+gap+') ON CONFLICT(day,visitor) DO UPDATE SET seconds=seconds+excluded.seconds').bind(stamp,visitor,day),
   env.DB.prepare(`INSERT INTO listeners(visitor,uid,device,source,track,first_seen,last_seen,seconds,days,last_day) VALUES(?2,?3,?4,?5,?6,?1,?1,0,1,?7)
    ON CONFLICT(visitor) DO UPDATE SET
     seconds=seconds+CASE WHEN ?1-last_seen BETWEEN ${PING_MIN} AND ${PING_MAX} THEN ?1-last_seen ELSE 0 END,
     days=days+CASE WHEN last_day<>?7 THEN 1 ELSE 0 END,
     last_day=?7, last_seen=?1, track=?6, device=?4,
     uid=COALESCE(?3,uid), source=CASE WHEN source='' THEN ?5 ELSE source END
    WHERE ?1-listeners.last_seen>=${PING_MIN} OR listeners.track<>?6`).bind(stamp,visitor,uid,device,source,track,day)
  ]);
 }catch(error){console.warn('Sway listener counter unavailable',String(error?.message||error).slice(0,120));}
 return new Response(null,{status:204});
}

export async function listenersReport(env,tracks){
 const empty={now:[],totals:{},daily:[],recent:[],sources:[],devices:[]};
 if(!env?.DB)return empty;
 const all=async(sql,...args)=>{try{return (await env.DB.prepare(sql).bind(...args).all()).results||[];}catch{return [];}};
 const one=async(sql,...args)=>(await all(sql,...args))[0]||{};
 const stamp=Math.floor(Date.now()/1000), today=new Date().toISOString().slice(0,10);
 const dayAgo=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
 const midnight=Math.floor(Date.parse(today+'T00:00:00Z')/1000);
 const byId=new Map((tracks||[]).map(t=>[t.id,t]));
 const person='l.visitor,l.uid,u.name,l.device,l.source,l.track,l.first_seen,l.last_seen,l.seconds,l.days';
 const [now,todayRow,weekRow,monthRow,newToday,newWeek,returning,daily,fresh,recent,sources,devices]=await Promise.all([
  all(`SELECT ${person} FROM listeners l LEFT JOIN users u ON u.id=l.uid WHERE l.last_seen>=? ORDER BY l.last_seen DESC LIMIT 60`,stamp-NOW_WINDOW),
  one('SELECT COUNT(*) AS people, SUM(seconds) AS seconds FROM listener_days WHERE day=?',today),
  one('SELECT COUNT(DISTINCT visitor) AS people, SUM(seconds) AS seconds FROM listener_days WHERE day>=?',dayAgo(6)),
  one('SELECT COUNT(DISTINCT visitor) AS people FROM listener_days WHERE day>=?',dayAgo(29)),
  one('SELECT COUNT(*) AS c FROM listeners WHERE first_seen>=?',midnight),
  one('SELECT COUNT(*) AS c FROM listeners WHERE first_seen>=?',stamp-7*86400),
  one('SELECT COUNT(*) AS c FROM listeners WHERE days>=2 AND last_seen>=?',stamp-7*86400),
  all('SELECT day, COUNT(*) AS people, SUM(seconds) AS seconds FROM listener_days WHERE day>=? GROUP BY day ORDER BY day',dayAgo(29)),
  all("SELECT date(first_seen,'unixepoch') AS day, COUNT(*) AS c FROM listeners WHERE first_seen>=? GROUP BY day",stamp-30*86400),
  all(`SELECT ${person} FROM listeners l LEFT JOIN users u ON u.id=l.uid ORDER BY l.last_seen DESC LIMIT 100`),
  all("SELECT CASE WHEN source='' THEN 'напрямую' ELSE source END AS name, COUNT(*) AS people FROM listeners WHERE last_seen>=? GROUP BY name ORDER BY people DESC LIMIT 12",stamp-30*86400),
  all('SELECT device AS name, COUNT(*) AS people FROM listeners WHERE last_seen>=? GROUP BY device ORDER BY people DESC',stamp-30*86400)
 ]);
 const newByDay=new Map(fresh.map(r=>[r.day,Number(r.c)||0]));
 const shape=row=>{
  const t=byId.get(row.track);
  return {id:String(row.visitor).slice(0,6),name:row.name||'',registered:!!row.uid,device:row.device,source:row.source,
   track:t?{title:t.title,artist:t.artist,art:t.art||''}:row.track?{title:row.track,artist:'',art:''}:null,
   firstSeen:row.first_seen,lastSeen:row.last_seen,seconds:Number(row.seconds)||0,days:Number(row.days)||0};
 };
 const n=v=>Number(v)||0;
 return {
  now:now.map(shape),
  totals:{now:now.length,today:n(todayRow.people),todaySeconds:n(todayRow.seconds),week:n(weekRow.people),weekSeconds:n(weekRow.seconds),
   month:n(monthRow.people),newToday:n(newToday.c),newWeek:n(newWeek.c),returningWeek:n(returning.c)},
  daily:daily.map(r=>({day:r.day,people:n(r.people),seconds:n(r.seconds),fresh:newByDay.get(r.day)||0})),
  recent:recent.map(shape),
  sources:sources.map(r=>({name:r.name,people:n(r.people)})),
  devices:devices.map(r=>({name:r.name||'—',people:n(r.people)}))
 };
}
