// The interface can recover transfers before this offline worker installs.
export async function startupWorker(request,env){
 const path=new URL(request.url).pathname;
 if(path!=='/sw.js')return new Response(null,{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
 const source=await env.ASSETS.fetch(new Request(new URL(path,request.url),{headers:{'Accept-Encoding':'identity'}}));
 if(!source.ok)return source;
 if(source.headers.has('Content-Encoding')&&source.headers.get('Content-Encoding')!=='identity')return new Response(null,{status:502});
 const body=await source.arrayBuffer(),expected=Number(source.headers.get('X-Sway-Size'));
 if(body.byteLength<100||body.byteLength>=15360||expected&&expected!==body.byteLength)return new Response(null,{status:502});
 const headers=new Headers(source.headers);
 const gzip=(request.headers.get('Accept-Encoding')||'').toLowerCase().split(',').some(token=>{
  const [name,...parameters]=token.split(';').map(s=>s.trim()),weight=parameters.find(s=>s.startsWith('q='));
  return name==='gzip'&&(!weight||Number(weight.slice(2))>0);
 });
 // Buffer the encoded body too. A small fixed-length gzip response avoids
 // intermediary Brotli/chunked transforms during the native worker download.
 const wire=gzip?await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer():body;
 headers.set('Content-Type','text/javascript; charset=utf-8');headers.set('Content-Encoding',gzip?'gzip':'identity');
 headers.set('Content-Length',String(wire.byteLength));headers.set('X-Sway-Size',String(body.byteLength));headers.set('Vary','Accept-Encoding');
 headers.set('Cache-Control','public, max-age=0, must-revalidate, no-transform');headers.set('X-Content-Type-Options','nosniff');
 return new Response(request.method==='HEAD'?null:wire,{headers,encodeBody:'manual'});
}
