import {assetPart} from './asset-transfer.mjs';
import {mediaSession} from './media-session.mjs';

// A short-lived socket gives each small transfer an independent connection.
// It exposes the same public allowlist and version checks as the HTTP route.
export async function assetSocket(request,env,options){
 if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response(null,{status:426});
 if(request.method!=='GET'||request.headers.get('Origin')!==new URL(request.url).origin)return new Response(null,{status:403});
 if(options?.mediaAllowed&&new URL(request.url).searchParams.get('stream')==='1')return mediaSession(request,env);
 const response=await assetPart(request,env,options);if(response.status!==206)return response;
 const body=await response.arrayBuffer(),headers=response.headers;
 const [client,server]=Object.values(new WebSocketPair());server.accept();
 server.send(JSON.stringify({range:headers.get('Content-Range'),version:headers.get('X-Sway-Version'),type:headers.get('X-Sway-Type'),encoding:headers.get('X-Sway-Encoding'),size:Number(headers.get('X-Sway-Size'))}));
 server.send(body);server.close(1000,'complete');
 return new Response(null,{status:101,webSocket:client});
}

// The caller authenticates and constructs the catalogue response first.
export async function catalogSocket(request,response){
 if(request.method!=='GET'||request.headers.get('Origin')!==new URL(request.url).origin)return new Response(null,{status:403});
 let bytes=new Uint8Array(await response.arrayBuffer()),size=bytes.length;
 if(size>16384)return new Response(null,{status:413});
 const encoding=new URL(request.url).searchParams.get('encoding')==='gzip'?'gzip':'identity';
 if(encoding==='gzip')bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 if(bytes.length>14336)return new Response(null,{status:413});
 const [client,server]=Object.values(new WebSocketPair());server.accept();
 server.send(JSON.stringify({status:response.status,encoding,size}));server.send(bytes);server.close(1000,'complete');
 return new Response(null,{status:101,webSocket:client});
}
