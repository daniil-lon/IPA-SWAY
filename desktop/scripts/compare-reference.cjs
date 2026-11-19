// Diagnostic image comparison only; personal content and branding are excluded.
const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const dir=path.resolve(__dirname,'../artifacts/fidelity-v2');
const before=path.join(dir,'search-v1.png');
const reference=path.join(dir,'reference-search.png');
const after=path.join(dir,'search-v2.png');
async function pixels(file,region){return sharp(file).extract(region).removeAlpha().raw().toBuffer();}
async function error(file,region){const [a,b]=await Promise.all([pixels(reference,region),pixels(file,region)]);let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return +(sum/a.length).toFixed(3);}
(async()=>{
 const regions=[
  {name:'music selection heading',left:248,top:185,width:300,height:32},
  {name:'artist recommendation heading',left:248,top:470,width:320,height:32},
  {name:'missed releases heading',left:248,top:634,width:330,height:32},
  ...[286,493,700,907,1114].map((left,index)=>({name:'category cover '+(index+1),left:left+3,top:254,width:110,height:110})),
  ...[286,493,700,907,1114].map((left,index)=>({name:'category label '+(index+1),left,top:374,width:116,height:28})),
 ];
 const results=[];
 for(const {name,...region}of regions)results.push({name,region,beforeMAE:await error(before,region),afterMAE:await error(after,region)});
 const r=await sharp(reference).removeAlpha().raw().toBuffer();
 const a=await sharp(after).removeAlpha().raw().toBuffer();
 const overlay=Buffer.alloc(r.length),difference=Buffer.alloc(r.length);
 for(let i=0;i<r.length;i++){overlay[i]=Math.round((r[i]+a[i])/2);difference[i]=Math.min(255,Math.abs(r[i]-a[i])*3);}
 await sharp(overlay,{raw:{width:1280,height:800,channels:3}}).png().toFile(path.join(dir,'search-overlay.png'));
 await sharp(difference,{raw:{width:1280,height:800,channels:3}}).png().toFile(path.join(dir,'search-difference.png'));
 const report={generatedAt:new Date().toISOString(),metric:'Mean absolute RGB error (0–255, lower is closer)',scope:'Selected fixed visual regions at 1280×800. Covers were captured from the reference itself. This is not a whole-app similarity percentage. Reference capture is JPEG; native CDP capture is PNG, so compression and text rasterization also affect the error.',results};
 fs.writeFileSync(path.join(dir,'comparison-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1});
