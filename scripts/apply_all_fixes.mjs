import fs from 'fs';

// ========================================================
// 1. UPDATE public/app.js
// ========================================================
let app = fs.readFileSync('public/app.js', 'utf8');

// A. Restore fullArtwork to simple, clean artwork (no toggle button over it)
const cleanArtwork = `const fullArtwork=t=>'<div class="full-artwork"><img class="full-cover" src="'+html(t.art)+'" alt="" draggable="false"><img class="full-peek" alt="" draggable="false" aria-hidden="true"></div>';`;
const oldArtworkRegex = /let shotModeActive[\s\S]*?const fullArtwork=t=>[\s\S]*?<\/div>';/m;
if (oldArtworkRegex.test(app)) {
  app = app.replace(oldArtworkRegex, cleanArtwork);
  console.log('Restored clean fullArtwork in app.js');
} else {
  console.log('oldArtworkRegex not matched');
}

// B. Add shot logic and background player rendering
const shotLogic = `
let shotAnimFrame = null;

function stopShotCanvas(){
 if(shotAnimFrame){ cancelAnimationFrame(shotAnimFrame); shotAnimFrame = null; }
}

function startShotCanvas(canvas, track){
 stopShotCanvas();
 if(!canvas) return;
 const ctx = canvas.getContext('2d');
 if(!ctx) return;
 canvas.width = 360; canvas.height = 360;
 const [h, s, l, a] = track?.palette || [271, 53, 36, 299];
 let tick = 0;
 function draw(){
  tick += 0.02;
  const isPlaying = intendsPlayback();
  const pulse = isPlaying ? Math.sin(tick * 3) * 0.15 : 0;
  const grad = ctx.createRadialGradient(
   180 + Math.cos(tick) * 40, 
   180 + Math.sin(tick * 0.8) * 40, 
   20, 
   180, 
   180, 
   200 + pulse * 35
  );
  grad.addColorStop(0, 'hsla(' + h + ', ' + s + '%, ' + (l + 16) + '%, 0.95)');
  grad.addColorStop(0.45, 'hsla(' + (a || (h + 50) % 360) + ', ' + Math.max(40, s - 10) + '%, ' + l + '%, 0.82)');
  grad.addColorStop(0.85, 'hsla(' + ((h + 120) % 360) + ', 60%, 14%, 0.9)');
  grad.addColorStop(1, '#05040a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 360, 360);
  shotAnimFrame = requestAnimationFrame(draw);
 }
 draw();
}

function initPlayerShot(full, t){
 if(!full || !t) return;
 const bg = full.querySelector('.canvas-shot-bg');
 if(!bg) return;
 const canvas = bg.querySelector('.full-shot-canvas');
 const video = bg.querySelector('.full-shot-video');
 
 if(t.shot && video){
  if(canvas) canvas.style.display = 'none';
  video.style.display = 'block';
  video.src = t.shot;
  video.play().catch(()=>{});
  stopShotCanvas();
  return;
 }
 
 if(canvas) canvas.style.display = 'block';
 if(video){ video.style.display = 'none'; video.pause(); video.src = ''; }
 startShotCanvas(canvas, t);
 
 fetch('/api/video-shot?id=' + encodeURIComponent(t.id) + '&artist=' + encodeURIComponent(t.artist) + '&title=' + encodeURIComponent(t.title))
  .then(r => r.json())
  .then(data => {
   if(!full.isConnected) return;
   if(data && data.shotUrl && video){
    t.shot = data.shotUrl;
    video.src = data.shotUrl;
    video.style.display = 'block';
    if(canvas) canvas.style.display = 'none';
    stopShotCanvas();
    video.play().catch(()=>{});
   }
  }).catch(()=>{});
}
`;

// Insert shotLogic before mobileFull
if (!app.includes('function initPlayerShot(')) {
  app = app.replace('function mobileFull(t){', shotLogic + '\r\nfunction mobileFull(t){');
  console.log('Inserted shotLogic before mobileFull');
}

// C. In mobileFull(t), insert .canvas-shot-bg as background
const mobileFullTarget = "return '<section class=\"mx-full full-player\" data-playing=\"'+intendsPlayback()+'\"><header>";
const mobileFullRepl = "return '<section class=\"mx-full full-player\" data-playing=\"'+intendsPlayback()+'\">'+\r\n'<div class=\"canvas-shot-bg\" aria-hidden=\"true\"><canvas class=\"full-shot-canvas\"></canvas><video class=\"full-shot-video\" loop muted playsinline autoplay src=\"'+html(t.shot||'')+'\" style=\"'+(t.shot?'display:block;':'display:none;')+'\"></video></div>'+\r\n'<header>";

if (app.includes(mobileFullTarget)) {
  app = app.replace(mobileFullTarget, mobileFullRepl);
  console.log('Added canvas-shot-bg to mobileFull');
} else {
  console.log('mobileFullTarget not matched');
}

// D. In desktopFull, insert .canvas-shot-bg as background
const desktopFullTarget = "b.innerHTML=!t?emptyPlayer:mobile.matches?mobileFull(t):'<div class=\"full-player desktop-full\">'+fullArtwork(t)";
const desktopFullRepl = "b.innerHTML=!t?emptyPlayer:mobile.matches?mobileFull(t):'<div class=\"full-player desktop-full\"><div class=\"canvas-shot-bg\" aria-hidden=\"true\"><canvas class=\"full-shot-canvas\"></canvas><video class=\"full-shot-video\" loop muted playsinline autoplay src=\"'+html(t.shot||'')+'\" style=\"'+(t.shot?'display:block;':'display:none;')+'\"></video></div>'+fullArtwork(t)";

if (app.includes(desktopFullTarget)) {
  app = app.replace(desktopFullTarget, desktopFullRepl);
  console.log('Added canvas-shot-bg to desktopFull');
} else {
  console.log('desktopFullTarget not matched');
}

// E. Remove Photo 1: sourceNote (Ссылки из Яндекс Музыки)
const sourceNoteTarget = "const sourceNote='<div class=\"search-sources\"><b>Ссылки из Яндекс Музыки</b><span>Вставь в строку поиска ссылку на трек, альбом или публичный плейлист.</span></div>';";
if (app.includes(sourceNoteTarget)) {
  app = app.replace(sourceNoteTarget, "const sourceNote='';");
  console.log('Removed Photo 1: sourceNote is now empty');
} else {
  console.log('sourceNoteTarget not matched');
}

// F. Remove Photo 2: storiesRail() from mobileHome
if (app.includes('storiesRail()+')) {
  app = app.replace('storiesRail()+', '');
  console.log('Removed Photo 2: storiesRail() removed from home screen');
} else {
  console.log('storiesRail()+ not found');
}

fs.writeFileSync('public/app.js', app, 'utf8');
console.log('Updated public/app.js successfully!');
