import {normalizeWaveMark} from './wave-mark.js';

const idle=[187,57,42,246];
export const wavePatterns=[['ribbons','Ленты'],['tide','Капли'],['halos','Искры'],['prism','Линза'],['petals','Свой знак']];
const safePattern=id=>id==='bloom'||wavePatterns.some(([key])=>key===id)?id:'ribbons';
// Offset, slope, curl, width, phase. All shapes are generated; none are image overlays.
const bands=[
 [-.10,-.36,.22,.158,1.78],
 [ .13, .30,.17,.100,4.15],
 [ .02,-.24,.25,.123,.62]
];
const clamp=(number,low,high)=>Math.max(low,Math.min(high,number));
const hueDelta=(start,end)=>((end-start+540)%360+360)%360-180;
const color=(h,s,l,a)=>'hsl('+h+' '+s+'% '+l+'% / '+clamp(a,0,1)+')';
const ease=value=>value*value*(3-2*value);
let timings={}, pulseLoad;
export const getTrackAccents=id=>timings[id];

export function sampleAccent(events,seconds){
 if(!events?.length||!Number.isFinite(seconds))return 0;
 const clock=seconds*100+3.0;
 let lo=0,hi=events.length/2;
 while(lo<hi){
  const mid=(lo+hi)>>>1;
  if(events[mid*2]>clock)hi=mid;else lo=mid+1;
 }
 let value=0;
 for(let j=lo-1;j>=0;j--){
  const offset=(clock-events[j*2])/100;
  if(offset>.36)break;
  const swell=offset<.058?ease(offset/.058):1-ease((offset-.058)/.302);
  value=Math.max(value,swell*events[j*2+1]*.01);
 }
 return value;
}
function loadPulses(){
 pulseLoad??=fetch('/wave-pulses.json').then(response=>{
  if(!response.ok)throw new Error('Pulse data unavailable');
  return response.json();
 }).then(data=>{timings=data;}).catch(()=>{pulseLoad=null;});
}

