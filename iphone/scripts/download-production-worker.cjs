// Use Wrangler's existing authenticated, read-only download helper. No token is
// extracted or printed; the current deployed Worker is preserved before repair.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const cli=path.resolve('node_modules/wrangler/wrangler-dist/cli.js'),target=path.resolve('node_modules/wrangler/wrangler-dist/cli-sway-download.cjs');
const marker='        if (args.json) {\n          logRaw(JSON.stringify(version6, null, 2));';
const source=fs.readFileSync(cli,'utf8');if(source.split(marker).length!==2)throw Error('Unknown Wrangler version handler');
const insertion=`        if(process.env.SWAY_DOWNLOAD_DIR){
          const fs=require('node:fs'),path=require('node:path');
          const dir=path.resolve(process.env.SWAY_DOWNLOAD_DIR);fs.mkdirSync(dir,{recursive:true});
          const definition=await fetchWorkerDefinitionFromDash(config2,'/accounts/'+accountId+'/workers/scripts/'+workerName+'/content/v2');
          const files=[];
          for(const file of definition.modules){
            const name=file.name,target=path.resolve(dir,name);
            if(!target.startsWith(dir+path.sep))throw Error('Invalid downloaded module name');
            fs.mkdirSync(path.dirname(target),{recursive:true});const data=Buffer.from(await file.arrayBuffer());fs.writeFileSync(target,data);files.push({name,bytes:data.length});
          }
          fs.writeFileSync(path.join(dir,'download.json'),JSON.stringify({version:version6.id,etag:version6.resources.script.etag,entrypoint:definition.entrypoint,files},null,2));
          logRaw(JSON.stringify({version:version6.id,entrypoint:definition.entrypoint,files}));return;
        }
`;
fs.writeFileSync(target,source.replace(marker,insertion+marker));
const child=spawn(process.execPath,[target,'versions','view','eda48bb9-73e3-4f9e-9b54-70ffd55ab119','--json'],{windowsHide:true,stdio:'inherit',env:{...process.env,HTTPS_PROXY:'http://127.0.0.1:2080',SWAY_DOWNLOAD_DIR:path.resolve('artifacts/loading-recovery/production-server')}});
child.on('exit',code=>{process.exitCode=code??1;});
