import {songLanguage} from './music-language.js';

const families={rap:/рэп|хип|rap|hip|дрилл/iu,pop:/поп|pop/iu,rock:/рок|rock/iu,indie:/инди|indie/iu,dance:/танцев|электр|edm|dance/iu,rnb:/r&b|соул|soul/iu};
// A station is a catalog query, not a renamed copy of the general wave.
// Only stations with enough available recordings enter the carousel.
export const waveStations=[
 {key:'focus',title:'Для фокуса',moods:['focus'],emblem:'rap',color:'focus',palette:[171,94,43,186]},
 {key:'rap-bright',title:'Рэп для хорошего настроения',families:['rap'],moods:['bright'],emblem:'rap',color:'bright',palette:[207,95,48,221]},
 {key:'date',title:'Красивые песни для свидания',families:['pop','rnb','indie'],moods:['calm','night'],emblem:'flower',color:'night',palette:[302,96,47,329]},
 {key:'calm',title:'Спокойно',moods:['calm'],emblem:'night',color:'calm',palette:[334,94,45,356]},
 {key:'dance',title:'Танцевальная',families:['dance'],emblem:'party',color:'focus',palette:[173,95,45,193]},
 {key:'light',title:'Легче',families:['pop','indie'],moods:['bright'],emblem:'night',color:'night',palette:[264,95,52,288]},
 {key:'alternative',title:'Альтернатива, не как у всех',families:['rock','indie'],emblem:'bolt',color:'calm',palette:[318,96,47,340]},
 {key:'night',title:'После полуночи',moods:['night'],emblem:'night',color:'bright',palette:[227,94,45,253]},
 {key:'rock',title:'Рок',families:['rock'],emblem:'bolt',color:'focus',palette:[177,98,45,192]},
 {key:'russian-rock',title:'Русский рок',families:['rock'],language:'ru',emblem:'bolt',color:'night',palette:[265,96,50,288]},
 {key:'english-rock',title:'Рок на английском',families:['rock'],language:'en',emblem:'bolt',color:'calm',palette:[322,96,48,343]},
 {key:'indie',title:'Инди',families:['indie'],emblem:'flower',color:'calm',palette:[317,98,48,336]},
 {key:'russian-pop',title:'Это русский поп',families:['pop'],language:'ru',emblem:'flower',color:'calm',palette:[323,96,49,346]},
 {key:'english-pop',title:'Поп на английском',families:['pop'],language:'en',emblem:'flower',color:'bright',palette:[224,94,50,246]},
 {key:'rap',title:'Рэп / Хип-хоп',families:['rap'],emblem:'rap',color:'bright',palette:[202,94,47,222]},
 {key:'russian-rap',title:'Русский рэп',families:['rap'],language:'ru',emblem:'rap',color:'focus',palette:[167,95,43,187]},
 {key:'english-rap',title:'Хип-хоп на английском',families:['rap'],language:'en',emblem:'rap',color:'calm',palette:[338,95,45,12]},
 {key:'rnb',title:'R&B и соул',families:['rnb'],emblem:'flower',color:'night',palette:[279,96,47,310]},
 {key:'workout',title:'На тренировку',moods:['bright'],families:['rap','rock','dance'],emblem:'bolt',color:'calm',palette:[343,96,47,12]},
 {key:'drive',title:'В дороге',moods:['bright','focus'],families:['pop','rock','rap'],emblem:'party',color:'bright',palette:[216,95,48,237]},
 {key:'rain',title:'За окном дождь',moods:['calm','night'],families:['indie','pop'],emblem:'night',color:'focus',palette:[188,94,40,212]},
 {key:'bright',title:'Бодрое',moods:['bright'],emblem:'party',color:'calm',palette:[31,96,49,349]}
];
const byKey=new Map(waveStations.map(station=>[station.key,station]));
export function stationTracks(catalog,key){
 const station=byKey.get(key);if(!station)return [];
 return catalog.filter(track=>(!station.families||station.families.some(family=>families[family].test(track.genre||'')))&&
  (!station.moods||station.moods.some(mood=>track.moods?.includes(mood)))&&
  (!station.language||songLanguage(track)===station.language));
}
export function availableStations(catalog){return waveStations.filter(station=>stationTracks(catalog,station.key).length>=3);}
