import {createServer} from 'node:http';
import {createReadStream,statSync} from 'node:fs';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';

const file=process.argv[2],exact=process.argv.slice(3).map(Number);
if(!file)throw new Error('Pass a local reference video.');
const size=statSync(file).size,output=await mkdtemp(join(tmpdir(),'sway-motion-'));
const server=createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<video src="/reference.mp4" muted preload="auto"></video>');return;}
 if(req.url!=='/reference.mp4'){res.writeHead(404);res.end();return;}
 const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
 const start=range?Number(range[1]):0,end=range?.[2]?Math.min(Number(range[2]),size-1):size-1;
 if(start>=size){res.writeHead(416,{'content-range':'bytes */'+size});res.end();return;}
 const headers={'content-type':'video/mp4','accept-ranges':'bytes','content-length':end-start+1};
 if(range)headers['content-range']='bytes '+start+'-'+end+'/'+size;
 res.writeHead(range?206:200,headers);createReadStream(file,{start,end}).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge'});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
 const meta=await page.locator('video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));
 const times=exact.length?exact:Array.from({length:20},(_,i)=>i/19*(meta.duration-.15));
 const data=await page.locator('video').evaluate(async(v,times)=>{
  const columns=times.length===1?1:4,w=times.length===1?588:248,h=Math.round(w*v.videoHeight/v.videoWidth),canvas=document.createElement('canvas');
  canvas.width=columns*w;canvas.height=Math.ceil(times.length/columns)*(h+24);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#111';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let i=0;i<times.length;i++){
   const t=Math.max(0,Math.min(v.duration-.08,times[i]));
   if(Math.abs(v.currentTime-t)>.001)await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=t;});
   const x=i%columns*w,y=Math.floor(i/columns)*(h+24);ctx.drawImage(v,x,y,w,h);ctx.fillStyle='#fff';ctx.font='14px sans-serif';ctx.fillText(t.toFixed(2)+'s',x+6,y+h+17);
  }
  return canvas.toDataURL('image/png').split(',')[1];
 },times);
 const path=join(output,'frames.png');await writeFile(path,Buffer.from(data,'base64'));
 console.log(JSON.stringify({...meta,output,path,times}));
}finally{await browser.close();server.close();}
