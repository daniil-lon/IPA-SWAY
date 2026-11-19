// A small, reproducible script-based heuristic; this is not a speech detector.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'public/catalog.json'),'utf8'));
const result={},counts={ru:0,en:0,mixed:0,unknown:0};let synced=0;
for(const track of catalog){
 try{
  const data=JSON.parse(fs.readFileSync(path.join(root,'lyrics_archive',track.id+'.json'),'utf8'));
  const text=String(data.plain||data.plainLyrics||data.text||data.synced||'').replace(/\[[^\]]*\]/g,'');
  const ru=(text.match(/[а-яё]/gi)||[]).length,en=(text.match(/[a-z]/gi)||[]).length;
  if(ru+en<30){counts.unknown++;continue;}
  const language=ru/(ru+en)>.7?'ru':en/(ru+en)>.7?'en':'mixed';result[track.id]=language;counts[language]++;
  if(data.lines?.length||data.synced) synced++;
 }catch{counts.unknown++;}
}
fs.writeFileSync(path.join(root,'desktop/ui/language-index.json'),JSON.stringify(result));
console.log(JSON.stringify({counts,synced}));
