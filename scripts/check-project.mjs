import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'artifacts/project-audit');mkdirSync(out,{recursive:true});
const resultFile=process.argv.includes('--ui')?'ui-results.json':'results.json';
const results=[];
function run(name,cwd,args,timeout=180000){
 const at=Date.now(),result=spawnSync(process.execPath,args,{cwd:path.join(root,cwd),encoding:'utf8',timeout,windowsHide:true,maxBuffer:4*1024*1024});
 writeFileSync(path.join(out,name+'.log'),(result.stdout||'')+(result.stderr||'')+(result.error?'\n'+result.error.message:''));
 const row={name,status:result.status===0?'PASS':result.error?'INCONCLUSIVE':'FAIL',exitCode:result.status,ms:Date.now()-at,log:name+'.log'};
 results.push(row);writeFileSync(path.join(out,resultFile),JSON.stringify({at:new Date().toISOString(),results},null,2));
 console.log(row.status+' '+name+' ('+row.ms+' ms)');
}
// Local deterministic suites only; no deployment, production writes or imports.
const suites=process.argv.includes('--ui')?[
 'check-next-admin','check-new-ux-features','check-share-links','check-history-owner',
 'check-next-browser','check-player-handling','check-equalizer','check-listening-features','check-listening-tools'
]:[
 'check-migrations','check-security','check-accounts','check-admin',
 'check-next-backend','check-playlists','check-catalog-recovery','check-custom-media',
 'check-transition-planning','check-discovery','check-catalog-assets','check-wave-refresh',
 'check-asset-socket','check-media-session'
];
for(const name of suites)run(name,'iphone',['scripts/'+name+'.mjs']);
if(!process.argv.includes('--ui')){
run('desktop-model','',['--test','desktop/scripts/features-model.test.cjs']);
run('desktop-runtime','',['desktop/scripts/check-runtime.cjs']);
run('desktop-preview','',['--test','desktop/scripts/preview.test.cjs']);
}
const files=[];
function scan(relative){for(const entry of readdirSync(path.join(root,relative),{withFileTypes:true})){
 if(['node_modules','artifacts','runtime','release','releases','.data','.data-smoke','.git','.wrangler','.tools','.private'].includes(entry.name)||entry.isSymbolicLink())continue;
 const file=path.join(relative,entry.name);
 if(entry.isDirectory())scan(file);else if(/\.(?:mjs|cjs|js)$/.test(entry.name))files.push(file);
}}
for(const dir of process.argv.includes('--ui')?[]:['iphone','desktop','scripts'])scan(dir);
let syntaxErrors=0;const syntax=[];
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8',windowsHide:true,timeout:15000});if(result.status!==0){syntaxErrors++;syntax.push(file+'\n'+result.stderr);}}
if(files.length)writeFileSync(path.join(out,'syntax.log'),syntax.join('\n'));
if(files.length)results.push({name:'syntax',status:syntaxErrors?'FAIL':'PASS',files:files.length,errors:syntaxErrors,log:'syntax.log'});
writeFileSync(path.join(out,resultFile),JSON.stringify({at:new Date().toISOString(),results},null,2));
console.log((syntaxErrors?'FAIL':'PASS')+' syntax: '+files.length+' files, '+syntaxErrors+' errors');
process.exitCode=results.some(row=>row.status!=='PASS')?1:0;
