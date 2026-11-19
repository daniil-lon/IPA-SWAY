const reduce=matchMedia('(prefers-reduced-motion: reduce)');
export const motionAllowed=()=>!reduce.matches&&!document.body.classList.contains('gentle-motion');

export function dismissLayer(layer,{slide=false}={}){
 if(!layer.open||layer.dataset.closing)return;
 if(slide&&document.body.classList.contains('gentle-motion')&&!reduce.matches&&layer.animate){
  layer.dataset.closing='true';
  layer.animate([{opacity:1},{opacity:0}],{duration:125,easing:'ease-out'}).finished.catch(()=>{}).then(()=>{
   layer.close();delete layer.dataset.closing;layer.style.removeProperty('--pull');
  });
  return;
 }
 if(!slide||!motionAllowed()||!layer.animate){layer.close();layer.style.removeProperty('--pull');return;}
 layer.dataset.closing='true';
 const from=getComputedStyle(layer).transform;
 const animation=layer.animate([{transform:from},{transform:'translateY(100%)'}],{duration:220,easing:'cubic-bezier(.38,0,.65,1)',fill:'forwards'});
 animation.finished.catch(()=>{}).then(()=>{
  layer.close();animation.cancel();delete layer.dataset.closing;
  layer.style.removeProperty('--pull');
 });
}

export function makeSwipe(root,{start,allow=()=>true,allowDown=()=>true,onX,dragX,onDown,pull}){
 let drag, suppressedUntil=0;
 const reset=()=>{if(drag?.axis==='y')pull?.(0);if(drag?.axis==='x')dragX?.(0);drag=null;};
 root.addEventListener('pointerdown',e=>{
  if(!allow(e)||!e.isPrimary||e.button!==0||!e.target.closest(start))return;
  suppressedUntil=0;drag={id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now(),axis:'',down:allowDown(e)};
 });
 root.addEventListener('pointermove',e=>{
  if(drag?.id!==e.pointerId)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.axis&&Math.max(Math.abs(dx),Math.abs(dy))>11){
   const horizontal=Math.abs(dx)>Math.abs(dy)*1.15;
   if((horizontal&&onX)||(!horizontal&&dy>0&&onDown&&drag.down)){
    drag.axis=horizontal?'x':'y';root.setPointerCapture(e.pointerId);
   }else{reset();return;}
  }
  if(drag.axis==='y')pull?.(Math.max(0,dy));
  if(drag.axis==='x')dragX?.(dx);
 });
 root.addEventListener('pointerup',e=>{
  if(drag?.id!==e.pointerId)return;
  const {axis,x,y,t}=drag,dx=e.clientX-x,dy=e.clientY-y;
  if(axis)suppressedUntil=performance.now()+420;
  const threshold=performance.now()-t<230?34:64;
  if(axis==='x'&&Math.abs(dx)>threshold)onX(dx<0?1:-1,e);
  if(axis==='y'&&dy>threshold){onDown();drag=null;return;}
  reset();
 });
 root.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)reset();});
 // A touchscreen's implicit capture starts on the child under the finger.
 root.addEventListener('lostpointercapture',e=>{if(e.target===root&&drag?.id===e.pointerId)reset();});
 root.addEventListener('click',e=>{
  if(e.detail&&performance.now()<suppressedUntil){e.preventDefault();e.stopImmediatePropagation();}
 },true);
}
