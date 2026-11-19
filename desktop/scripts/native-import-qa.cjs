const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const {LocalLibrary}=require('../local-library.cjs');
const source=path.resolve(__dirname,'..'),base=process.env.SWAY_NATIVE_ROOT||source;
const profile=path.join(base,'.data-smoke'),registryFile=path.join(profile,'imported-library.json');
async function boot(){
 const executable=base===source?path.join(source,'runtime/electron.exe'):path.resolve(base,'../../Sway.exe');
 const args=base===source?['.','--smoke','--media-check']:['--smoke','--media-check'];const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 await new Promise((resolve,reject)=>{const child=spawn(executable,args,{cwd:base,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Native smoke '+code+': '+output.slice(-1800))));});
 return JSON.parse(await fs.readFile(path.join(base,'artifacts/native-smoke.json'),'utf8'));
}
(async()=>{
 let original;try{original=await fs.readFile(registryFile);}catch{}
 try{
  const catalog=JSON.parse(await fs.readFile(path.join(source,'../public/catalog.json'),'utf8'));
  const file=path.resolve(source,'../public',decodeURIComponent(catalog[0].audio).replace(/^\//,''));
  const registry=new LocalLibrary(profile);const [track]=await registry.add([file],'book');
  const first=await boot(),second=await boot();
  for(const run of [first,second]){assert(run.ready&&run.bridge);assert.equal(run.imported.id,track.id);assert.equal(run.imported.count,1);assert.equal(run.imported.kind,'book');assert.equal(run.imported.status,206);assert.equal(run.imported.bytes,32);assert(run.imported.duration>5);assert.deepEqual(run.rendererErrors,[]);}
  const report={pass:true,kind:'book',id:track.id,boots:2,rangeStatus:second.imported.status,decodedDuration:second.imported.duration,nativePicker:'not exercised by this check'};
  const out=path.join(source,'artifacts/features-v3',base===source?'native-import-report.json':'packaged-native-import-report.json');await fs.writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(original)await fs.writeFile(registryFile,original);else await fs.unlink(registryFile).catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
