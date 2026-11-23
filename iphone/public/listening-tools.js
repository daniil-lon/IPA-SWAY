export const downloadDefaults={limitMB:1024,wifiOnly:false};
export function downloadPolicy(value={}){return {limitMB:[256,512,1024,2048,4096].includes(Number(value.limitMB))?Number(value.limitMB):1024,wifiOnly:value.wifiOnly===true};}
export function connectionAllows(policy,connection){
 if(!policy.wifiOnly)return true;
 return connection?.type==='wifi'||connection?.type==='ethernet';
}
export function downloadFits(policy,used,bytes){return used+Math.max(0,Number(bytes)||0)<=policy.limitMB*1024*1024;}
export function queueSnapshot(value,ids){
 if(!value||typeof value!=='object')return null;
 const queue=[...new Set((Array.isArray(value.queue)?value.queue:[]).filter(id=>typeof id==='string'&&ids.has(id)))].slice(0,2000);
 if(!queue.length||!queue.includes(value.current))return null;
 return {queue,current:value.current,position:Math.max(0,Math.min(86400,Number(value.position)||0)),mode:['wave','playlist','likes','chart','offline','track','track-wave','normal','album','artist','shuffle'].includes(value.mode)?value.mode:'track',shuffle:value.shuffle===true,repeat:['all','one'].includes(value.repeat)?value.repeat:value.repeat===true?'one':'off',original:value.shuffle===true&&Array.isArray(value.original)?[...new Set(value.original.filter(id=>typeof id==='string'&&ids.has(id)))].slice(0,2000):null,nextUp:queue.includes(value.nextUp)?value.nextUp:'',source:typeof value.source==='string'?value.source.slice(0,80):'',waveMood:['bright','calm','focus','night'].includes(value.waveMood)?value.waveMood:'',waveMix:value.waveMix&&typeof value.waveMix==='object'?value.waveMix:null};
}
const queueBindings=new WeakMap();
export function mountQueueDrag(root,{commit,feedback}){
 queueBindings.get(root)?.abort();const lifetime=new AbortController();queueBindings.set(root,lifetime);const options={signal:lifetime.signal};
 let drag=null;
 const stop=()=>{
  if(!drag)return;drag.item.classList.remove('is-dragging');drag=null;
  commit([...root.querySelectorAll('[data-queue-id]')].map(el=>el.dataset.queueId));
 };
 root.addEventListener('pointerdown',event=>{
  const handle=event.target.closest('[data-queue-handle]'),item=handle?.closest('[data-queue-id]');if(!item||event.button>0)return;
  event.preventDefault();drag={item,pointer:event.pointerId};item.classList.add('is-dragging');root.setPointerCapture?.(event.pointerId);
 },options);
 root.addEventListener('pointermove',event=>{
  if(!drag||drag.pointer!==event.pointerId)return;
  const hovered=[...root.querySelectorAll('[data-queue-id]')].find(el=>{const box=el.getBoundingClientRect();return event.clientY>=box.top&&event.clientY<=box.bottom;});
  if(hovered&&hovered!==drag.item&&hovered.parentElement===drag.item.parentElement){
   const box=hovered.getBoundingClientRect();hovered.parentElement.insertBefore(drag.item,event.clientY<box.y+box.height/2?hovered:hovered.nextSibling);feedback?.();
  }
  const box=root.getBoundingClientRect();if(event.clientY>box.bottom-55)root.scrollTop+=12;else if(event.clientY<box.top+55)root.scrollTop-=12;
 },options);
 root.addEventListener('pointerup',stop,options);root.addEventListener('pointercancel',stop,options);root.addEventListener('lostpointercapture',stop,options);
}
