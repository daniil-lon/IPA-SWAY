const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
export function mountWaveDeck(frame,{initial,initialKey,maker,size,onCenter,onTouchCenter,onTouchSettle,signal}){
 // The window holds every station once: as wide as possible for a fast fling, never showing a station twice.
 const RADIUS=Math.max(4,Math.min(30,Math.floor(((size?.()||19)-1)/2))), BUFFER=Math.max(3,Math.floor(RADIUS/3));
 const deck=frame.querySelector('.wave-deck'), shortcuts=[...deck.querySelectorAll('[data-deck-shortcut]')];
 const windowed=new Map();
 let pending=0, animation=0, settleTimer=0, drag=null, ignoreClick=false, positioned=null, last=null, touchFrom=null, touchActive=false, selectionSlot=initial;
 const items=()=>[...deck.children].filter(el=>!el.hidden);
 const slotOf=el=>Number(el.dataset.deckSlot||0);
 const middle=el=>el.offsetLeft+el.offsetWidth/2;
 const offset=el=>middle(el)-deck.clientWidth/2;
 const nearest=available=>available.reduce((best,item)=>Math.abs(offset(item)-deck.scrollLeft)<Math.abs(offset(best)-deck.scrollLeft)?item:best);
 const motion=()=>!reducedMotion.matches&&!document.body.classList.contains('gentle-motion');

 function paint(){
  pending=0;
  if(!frame.isConnected)return;
  const center=deck.scrollLeft+deck.clientWidth/2;
  const geometry=items().map(item=>{const width=item.offsetWidth;return {item,width,distance:item.offsetLeft+width/2-center};});
  const centered=geometry.reduce((best,m)=>Math.abs(m.distance)<Math.abs(best.distance)?m:best).item;
  for(const {item,width,distance} of geometry){
   const d=Math.max(-1.8,Math.min(1.8,distance/width));
   // Off-screen cards keep their resting values, so a wide window costs nothing per frame.
   if(Math.abs(d)===1.8&&item.style.getPropertyValue('--deck-distance')===(d<0?'-1.800':'1.800'))continue;
   item.style.setProperty('--deck-distance',d.toFixed(3));
   item.style.setProperty('--deck-weight',Math.pow(Math.min(1,Math.abs(d)),1.22).toFixed(3));
   item.style.setProperty('--deck-layer',String(Math.round(20-Math.abs(d)*10)));
  }
  if(last!==centered){
   if(last)delete last.dataset.centered;
   last=centered;centered.dataset.centered='';
   onCenter(slotOf(centered),centered.dataset.deckItem);
   if(touchFrom)onTouchCenter?.();
  }
 }
 const update=()=>{if(!pending)pending=requestAnimationFrame(paint);};
 const cancelMotion=()=>{if(animation)cancelAnimationFrame(animation);animation=0;positioned=null;};

 function refill(slot,anchor){
  const start=slot-RADIUS,end=slot+RADIUS, before=anchor?offset(anchor)-deck.scrollLeft:0;
  deck.dataset.virtualizing='';
  for(const [i,item] of windowed){if(i<start||i>end){if(item.contains(document.activeElement))deck.focus({preventScroll:true});item.remove();windowed.delete(i);}}
  let next=null;
  for(let i=end;i>=start;i--){
   let item=windowed.get(i);
   if(!item){item=maker(i);item.dataset.deckSlot=i;windowed.set(i,item);deck.insertBefore(item,next);}
   next=item;
  }
  placeShortcuts();
  const target=anchor?.isConnected?anchor:windowed.get(slot);
  deck.scrollLeft=offset(target)-before;
  deck.getBoundingClientRect();
  delete deck.dataset.virtualizing;
  update();
 }

 function settle(){
  clearTimeout(settleTimer);settleTimer=0;
  if(animation||drag?.moving||touchActive||!frame.isConnected)return;
  // A scrollend from the preceding movement may arrive after the next arrow
  // has started. Rebuilding around that old position cancels the new scroll.
  if(positioned?.isConnected&&Math.abs(offset(positioned)-deck.scrollLeft)>2)return;
  const centered=nearest(items()), slot=slotOf(centered);
  if(Math.abs(offset(centered)-deck.scrollLeft)>2){center(slot,true,centered.dataset.deckItem);return;}
  positioned=null;
  if(touchFrom&&touchFrom!==centered)onTouchSettle?.();
  touchFrom=null;
  if(!windowed.has(slot+BUFFER)||!windowed.has(slot-BUFFER))refill(slot,centered);
  else update();
 }
 function center(slot,animate=true,key=''){
  cancelMotion();
  const exists=windowed.has(slot);
  if(!exists)refill(slot);
  const target=shortcuts.find(el=>!el.hidden&&el.isConnected&&el.dataset.deckItem===key)||windowed.get(slot);
  positioned=target;
  const from=deck.scrollLeft,started=performance.now();
  if(animate&&exists&&motion()&&Math.abs(offset(target)-from)>2){
   // WebKit can discard native smooth scrolls after a virtual window moves.
   // Animate only the snap; finger panning and inertia stay native.
   const tick=now=>{
    if(!frame.isConnected||!target.isConnected){cancelMotion();return;}
    const progress=Math.min(1,(now-started)/320),ease=1-Math.pow(1-progress,3);
    deck.scrollLeft=from+(offset(target)-from)*ease;update();
    if(progress<1)animation=requestAnimationFrame(tick);
    else{animation=0;deck.scrollLeft=offset(target);settle();}
   };
   animation=requestAnimationFrame(tick);
  }else{deck.scrollLeft=offset(target);settle();}
  update();
 }
 function move(dir){
  let available=items(), from=nearest(available);
  if(positioned?.isConnected&&!positioned.hidden&&(available.indexOf(positioned)-available.indexOf(from))*dir>0)from=positioned;
  let target=available[available.indexOf(from)+dir];
  if(!target){refill(slotOf(from),from);available=items();target=available[available.indexOf(from)+dir];}
  if(target)center(slotOf(target),true,target.dataset.deckItem);
 }

 deck.addEventListener('scroll',()=>{
  // Focusing an off-screen card must not pan this horizontal viewport upward
  // and clip its raised glyph (WebKit/Chromium scrollIntoView both do this).
  if(deck.scrollTop)deck.scrollTop=0;
  update();clearTimeout(settleTimer);settleTimer=setTimeout(settle,145);
 },{passive:true});
 deck.addEventListener('scrollend',settle);
 deck.addEventListener('wheel',cancelMotion,{passive:true});
 // Native panning cancels the pointer before the finger leaves the display.
 // Keep the touch session through that cancellation and the resulting inertia.
 deck.addEventListener('touchstart',e=>{if(e.isTrusted&&e.touches.length===1){cancelMotion();touchActive=true;touchFrom=nearest(items());clearTimeout(settleTimer);}},{passive:true});
 for(const type of ['touchend','touchcancel'])deck.addEventListener(type,()=>{touchActive=false;clearTimeout(settleTimer);settleTimer=setTimeout(settle,180);},{passive:true});
 frame.querySelector('[data-deck-back]').addEventListener('click',()=>move(-1));
 frame.querySelector('[data-deck-next]').addEventListener('click',()=>move(1));
 deck.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();
  if(e.key==='Home'||e.key==='End')center(e.key==='Home'?initial:initial+RADIUS-1);
  else move(e.key==='ArrowLeft'?-1:1);
 });
 deck.addEventListener('pointerdown',e=>{
  cancelMotion();ignoreClick=false;
  if(e.isTrusted&&e.isPrimary&&e.pointerType==='touch')touchFrom=nearest(items());
  if(e.pointerType!=='mouse'||e.button!==0)return;
  drag={id:e.pointerId,x:e.clientX,left:deck.scrollLeft,moving:false};
 });
 deck.addEventListener('pointerleave',()=>{if(drag&&!drag.moving)drag=null;});
 deck.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const delta=e.clientX-drag.x;
  if(!drag.moving&&Math.abs(delta)<8)return;
  if(!drag.moving){drag.moving=true;deck.setPointerCapture(e.pointerId);deck.dataset.dragging='';}
  deck.scrollLeft=drag.left-delta;
 });
 function release(e){
  if(!drag||e.pointerId!==drag.id)return;
  const wasMoving=drag.moving;drag=null;
  if(!wasMoving)return;
  const item=nearest(items());ignoreClick=true;
  delete deck.dataset.dragging;
  center(slotOf(item),true,item.dataset.deckItem);
 }
 for(const event of ['pointerup','pointercancel','lostpointercapture'])deck.addEventListener(event,release);
 deck.addEventListener('click',e=>{if(ignoreClick&&e.detail){e.preventDefault();e.stopImmediatePropagation();ignoreClick=false;}},true);
 deck.addEventListener('click',()=>{touchFrom=null;},true);
 window.addEventListener('resize',()=>{
  if(last?.isConnected)center(slotOf(last),false,last.dataset.deckItem);
 },{signal});
 signal?.addEventListener('abort',()=>{cancelMotion();clearTimeout(settleTimer);if(pending)cancelAnimationFrame(pending);},{once:true});

 center(initial,false,initialKey);
 return {center,visibility(slot,key,animate=true){
  const anchor=nearest(items()), inset=offset(anchor)-deck.scrollLeft;
  deck.dataset.virtualizing='';
  selectionSlot=slot;placeShortcuts();
  if(anchor.isConnected&&!anchor.hidden)deck.scrollLeft=offset(anchor)-inset;
  deck.getBoundingClientRect();delete deck.dataset.virtualizing;
  center(slot,animate,key);
 },refresh(){
  const moving=animation&&positioned?{slot:slotOf(positioned),key:positioned.hasAttribute('data-deck-shortcut')?positioned.dataset.deckItem:''}:null;
  const centered=nearest(items()),at=slotOf(centered),key=centered.dataset.deckItem,inset=offset(centered)-deck.scrollLeft;
  deck.dataset.virtualizing='';
  for(const [slot,item] of windowed){
   if(item.contains(document.activeElement))continue;
   const replacement=maker(slot);
   if(replacement.dataset.deckItem===item.dataset.deckItem)continue;
   replacement.dataset.deckSlot=slot;item.replaceWith(replacement);windowed.set(slot,replacement);
  }
  const target=[...windowed.values()].filter(item=>item.dataset.deckItem===key).sort((a,b)=>Math.abs(slotOf(a)-at)-Math.abs(slotOf(b)-at))[0]||windowed.get(at);
  if(frame.dataset.selection===key)selectionSlot=slotOf(target);
  placeShortcuts();
  if(target)deck.scrollLeft=offset(target)-inset;
  deck.getBoundingClientRect();delete deck.dataset.virtualizing;
  // Recommendation changes may replace the animated target. Resume toward
  // its slot instead of letting the next animation frame cancel navigation.
  if(moving)center(moving.slot,true,moving.key);
  update();
 }};

 function placeShortcuts(){
  const selected=frame.dataset.selection;
  const matches=[...windowed.values()].filter(item=>item.dataset.deckItem===selected);
  const station=matches.sort((a,b)=>Math.abs(slotOf(a)-selectionSlot)-Math.abs(slotOf(b)-selectionSlot))[0];
  let next=station;
  for(const shortcut of [...shortcuts].reverse()){
   shortcut.hidden=!selected;
   if(station&&selected){shortcut.dataset.deckSlot=slotOf(station);if(shortcut.nextElementSibling!==next)deck.insertBefore(shortcut,next);next=shortcut;}
   else{if(shortcut.contains(document.activeElement))deck.focus({preventScroll:true});shortcut.remove();}
  }
 }
}
