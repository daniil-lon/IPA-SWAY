export function shuffled(values, random = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Queue entries are occurrences, so repeated tracks remain independently editable. */
export class PlaybackQueue {
  constructor(random = Math.random) { this.random = random; this.set([]); }
  set(ids, index = 0, source = 'library') {
    this.ids = [...ids]; this.index = Math.max(0, Math.min(index, ids.length - 1));
    this.source = source; this.resetShuffle(); return this;
  }
  resetShuffle() { this.bag = []; this.back = []; this.forward = []; this.seen = new Set([this.index]); }
  append(ids, next = false) {
    const at = next ? this.index + 1 : this.ids.length;
    this.ids.splice(at, 0, ...ids); this.resetShuffle(); return at;
  }
  remove(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.ids.length || index === this.index) return false;
    this.ids.splice(index, 1); if (index < this.index) this.index--;
    this.resetShuffle(); return true;
  }
  move(from, to) {
    if (![from,to].every(i=>Number.isInteger(i)&&i>=0&&i<this.ids.length)||from===to) return false;
    const [id] = this.ids.splice(from, 1); this.ids.splice(to, 0, id);
    if (this.index === from) this.index = to;
    else if (from < this.index && to >= this.index) this.index--;
    else if (from > this.index && to <= this.index) this.index++;
    this.resetShuffle(); return true;
  }
  jump(index) {
    if (!Number.isInteger(index)||index<0||index>=this.ids.length) return false;
    if (index !== this.index) { this.back.push(this.index); this.forward=[]; }
    this.index=index; this.seen.add(index); this.bag=this.bag.filter(i=>i!==index); return true;
  }
  next({direction=1,automatic=false,shuffle=false,repeat=0}={}) {
    if (!this.ids.length) return -1;
    if (automatic && repeat===2) return this.index;
    if (!shuffle) {
      const next=this.index+direction;
      if (next<0||next>=this.ids.length) {
        if (repeat!==1) return -1;
        this.index=(next+this.ids.length)%this.ids.length;
      } else this.index=next;
      return this.index;
    }
    if (direction<0) {
      if (!this.back.length) return -1;
      this.forward.push(this.index); this.index=this.back.pop(); return this.index;
    }
    if (this.forward.length) { this.back.push(this.index); this.index=this.forward.pop(); return this.index; }
    if (!this.bag.length) {
      let candidates=this.ids.map((_,i)=>i).filter(i=>!this.seen.has(i));
      if (!candidates.length && repeat===1) { this.seen=new Set([this.index]); candidates=this.ids.map((_,i)=>i).filter(i=>i!==this.index); }
      if (!candidates.length) return repeat===1 ? this.index : -1;
      this.bag=shuffled(candidates,this.random);
    }
    this.back.push(this.index); this.index=this.bag.pop(); this.seen.add(this.index); return this.index;
  }
  snapshot(position=0) { return {ids:[...this.ids],index:this.index,source:this.source,position:Math.max(0,Number(position)||0)}; }
}

export function parseLyrics(data) {
  const timed=[];
  const lines=Array.isArray(data?.lines)?data.lines:Array.isArray(data?.synced)?data.synced:[];
  for (const line of lines) {
    if(!line||typeof line!=='object')continue;
    const rawTime=line.at ?? line.time ?? line.startTime;
    if(rawTime==null||rawTime==='')continue;
    const at=Number(rawTime);
    if (Number.isFinite(at) && at>=0 && typeof line.text==='string') timed.push({at,text:line.text});
  }
  const lrc=typeof data?.synced==='string'?data.synced:typeof data?.syncedLyrics==='string'?data.syncedLyrics:'';
  if (!timed.length && lrc) {
    const offset=Number(lrc.match(/\[offset:([+-]?\d+)\]/i)?.[1]||0)/1000;
    for (const row of lrc.split(/\r?\n/)) {
      const stamps=[...row.matchAll(/\[(\d+):(\d{2}(?:[.:]\d{1,3})?)\]/g)];
      const text=row.replace(/\[[^\]]*\]/g,'').trim();
      for (const stamp of stamps) timed.push({at:Math.max(0,Number(stamp[1])*60+Number(stamp[2].replace(':','.'))+offset),text});
    }
  }
  timed.sort((a,b)=>a.at-b.at);
  const unique=timed.filter((line,i)=>!i||line.at!==timed[i-1].at||line.text!==timed[i-1].text);
  const raw=data?.plain||data?.plainLyrics||data?.lyrics||data?.text;
  const plain=typeof raw==='string'?raw:unique.map(l=>l.text).join('\n');
  return {timed:unique,plain};
}

export function activeLyricIndex(lines,time) {
  let low=0,high=lines.length-1,result=-1;
  while(low<=high){const middle=(low+high)>>1;if(lines[middle].at<=time){result=middle;low=middle+1;}else high=middle-1;}
  return result;
}

/** A local taste model, intentionally separate from Yandex's recommendation service. */
export function recommendTracks(tracks,{liked=new Set(),excluded=new Set(),stats={},history=[],seedIds=[],mood='any',language='any',languages={},limit=120,random=Math.random}={}) {
  const byId=new Map(tracks.map(t=>[t.id,t]));
  const artistTaste=new Map(),genreTaste=new Map();
  const add=(map,key,value)=>{if(key)map.set(key,(map.get(key)||0)+value);};
  for(const id of new Set([...liked,...seedIds,...Object.keys(stats)])){
    const t=byId.get(id);if(!t)continue;
    const s=stats[id]||{};const weight=(liked.has(id)?5:0)+(seedIds.includes(id)?9:0)+Math.min(4,Number(s.completed)||0)-Math.min(4,Number(s.skipped)||0)*.75;
    for(const a of t.artists||[t.artist])add(artistTaste,a,weight);add(genreTaste,t.genre,weight*.35);
  }
  const recent=new Set(history.slice(0,35));
  const candidates=[];
  for(const t of tracks){
    if(excluded.has(t.id)||mood!=='any'&&!t.moods?.includes(mood)||language!=='any'&&languages[t.id]!==language)continue;
    let weight=1+(liked.has(t.id)?3:0)+(genreTaste.get(t.genre)||0);
    weight+=Math.max(0,...(t.artists||[t.artist]).map(a=>artistTaste.get(a)||0));
    if(recent.has(t.id))weight*=.15;
    weight/=1+Math.max(0,Number(stats[t.id]?.skipped)||0);
    candidates.push({track:t,key:-Math.log(Math.max(Number.EPSILON,random()))/Math.max(.05,weight)});
  }
  candidates.sort((a,b)=>a.key-b.key);
  const selected=[],deferred=[],artistCounts=new Map();
  for(const item of candidates){const a=item.track.artists?.[0]||item.track.artist;if((artistCounts.get(a)||0)>=Math.max(2,Math.ceil(limit/12))){deferred.push(item.track);continue;}selected.push(item.track);artistCounts.set(a,(artistCounts.get(a)||0)+1);if(selected.length>=limit)break;}
  return [...selected,...deferred].slice(0,limit);
}
