// Small copies of covers and artist photos (/art/s/covers/x.jpg.webp) live in a few packed files,
// because the Workers Free plan allows 20,000 static files and the catalogue plus audio already
// use most of them. scripts/make-thumbs.py writes /art/packs/<n>.bin and /art/packs/index.json
// ({"covers/x.jpg": [pack, offset, length]}); this module cuts one image back out.
let index=null;

async function loadIndex(request,env){
 index??=env.ASSETS.fetch(new Request(new URL('/art/packs/index.json',request.url))).then(r=>{
  if(!r.ok)throw new Error('thumb_index_'+r.status);return r.json();
 }).catch(error=>{index=null;throw error;});
 return index;
}

export const isThumb=path=>typeof path==='string'&&path.startsWith('/art/s/')&&path.endsWith('.webp');

// Returns {data,type} or {error:status}.
export async function thumbBytes(path,request,env){
 let key;try{key=decodeURIComponent(path).slice(7,-5);}catch{return {error:404};}
 const entry=(await loadIndex(request,env))[key];
 if(!entry)return {error:404};
 const [pack,offset,length]=entry;
 const response=await env.ASSETS.fetch(new Request(new URL('/art/packs/'+pack+'.bin',request.url),{headers:{Range:'bytes='+offset+'-'+(offset+length-1),'Accept-Encoding':'identity'}}));
 if(response.status!==200&&response.status!==206){response.body?.cancel().catch(()=>{});return {error:502};}
 let data=new Uint8Array(await response.arrayBuffer());
 if(response.status===200)data=data.slice(offset,offset+length);
 if(data.length!==length)return {error:502};
 return {data,type:'image/webp'};
}

export async function thumbResponse(request,env){
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
 const thumb=await thumbBytes(new URL(request.url).pathname,request,env);
 if(thumb.error)return new Response(null,{status:thumb.error});
 return new Response(request.method==='HEAD'?null:thumb.data,{headers:{
  'Content-Type':thumb.type,'Content-Length':String(thumb.data.length),
  'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'
 }});
}
