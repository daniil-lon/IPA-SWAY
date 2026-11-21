import {readFile,readdir,writeFile} from 'node:fs/promises';
import {lyricLanguage} from '../public/music-language.js';
const catalog=JSON.parse(await readFile('public/catalog.json','utf8')),known=new Set(catalog.map(t=>t.id)),result={};
for(const file of (await readdir('lyrics_archive')).filter(f=>f.endsWith('.json')).sort()){
 const id=file.slice(0,-5);if(!known.has(id))continue;
 const data=JSON.parse(await readFile('lyrics_archive/'+file,'utf8'));
 const language=lyricLanguage(data.plain||data.lines?.map(l=>l.text).join('\n')||'');
 if(language)result[id]=language;
}
await writeFile('public/track-languages.json',JSON.stringify(result));
console.log('Lyrics-based language metadata:',Object.keys(result).length,'of',catalog.length,'tracks; unknown songs remain unclassified.');
