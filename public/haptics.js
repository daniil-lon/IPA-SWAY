const mobileTouch=matchMedia('(pointer: coarse)');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let lastPulse=-Infinity;
const lengths={tick:7,play:10,like:12,shuffle:13,route:8};

export const supportsHaptics=()=>typeof navigator.vibrate==='function'&&(mobileTouch.matches||navigator.maxTouchPoints>0);

export function feedback(kind,{target,event,enabled=true}={}){
 if(event&&!event.isTrusted)return;
 if(target?.animate&&!reduced.matches&&kind!=='route'&&kind!=='tick'){
  target.animate([{scale:1},{scale:.96,offset:.35},{scale:1}],{duration:155,easing:'ease-out'});
 }
 if(!enabled||!supportsHaptics()||document.visibilityState!=='visible'||event?.pointerType==='mouse')return;
 const now=performance.now();
 if(now-lastPulse<160)return;
 try{if(navigator.vibrate(lengths[kind]||8))lastPulse=now;}catch{}
}
