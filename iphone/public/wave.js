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
 const recentArtists=new Map();
 for(const {id,kind} of history.slice(-30)){const t=index.get(id);if(t&&kind==='listen')for(const name of artistCredits(t.artist))add(recentArtists,name,1);}
 function affinity(table,key){return Math.tanh((table.get(key)||0)/3.5);}
 const remaining=catalog.filter(t=>!notNow.has(t.id)&&(!mood||t.moods.includes(mood))).map(t=>{
  const taste=t.moods.reduce((sum,key)=>sum+affinity(moods,key),0)/Math.max(1,t.moods.length);
  const genre=genreOf(t),preferred=artistCredits(t.artist).some(name=>preferredArtists.has(name));
   const credits=artistCredits(t.artist),artistAffinity=credits.length?Math.max(...credits.map(name=>affinity(artists,name))):0;
  const match=.85*taste+.65*affinity(genres,genre)+.52*artistAffinity+(likes.has(t.id)?.55:0)+(preferredGenres.has(genre)?.9:0)+(preferred?1.05:0);
  // Fatigue: an artist heard several times lately steps back, so one favourite does not open every station.
  const tired=credits.length?Math.max(...credits.map(name=>recentArtists.get(name)||0)):0;
  const score=match*(explore?.26:1)+Math.max(-2.8,individual.get(t.id)||0)-(fresh.has(t.id)?1.1:0)-Math.min(3.2,tired*.6)+random()*(explore?2.6:1.1);
  return {t,score,credits};
 }).sort((a,b)=>b.score-a.score);
 return spreadArtists(remaining);
}
// Greedy re-order: every pick of an artist lowers that artist's later songs, and nobody repeats
// within the last four songs while anyone else is left. The head of the list is what people hear.
function spreadArtists(items,head=150,window=90){
 const result=[],used=new Map();
 while(items.length&&result.length<head){
  const recent=new Set(result.slice(-4).flatMap(x=>x.credits));
  let best=0,bestScore=-Infinity;
  for(let i=0;i<Math.min(items.length,window);i++){
   const {score,credits}=items[i],count=credits.length?Math.max(...credits.map(name=>used.get(name)||0)):0;
   const value=score-count*.9-(credits.some(name=>recent.has(name))?4:0);
   if(value>bestScore){bestScore=value;best=i;}
  }
  const [pick]=items.splice(best,1);result.push(pick);
  for(const name of pick.credits)used.set(name,(used.get(name)||0)+1);
 }
 return [...result,...items].map(x=>x.t);
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

