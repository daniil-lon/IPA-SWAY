const translit={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
export const normalizeSearch=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('ru').replace(/[а-яё]/g,c=>translit[c]).replace(/[^a-z0-9]+/g,' ').trim();
function distance(a,b){if(Math.abs(a.length-b.length)>2)return 3;let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=row;}return prev[b.length];}
const indexed=new WeakMap();
export function searchTracks(tracks,query){
 const q=normalizeSearch(query);if(!q)return tracks;
 const words=q.split(' '),seen=new Set();
 return tracks.map(t=>{let text=indexed.get(t);if(!text){text=normalizeSearch([t.title,t.artist,t.albumTitle,t.genre,...(t.moods||[])].join(' '));indexed.set(t,text);}let score=text.includes(q)?100:words.every(w=>text.includes(w))?70:0;if(!score&&q.length>=4){const tokens=text.split(' ');if(words.every(w=>tokens.some(v=>distance(w,v)<=(w.length>6?2:1))))score=35;}return {t,score};}).filter(({t,score})=>{const key=t.canonicalId||t.id;if(!score||seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>b.score-a.score).map(r=>r.t);
}
