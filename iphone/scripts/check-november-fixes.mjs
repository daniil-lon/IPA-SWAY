import assert from 'node:assert/strict';
import {relatedMix} from '../public/wave.js';
import {applyWaveFiltersToPool} from '../public/wave-filters.js';

const tracks=[
 {id:'seed',title:'Wake Up',artist:'Русский артист',genre:'Рэп',moods:['bright'],language:'ru'},
 {id:'similar',title:'Holiday',artist:'Другой',genre:'Рэп',moods:['bright'],language:'ru'},
 {id:'foreign',title:'Привет',artist:'Foreign',genre:'Рэп',moods:['bright'],language:'en'},
 {id:'unknown',title:'Название',artist:'Имя',genre:'Рэп',moods:[]},
 {id:'rock',title:'Rock',artist:'Band',genre:'Рок',moods:['calm'],language:'en'}
];
const radio=relatedMix(tracks,tracks[0],{random:()=>.5});
assert.ok(radio.length,'Related tracks should be found');
assert.ok(!radio.some(t=>t.id==='seed'),'A track radio must never restart its seed');
assert.equal(radio[0].id,'similar','Musical similarity should lead the radio');
assert.deepEqual(applyWaveFiltersToPool(tracks,{language:'ru'}).map(t=>t.id),['seed','similar'],'Language follows content metadata, not the spelling of a title or artist');
assert.deepEqual(applyWaveFiltersToPool(tracks,{language:'en'}).map(t=>t.id),['foreign','rock'],'Unknown-language songs must not leak into a strict language filter');
console.log('PASS: radio excludes seed, ranks similarity, and filters actual song language');

import {artistRadio,similarArtists,latestRelease,releaseTimestamp} from '../public/music-intelligence.js';
import {lyricLanguage} from '../public/music-language.js';
assert.ok(!relatedMix(tracks,{...tracks[0],id:'alias',canonicalId:'seed'}).some(t=>t.id==='seed'));
const artist={name:'Русский артист',items:[tracks[0]]},collab={...tracks[1],id:'collab',artist:'Другой, Русский артист'};
assert.ok(!artistRadio([...tracks,collab],artist).some(t=>['seed','collab'].includes(t.id)));
assert.equal(similarArtists(artist,[artist,{name:'Band',items:[tracks[4]]},{name:'Другой',items:[tracks[1]]}])[0].name,'Другой');
assert.equal(lyricLanguage('Я люблю эту музыку, она всегда рядом со мной и помогает мне мечтать.'),'ru');
assert.equal(lyricLanguage('This recording has an English title and a full verse in English.'),'en');
assert.equal(lyricLanguage('Це українська пісня, яка завжди поруч зі мною і допомагає мені мріяти.'),'foreign');
assert.deepEqual(applyWaveFiltersToPool(tracks,{language:'ru',character:'favorite'},{likes:new Set(['foreign'])}),[]);
assert.equal(releaseTimestamp({releaseDate:'2026-01-01'}),0);
const now=Date.parse('2026-11-21'),fresh={releaseDate:'2026-11-20'},future={releaseDate:'2026-11-22'};
assert.equal(latestRelease([fresh,future,{releaseDate:'2026'}],now),fresh);
console.log('PASS: canonical seed, collaboration exclusion, artist similarity, unknown language, strict filters, real release dates');
