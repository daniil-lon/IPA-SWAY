// Workers Static Assets ignores Range. Provide a bounded byte stream for media clients.
export async function media(req, env, knownSize) {
 const range=req.headers.get('Range');
 if(req.method!=='GET'||!range) return env.ASSETS.fetch(req);
 const match=/^bytes=(\d{0,16})-(\d{0,16})$/.exec(range);
 if(!match||(!match[1]&&!match[2]))return env.ASSETS.fetch(req);
 const response=await env.ASSETS.fetch(new Request(req.url,{headers:{'Accept-Encoding':'identity'}}));
 if(response.status!==200||!response.body)return response;
 const total=Number(response.headers.get('Content-Length')) || knownSize;
 if(!Number.isSafeInteger(total)||total<=0||response.headers.has('Content-Encoding'))return response;
 const ifRange=req.headers.get('If-Range');
 if(ifRange&&ifRange!==response.headers.get('ETag'))return response;
 const offset=match[1]?Number(match[1]):Math.max(total-Number(match[2]),0);
 const end=match[1]&&match[2]?Math.min(Number(match[2]),total-1):total-1;
 const headers=new Headers(response.headers);
 headers.set('Accept-Ranges','bytes');
 if(offset>end||offset>=total||(!match[1]&&Number(match[2])===0)){
  await response.body.cancel();
  return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+total,'Accept-Ranges':'bytes','Cache-Control':'no-store'}});
 }
 const size=end-offset+1;
 headers.set('Content-Range','bytes '+offset+'-'+end+'/'+total);
 headers.set('Content-Length',String(size));
 const reader=response.body.getReader();
 let position=0;
 const slice=new ReadableStream({
  async pull(controller){
   for(;;){
    const {done,value}=await reader.read();
    if(done){controller.error(new Error('Incomplete media'));return;}
    const start=position;position+=value.byteLength;
    const from=Math.max(offset-start,0), to=Math.min(end+1-start,value.byteLength);
    if(from<to)controller.enqueue(value.subarray(from,to));
    if(position>end){controller.close();reader.cancel().catch(()=>{});return;}
    if(from<to)return;
   }
  },
  cancel(reason){return reader.cancel(reason);}
 });
 const fixed=new FixedLengthStream(size);
 slice.pipeTo(fixed.writable).catch(()=>{});
 return new Response(fixed.readable,{status:206,headers});
}
