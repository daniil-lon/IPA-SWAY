import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {artistCredits,chartHue,chartPeriod,genreOf,newReleases,tagCatalog,tracksInMix} from '../public/discovery.js';
import {relatedMix} from '../public/wave.js';
import {readChart,recordChartListen} from '../chart-store.mjs';

const catalog=[
 {id:'p',genre:'Поп',artist:'Дора',moods:['bright','focus'],createdAt:undefined},
 {id:'a',genre:'Hip Hop',artist:'A',moods:['focus']},
 {id:'b',genre:'Рэп / Хип-хоп',artist:'A, B',moods:['bright']},
 {id:'c',genre:'Джаз',artist:'C',moods:['calm']},
];
const tagged=tagCatalog(catalog,{p:{moods:['night'],palette:[11,20,25,41]}});
const imported=tagCatalog([{id:'bulk',cover:'/art/cover.jpg',album:'Альбом',explicit:true,palette:{accent:'#7c5cff'}}],{});
assert.equal(imported[0].art,'/art/cover.jpg');assert.equal(imported[0].albumTitle,'Альбом');assert.equal(imported[0].isExplicit,true);
assert.equal(imported[0].palette.length,4);assert.ok(imported[0].palette.every(Number.isFinite));assert.deepEqual(imported[0].moods,[]);
assert.deepEqual(tagged[0].moods,['night']);
assert.deepEqual(tagged[0].palette,[11,20,25,41]);
assert.deepEqual(artistCredits('Дора, Мэйби Бэйби feat. OG Buda'),['Дора','Мэйби Бэйби','OG Buda']);
assert.deepEqual(tracksInMix(tagged,{mood:'focus'}).map(t=>t.id),['a']);
assert.deepEqual(tracksInMix(tagged,{genre:genreOf(catalog[1])}).map(t=>t.id),['a','b']);
assert.deepEqual(relatedMix(tagged,tagged[1]).map(t=>t.id),['a','b']);
const now=Date.now();
assert.deepEqual(newReleases(tagged.map((t,i)=>({...t,createdAt:i===3?null:Math.floor(now/1000)-i})),{now,perArtist:1}).map(t=>t.id),['p','a']);
assert.notEqual(chartHue(now),chartHue(now+chartPeriod));

const sqlite=new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for(const script of ['0001_accounts.sql','0006_chart_and_crossfade.sql'])sqlite.exec(await readFile(new URL('../migrations/'+script,import.meta.url),'utf8'));
const db={prepare:(query)=>({bind:(...args)=>({all:async()=>({results:sqlite.prepare(query).all(...args).map(x=>({...x}))}),run:async()=>sqlite.prepare(query).run(...args)})})};
sqlite.exec("INSERT INTO users(id,name) VALUES ('one','One'),('two','Two'),('three','Three'); INSERT INTO likes (uid,track) VALUES ('one','a'),('two','a'),('two','expired'),('three','expired')");
await recordChartListen(db,'one','b');
await recordChartListen(db,'one','b');
await recordChartListen(db,'two','b');
await recordChartListen(db,'three','a');
const day=Math.floor(Date.now()/86400000);
sqlite.prepare('INSERT INTO chart_listens VALUES (?,?,?)').run(day-35,'c','one');
const active=new Set(['a','b','c']);
assert.deepEqual(await readChart(db,active),[{id:'a',plays:1,likes:2},{id:'b',plays:2,likes:0}]);
sqlite.exec("DELETE FROM users WHERE id='three'");
assert.equal((await readChart(db,active))[0].plays,0);
sqlite.close();
console.log('PASS strict sets, release grouping, rotating chart hue, real ranking, deduplication and deletion cascade');
