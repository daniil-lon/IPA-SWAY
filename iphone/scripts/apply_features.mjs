import fs from 'fs';

const appPath = './public/app.js';
let code = fs.readFileSync(appPath, 'utf8');

// 1. Add Shot logic before fullArtwork
const shotModule = `let shotModeActive = true;
try { if(localStorage.getItem('sway_shot_mode') === 'off') shotModeActive = false; } catch(e){}
let shotAnimFrame = null;
let currentShotTrackId = null;

function stopShotCanvas(){
 if(shotAnimFrame){ cancelAnimationFrame(shotAnimFrame); shotAnimFrame = null; }
}

function startShotCanvas(canvas, track){
 stopShotCanvas();
 if(!canvas) return;
 const ctx = canvas.getContext('2d');
 if(!ctx) return;
 canvas.width = 400; canvas.height = 400;
 const [h, s, l, a] = track?.palette || [271, 53, 36, 299];
 let tick = 0;
 function draw(){
  tick += 0.022;
  const isPlaying = intendsPlayback();
  const pulse = isPlaying ? Math.sin(tick * 3) * 0.14 : 0;
  const grad = ctx.createRadialGradient(
   200 + Math.cos(tick) * 45, 
   200 + Math.sin(tick * 0.8) * 45, 
   25, 
   200, 
   200, 
   220 + pulse * 35
  );
  grad.addColorStop(0, 'hsla(' + h + ', ' + s + '%, ' + (l + 16) + '%, 0.96)');
  grad.addColorStop(0.45, 'hsla(' + (a || (h + 50) % 360) + ', ' + Math.max(40, s - 10) + '%, ' + l + '%, 0.82)');
  grad.addColorStop(0.85, 'hsla(' + ((h + 120) % 360) + ', 60%, 14%, 0.9)');
  grad.addColorStop(1, '#05040a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 400, 400);
  ctx.beginPath();
  ctx.arc(200, 200, 85 + Math.sin(tick * 1.4) * 12 + pulse * 22, 0, Math.PI * 2);
  ctx.strokeStyle = 'hsla(' + h + ', 95%, 75%, ' + (0.22 + pulse * 0.3) + ')';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  shotAnimFrame = requestAnimationFrame(draw);
 }
 draw();
}

function initPlayerShot(full, t){
 if(!full || !t) return;
 currentShotTrackId = t.id;
 const container = full.querySelector('.full-shot-container');
 const cover = full.querySelector('.full-cover');
 const btn = full.querySelector('.shot-toggle-btn');
 const canvas = full.querySelector('.full-shot-canvas');
 const video = full.querySelector('.full-shot-video');
 if(!container) return;
 if(!shotModeActive){
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  if(cover) cover.style.opacity = '1';
  if(btn){
   btn.classList.remove('active');
   const span = btn.querySelector('span');
   if(span) span.textContent = 'Обложка';
  }
  if(video){ video.pause(); video.src = ''; }
  stopShotCanvas();
  return;
 }
 container.style.opacity = '1';
 container.style.pointerEvents = 'auto';
 if(cover) cover.style.opacity = '0.01';
 if(btn){
  btn.classList.add('active');
  const span = btn.querySelector('span');
  if(span) span.textContent = 'Шот';
 }
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
   if(currentShotTrackId !== t.id) return;
   if(data && data.shotUrl && video){
    t.shot = data.shotUrl;
    video.src = data.shotUrl;
    video.style.display = 'block';
    if(canvas) canvas.style.display = 'none';
    stopShotCanvas();
    video.play().catch(()=>{});
    document.querySelectorAll('[data-row="' + t.id + '"] strong').forEach(el => {
     if(!el.querySelector('.badge-shot')){
      el.insertAdjacentHTML('beforeend', ' <span class="badge-shot" title="Видеошот"><svg viewBox="0 0 16 16"><path d="M4 2.5C4 1.67 4.9 1.16 5.6 1.6l8 5.5c.67.45.67 1.45 0 1.9l-8 5.5C4.9 14.94 4 14.43 4 13.6V2.5z"/></svg></span>');
     }
    });
   }
  }).catch(()=>{});
}

function toggleShotMode(){
 shotModeActive = !shotModeActive;
 try { localStorage.setItem('sway_shot_mode', shotModeActive ? 'on' : 'off'); } catch(e){}
 const full = dialog.querySelector('.full-player');
 const t = fullCoverTrack(current);
 if(full && t) initPlayerShot(full, t);
 notice(shotModeActive ? 'Живой видеошот включён' : 'Режим статичной обложки');
}

const fullArtwork=t=>{
 const isShot=shotModeActive;
 return '<div class="full-artwork" data-shot="'+isShot+'">'+
  '<button type="button" class="shot-toggle-btn '+(isShot?'active':'')+'" data-action="toggle-shot" title="Переключить видеошот / обложку" aria-label="Видеошот">'+
   '<svg viewBox="0 0 16 16"><path d="M4 2.5C4 1.67 4.9 1.16 5.6 1.6l8 5.5c.67.45.67 1.45 0 1.9l-8 5.5C4.9 14.94 4 14.43 4 13.6V2.5z"/></svg> '+
   '<span>'+(isShot?'Шот':'Обложка')+'</span>'+
  '</button>'+
  '<img class="full-cover" src="'+html(t.art)+'" alt="" draggable="false" style="'+(isShot?'opacity:0.01;pointer-events:none;':'opacity:1;')+'">'+
  '<img class="full-peek" alt="" draggable="false" aria-hidden="true">'+
  '<div class="full-shot-container" style="'+(isShot?'opacity:1;pointer-events:auto;':'opacity:0;pointer-events:none;')+'">'+
   '<canvas class="full-shot-canvas"></canvas>'+
   '<video class="full-shot-video" loop muted playsinline autoplay src="'+html(t.shot||'')+'" style="'+(t.shot?'display:block;':'display:none;')+'"></video>'+
  '</div>'+
 '</div>';
};
`;

