import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const baseArg=process.argv.indexOf('--base'),destination=resolve('artifacts/sway-live-catalog-'+Date.now()),base=(baseArg>=0?process.argv[baseArg+1]:'https://music.academmix.ru').replace(/\/$/,'');
const files=['catalog.json','albums.json','artists.json','wave-pulses.json','track-moods.json','chart.json'];
const browser=await chromium.launch({channel:'msedge'});
try{
 const page=await browser.newPage();await page.goto(base+'/api/health');await mkdir(destination,{recursive:true});
 const values=await page.evaluate(async files=>Promise.all(files.map(async file=>{
  const response=await fetch('/'+file,{cache:'reload'});if(!response.ok)throw new Error(file+': '+response.status);return {file,text:await response.text()};
 })),files);
 const hashes={};for(const {file,text} of values){JSON.parse(text);await writeFile(join(destination,file),text);hashes[file]=createHash('sha256').update(text).digest('hex');}
 const tracks=JSON.parse(values.find(v=>v.file==='catalog.json').text);
 const result={destination,tracks:tracks.length,hashes,capturedAt:new Date().toISOString()};
 await writeFile('artifacts/sway-live-catalog.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
