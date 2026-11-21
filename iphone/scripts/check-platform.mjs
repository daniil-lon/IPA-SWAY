import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const config=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8'));
const assets=path.resolve(root,config.assets.directory);
assert.equal(path.basename(path.resolve(root)),'iphone','Deploy from the iPhone project');
assert.equal(assets,path.join(root,'public'),'Only the iPhone public folder may be published');
assert.equal(config.name,'tonika-music');
assert.ok(config.routes.some(route=>route.pattern==='music.academmix.ru'));
let files=0;
function inspect(directory){
 for(const item of fs.readdirSync(directory,{withFileTypes:true})){
  const file=path.join(directory,item.name);
  assert.ok(!item.isSymbolicLink(),'Published assets must not escape the iPhone directory: '+file);
  assert.ok(!/^(android|desktop|releases|node_modules)$/i.test(item.name),'Another platform entered the iPhone asset tree: '+file);
  if(item.isDirectory())inspect(file);
  else{assert.ok(!/\.(apk|aab|exe|msi|dmg|appx|ipa)$/i.test(item.name),'Native distribution entered the iPhone release: '+file);files++;}
 }
}
inspect(assets);
assert.ok(!fs.readFileSync(path.join(assets,'app.js'),'utf8').includes('/downloads/Sway-Android.apk'));
console.log('PASS: iPhone-only Cloudflare entry, domain and '+files+' assets; no Android or desktop packages');
