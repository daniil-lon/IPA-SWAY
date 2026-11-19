import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

export const toneRates=[60,2400];
const sampleRate=48000, length=26*sampleRate;
const wave=Buffer.alloc(44+2*length);
wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);
wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);
wave.writeUInt32LE(sampleRate,24);wave.writeUInt32LE(2*sampleRate,28);
wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);
wave.write('data',36);wave.writeUInt32LE(wave.length-44,40);
for(let i=0;i<length;i++)wave.writeInt16LE(Math.round(3200*toneRates.reduce((v,hz)=>v+Math.sin(2*Math.PI*hz*i/sampleRate),0)),44+2*i);
export const track={id:'test-audio',title:'Тестовый тон',artist:'Sway',genre:'Эмбиент',seconds:26,audio:'/test-tone.wav',art:'/art/mood-focus.svg',moods:['focus'],palette:[174,66,34,160]};
export const nextTrack={...track,id:'test-next',title:'Следующий тон',artist:'Sway Studio',audio:'/test-next.wav',art:'/art/mood-bright.svg',palette:[338,58,41,329]};

const root=new URL('../public/',import.meta.url);
const types={js:'text/javascript',html:'text/html; charset=utf-8',css:'text/css',json:'application/json',svg:'image/svg+xml',png:'image/png',webmanifest:'application/manifest+json'};
export async function servePlayer({catalog=[track,nextTrack],handler}={}){
 const server=createServer(async(req,res)=>{
  const {pathname}=new URL(req.url,'http://localhost');
  if(handler&&await handler(req,res,pathname))return;
  if(pathname===track.audio||pathname===nextTrack.audio||pathname==='/media/test-tone.wav'||pathname==='/media/test-next.wav'){
   const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
   const start=range?+range[1]:0, end=range&&range[2]?Math.min(+range[2],wave.length-1):wave.length-1;
   if(start>=wave.length){res.writeHead(416,{'content-range':'bytes */'+wave.length});return res.end();}
   const headers={'content-type':'audio/wav','accept-ranges':'bytes','content-length':end-start+1};
   if(range)headers['content-range']=`bytes ${start}-${end}/${wave.length}`;
   res.writeHead(range?206:200,headers);return res.end(req.method==='HEAD'?undefined:wave.subarray(start,end+1));
  }
  const json={'/api/me':{user:null,likes:[],loginConfigured:true,loginRequired:false},'/catalog.json':catalog,'/chart.json':[],'/api/chart':{items:[]},'/track-moods.json':{},'/wave-pulses.json':{}};
  if(Object.hasOwn(json,pathname)){
   res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(json[pathname]));
  }
  try{
   const href=new URL(pathname==='/'?'index.html':'.'+pathname,root);
   if(!href.href.startsWith(root.href))throw new Error('Unexpected fixture path');
   const body=await readFile(href);
   res.writeHead(200,{'content-type':types[pathname==='/'?'html':pathname.split('.').at(-1)]||'application/octet-stream'});res.end(body);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,origin:'http://127.0.0.1:'+server.address().port};
}
