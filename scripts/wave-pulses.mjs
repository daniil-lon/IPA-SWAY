import {createServer} from 'node:http';
import {readFileSync,createReadStream,writeFileSync,existsSync} from 'node:fs';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

// Decode the shipped records once. The player can follow the resulting timing
// during playback and seeks without reading or rerouting the media stream.
const args=process.argv.slice(2);
const missingOnly=args.includes('--missing');
const directory=args.find(arg=>arg!=='--missing');
const assets=directory?pathToFileURL(resolve(directory)+'/'):new URL('../public/',import.meta.url);
const catalog=JSON.parse(readFileSync(new URL('catalog.json',assets)));
const output=new URL('wave-pulses.json',assets);
const previous=missingOnly&&existsSync(output)?JSON.parse(readFileSync(output)):null;
const sources=new Map(catalog.map(t=>[t.audio,new URL(t.audio.slice(1),assets)]));
const server=createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<title>Tonika — audio analysis</title>');return;}
 const source=sources.get(req.url);
 if(!source){res.writeHead(404).end();return;}
 res.setHeader('Content-Type','audio/mpeg');createReadStream(source).pipe(res);
});
server.listen(0,'127.0.0.1');await once(server,'listening');
let browser;
try{
 browser=await chromium.launch({channel:process.env.TONIKA_BROWSER||'msedge'});
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:'+server.address().port);
 const timings={};
 for(const track of catalog){
  if(previous&&Array.isArray(previous[track.id])){timings[track.id]=previous[track.id];continue;}
  const events=await page.evaluate(async url=>{
   const data=await (await fetch(url)).arrayBuffer();
   const rate=11025, step=Math.round(rate/100), ctx=new OfflineAudioContext(1,1,rate);
   const track=await ctx.decodeAudioData(data);
   const left=track.getChannelData(0),right=track.numberOfChannels>1?track.getChannelData(1):left;
   const coeff=hz=>1-Math.exp(-2*Math.PI*hz/rate);
   const a=coeff(151),b=coeff(43),c=coeff(1400);
   const bass=[],mid=[];
   let low=0,sub=0,mellow=0;
   for(let i=0;i<left.length;i+=step){
    let bassPower=0,midPower=0;
    for(let k=i;k<Math.min(i+step,left.length);k++){
     const v=(left[k]+right[k])*.5;
     low+=a*(v-low);sub+=b*(v-sub);mellow+=c*(v-mellow);
     bassPower+=(low-sub)**2;midPower+=(mellow-low)**2;
    }
    bass.push(Math.log1p(55*Math.sqrt(bassPower/step)));
    mid.push(Math.log1p(34*Math.sqrt(midPower/step)));
   }
   const previous=(values,i)=>(values[i-4]+values[i-3]+values[i-2]+values[i-1])*.25;
   const flux=bass.map((value,i)=>i<4?0:Math.max(0,value-previous(bass,i))*.78+Math.max(0,mid[i]-previous(mid,i))*.32);
   let baseline=.018;
   const attacks=[];
   for(let i=4;i<flux.length-3;i++){
    const v=flux[i], recent=attacks.at(-1);
    baseline+=.034*(Math.min(v,baseline*2+.12)-baseline);
    if(v<Math.max(.04,baseline*2.2)||v<=flux[i-1]||v<flux[i+1]||bass[i]+mid[i]<.16)continue;
    const strength=v/(baseline+.09);
    if(!recent||i-recent[0]>=19)attacks.push([i,strength]);
    else if(strength>recent[1]*1.12)attacks[attacks.length-1]=[i,strength];
   }
   const strengths=attacks.map(p=>p[1]).sort((a,b)=>a-b);
   const scale=Math.max(.57,strengths[Math.floor(strengths.length*.82)]||1);
   return attacks.flatMap(([i,v])=>[Math.round(i*step/rate*100),Math.round(24+70*Math.min(1.08,v/scale))]);
  },track.audio);
  timings[track.id]=events;
  console.log(track.id+': '+events.length/2+' audio accents');
 }
 writeFileSync(output,JSON.stringify(timings)+'\n');
}finally{await browser?.close();server.close();}
