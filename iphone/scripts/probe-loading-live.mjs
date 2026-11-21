import {fetchAsset} from '../public/asset-loader.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin='https://music.academmix.ru',results=[];
for(const file of ['app.js','cover-colors.js','refinements.css']){
 const at=Date.now(),response=await fetchAsset(new Request(origin+'/'+file)),data=Buffer.from(await response.arrayBuffer());
 const sha=data=>createHash('sha256').update(data).digest('hex'),match=sha(data)===sha(await readFile('public/'+file));
 results.push({file,status:response.status,bytes:data.length,ms:Date.now()-at,match});console.log(JSON.stringify(results.at(-1)));
 if(!match)throw new Error('Incomplete or unexpected published asset: '+file);
}
await writeFile('artifacts/loading-recovery/live-assets.json',JSON.stringify({at:new Date().toISOString(),results},null,2));
