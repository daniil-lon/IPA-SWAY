const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const RADIUS=9, BUFFER=3;

export function mountWaveDeck(frame,{initial,initialKey,maker,onCenter,onTouchCenter,onTouchSettle,signal}){
 const deck=frame.querySelector('.wave-deck'), shortcuts=[...deck.querySelectorAll('[data-deck-shortcut]')];
 const windowed=new Map();
 let pending=0, settleTimer=0, drag=null, ignoreClick=false, positioned=null, last=null, touchFrom=null, touchActive=false, selectionSlot=initial;
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
  if(drag?.moving||touchActive||!frame.isConnected)return;
  positioned=null;
  const centered=nearest(items()), slot=slotOf(centered);
  if(touchFrom&&touchFrom!==centered)onTouchSettle?.();
  touchFrom=null;
  if(!windowed.has(slot+BUFFER)||!windowed.has(slot-BUFFER))refill(slot,centered);
  else update();
 }
 function center(slot,animate=true,key=''){
  const exists=windowed.has(slot);
  if(!exists)refill(slot);
  const target=shortcuts.find(el=>!el.hidden&&el.isConnected&&el.dataset.deckItem===key)||windowed.get(slot);
  positioned=target;
  deck.scrollTo({left:offset(target),behavior:animate&&exists&&motion()?'smooth':'auto'});
  if(!motion())settle();
  update();
 }
 function move(dir){
  let available=items(), from=positioned?.isConnected&&!positioned.hidden?positioned:nearest(available);
  let target=available[available.indexOf(from)+dir];
  if(!target){refill(slotOf(from),from);available=items();target=available[available.indexOf(from)+dir];}
  if(target)center(slotOf(target),true,target.dataset.deckItem);
 }

 deck.addEventListener('scroll',()=>{update();clearTimeout(settleTimer);settleTimer=setTimeout(settle,145);},{passive:true});
 deck.addEventListener('scrollend',settle);
 // Native panning cancels the pointer before the finger leaves the display.
 // Keep the touch session through that cancellation and the resulting inertia.
 deck.addEventListener('touchstart',e=>{if(e.isTrusted&&e.touches.length===1){touchActive=true;touchFrom=nearest(items());clearTimeout(settleTimer);}},{passive:true});
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
  positioned=null;ignoreClick=false;
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
 signal?.addEventListener('abort',()=>{clearTimeout(settleTimer);if(pending)cancelAnimationFrame(pending);},{once:true});

 center(initial,false,initialKey);
 return {center,visibility(slot,key,animate=true){
  const anchor=nearest(items()), inset=offset(anchor)-deck.scrollLeft;
  deck.dataset.virtualizing='';
  selectionSlot=slot;placeShortcuts();
  if(anchor.isConnected&&!anchor.hidden)deck.scrollLeft=offset(anchor)-inset;
  deck.getBoundingClientRect();delete deck.dataset.virtualizing;
  center(slot,animate,key);
 },refresh(){
  const centered=nearest(items());
  for(const [slot,item] of windowed){
   if(!item.dataset.recommendation||Math.abs(slot-slotOf(centered))<=2||item.contains(document.activeElement))continue;
   const replacement=maker(slot);
   if(replacement.dataset.deckItem===item.dataset.deckItem)continue;
   replacement.dataset.deckSlot=slot;item.replaceWith(replacement);windowed.set(slot,replacement);
  }
  update();
 }};

 function placeShortcuts(){
  const selected=frame.dataset.selection;
  const matches=[...windowed.values()].filter(item=>item.dataset.deckItem===selected);
  const station=matches.sort((a,b)=>Math.abs(slotOf(a)-selectionSlot)-Math.abs(slotOf(b)-selectionSlot))[0];
  for(const shortcut of shortcuts){
   shortcut.hidden=!selected;
   if(station&&selected){shortcut.dataset.deckSlot=slotOf(station);deck.insertBefore(shortcut,station);}
   else{if(shortcut.contains(document.activeElement))deck.focus({preventScroll:true});shortcut.remove();}
  }
 }
}
