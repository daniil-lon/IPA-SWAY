import {build} from 'esbuild';
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import './build-wave-pulses.mjs';

// One stylesheet and one module avoid a dependency waterfall on mobile links.
await build({entryPoints:['public/styles.css'],outfile:'public/sway.css',bundle:true,minify:true,external:['/art/*'],target:['safari16','chrome100']});
await build({entryPoints:['public/app.js'],outfile:'public/app-bundle.js',bundle:true,minify:true,format:'esm',target:['safari16','chrome100']});
const code=(await build({entryPoints:['public/boot.js'],bundle:true,minify:true,format:'esm',target:'safari16',write:false})).outputFiles[0].text;
const appHash=createHash('sha256').update(await readFile('public/app-bundle.js')).digest('base64');
const cssHash=createHash('sha256').update(await readFile('public/sway.css')).digest('base64');
const hash=createHash('sha256').update(code).digest('base64');
const page=(await readFile('public/index.html','utf8')).replace(/<!-- sway:boot:start -->[\s\S]*?<!-- sway:boot:end -->/,'<!-- sway:boot:start --><script type="module" data-sway-boot data-app-hash="'+appHash+'" data-css-hash="'+cssHash+'">'+code+'</script><!-- sway:boot:end -->');
assert.ok(page.includes(code)&&gzipSync(page).length<8192,'The entire entry page must fit in one small response');
await writeFile('public/index.html',page);
let headers=(await readFile('public/_headers','utf8')).replace(/script-src 'self'(?: 'sha256-[^']+')*/,"script-src 'self' 'sha256-"+hash+"' 'sha256-"+appHash+"'");
assert.ok(headers.includes("'sha256-"+hash+"'"));assert.ok(!headers.includes("script-src 'self' 'unsafe-inline'"));
const lengths=[];
for(const name of (await readdir('public')).filter(n=>/\.(js|css)$/.test(n)&&(!n.startsWith('admin')||n==='admin-client.js')&&n!=='sw.js').sort())lengths.push('/'+name+'\n  X-Sway-Size: '+(await stat('public/'+name)).size);
headers=headers.replace(/\n# sway:integrity:start[\s\S]*?# sway:integrity:end\n?/,'\n').trimEnd()+'\n# sway:integrity:start\n'+lengths.join('\n')+'\n# sway:integrity:end\n';
assert.ok(headers.split('\n').filter(l=>l.startsWith('/')).length<=100,'Stay within the static header rule limit');
await writeFile('public/_headers',headers);
console.log('Startup: inline bootstrap '+Buffer.byteLength(code)+' bytes; compressed entry '+gzipSync(page).length+' bytes; CSP pins the exact script hash');
