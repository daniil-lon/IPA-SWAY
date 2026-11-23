// "Мои итоги" as a 1080×1920 story picture in the Sway palette: minutes, top track cover, top artists.
const font=(weight,size)=>`${weight} ${size}px -apple-system,"SF Pro Display",system-ui,"Segoe UI",sans-serif`;
const loadImage=src=>new Promise(resolve=>{if(!src)return resolve(null);const img=new Image();img.decoding='async';img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=src;});
function fitText(ctx,text,max){
 let value=String(text||'');if(ctx.measureText(value).width<=max)return value;
 while(value.length>1&&ctx.measureText(value+'…').width>max)value=value.slice(0,-1);
 return value+'…';
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
export async function createRecapStory(data,periodLabel){
 const c=document.createElement('canvas');c.width=1080;c.height=1920;
 const ctx=c.getContext('2d');if(!ctx)return null;
 ctx.fillStyle='#0b0a10';ctx.fillRect(0,0,1080,1920);
 for(const [x,y,r,color] of [[860,360,700,'#ff1fd855'],[160,1500,760,'#ff8a0040'],[120,180,520,'#ffe60022']]){
  const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(0,0,1080,1920);
 }
 const burst=ctx.createLinearGradient(90,0,990,0);burst.addColorStop(0,'#ffe600');burst.addColorStop(.5,'#ff8a00');burst.addColorStop(1,'#ff1fd8');
 const top=data.tracks?.[0]?.track,[logo,cover]=await Promise.all([loadImage('/art/icon-512.png'),loadImage(top?.art)]);
 if(logo){ctx.save();roundRect(ctx,90,110,84,84,20);ctx.clip();ctx.drawImage(logo,90,110,84,84);ctx.restore();}
 ctx.fillStyle='#fff';ctx.font=font(800,48);ctx.fillText('Sway',196,168);
 ctx.fillStyle='#c9c3d4';ctx.font=font(600,40);ctx.fillText('Мои итоги · '+periodLabel,90,300);
 ctx.fillStyle=burst;ctx.font=font(900,230);ctx.fillText(String(Math.floor((data.seconds||0)/60)),82,520);
 ctx.fillStyle='#fff';ctx.font=font(700,56);ctx.fillText('минут музыки',90,600);
 ctx.fillStyle='#c9c3d4';ctx.font=font(600,38);ctx.fillText((data.plays||0)+' прослушиваний · '+(data.discoveries||0)+' новых треков',90,672);
 let y=780;
 if(top){
  ctx.fillStyle='#ffffff12';roundRect(ctx,90,y,900,260,40);ctx.fill();
  if(cover){ctx.save();roundRect(ctx,120,y+30,200,200,26);ctx.clip();ctx.drawImage(cover,120,y+30,200,200);ctx.restore();}
  const tx=cover?352:130;
  ctx.fillStyle='#ffe600';ctx.font=font(700,30);ctx.fillText('НА ПОВТОРЕ',tx,y+88);
  ctx.fillStyle='#fff';ctx.font=font(800,50);ctx.fillText(fitText(ctx,top.title,960-tx),tx,y+150);
  ctx.fillStyle='#c9c3d4';ctx.font=font(600,36);ctx.fillText(fitText(ctx,top.artist,960-tx),tx,y+202);
  y+=330;
 }
 const artists=(data.artists||[]).slice(0,5);
 if(artists.length){
  ctx.fillStyle='#fff';ctx.font=font(800,52);ctx.fillText('Любимые исполнители',90,y);y+=40;
  artists.forEach((a,i)=>{
   const row=y+i*96;
   ctx.fillStyle=i?'#ffffff1f':burst;ctx.beginPath();ctx.arc(126,row+44,34,0,Math.PI*2);ctx.fill();
   ctx.fillStyle=i?'#fff':'#111';ctx.font=font(800,34);ctx.textAlign='center';ctx.fillText(String(i+1),126,row+56);ctx.textAlign='left';
   ctx.fillStyle='#fff';ctx.font=font(700,42);ctx.fillText(fitText(ctx,a.name,620),186,row+58);
   ctx.fillStyle='#c9c3d4';ctx.font=font(600,34);ctx.textAlign='right';ctx.fillText(Math.floor(a.seconds/60)+' мин',990,row+58);ctx.textAlign='left';
  });
 }
 ctx.fillStyle='#ffe600';roundRect(ctx,90,1720,900,110,55);ctx.fill();
 ctx.fillStyle='#111';ctx.font=font(800,44);ctx.textAlign='center';ctx.fillText('Слушай со мной · music.academmix.ru',540,1790);ctx.textAlign='left';
 return new Promise(resolve=>c.toBlob(resolve,'image/png'));
}