const oldFullArtwork = "const fullArtwork=t=>'<div class=\"full-artwork\"><img class=\"full-cover\" src=\"'+html(t.art)+'\" alt=\"\" draggable=\"false\"><img class=\"full-peek\" alt=\"\" draggable=\"false\" aria-hidden=\"true\"></div>';";
if (code.includes(oldFullArtwork)) {
  code = code.replace(oldFullArtwork, shotModule);
  console.log('Replaced fullArtwork');
} else {
  console.log('oldFullArtwork not matched');
}

// 2. Click listener action toggle-shot
const clickTarget = "if(b.dataset.action==='story'){openStory(b.dataset.story);return;}";
if (code.includes(clickTarget)) {
  code = code.replace(clickTarget, "if(b.dataset.action==='story'){openStory(b.dataset.story);return;}\r\n if(b.dataset.action==='toggle-shot'){toggleShotMode();return;}");
  console.log('Replaced clickTarget');
} else {
  console.log('clickTarget not matched');
}

// 3. mountPlayerScene -> add initPlayerShot(full,t);
const mountTarget = "mountPlayerScene(full,t,{old,color:setCoverColors,direction:travel,motion:motionAllowed()});";
if (code.includes(mountTarget)) {
  code = code.replace(mountTarget, "mountPlayerScene(full,t,{old,color:setCoverColors,direction:travel,motion:motionAllowed()});\r\n  initPlayerShot(full,t);");
  console.log('Replaced mountTarget');
} else {
  console.log('mountTarget not matched');
}

// 4. dialog close listener
const dialogTarget = "dialog.addEventListener('scroll',syncFullScroll,{passive:true});";
if (code.includes(dialogTarget)) {
  code = code.replace(dialogTarget, "dialog.addEventListener('scroll',syncFullScroll,{passive:true});\r\ndialog.addEventListener('close',()=>{stopShotCanvas();const v=dialog.querySelector('.full-shot-video');if(v)v.pause();});");
  console.log('Replaced dialogTarget');
} else {
  console.log('dialogTarget not matched');
}

