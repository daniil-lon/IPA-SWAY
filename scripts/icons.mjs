import {Resvg} from '@resvg/resvg-js';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const root=process.argv[2]||'public';
const svg=readFileSync(root+'/art/logo.svg','utf8');
const render=(source,width)=>new Resvg(source,{fitTo:{mode:'width',value:width}}).render().asPng();
const mask=svg.replace('rx="17"','');
for(const width of [180,192,512])writeFileSync(root+'/art/icon-'+width+'.png',render(mask,width));
const catalog=JSON.parse(readFileSync(root+'/catalog.json','utf8'));
mkdirSync(root+'/art/system',{recursive:true});
for(const path of new Set([...catalog.map(t=>t.art),'/art/commons.svg'])){
 const name=/^\/art\/([a-z0-9_-]+)\.svg$/i.exec(path)?.[1];
 if(name)writeFileSync(root+'/art/system/'+name+'.png',render(readFileSync(root+path,'utf8'),256));
}
