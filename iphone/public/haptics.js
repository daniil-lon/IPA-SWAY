const mobileTouch=matchMedia('(pointer: coarse)');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let lastPulse=-Infinity;
const lengths={tick:7,selection:6,play:10,like:12,shuffle:13,route:8,swipe:9,shake:[18,30,18]};
// The Sway iPhone app (ios/) answers with UIKit feedback generators, so each kind gets its own feel.
const native=()=>globalThis.webkit?.messageHandlers?.swayHaptic;
// Safari has no navigator.vibrate. Since iOS 18 a native switch control clicks the Taptic Engine when
// it toggles, which is the only system haptic a web page can reach; it works inside a user gesture.
const ios=/iP(?:hone|ad|od)/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
let tapper;
function switchTap(){
 if(!tapper){
  tapper=document.createElement('label');tapper.ariaHidden='true';
  tapper.style.cssText='position:fixed;left:-40px;top:0;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none';
  const input=document.createElement('input');input.type='checkbox';input.setAttribute('switch','');input.tabIndex=-1;
  // Keep the synthetic toggle away from the app's document-level click and change handlers.
  for(const type of ['click','input','change'])tapper.addEventListener(type,e=>e.stopPropagation());
  tapper.append(input);document.body.append(tapper);
 }
 tapper.click();
}

export const supportsHaptics=()=>!!native()||(typeof navigator.vibrate==='function'||ios)&&(mobileTouch.matches||navigator.maxTouchPoints>0);

export function feedback(kind,{target,event,enabled=true}={}){
 if(event&&!event.isTrusted)return;
 if(target?.animate&&!reduced.matches&&kind!=='route'&&kind!=='tick'&&kind!=='selection'){
  target.animate([{scale:1},{scale:.96,offset:.35},{scale:1}],{duration:155,easing:'ease-out'});
 }
 if(!enabled||!supportsHaptics()||document.visibilityState!=='visible'||event?.pointerType==='mouse')return;
 const now=performance.now();
 if(now-lastPulse<(kind==='selection'||kind==='tick'?60:140))return;
 lastPulse=now;
 try{
  const bridge=native();
  if(bridge)bridge.postMessage(kind);
  else if(typeof navigator.vibrate==='function')navigator.vibrate(lengths[kind]||8);
  else if(ios){switchTap();if(kind==='like'||kind==='shake')setTimeout(switchTap,90);}
 }catch{}
}
