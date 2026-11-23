import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
const exec=promisify(execFile);
const origin=new URL(process.argv[2]).origin;
const executable=process.platform==='win32'?'curl.exe':'curl';
const curl=async (args,fail=true)=>{
 for(let attempt=1;attempt<=3;attempt++){
  try{
   return (await exec(executable,[fail?'-fsS':'-sS','--connect-timeout','10','--max-time','25',...args],{encoding:'buffer',maxBuffer:32*1024*1024})).stdout;
  }catch(e){
   if(attempt===3) throw e;
   await new Promise(r=>setTimeout(r,500));
  }
 }
};
const health=JSON.parse(await curl([origin+'/api/health']));
assert.ok(health.ok);
if(health.loginRequired){
 assert.equal(health.loginConfigured,true,'Required sign-in is live but Yandex ID is not configured');
 const page=await curl([origin+'/']);
 assert.match(page.toString(),/Sway/);
 const catalog=JSON.parse(await readFile('public/catalog.json','utf8'));
 const sink=process.platform==='win32'?'NUL':'/dev/null';
 for(const path of ['/catalog.json',catalog[0].audio,'/api/profile']){
  const status=await curl(['-o',sink,'-w','%{http_code}',origin+path],false);
  assert.equal(String(status),'401',path);
 }
 const redirect=await curl(['-o',sink,'-w','%{http_code} %{redirect_url}',origin+'/auth/yandex']);
 assert.match(String(redirect),/^303 https:\/\/oauth\.yandex\.ru\/authorize\?/);
 console.log('Signed-out shell available; catalog and media require a session; Yandex ID redirect is present.');
}else{
const catalog=JSON.parse(await curl([origin+'/catalog.json']));
assert.equal(health.tracks,catalog.length);
for(const track of catalog){
 const original=await readFile('public'+decodeURI(track.audio));
 const offset=original.length-512;
 const actual=await curl(['--range',offset+'-',origin+encodeURI(track.audio)]);
 assert.deepEqual(actual,original.subarray(offset),track.id);
}
console.log(catalog.length+' public audio streams matched the final 512 bytes of their original files. Login configured: '+health.loginConfigured);
}
