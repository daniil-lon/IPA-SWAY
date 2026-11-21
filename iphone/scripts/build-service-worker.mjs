import {build} from 'esbuild';
import {readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Preserve the module registration used by installed versions. No runtime
// imports are needed before the recovery worker can install.
const result=await build({entryPoints:['service-worker.mjs'],outfile:'public/sw.js',bundle:true,format:'esm',minify:true,write:false,target:'safari16',banner:{js:'// Generated from service-worker.mjs.'}});
const body=result.outputFiles[0].contents;
// Stay well below the 16 KB connection cutoff that the chunked recovery path
// exists for, while leaving room for the media-session loader.
assert.ok(body.length<15360,'The recovery worker must stay small and self-contained');
await writeFile('public/sw.js',body);
for(const name of (await readdir('public')).filter(name=>/^sw-part-[a-f0-9]{16}\.js$/.test(name)))await unlink('public/'+name);
let headers=(await readFile('public/_headers','utf8')).replace(/\n# sway:worker:start[\s\S]*?# sway:worker:end\n?/,'\n').trimEnd();
// The recovery worker itself cannot repair a truncated compressed script.
headers+='\n# sway:worker:start\n/sw.js\n  Cache-Control: public, max-age=0, must-revalidate, no-transform\n  X-Sway-Size: '+body.length+'\n# sway:worker:end\n';
await writeFile('public/_headers',headers);
console.log('Service worker: '+body.length+' bytes, no runtime imports');
