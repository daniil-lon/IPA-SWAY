const MAX=32*1024*1024,FRAME=8192,WINDOW=16;
export function openMediaSession(url,start=0,version='',signal){
 return new Promise((resolve,reject)=>{
  signal?.throwIfAborted();
  const address=new URL('/api/media-socket',url);address.protocol=url.protocol==='https:'?'wss:':'ws:';
  address.search=new URLSearchParams({path:url.pathname,stream:'1',offset:String(start),...(version?{v:version}:{})});
  const socket=new WebSocket(address);socket.binaryType='arraybuffer';
  let meta,ended=false,closed=false,received=start,delivered=start,inFlight=false,timer,reader;
  const queue=[];
  const reset=ms=>{clearTimeout(timer);timer=setTimeout(()=>fail(new Error('media_session_timeout')),ms);};
  const dispose=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);try{socket.close();}catch{}};
  const fail=error=>{if(closed)return;closed=true;queue.length=0;dispose();if(!meta)reject(error);if(reader){reader.reject(error);reader=null;}};
  const abort=()=>fail(signal.reason||new DOMException('Aborted','AbortError'));
  const request=()=>{
   if(closed||ended||inFlight||!meta||queue.length>WINDOW)return;
   inFlight=true;reset(8000);socket.send(JSON.stringify({offset:received,count:WINDOW}));
  };
  const deliver=()=>{if(reader&&queue.length){const job=reader;reader=null;const data=queue.shift();delivered+=data.length;job.resolve(data);request();}else if(reader&&ended){const job=reader;reader=null;job.resolve(null);}};
  signal?.addEventListener('abort',abort,{once:true});reset(4000);
  socket.onmessage=event=>{try{
   if(closed)return;
   if(typeof event.data==='string'){
    if(event.data.length>1024)throw new Error('media_session_metadata');const value=JSON.parse(event.data);
    if(!meta){
     if(value.stream!==1||!Number.isSafeInteger(value.total)||value.total<=start||value.total>MAX||value.start!==start||value.encoding!=='identity'||!/^[a-f0-9]{64}$/.test(value.version)||version&&value.version!==version)throw new Error('media_session_metadata');
     meta=value;clearTimeout(timer);
     resolve({...meta,read(){if(closed&&!ended)return Promise.reject(new Error('media_session_closed'));if(queue.length){const data=queue.shift();delivered+=data.length;request();return Promise.resolve(data);}if(ended)return Promise.resolve(null);return new Promise((resolve,reject)=>{reader={resolve,reject};request();});},close(){fail(new DOMException('Cancelled','AbortError'));},get position(){return delivered;}});
     request();
    }else{
     if(!inFlight||value.windowEnd!==received)throw new Error('media_session_window');
     inFlight=false;ended=received===meta.total;clearTimeout(timer);if(ended)dispose();else request();deliver();
    }
   }else{
    if(!meta||!inFlight||queue.length>WINDOW*2)throw new Error('media_session_frame');
    const data=new Uint8Array(event.data);if(data.length!==Math.min(FRAME,meta.total-received))throw new Error('media_session_bytes');
    received+=data.length;queue.push(data);reset(8000);deliver();
   }
  }catch(error){fail(error);}};
  socket.onerror=()=>fail(new Error('media_session_connection'));
  socket.onclose=()=>{if(!ended)fail(new Error('media_session_incomplete'));};
 });
}
