import {readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {accentGroup} from '../public/track-accents.js';

const all=JSON.parse(await readFile('public/wave-pulses.json','utf8'));
const groups=Array.from({length:512},()=>({}));
for(const [id,accents] of Object.entries(all))groups[parseInt(accentGroup(id),16)][id]=accents;
let maximum=0;
await Promise.all(groups.map(async(group,index)=>{
 const text=JSON.stringify(group);maximum=Math.max(maximum,gzipSync(text).length);
 await writeFile('public/wave-pulses-'+index.toString(16).padStart(3,'0')+'.json',text);
}));
await Promise.all((await readdir('public')).filter(name=>/^wave-pulses-[0-9a-f]{2}\.json$/.test(name)).map(name=>unlink('public/'+name)));
assert.ok(maximum<14000,'A beat group must fit inside a small compressed response');
console.log('Beat data: '+Object.keys(all).length+' songs in 512 groups; largest compressed group '+maximum+' bytes');