function glassBand(ctx,w,h,phase,palette,beat,band){
 const [offset,tilt,curl,width,seed]=band, [hue,sat,,accent]=palette;
 const unit=Math.min(w,h), steps=38, t=phase+seed, alpha=ctx.globalAlpha;
 const curve=[];
 for(let i=0;i<=steps;i++){
  const u=i/steps, q=u*1.46-.23;
  const x=w*q, shift=Math.sin(t*.48)*.074;
  const turn=q*5.9+t*.89;
  const y=h*(.43+offset+tilt*(q-.5)+shift)+unit*(curl*Math.sin(turn)+.065*Math.sin(q*10.1-t*.64));
  const angle=q*6.6-t*.82;
  const depth=.36+.64*Math.abs(Math.cos(angle));
  const spread=unit*width*depth*(1+.10*Math.sin(t+q*7)+beat*.17);
  curve.push([x,y-spread,y+spread]);
 }
 const trace=(edge,reverse=false)=>{
  const at=i=>{const [x,a,b]=curve[reverse?steps-i:i];return [x,a+(b-a)*edge];};
  const first=at(0);
  if(reverse)ctx.lineTo(...first);else ctx.moveTo(...first);
  for(let i=1;i<steps;i++){
   const [x,y]=at(i), [nx,ny]=at(i+1);
   ctx.quadraticCurveTo(x,y,(x+nx)/2,(y+ny)/2);
  }
  ctx.lineTo(...at(steps));
 };
 ctx.beginPath();trace(0);trace(1,true);ctx.closePath();
 const fill=ctx.createLinearGradient(-w*.12,h*.08,w,h*.78);
 fill.addColorStop(0,color(accent,sat,61,.03));
 fill.addColorStop(.23,color(accent,sat,74,.18));
 fill.addColorStop(.43,color(hue,sat,67,.09));
 fill.addColorStop(.64,color(hue,sat,64,.24+beat*.06));
 fill.addColorStop(.84,color(accent,sat,68,.22));
 fill.addColorStop(1,color(accent,sat,57,.06));
 ctx.fillStyle=fill;ctx.fill();

 // The thin reflections follow the curved thickness rather than moving independently of it.
 const glint=(Math.sin(t*.44-.7)+1)*.28+.19;
 const edge=ctx.createLinearGradient(0,0,w,0);
 edge.addColorStop(0,color(hue,sat,78,.07));
 edge.addColorStop(Math.max(.04,glint-.16),color(accent,sat,81,.27));
 edge.addColorStop(glint,color(hue,clamp(sat+20,45,88),92,.77+beat*.13));
 edge.addColorStop(Math.min(.96,glint+.17),color(accent,sat,80,.28));
 edge.addColorStop(1,color(hue,sat,75,.08));
 for(const [offset,opacity,line] of [[0,.16,unit*.024],[0,.80,unit*.0042],[.061,.40,unit*.0026],[.96,.40,unit*.005],[.986,.70,unit*.0027]]){
  ctx.globalAlpha=alpha*opacity;ctx.strokeStyle=edge;ctx.lineWidth=Math.max(.65,line);
  ctx.beginPath();trace(offset);ctx.stroke();
 }
 ctx.globalAlpha=alpha;
}
function paintAtmosphere(ctx,w,h,phase,colors,beat,playingMix){
 const [hue,sat,,accent]=colors, radius=Math.min(w,h)*.68;
 for(const [x,y,tone,t] of [[.29,.35,hue,phase*.55],[.76,.38,accent,phase*.49+1.9]]){
  const cx=w*(x+.12*Math.sin(t)),cy=h*(y+.078*Math.cos(t));
  const ambient=ctx.createRadialGradient(cx,cy,0,cx,cy,radius);
  ambient.addColorStop(0,color(tone,sat,48,.20+playingMix*.065+beat*.06));
  ambient.addColorStop(.38,color(tone,sat,46,.14));
  ambient.addColorStop(1,color(tone,sat,44,0));
  ctx.fillStyle=ambient;ctx.fillRect(0,0,w,h);
 }
}
function glow(ctx,w,h,x,y,r,stops){
 const fill=ctx.createRadialGradient(x,y,0,x,y,r);
 for(const [offset,shade] of stops)fill.addColorStop(offset,shade);
 ctx.fillStyle=fill;ctx.fillRect(0,0,w,h);
}
// A closed, warped contour gives the light a soft edge that can fold over itself.
function caustic(ctx,x,y,rx,ry,t,seed,strength,soft=false){
 const steps=44, points=[];
 for(let i=0;i<steps;i++){
  const q=2*Math.PI*i/steps;
  const r=1+(soft?.20:.27)*Math.sin(3*q+t*1.6+seed)+(soft?.08:.15)*Math.cos((soft?4:5)*q-t*.88);
  points.push([x+rx*(r*Math.cos(q)+.13*Math.sin(2*q+t)),y+ry*(r*Math.sin(q)+.12*Math.cos(2*q-t))]);
 }
 ctx.beginPath();
 const end=points.at(-1),first=points[0];
 ctx.moveTo((end[0]+first[0])/2,(end[1]+first[1])/2);
 for(let i=0;i<steps;i++){
  const [ax,ay]=points[i],[bx,by]=points[(i+1)%steps];
  ctx.quadraticCurveTo(ax,ay,(ax+bx)/2,(ay+by)/2);
 }
 ctx.closePath();
 const width=rx*.11, alpha=ctx.globalAlpha;
 for(const [factor,opacity] of [[1.7,.06],[1,.14],[.43,.24],[.115,.71]]){
  ctx.globalAlpha=alpha*opacity*strength;ctx.lineWidth=Math.max(.7,width*factor);ctx.stroke();
 }
 ctx.globalAlpha=alpha;
}
function lightSurface(ctx,x,y,rx,ry,time,seed,hue,sat,accent,strength){
 const points=[],turn=.11*Math.sin(time*.19+seed),steps=76;
 for(let i=0;i<steps;i++){
  const q=i/steps*Math.PI*2,r=1+.24*Math.sin(q*3+time*.56+seed)+.13*Math.cos(q*2-time*.41+seed)+.08*Math.sin(q*5+time*.29);
  const px=r*Math.cos(q)+.17*Math.sin(q*2-time*.36)+.11*Math.cos(q*3+time*.48+seed),py=r*Math.sin(q)+.17*Math.cos(q*3+time*.22)+.08*Math.sin(q*4-time*.5);
  points.push([x+rx*(px*Math.cos(turn)-py*Math.sin(turn)),y+ry*(px*Math.sin(turn)+py*Math.cos(turn))]);
 }
 const trace=()=>{
  ctx.beginPath();const last=points.at(-1),first=points[0];ctx.moveTo((last[0]+first[0])/2,(last[1]+first[1])/2);
  for(let i=0;i<steps;i++){const a=points[i],b=points[(i+1)%steps];ctx.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);}ctx.closePath();
 };
 ctx.save();ctx.globalAlpha*=strength;trace();
 const glass=ctx.createLinearGradient(x-rx,y-ry,x+rx*.7,y+ry);
 glass.addColorStop(0,color(hue,sat,61,.08));glass.addColorStop(.35,color(hue,sat,52,.19));glass.addColorStop(.66,color(accent,sat,30,.12));glass.addColorStop(1,color(hue,sat,44,.03));ctx.fillStyle=glass;ctx.fill();
 const edge=ctx.createLinearGradient(x-rx,y-ry,x+rx,y+ry);
 edge.addColorStop(0,color(hue,sat,73,.07));edge.addColorStop(.3,color(hue,sat,80,.75));edge.addColorStop(.57,color(accent,sat,65,.26));edge.addColorStop(.83,color(hue,sat,77,.52));edge.addColorStop(1,color(accent,sat,65,0));ctx.strokeStyle=edge;
 for(const [width,blur,opacity] of [[rx*.18,rx*.07,.12],[rx*.055,rx*.027,.31],[rx*.012,rx*.009,.52]]){
  ctx.save();ctx.globalAlpha*=opacity;ctx.filter='blur('+Math.max(1,blur)+'px)';ctx.lineWidth=width;trace();ctx.stroke();ctx.restore();
 }
 trace();ctx.clip();
 for(let i=0;i<3;i++){
  const bend=Math.sin(time*.54+seed+i)*ry*.36,curl=Math.cos(time*.44+i)*rx*.35;
  ctx.save();ctx.filter='blur('+Math.max(3,rx*.023)+'px)';ctx.globalAlpha*=i===1?.27:.17;ctx.lineWidth=rx*.035;ctx.strokeStyle=edge;
  ctx.beginPath();ctx.moveTo(x-rx*1.1,y+ry*(i*.47-.8));ctx.bezierCurveTo(x+curl,y+bend-ry*.95,x-rx*.45,y-bend+ry*.82,x+rx*.57,y+ry*(i*.39-.1));ctx.bezierCurveTo(x+rx*.9,y-ry*.3-bend,x-rx*.1,y-ry*.5,x+rx*1.2,y+ry*.76);ctx.stroke();ctx.restore();
 }
 ctx.restore();
}
function paintWaveBloom(ctx,w,h,t,[hue,sat,,accent],beat,mix,started){
 // Slate-blue light retains a quiet tint from the artwork.
 hue+=hueDelta(hue,216)*.72;accent+=hueDelta(accent,224)*.72;sat=clamp(sat*.43,24,37);
 const unit=Math.min(w,h*.76), x=w*.5, y=h*.29;
 // Keep the moving caustics behind the content while color changes at the same phase.
 if(mix>.001){
  ctx.globalAlpha=mix;
  const top=ctx.createLinearGradient(0,0,0,h*.9);
  top.addColorStop(0,color(hue,sat,20,.98));
  top.addColorStop(.49,color(hue,sat,14,.88));top.addColorStop(.83,color(accent,sat,7,.41));
  top.addColorStop(1,color(hue,sat,8,0));
  ctx.fillStyle=top;ctx.fillRect(0,0,w,h);
  glow(ctx,w,h,x+unit*.08*Math.sin(t*.34),y+unit*.07*Math.cos(t*.43),unit*.69,[
   [0,color(hue,sat,36,.36+beat*.09)],[.35,color(hue,sat,27,.31)],[.72,color(accent,sat,19,.19)],[1,color(accent,sat,15,0)]
  ]);
  glow(ctx,w,h,x+unit*.18*Math.cos(t*.33+1),y+unit*.23*Math.sin(t*.41+.9),unit*.55,[
   [0,color(accent,sat,34,.29+beat*.09)],[.59,color(accent,sat,23,.18)],[1,color(accent,sat,19,0)]
  ]);
  const size=.36+.64*mix,breath=1+.024*Math.sin(t*.64)+beat*.025;
  lightSurface(ctx,x+unit*.025*Math.sin(t*.31),y+unit*.055,unit*.43*size*breath,unit*.45*size,t,1.1,hue,sat,accent,.96+beat*.08);
  lightSurface(ctx,x-unit*.09,y+unit*.035,unit*.52*size,unit*.39*size,t*.69,-1.4,accent,sat,hue,.33);
 }
 const warm=started?Math.max(0,1-mix*2):1-mix;
 if(warm>.001){
  ctx.globalAlpha=warm;
  const a=t*.78, bx=x+unit*.047*Math.sin(a), by=y+unit*.062*Math.cos(t*.92);
  glow(ctx,w,h,bx+unit*.09*Math.cos(a),by-unit*.065,unit*.51,[[0,'#ff4a00'],[.46,'#f81784b0'],[.69,'#d309c561'],[1,'#3d069800']]);
  glow(ctx,w,h,bx+unit*.11*Math.cos(a*1.77),by-unit*.13*Math.sin(a+1),unit*.435,[[0,'#ff4f41'],[.31,'#ff239b'],[.57,'#e511ec91'],[1,'#6c08d000']]);
  glow(ctx,w,h,bx-unit*.055,by+unit*.043,unit*.36,[[0,'#fff407'],[.39,'#ffde00'],[.62,'#ffb700ee'],[.81,'#f866005e'],[1,'#ff540000']]);
  glow(ctx,w,h,bx+unit*.10*Math.sin(a+.8),by+unit*.065*Math.sin(a*2.2),unit*.30,[[0,'#fff130'],[.42,'#ffdc08f5'],[.75,'#fba20058'],[1,'#ff750000']]);
  ctx.strokeStyle='#fff3aada';
  caustic(ctx,bx,by,unit*.253,unit*.21,t*.61,1.3,.53);
 }
 ctx.globalAlpha=1;
}
function glassShape(ctx,x,y,r,rotation,[h,s,,a],beat,draw){
 ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(r,r);
 ctx.beginPath();draw(ctx);
 const light=ctx.createLinearGradient(-.8,-.8,.85,.9);
 light.addColorStop(0,color(h,s,88,.38));light.addColorStop(.29,color(h,s,74,.11));
 light.addColorStop(.65,color(a,s,57,.10));light.addColorStop(1,color(a,s,82,.22+beat*.10));
 ctx.fillStyle=light;ctx.fill();
 const edge=ctx.createLinearGradient(-.9,-.8,.9,.8);
 edge.addColorStop(0,color(h,s,93,.46+beat*.12));edge.addColorStop(.49,color(h,s,84,.06));edge.addColorStop(1,color(a,s,87,.30));
 ctx.lineWidth=.028;ctx.strokeStyle=edge;ctx.stroke();
 ctx.clip();
 const reflection=ctx.createRadialGradient(-.46,-.66,0,-.46,-.66,.93);
 reflection.addColorStop(0,color(h,s,88,.27+beat*.07));reflection.addColorStop(1,color(h,s,75,0));
 ctx.fillStyle=reflection;ctx.fillRect(-1,-1,2,2);ctx.restore();
}
function drop(ctx){
 ctx.moveTo(.04,-.97);ctx.bezierCurveTo(.39,-1.01,.94,-.15,.9,.27);
 ctx.bezierCurveTo(.87,.86,.36,1.03,-.1,.92);ctx.bezierCurveTo(-.73,.8,-1,.34,-.83,-.13);
 ctx.bezierCurveTo(-.63,-.66,-.22,-.69,.04,-.97);ctx.closePath();
}
function shard(ctx){
 ctx.moveTo(0,-1);ctx.quadraticCurveTo(.19,-.15,.86,0);ctx.quadraticCurveTo(.17,.15,0,1);
 ctx.quadraticCurveTo(-.17,.15,-.86,0);ctx.quadraticCurveTo(-.19,-.15,0,-1);ctx.closePath();
}
function lens(ctx){ctx.ellipse(0,0,1,.67,0,0,Math.PI*2);}
function glassMark(ctx,w,h,t,[hue,sat,,accent],beat,mark){
 const r=Math.min(w,h)*(.28+.016*beat),x=w*(.49+.08*Math.sin(t*.7)),y=h*(.37+.056*Math.cos(t*.86));
 glassShape(ctx,x,y,r,-.18+.24*Math.sin(t*.43),[hue,sat,0,accent],beat,lens);
 ctx.save();ctx.translate(x,y);ctx.rotate(-.12+.08*Math.sin(t*.8));ctx.globalAlpha*=.48;
 ctx.font='700 '+Math.round(r*.96)+'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
 ctx.textBaseline='middle';ctx.textAlign='center';ctx.shadowBlur=r*.18;ctx.shadowColor=color(accent,sat,72,.57);
 ctx.fillStyle=color(hue,sat,84,.9);ctx.fillText(mark||'✦',0,0,w*.7);ctx.restore();
}
function paintPattern(ctx,w,h,t,palette,beat,pattern,mark,opacity=1){
 if(opacity<=0)return;
 ctx.save();ctx.globalAlpha=opacity;
 const unit=Math.min(w,h);
 if(pattern==='bloom'){
  const [hue,sat,,accent]=palette, radius=Math.min(w,h*1.4)*(.48+beat*.035);
  for(let i=0;i<3;i++){
   const phase=t*(.21+i*.075)+i*2.25;
   const x=w*(.50+.28*Math.cos(phase)),y=h*(.29+.14*Math.sin(phase*.84));
   const glow=ctx.createRadialGradient(x,y,0,x,y,radius*(1+i*.21));
   glow.addColorStop(0,color(i===1?hue:accent,sat,54,.26+beat*.15));
   glow.addColorStop(.5,color(hue,sat,41,.17));
   glow.addColorStop(1,color(hue,sat,24,0));
   ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  }
 }else if(pattern==='petals')glassMark(ctx,w,h,t,palette,beat,mark);
 else if(pattern==='prism'){
  for(let i=0;i<2;i++)glassShape(ctx,w*(.45+i*.17+.10*Math.sin(t*.67+i*2.1)),h*(.39+i*.13+.10*Math.cos(t*.52+i)),unit*(.58-i*.15+beat*.02),t*.11+i*2.05,palette,beat,lens);
 }else if(pattern==='tide'){
  for(let i=0;i<3;i++)glassShape(ctx,w*(.24+i*.25+.09*Math.sin(t*.89+i*1.8)),h*(.34+i*.067+.09*Math.cos(t*.71+i)),unit*(.29+(i%2)*.10+beat*.017),t*.15-i*.85,palette,beat,drop);
 }else if(pattern==='halos'){
  for(let i=0;i<5;i++)glassShape(ctx,w*(.13+i*.184+.078*Math.sin(t*.78+i*.8)),h*(.34+.17*Math.cos(i*1.68+t*.61)),unit*(.11+Math.sin(i*.67)*.15+beat*.014),t*.12-i*.68,palette,beat,shard);
 }else for(const band of bands)glassBand(ctx,w,h,t,palette,beat,band);
 ctx.restore();
}
export function mountWaveLight(canvas,{track,playing=false,started=playing,getAudio,motion=true,pattern,mark,signal}){
 let ctx;
 try{ctx=canvas?.getContext('2d',{alpha:true});}catch{}
 if(!ctx)return null;
 loadPulses();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const animate=()=>!reduced.matches;
 let id=track?.id, target=track?.palette||idle, tone=target, from=target, changed=0;
 let mode=playing?1:started?.63:0, mixFrom=mode,mixNow=mode, modeChanged=0;
 let design=safePattern(pattern),previous=design,activeMark=normalizeWaveMark(mark),previousMark=activeMark,patternChanged=0,pulse=0;
 canvas.dataset.pattern=design;canvas.dataset.motion=motion?'full':'gentle';
 let width=0,height=0, phase=1.48, last=0, frame=0, throttle=0, dirty=true, visible=true;
 const active=()=>visible&&document.visibilityState!=='hidden'&&!signal.aborted;
 function request(){
  if(frame||throttle||!width||!height||!active()||!dirty&&!animate())return;
  if(!dirty&&!motion)throttle=setTimeout(()=>{throttle=0;if(active())frame=requestAnimationFrame(draw);},76);
  else frame=requestAnimationFrame(draw);
 }
 function draw(now){
  frame=0;
  if(!active())return;
  const step=animate(), elapsed=last?now-last:0;
  if(dirty||elapsed>=28){
   if(step)phase+=Math.min(elapsed,138)/1000*(motion?(playing?.89:.56):(playing?.20:.115));
   const progress=step?clamp((now-changed)/650,0,1):1, mix=ease(progress);
   tone=progress===1?target:from.map((value,i)=>value+mix*((i===0||i===3)?hueDelta(value,target[i]):target[i]-value));
   mixNow=step?mixFrom+(mode-mixFrom)*ease(clamp((now-modeChanged)/(motion?360:220),0,1)):mode;
   const audio=getAudio?.();
   const beatTarget=step&&playing&&audio&&!audio.paused&&!audio.seeking&&!audio.muted&&audio.volume>0?sampleAccent(timings[id],audio.currentTime):0;
   pulse=step?pulse+(beatTarget-pulse)*(1-Math.exp(-Math.min(160,elapsed||32)/(beatTarget>pulse?62:190))):0;
   const beat=pulse*(motion?.68:.24), [h,s,l,a]=tone, palette=[h,clamp(s,28,86),l,a];
   const blend=step?ease(clamp((now-patternChanged)/(motion?450:230),0,1)):1;
   ctx.clearRect(0,0,width,height);
   if(design==='bloom')paintWaveBloom(ctx,width,height,phase,palette,beat,mixNow,started);
   else{
    paintAtmosphere(ctx,width,height,phase,palette,beat,mixNow);
    const changing=previous!==design||previousMark!==activeMark;
    if(changing&&blend<1)paintPattern(ctx,width,height,phase,palette,beat,previous,previousMark,1-blend);
    paintPattern(ctx,width,height,phase,palette,beat,design,activeMark,changing?blend:1);
   }
   if(!canvas.hasAttribute('data-ready'))canvas.dataset.ready='';
   last=now;dirty=false;
  }
  request();
 }
 function measure(){
  const w=canvas.clientWidth, h=canvas.clientHeight;
  if(!w||!h){width=height=0;return;}
  // The soft light does not need a full resolution surface on high DPI phones.
  const scale=Math.min(1,Math.sqrt(280000/(w*h)));
  const nextWidth=Math.round(w*scale), nextHeight=Math.round(h*scale);
  if(width===nextWidth&&height===nextHeight)return;
  canvas.width=width=nextWidth;canvas.height=height=nextHeight;
  dirty=true;request();
 }
 function wake(){
  if(frame)cancelAnimationFrame(frame);clearTimeout(throttle);frame=0;throttle=0;
  last=0;dirty=true;request();
 }
 const box=new ResizeObserver(measure);
 const onScreen=new IntersectionObserver(([entry])=>{
  if(visible===entry.isIntersecting)return;
  visible=entry.isIntersecting;wake();
 });
 box.observe(canvas);onScreen.observe(canvas);measure();
 document.addEventListener('visibilitychange',wake,{signal});
 reduced.addEventListener('change',wake,{signal});
 signal.addEventListener('abort',()=>{box.disconnect();onScreen.disconnect();clearTimeout(throttle);if(frame)cancelAnimationFrame(frame);},{once:true});
 return {
  setTrack(next){
   if(!next||next.id===id)return;
   id=next.id;from=tone;target=next.palette||idle;changed=performance.now();pulse*=.4;dirty=true;request();
  },
  setPlaying(value){
   if(value===playing)return;
   playing=value;if(value)started=true;mixFrom=mixNow;mode=value?1:started?.63:0;modeChanged=performance.now();dirty=true;request();
  },
  setMotion(enabled){if(motion!==enabled){motion=enabled;canvas.dataset.motion=motion?'full':'gentle';wake();}},
  setPattern(next,mark){
   next=safePattern(next);mark=normalizeWaveMark(mark);
   if(design===next&&activeMark===mark)return;
   previous=design;previousMark=activeMark;design=next;activeMark=mark;patternChanged=performance.now();canvas.dataset.pattern=design;dirty=true;request();
  }
 };
}