// 5. Add 'shots' button to storiesRail
const storyRailTarget = "'<span class=\"story-caption\">Драйв</span>'+\r\n  '</button>'+\r\n '</div>';";
const storyRailRepl = "'<span class=\"story-caption\">Драйв</span>'+\r\n  '</button>'+\r\n" +
  "  '<button type=\"button\" class=\"story-badge\" data-action=\"story\" data-story=\"shots\">'+\r\n" +
  "    '<div class=\"story-ring story-ring-shots\"><div class=\"story-thumb story-thumb-shots\"><svg width=\"18\" height=\"18\" viewBox=\"0 0 16 16\" fill=\"#ffd54f\"><path d=\"M4 2.5C4 1.67 4.9 1.16 5.6 1.6l8 5.5c.67.45.67 1.45 0 1.9l-8 5.5C4.9 14.94 4 14.43 4 13.6V2.5z\"/></svg></div></div>'+\r\n" +
  "    '<span class=\"story-caption\">Шоты</span>'+\r\n" +
  "  '</button>'+\r\n '</div>';";

if (code.includes(storyRailTarget)) {
  code = code.replace(storyRailTarget, storyRailRepl);
  console.log('Replaced storyRailTarget');
} else {
  // Try with \n
  const storyRailTargetN = "'<span class=\"story-caption\">Драйв</span>'+\n  '</button>'+\n '</div>';";
  if (code.includes(storyRailTargetN)) {
    code = code.replace(storyRailTargetN, storyRailRepl);
    console.log('Replaced storyRailTarget with LF');
  } else {
    console.log('storyRailTarget not matched');
  }
}

// 6. Add 'shots' slide to getStorySlides
const getStoryTarget = "return [{capsule:'ДРАЙВ И ЭНЕРГИЯ',title:'Максимум сил',desc:'Бодрые биты для спорта, движения и отличного настроения.',bg:'radial-gradient(circle at 50% 35%, #ff0055 0%, #ff7700 50%, #05040a 85%)',art:'<img src=\"/art/logo-burst.webp\" class=\"story-artist-art\" alt=\"\">',actionText:'Включить энергию',actionFn:'mood:energy'}];";
const getStoryRepl = "if(storyKey==='shots'){\r\n" +
  "  return [{capsule:'ВИДЕОШОТЫ ИЗ ЯНДЕКС МУЗЫКИ',title:'Живая музыка',desc:'Короткие зацикленные видеоролики и анимированные обложки прямо в плеере Sway. Смотрите и слушайте одновременно!',bg:'radial-gradient(circle at 50% 35%, #00f2fe 0%, #ff0080 50%, #05040a 85%)',art:'<img src=\"/art/logo-burst.webp\" class=\"story-artist-art\" alt=\"\">',actionText:'Слушать хиты с видеошотами',actionFn:'shots'}];\r\n" +
  " }\r\n " + getStoryTarget;

if (code.includes(getStoryTarget)) {
  code = code.replace(getStoryTarget, getStoryRepl);
  console.log('Replaced getStoryTarget');
} else {
  console.log('getStoryTarget not matched');
}

// 7. Add 'shots' handling to handleStoryAction
const handleActionTarget = "location.hash = '#artist/' + encodeURIComponent(tracks[0]?.artist || '');\r\n }";
const handleActionRepl = "location.hash = '#artist/' + encodeURIComponent(tracks[0]?.artist || '');\r\n } else if(action === 'shots'){\r\n  const hit = tracks.find(t => t.artist.toLowerCase().includes('macan') || t.artist.toLowerCase().includes('instasamka') || t.title.toLowerCase().includes('пополам')) || tracks[0];\r\n  if(hit){ play(hit); if(dialog) dialog.showModal(); }\r\n }";

if (code.includes(handleActionTarget)) {
  code = code.replace(handleActionTarget, handleActionRepl);
  console.log('Replaced handleActionTarget');
} else {
  console.log('handleActionTarget not matched');
}

fs.writeFileSync(appPath, code, 'utf8');
console.log('Successfully updated app.js!');
