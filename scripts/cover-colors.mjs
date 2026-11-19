import {readFile,writeFile} from 'node:fs/promises';
import {Resvg} from '@resvg/resvg-js';

const file=new URL('../public/catalog.json',import.meta.url);
const catalog=JSON.parse(await readFile(file,'utf8')), cache=new Map(), seen=new Set();

function hueOf(r,g,b,max,delta){
 if(max===r)return ((g-b)/delta+6)%6*60;
 if(max===g)return ((b-r)/delta+2)*60;
 return ((r-g)/delta+4)*60;
}

function palette({pixels,width,height}){
 const bins=Array.from({length:24},()=>({w:0,x:0,y:0,s:0,l:0}));
 for(let i=0;i<pixels.length;i+=4){
  const r=pixels[i]/255,g=pixels[i+1]/255,b=pixels[i+2]/255,alpha=pixels[i+3]/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
  if(d<.04||l<.07||l>.94||alpha<.5)continue;
  const h=hueOf(r,g,b,max,d), a=h*Math.PI/180, s=d/(1-Math.abs(2*l-1));
  const x=(i/4%width+.5)/width-.5,y=(Math.floor(i/4/width)+.5)/height-.5;
  const w=alpha*(.36+d)*Math.sqrt(d)*(.65+l)*(1-Math.hypot(x,y)*.66);
  const bin=bins[Math.round(h/15)%24];
  bin.w+=w;bin.x+=Math.cos(a)*w;bin.y+=Math.sin(a)*w;bin.s+=s*w;bin.l+=l*w;
 }
 const smooth=bins.map((_,i)=>[bins[(i+23)%24],bins[i],bins[(i+1)%24]].reduce((a,b)=>({w:a.w+b.w,x:a.x+b.x,y:a.y+b.y,s:a.s+b.s,l:a.l+b.l}),{w:0,x:0,y:0,s:0,l:0}));
 const index=smooth.reduce((best,bin,i)=>bin.w>smooth[best].w?i:best,0), main=smooth[index];
 if(!main.w)return [268,22,24,291];
 const hue=bin=>Math.round((Math.atan2(bin.y,bin.x)*180/Math.PI+360)%360);
 const alternate=smooth.reduce((best,bin,i)=>Math.min((i-index+24)%24,(index-i+24)%24)>3&&bin.w>(smooth[best]?.w||0)?i:best,-1);
 const h=hue(main),s=Math.round(Math.min(.93,Math.max(.23,main.s/main.w))*100),l=Math.round(main.l/main.w*100);
 const accent=alternate>=0&&smooth[alternate].w>.27*main.w?hue(smooth[alternate]):(h+20)%360;
 return [h,s,l,accent];
}

for(const t of catalog){
 if(!cache.has(t.art)){
  const image=await readFile(new URL('../public'+t.art,import.meta.url));
  const sample=new Resvg(image,{fitTo:{mode:'width',value:48},font:{loadSystemFonts:false}}).render();
  cache.set(t.art,palette(sample));
 }
 const [h,s,l,a]=cache.get(t.art);
 let result=[h,s,l,a], shift=0;
 while(seen.has(result.join())){shift++;result=[(h+shift*3)%360,s,l,(a+shift*3)%360];}
 seen.add(result.join());t.palette=result;
}
await writeFile(file,JSON.stringify(catalog,null,2)+'\n','utf8');
console.log('Computed cover colors for '+catalog.length+' tracks');
