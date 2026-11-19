const timing={duration:460,easing:'cubic-bezier(.21,.73,.22,1)'};
const slide=x=>'translateX('+x+'px)';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const node=(tag,name,ghost=false)=>{
 const el=document.createElement(tag);el.className=name;
 if(ghost)el.setAttribute('aria-hidden','true');
 return el;
};
const outgoing=(el,frames,opts=timing)=>{
 el.animate(frames,opts).finished.catch(()=>{}).then(()=>el.remove());
};

function tone(t,color){
 const layer=node('div','player-tone');color(layer,t);
 if(t.art){
  const img=node('img','player-tone-art');img.alt='';img.decoding='async';
  img.addEventListener('load',()=>layer.classList.add('has-art'),{once:true});
  img.addEventListener('error',()=>img.remove(),{once:true});
  img.src=t.art;layer.append(img);
 }
 return layer;
}

export function mountPlayerScene(root,t,{old,color,direction,motion}){
 const scene=node('div','player-scene',true);
 const peek=old?.querySelector('.player-tone.is-peek');
 const preview=peek?.dataset.coverTrack===t.id&&peek.firstChild?.getAttribute('src')===t.art;
 const incoming=preview?peek:tone(t,color);
 incoming.className='player-tone is-current'+(incoming.classList.contains('has-art')?' has-art':'');
 scene.append(incoming);root.prepend(scene);
 const previous=old?.querySelector('.player-tone.is-current');
 if(!previous||previous.dataset.coverTrack===t.id||!root.animate)return;
 const art=root.querySelector('.full-artwork'), cover=art.querySelector('.full-cover');
 const lines=root.querySelector('.player-track-lines'), copy=lines.querySelector('.player-track-copy');
 previous.classList.replace('is-current','departing');scene.prepend(previous);
 if(!motion){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced){previous.remove();return;}
  // The app's quieter mode keeps just a brief change of color.
  incoming.animate([{opacity:0},{opacity:1}],{duration:175,easing:'ease-out'});
  outgoing(previous,[{opacity:1},{opacity:1}],{duration:175});
  return;
 }
 const distance=(art.clientWidth+16)*direction;
 const offset=Number(old.dataset.dragX)||0;
 const blend=preview?Number(old.dataset.sceneMix)||0:0;
 const shift=direction*22;
 const ghostCover=old.querySelector('.full-cover:not(.departing)');
 const ghostCopy=old.querySelector('.player-track-copy:not(.departing)');
 for(const [parent,ghost] of [[art,ghostCover],[lines,ghostCopy]]){
  ghost.classList.add('departing');ghost.setAttribute('aria-hidden','true');parent.append(ghost);
 }
 outgoing(previous,[{transform:slide(-shift*blend)},{transform:slide(-shift)}]);
 incoming.animate([{opacity:blend,transform:slide(shift*(1-blend))},{opacity:1,transform:'none'}],timing);
 if(!offset)cover.animate([{opacity:.52,transform:slide(distance*.44)},{opacity:1,transform:'none'}],timing);
 else cover.animate([{opacity:preview?1:.72,transform:slide(offset+distance)},{opacity:1,transform:'none'}],timing);
 outgoing(ghostCover,[{opacity:1,transform:slide(offset)},{opacity:.24,transform:slide(offset? -distance:-distance*.44)}]);
 const textOffset=clamp(offset*.13,-24,24);
 copy.animate([{opacity:0,transform:slide(textOffset+direction*30)},{opacity:1,transform:'none'}],timing);
 outgoing(ghostCopy,[{opacity:1,transform:slide(textOffset)},{opacity:0,transform:slide(-direction*30)}]);
}

export function dragPlayerScene(root,x,t,color){
 const art=root?.querySelector('.full-artwork'), scene=root?.querySelector('.player-scene');
 if(!art||!scene)return;
 const peek=art.querySelector('.full-peek');
 const width=art.clientWidth+16;
 const offset=t?clamp(x,-width,width):clamp(x*.3,-38,38);
 const direction=x<0?1:-1;
 const blend=t?clamp(Math.abs(offset)/width,0,1):0;
 root.dataset.dragX=offset;root.dataset.sceneMix=blend;
 root.toggleAttribute('data-dragging',!!x);
 root.style.setProperty('--drag-x',offset+'px');
 root.style.setProperty('--drag-copy',clamp(offset*.13,-24,24)+'px');
 root.style.setProperty('--scene-mix',blend);
 root.style.setProperty('--scene-current-x',-direction*22*blend+'px');
 root.style.setProperty('--scene-peek-x',direction*22*(1-blend)+'px');
 root.style.setProperty('--peek-opacity',t?1:0);
 if(!t)return;
 if(peek.getAttribute('src')!==t.art)peek.src=t.art;
 art.style.setProperty('--neighbor',direction);
 const last=scene.querySelector('.is-peek');
 if(last?.dataset.coverTrack===t.id)return;
 last?.remove();
 const layer=tone(t,color);layer.classList.add('is-peek');scene.append(layer);
}
