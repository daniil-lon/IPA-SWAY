export const EQ_FREQUENCIES=[31,62,125,250,500,1000,2000,4000,8000,16000];
export const EQ_PRESETS={
  flat:{title:'Ровный',gains:[0,0,0,0,0,0,0,0,0,0]},
  bass:{title:'Больше баса',gains:[6,5,4,2,0,0,0,0,0,0]},
  pop:{title:'Поп',gains:[-1,1,3,4,2,0,-1,-1,1,2]},
  rock:{title:'Рок',gains:[4,3,1,-1,-2,0,2,3,4,4]},
  voice:{title:'Голос',gains:[-4,-3,-1,1,3,4,3,1,-1,-3]},
  electronic:{title:'Электроника',gains:[5,4,1,0,-2,1,0,2,4,5]},
};
export function normalizeEQ(value={}){
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
  return {enabled:value.enabled===true,preset:EQ_PRESETS[value.preset]?value.preset:'custom',gains:EQ_FREQUENCIES.map((_,i)=>clamp(value.gains?.[i],-12,12)),preamp:clamp(value.preamp,-12,6)};
}
export class AudioEffects{
  constructor(audio,settings={}){this.audio=audio;this.settings=normalizeEQ(settings);this.context=null;}
  async ensure(){
    if(!this.context){
      this.context=new AudioContext({latencyHint:'playback'});
      this.source=this.context.createMediaElementSource(this.audio);
      this.filters=EQ_FREQUENCIES.map(f=>{const n=this.context.createBiquadFilter();n.type='peaking';n.frequency.value=f;n.Q.value=1.1;return n;});
      this.preamp=this.context.createGain();
      this.limiter=this.context.createDynamicsCompressor();
      this.limiter.threshold.value=-1;this.limiter.knee.value=0;this.limiter.ratio.value=20;this.limiter.attack.value=.003;this.limiter.release.value=.15;
      this.connect();
    }
    if(this.context.state==='suspended')await this.context.resume();
  }
  connect(){
    if(!this.context)return;
    this.source.disconnect();for(const node of this.filters)node.disconnect();this.preamp.disconnect();this.limiter.disconnect();
    if(!this.settings.enabled){this.source.connect(this.context.destination);return;}
    let node=this.source;for(const filter of this.filters){node.connect(filter);node=filter;}
    node.connect(this.preamp);this.preamp.connect(this.limiter);this.limiter.connect(this.context.destination);
    this.apply();
  }
  apply(){
    if(!this.context)return;
    this.filters.forEach((n,i)=>n.gain.setTargetAtTime(this.settings.gains[i],this.context.currentTime,.015));
    this.preamp.gain.setTargetAtTime(10**(this.settings.preamp/20),this.context.currentTime,.015);
  }
  set(value){const previous=this.settings.enabled;this.settings=normalizeEQ(value);if(previous!==this.settings.enabled)this.connect();else this.apply();return this.settings;}
  response(){
    if(!this.context)return null;
    const frequencies=new Float32Array(EQ_FREQUENCIES),total=new Float32Array(10).fill(1),phase=new Float32Array(10),magnitudes=new Float32Array(10);
    for(const filter of this.filters){filter.getFrequencyResponse(frequencies,magnitudes,phase);for(let i=0;i<10;i++)total[i]*=magnitudes[i];}
    return [...total].map(v=>20*Math.log10(v));
  }
}
