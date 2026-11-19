import {writeFileSync,mkdirSync,existsSync} from 'node:fs';
mkdirSync('public/art',{recursive:true});
const write=(n,svg)=>writeFileSync('public/art/'+n+'.svg',svg);
const mark='<rect x="2" y="2" width="60" height="60" rx="20" fill="#d9c9ff"/><path d="M13 37c7 0 9-19 15-19s4 28 10 28 5-20 13-20" fill="none" stroke="#251842" stroke-width="4.6" stroke-linecap="round"/>';
if(!existsSync('public/art/logo-burst.png'))write('logo','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'+mark+'</svg>');
const colors=[['#190f31','#a565fc','#f673d7'],['#072b30','#4be2c4','#bcf7c8'],['#35112d','#ee6286','#ffb57c'],['#0f1b3b','#6e82ff','#a4c2ff'],['#36172e','#e668e0','#ff993c'],['#211149','#8386ff','#e5a4ff'],['#1e1838','#b297f7','#f8c3e7'],['#0f2c26','#88c953','#fbd281'],['#35213b','#ffa2c2','#9bc8fa'],['#241c19','#ff9776','#e7c99c']];
for(let j=0;j<colors.length;j++){
 const [bg,a,b]=colors[j];const paths=[];
 for(let i=0;i<24;i++){
  const rs=(25+i*5), pts=[];
  for(let k=0;k<=170;k++){const t=k/170*Math.PI*2,q=rs*(1+.27*Math.sin((2+j%4)*t+i*.08));pts.push([(155+q*Math.cos(t)*(.95+j%3*.12)+14*Math.sin(i*.15)), (150+q*Math.sin(t)*(.97-j%3*.10))].map(x=>x.toFixed(1)).join(' '));}
  paths.push('<path d="M'+pts.join('L')+'Z" opacity="'+(.25+i*.027)+'" stroke="url(#s)" fill="none" stroke-width="1.45"/>');
 }
 const defs='<defs><linearGradient id="s" x2="1" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="'+a+'"/><stop offset="1" stop-color="'+b+'"/></linearGradient><radialGradient id="g"><stop stop-color="'+a+'" stop-opacity=".48"/><stop offset="1" stop-color="'+bg+'"/></radialGradient></defs>';
 write('cover-'+j,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">'+defs+'<rect width="300" height="300" fill="'+bg+'"/><circle cx="155" cy="144" r="192" fill="url(#g)"/><g transform="rotate('+(-44+j*27)+' 150 150)">'+paths.join('')+'</g></svg>');
}
let lines='';
for(let i=0;i<57;i++){
 const pts=[];
 for(let k=0;k<=250;k++){
  const t=2*Math.PI*k/250,r=73+i*2.42;
  const a=r*(1+.21*Math.sin(3*t-.14*i)+.13*Math.cos(2*t+.064*i));
  const x=342+a*Math.cos(t)*1.14+17*Math.cos(i*.12),y=214+a*Math.sin(t)*.71+21*Math.sin(i*.09);
  pts.push(x.toFixed(1)+' '+y.toFixed(1));
 }
 lines+='<path d="M'+pts.join(' L')+'Z" opacity="'+(.24+.59*i/56).toFixed(2)+'"/>';
}
write('wave','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 460"><defs><linearGradient id="line" x1="57" y1="360" x2="574" y2="88" gradientUnits="userSpaceOnUse"><stop stop-color="#423aee"/><stop offset=".34" stop-color="#9571ff"/><stop offset=".7" stop-color="#f688ec"/><stop offset="1" stop-color="#ffac81"/></linearGradient><radialGradient id="halo"><stop offset="0" stop-color="#8b43fc" stop-opacity=".55"/><stop offset="1" stop-color="#190e2f" stop-opacity="0"/></radialGradient></defs><ellipse cx="340" cy="222" rx="297" ry="207" fill="url(#halo)"/><g transform="rotate(-16 330 230)" fill="none" stroke="url(#line)" stroke-width="1.22">'+lines+'</g></svg>');
