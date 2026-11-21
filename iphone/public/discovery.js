import coverColors from './cover-colors.js';
import {stationTracks} from './wave-stations.js';
const moods = new Set(['bright','calm','focus','night']);
const knownOrder = ['Рэп / Хип-хоп','Инди / Поп','Поп','R&B / Хип-хоп','Рэп / Дрилл','Кьют-рок'];
export const canonical = value => String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru').replace(/ё/g,'е');

export function genreOf(track) {
 const text = String(track?.genre || '').trim().replace(/\s*\/\s*/g,' / ');
 const key = canonical(text);
 if(!key)return '';
 if(['рэп','хип-хоп','рэп / хип-хоп','hip-hop','hip hop','rap'].includes(key))return knownOrder[0];
 if(['поп / рэп','рэп / поп','хип-хоп / поп','поп / хип-хоп'].includes(key))return 'Поп-рэп';
 return knownOrder.find(t=>canonical(t)===key)||text;
}

export function artistCredits(value) {
 return [...new Set(String(value??'').split(/\s*[,;/]\s*|\s+(?:&|×|feat\.?|ft\.?)\s+/iu).map(name=>name.trim()).filter(Boolean))];
}

export function tagCatalog(catalog, measured, languages={}) {
 return catalog.map(track=>{
  const declared = Array.isArray(track.moods)?track.moods.filter(m=>moods.has(m)):[];
  // Earlier bulk imports assigned the same two defaults to every track.
  const placeholder = !track.createdAt && declared.length === 2 && declared.includes('bright') && declared.includes('focus');
  const checked=Object.hasOwn(measured,track.id)?measured[track.id]:null;
  const generated=Array.isArray(checked)?checked:checked?.moods;
  const detected = Array.isArray(generated)?generated.filter(m=>moods.has(m)):[];
  const supplement=coverColors[track.id];
  const palette=[checked?.palette,track.palette,supplement?.palette].find(p=>Array.isArray(p)&&p.length===4&&p.every(Number.isFinite))||[220,9,28,227];
  return {...track, language:track.language||languages[track.id]||'', art:supplement?.art||track.art||track.cover||'/art/logo.svg',albumTitle:track.albumTitle||track.album||'',isExplicit:track.isExplicit??track.explicit??false,palette, moodSource:declared.length&&!placeholder?'editorial':detected.length?'audio':'', moods:declared.length&&!placeholder ? declared : detected};
 });
}

export function genreOptions(catalog, preferred=[]) {
 const counts = new Map();
 for (const track of catalog) {
  const genre = genreOf(track);
  if(genre)counts.set(genre,(counts.get(genre)||0)+1);
 }
 return [...counts.keys()].sort((a,b)=>Number(preferred.includes(b))-Number(preferred.includes(a))||counts.get(b)-counts.get(a)||a.localeCompare(b,'ru'));
}

export function tracksInMix(catalog, mix) {
 if(!mix)return catalog;
 if(mix.station)return stationTracks(catalog,mix.station);
 if(mix.genre)return catalog.filter(t=>genreOf(t)===mix.genre);
 if(mix.mood)return catalog.filter(t=>t.moods?.includes(mix.mood));
 if(mix.seedId){
  const seed=catalog.find(t=>t.id===mix.seedId);
  if(!seed)return [];
  const sameGenre=genreOf(seed) ? catalog.filter(t=>genreOf(t)===genreOf(seed)) : catalog.filter(t=>artistCredits(t.artist).some(name=>artistCredits(seed.artist).includes(name)));
  return sameGenre;
 }
 return [];
}

export function newReleases(catalog,{now=Date.now(),max=40,perArtist=2}={}) {
 const month=30*86400000;
 const date=t=>{const raw=t.albumReleaseDate||t.releaseDate||'';if(!raw||/^\d{4}$/.test(raw)||/^\d{4}-01-01$/.test(raw)&&!t.releaseDateVerified)return NaN;return Date.parse(raw);};
 const seen=new Map();
 return catalog.map(t=>({t,date:date(t)})).filter(e=>e.date>now-month&&e.date<=now)
  .sort((a,b)=>b.date-a.date||String(a.t.id).localeCompare(String(b.t.id))).filter(({t})=>{
   const first=canonical(artistCredits(t.artist)[0]);
   const count=seen.get(first)||0;
   if(count>=perArtist)return false;
   seen.set(first,count+1);return true;
  }).slice(0,max).map(x=>x.t);
}

export const chartPeriod = 10*60*1000;
export const chartHue = (now=Date.now())=>[183,281,9,208,329,151,35][Math.floor(now/chartPeriod)%7];
