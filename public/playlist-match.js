// Match metadata only. A match never supplies an audio URL from the external service.
export const matchKey=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[\p{P}\p{S}\s]+/gu,' ').trim();
const artistKey=value=>matchKey(value).split(/\s+(?:feat|ft)\s+/)[0];
export function parseTrackList(text){
 const input=String(text||'').trim();if(!input)return [];
 if(input[0]==='['){try{const list=JSON.parse(input);if(Array.isArray(list))return list.slice(0,1000).map(t=>({artist:t.artist||t.artistName||'',title:t.title||t.trackName||'',id:t.id})).filter(t=>t.title||t.id);}catch{}}
 return input.split(/\r?\n/).map(s=>s.trim().replace(/^\d+[.)]\s*/,'')) .filter(Boolean).slice(0,1000).map(line=>{
  const fields=line.split(/\s+[—–-]\s+|\t/);return fields.length>1?{artist:fields.shift(),title:fields.join(' — ')}:{id:line,title:line,artist:''};
 });
}
export function matchPlaylist(entries,catalog){
 const byId=new Map(catalog.map(t=>[t.id,t])),byPair=new Map(),byTitle=new Map();
 for(const t of catalog){const key=matchKey(t.title)+'|'+artistKey(t.artist),title=matchKey(t.title);if(!byPair.has(key))byPair.set(key,[]);byPair.get(key).push(t);if(!byTitle.has(title))byTitle.set(title,[]);byTitle.get(title).push(t);}
 const matched=[],missing=[],ambiguous=[],seen=new Set();
 for(const entry of entries){
  let candidates=entry.id&&byId.has(entry.id)?[byId.get(entry.id)]:entry.artist?byPair.get(matchKey(entry.title)+'|'+artistKey(entry.artist))||[]:byTitle.get(matchKey(entry.title))||[];
  // Duplicate encodings of the same recording may be present in the catalogue.
  const distinct=[...new Map(candidates.map(t=>[matchKey(t.title)+'|'+artistKey(t.artist)+'|'+Math.round((t.seconds||0)/5),t])).values()];
  if(!distinct.length)missing.push(entry);else if(distinct.length>1)ambiguous.push(entry);else if(!seen.has(distinct[0].id)){matched.push(distinct[0]);seen.add(distinct[0].id);}
 }
 return {matched,missing,ambiguous,total:entries.length};
}
