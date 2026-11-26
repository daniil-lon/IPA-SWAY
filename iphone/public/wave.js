const HISTORY_LIMIT=120;
const DAY=86400000;

export function readWaveHistory(value){
 if(!Array.isArray(value))return [];
 return value.slice(-HISTORY_LIMIT).filter(entry=>typeof entry?.id==='string'&&['listen','skip'].includes(entry.kind)&&Number.isFinite(entry.at));
}

export function recordWaveSignal(history,id,kind,at=Date.now()){
 return [...history.slice(1-HISTORY_LIMIT),{id,kind,at}];
}

export function rankWave(catalog,{likes=new Set(),history=[],preferredGenres=new Set(),preferredArtists=new Set(),mood='',exclude=[],explore=false,random=Math.random,now=Date.now()}={}){
 const index=new Map(catalog.map(t=>[t.id,t]));
 const notNow=new Set(exclude), fresh=new Set(history.slice(-4).map(e=>e.id));
 const moods=new Map(), genres=new Map(), artists=new Map(), individual=new Map();
 const add=(table,key,value)=>table.set(key,(table.get(key)||0)+value);
 const signal=(t,v)=>{
  for(const key of t.moods)add(moods,key,v/Math.max(1,t.moods.length));
  add(genres,genreOf(t),v);for(const artist of artistCredits(t.artist))add(artists,artist,v);
 };
 for(const id of likes){const t=index.get(id);if(t)signal(t,2.7);}
 for(const {id,kind,at} of history){
  const t=index.get(id);if(!t)continue;
  const age=Math.max(0,now-at), weight=Math.exp(-age/(28*DAY));
  signal(t,(kind==='listen'?1:-1.45)*weight);
  add(individual,id,(kind==='listen'?.08:-1.65)*weight);
 }
 function affinity(table,key){return Math.tanh((table.get(key)||0)/3.5);}
 const remaining=catalog.filter(t=>!notNow.has(t.id)&&(!mood||t.moods.includes(mood))).map(t=>{
  const taste=t.moods.reduce((sum,key)=>sum+affinity(moods,key),0)/Math.max(1,t.moods.length);
  const genre=genreOf(t),preferred=artistCredits(t.artist).some(name=>preferredArtists.has(name));
   const credits=artistCredits(t.artist),artistAffinity=credits.length?Math.max(...credits.map(name=>affinity(artists,name))):0;
  const match=.85*taste+.65*affinity(genres,genre)+.52*artistAffinity+(likes.has(t.id)?.55:0)+(preferredGenres.has(genre)?.9:0)+(preferred?1.45:0);
  const score=match*(explore?.26:1)+Math.max(-2.8,individual.get(t.id)||0)-(fresh.has(t.id)?1.1:0)+random()*(explore?2.6:1.1);
  return {t,score};
 }).sort((a,b)=>b.score-a.score);
 const result=[];
 while(remaining.length){
  // Space artists out: neither of the last two songs may share the next one's artist while a close alternative exists.
  const recent=result.slice(-2).map(t=>t.artist), next=remaining.findIndex(({t,score})=>!recent.includes(t.artist)&&score>remaining[0].score-.75);
  result.push(remaining.splice(Math.max(0,next),1)[0].t);
 }
 return result;
}

export function deckRecommendations(catalog,options={}){
 const ranked=rankWave(catalog,{...options,random:()=>.5});
 const recent=new Set((options.history||[]).slice(-6).map(e=>e.id));
 // Reserve the most visible cards for discovery and keep the rest available on subsequent passes.
 return [...ranked.filter(t=>!options.likes?.has(t.id)&&!recent.has(t.id)),...ranked.filter(t=>options.likes?.has(t.id)||recent.has(t.id))];
}

export function recommendationTitle(track){return 'В духе «'+track.title+'»';}

export function relatedMix(catalog,seed,options={}){
 if(!seed)return [];
 const recording=seed.canonicalId||seed.id;
 const aligned=catalog.filter(t=>(t.canonicalId||t.id)!==recording&&!t.canonicalId&&songSimilarity(seed,t)>=.34);
 const ranked=rankWave(aligned,{...options,random:options.random||(()=>.5)});
 return ranked.map((t,i)=>({t,score:songSimilarity(seed,t)+(1-i/Math.max(1,ranked.length))*.14})).sort((a,b)=>b.score-a.score).slice(0,60).map(x=>x.t);
}
import {songSimilarity} from './music-intelligence.js';
import {artistCredits,genreOf,tracksInMix} from './discovery.js';

