import {canonical,artistCredits,genreOf} from './discovery.js';
import {songLanguage} from './music-language.js';
const names=t=>(t.artists?.length?t.artists:artistCredits(t.artist)).map(canonical);
const features=new WeakMap();
const feature=t=>{if(!features.has(t))features.set(t,{genre:genreOf(t),names:names(t),language:songLanguage(t)});return features.get(t);};
const overlap=(a,b)=>{const x=new Set(a),y=new Set(b);return [...x].filter(v=>y.has(v)).length/Math.max(1,new Set([...x,...y]).size);};
export function songSimilarity(a,b){
 const fa=feature(a),fb=feature(b),ga=fa.genre,gb=fb.genre,same=ga&&ga===gb;
 const family=g=>/рэп|хип|rap|hip|drill|дрилл/i.test(g)?'rap':/рок|rock/i.test(g)?'rock':/поп|pop/i.test(g)?'pop':g;
 const genre=same?1:ga&&gb&&family(ga)===family(gb)?.55:0;
 const mood=overlap(a.moods||[],b.moods||[]);
 const collaboration=overlap(fa.names,fb.names);
 const language=fa.language&&fa.language===fb.language?1:0;
 return genre*.61+mood*.2+collaboration*.15+language*.04;
}
const histogram=(items,keys)=>{const map=new Map();for(const t of items)for(const key of keys(t))if(key)map.set(key,(map.get(key)||0)+1);return map;};
const cosine=(a,b)=>{let dot=0,aa=0,bb=0;for(const [k,v] of a){dot+=v*(b.get(k)||0);aa+=v*v;}for(const v of b.values())bb+=v*v;return dot/Math.sqrt(aa*bb||1);};
export function similarArtists(artist,candidates,{limit=8}={}){
 const identity=canonical(artist.name),items=artist.items||[];
 const genres=histogram(items,t=>[genreOf(t)]),moods=histogram(items,t=>t.moods||[]);
 const collaborators=new Set(items.flatMap(names).filter(n=>n!==identity));
 return [...new Map(candidates.map(a=>[canonical(a.name),a])).values()].filter(a=>canonical(a.name)!==identity&&a.items?.length).map(a=>{
  const genre=cosine(genres,histogram(a.items,t=>[genreOf(t)]));
  const mood=cosine(moods,histogram(a.items,t=>t.moods||[]));
  const cooperation=collaborators.has(canonical(a.name))?1:0;
  return {artist:a,score:.68*genre+.19*mood+.13*cooperation};
 }).filter(a=>a.score>=.44).sort((a,b)=>b.score-a.score||a.artist.name.localeCompare(b.artist.name,'ru')).slice(0,limit).map(a=>a.artist);
}
export function artistRadio(catalog,artist,{limit=80}={}){
 const identity=canonical(artist.name),seeds=[...new Map((artist.items||[]).map(t=>[genreOf(t)+'|'+(t.moods||[]).join(',')+'|'+songLanguage(t),t])).values()].slice(0,12);
 // All recordings crediting the seed artist, including collaborations, are excluded.
 return catalog.filter(t=>!feature(t).names.includes(identity)).map(t=>({t,score:seeds.reduce((best,s)=>Math.max(best,songSimilarity(s,t)),0)}))
  .filter(x=>x.score>=.34).sort((a,b)=>b.score-a.score||a.t.title.localeCompare(b.t.title,'ru')).slice(0,limit).map(x=>x.t);
}
export function releaseTimestamp(album){
 const raw=album?.releaseDate||album?.albumReleaseDate||'';
 // Legacy imports filled an unknown day with January 1. A year is not a release date.
 if(!raw||/^\d{4}$/.test(raw)||/^\d{4}-01-01$/.test(raw)&&album?.releaseDateVerified!==true)return 0;
 const at=Date.parse(raw);return Number.isFinite(at)?at:0;
}
export function latestRelease(albums,now=Date.now()){
 return albums.map(a=>({a,at:releaseTimestamp(a)})).filter(x=>x.at>0&&x.at<=now&&x.at>=now-90*86400000).sort((a,b)=>b.at-a.at)[0]?.a||null;
}
