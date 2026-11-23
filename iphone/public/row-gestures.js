// Track rows: swipe left plays the track next, swipe right likes it, a long press opens its menu.
// Vertical scrolling stays native (touch-action: pan-y), so only a clear horizontal move becomes a swipe.
const threshold=72, holdMs=480, slop=9;
export const rowSelector='.row[data-row],.chart-row[data-row],.album-track-row[data-row]';
export function mountRowGestures(root,{onNext,onLike,onMenu,isLiked=()=>false,feedback=()=>{}}){
 let g=null, suppressClick=0;
 const rowOf=target=>{const row=target.closest?.(rowSelector);return row&&!row.closest('.queue-item,[data-no-row-gestures]')?row:null;};
 const clear=()=>{
  if(!g)return;clearTimeout(g.timer);
  const {row}=g;g=null;
  row.removeAttribute('data-swiping');row.removeAttribute('data-swipe-side');row.removeAttribute('data-swipe-label');row.removeAttribute('data-swipe-ready');
  row.style.removeProperty('--swipe');
 };
 root.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0||e.pointerType==='mouse')return;
  const row=rowOf(e.target);if(!row||e.target.closest('.row-actions'))return;
  clear();
  g={row,id:e.pointerId,x:e.clientX,y:e.clientY,axis:'',ready:false,
   timer:setTimeout(()=>{if(g?.row===row&&!g.axis){const id=row.dataset.row;clear();suppressClick=performance.now()+700;feedback('hold');onMenu(id);}},holdMs)};
 });
 root.addEventListener('pointermove',e=>{
  if(!g||g.id!==e.pointerId)return;
  const dx=e.clientX-g.x,dy=e.clientY-g.y;
  if(!g.axis){
   if(Math.max(Math.abs(dx),Math.abs(dy))<slop)return;
   clearTimeout(g.timer);
   if(Math.abs(dx)<Math.abs(dy)*1.3){clear();return;}
   g.axis='x';g.row.setAttribute('data-swiping','');
  }
  const side=dx<0?'left':'right',offset=Math.max(-threshold*1.6,Math.min(threshold*1.6,dx)),ready=Math.abs(dx)>=threshold;
  g.row.style.setProperty('--swipe',offset+'px');g.row.dataset.swipeSide=side;
  g.row.dataset.swipeLabel=side==='left'?'Играть следующим':isLiked(g.row.dataset.row)?'Убрать из «Мне нравится»':'Мне нравится';
  if(ready!==g.ready){g.ready=ready;g.row.toggleAttribute('data-swipe-ready',ready);if(ready)feedback('tick');}
 });
 const finish=(e,commit)=>{
  if(!g||g.id!==e.pointerId)return;
  const {axis,ready,row,x}=g,id=row.dataset.row,dx=e.clientX-x;
  clear();
  if(axis!=='x')return;
  suppressClick=performance.now()+450;
  if(commit&&ready)(dx<0?onNext:onLike)(id);
 };
 root.addEventListener('pointerup',e=>finish(e,true));
 root.addEventListener('pointercancel',e=>finish(e,false));
 // A swipe or a long press must not also start the track underneath.
 root.addEventListener('click',e=>{if(performance.now()<suppressClick&&rowOf(e.target)){e.preventDefault();e.stopPropagation();suppressClick=0;}},true);
 // Android also fires contextmenu after the same long press; the hold timer already opened the menu then.
 root.addEventListener('contextmenu',e=>{const row=rowOf(e.target);if(!row)return;e.preventDefault();const held=performance.now()<suppressClick;clear();if(!held)onMenu(row.dataset.row);});
}
