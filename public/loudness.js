// Slow, attenuation-only leveling. Learned track levels are kept on this device.
// This is adaptive RMS leveling, not an EBU R128/LUFS mastering measurement.
export function createLeveler(context,input){
 const analyser=context.createAnalyser();analyser.fftSize=2048;input.connect(analyser);
 const gain=context.createGain(),samples=new Float32Array(analyser.fftSize);input.connect(gain);
 let enabled=false,id='',sum=0,count=0,learned={},last=0;
 try{const saved=JSON.parse(localStorage.getItem('sway.track-levels')||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))learned=Object.fromEntries(Object.entries(saved).filter(([,value])=>Number.isFinite(value)&&value>0));}catch{}
 const target=energy=>Math.max(.13,Math.min(1,.1/Math.sqrt(energy)));
 const apply=(value,time=.7)=>gain.gain.setTargetAtTime(value,context.currentTime,time);
 function track(next){if(id===next)return;id=next;sum=0;count=0;last=0;apply(enabled&&Number.isFinite(learned[id])?target(learned[id]):1,.05);}
 function setEnabled(value){enabled=!!value;apply(enabled&&Number.isFinite(learned[id])?target(learned[id]):1,.35);}
 function sample(playing){
  if(!enabled||!playing||!id||context.state!=='running'||context.currentTime-last<.2)return;
  last=context.currentTime;analyser.getFloatTimeDomainData(samples);
  let energy=0;for(const value of samples)energy+=value*value;energy/=samples.length;
  // Ignore silence and very quiet intros so the gain does not pump between phrases.
  if(energy<.0001)return;sum+=energy;count++;
  if(count<10)return;
  const mean=sum/count;apply(target(mean),1.2);
  if(count%20===0){learned[id]=mean;const keys=Object.keys(learned);if(keys.length>1500)delete learned[keys[0]];try{localStorage.setItem('sway.track-levels',JSON.stringify(learned));}catch{}}
 }
 return {output:gain,track,setEnabled,sample};
}
