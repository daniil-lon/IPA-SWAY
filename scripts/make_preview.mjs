import fs from 'fs';

const b64 = fs.readFileSync('C:/Users/Даниил/.gemini/antigravity/brain/32b6f38f-24e5-405d-a29f-d3c896a7918c/logo_base64.txt', 'utf8').trim();

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sway - Медленная анимация (Режим Микс)</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    :root {
      --speed: 4.8s;
      --glow-opacity: 0.75;
    }
    @keyframes slowFloatPulse {
      0% {
        transform: translateY(0px) rotate(0deg) scale(0.93);
        filter: drop-shadow(0 0 16px rgba(255, 213, 79, 0.45)) drop-shadow(0 0 35px rgba(255, 45, 135, 0.25));
      }
      32% {
        transform: translateY(-8px) rotate(2.4deg) scale(1.05);
        filter: drop-shadow(0 0 32px rgba(255, 225, 80, 0.85)) drop-shadow(0 0 60px rgba(255, 30, 140, 0.6));
      }
      68% {
        transform: translateY(6px) rotate(-2.0deg) scale(0.97);
        filter: drop-shadow(0 0 22px rgba(255, 170, 0, 0.65)) drop-shadow(0 0 45px rgba(255, 0, 110, 0.45));
      }
      100% {
        transform: translateY(0px) rotate(0deg) scale(0.93);
        filter: drop-shadow(0 0 16px rgba(255, 213, 79, 0.45)) drop-shadow(0 0 35px rgba(255, 45, 135, 0.25));
      }
    }
    @keyframes slowAura {
      0%, 100% {
        transform: scale(0.85) rotate(0deg);
        opacity: calc(var(--glow-opacity) * 0.55);
      }
      40% {
        transform: scale(1.25) rotate(45deg);
        opacity: var(--glow-opacity);
      }
      75% {
        transform: scale(0.95) rotate(90deg);
        opacity: calc(var(--glow-opacity) * 0.7);
      }
    }
    @keyframes waveBarSlow {
      0%, 100% { height: 6px; transform: scaleY(0.7); }
      50% { height: 30px; transform: scaleY(1.2); }
    }
    @keyframes shineShimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes starTwinkle {
      0%, 100% { opacity: 0.15; transform: scale(0.6); }
      50% { opacity: 0.95; transform: scale(1.3); }
    }
    .logo-hero {
      animation: slowFloatPulse var(--speed) cubic-bezier(0.4, 0, 0.2, 1) infinite;
      will-change: transform, filter;
    }
    .ambient-glow {
      animation: slowAura var(--speed) ease-in-out infinite;
      will-change: transform, opacity;
    }
    .eq-bar {
      width: 4px;
      border-radius: 99px;
      animation: waveBarSlow var(--speed) ease-in-out infinite;
    }
    .text-shimmer {
      background: linear-gradient(90deg, rgba(255,255,255,0.4) 0%, rgba(255,225,120,0.95) 50%, rgba(255,255,255,0.4) 100%);
      background-size: 200% 100%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: shineShimmer 3.2s linear infinite;
    }
  </style>
</head>
<body class="bg-[#08070d] text-white p-3 font-sans antialiased select-none min-h-screen flex flex-col items-center justify-center">

  <!-- Top Control Header -->
  <div class="w-full max-w-sm mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
    <div class="flex items-center gap-2">
      <span class="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-amber-400 to-pink-500 shadow-[0_0_8px_#ff0080]"></span>
      <span class="text-xs font-bold tracking-wide uppercase text-white/90">Sway • Режим Микс</span>
    </div>
    <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/30">4.8s (Медленно)</span>
  </div>

  <!-- Screen Frame -->
  <div class="w-full max-w-sm relative rounded-[32px] overflow-hidden border border-white/15 bg-black aspect-[9/15] flex flex-col items-center justify-center shadow-2xl shadow-purple-950/40">
    
    <!-- Simulated Phone Status -->
    <div class="absolute top-3 w-28 h-6 bg-black rounded-full border border-white/15 z-30 flex items-center justify-between px-3">
      <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
      <span class="w-2 h-2 rounded-full bg-amber-400"></span>
    </div>

    <!-- Twinkle Sparks in background -->
    <div class="absolute top-1/4 left-1/5 w-1 h-1 bg-amber-300 rounded-full blur-[0.5px]" style="animation: starTwinkle 3.2s 0.3s infinite ease-in-out;"></div>
    <div class="absolute top-1/3 right-1/4 w-1.5 h-1.5 bg-pink-400 rounded-full blur-[0.5px]" style="animation: starTwinkle 4.1s 1.2s infinite ease-in-out;"></div>
    <div class="absolute bottom-1/3 left-1/4 w-1 h-1 bg-amber-200 rounded-full blur-[0.5px]" style="animation: starTwinkle 3.6s 2.0s infinite ease-in-out;"></div>
    <div class="absolute bottom-1/4 right-1/5 w-1.5 h-1.5 bg-pink-500 rounded-full blur-[0.5px]" style="animation: starTwinkle 4.5s 0.8s infinite ease-in-out;"></div>

    <!-- Ambient Gradient Aura behind logo -->
    <div id="aura-blob" class="ambient-glow absolute w-72 h-72 rounded-full pointer-events-none blur-[65px] transition-all duration-700"
         style="background: radial-gradient(circle at 35% 35%, rgba(255, 215, 0, 0.48) 0%, rgba(255, 110, 0, 0.38) 45%, rgba(255, 0, 128, 0.38) 70%, transparent 85%);"></div>

    <!-- MAIN LOGO WITH BURST & WAVE -->
    <div class="relative z-10 flex flex-col items-center justify-center">
      <div class="logo-hero relative w-52 h-52 flex items-center justify-center">
        <img src="data:image/webp;base64,${b64}" alt="Sway Logo Burst" class="w-full h-full object-contain pointer-events-none select-none">
      </div>
    </div>

    <!-- MIX MODE: ACOUSTIC FREQUENCY SOUND BARS -->
    <div id="eq-container" class="relative z-10 mt-5 flex items-center gap-1.5 h-8 transition-all duration-500">
      <div class="eq-bar bg-gradient-to-t from-pink-500 to-amber-400" style="animation-delay: 0.1s;"></div>
      <div class="eq-bar bg-gradient-to-t from-pink-500 to-amber-400" style="animation-delay: 0.7s;"></div>
      <div class="eq-bar bg-gradient-to-t from-pink-500 to-amber-300" style="animation-delay: 1.4s;"></div>
      <div class="eq-bar bg-gradient-to-t from-purple-500 to-pink-400" style="animation-delay: 0.3s; width: 5px;"></div>
      <div class="eq-bar bg-gradient-to-t from-pink-500 to-amber-300" style="animation-delay: 1.0s;"></div>
      <div class="eq-bar bg-gradient-to-t from-pink-500 to-amber-400" style="animation-delay: 0.5s;"></div>
      <div class="eq-bar bg-gradient-to-t from-pink-500 to-amber-400" style="animation-delay: 0.9s;"></div>
    </div>

    <!-- Bottom Brand Title & Status -->
    <div class="relative z-10 mt-4 text-center">
      <div class="text-sm font-extrabold tracking-[0.2em] bg-gradient-to-r from-amber-300 via-orange-400 to-pink-500 bg-clip-text text-transparent">SWAY</div>
      <div class="text-xs text-shimmer mt-1 font-medium tracking-tight">Загружаем музыку…</div>
    </div>

    <!-- SIMULATION OVERLAY (App Reveal) -->
    <div id="app-reveal" class="absolute inset-0 bg-[#0f0c1b] p-5 flex flex-col justify-between opacity-0 pointer-events-none transition-all duration-700 z-40">
      <div class="flex items-center justify-between text-xs text-white/60 pt-4">
        <span class="font-bold text-white text-base">Главная</span>
        <div class="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-pink-500 flex items-center justify-center text-black font-bold text-xs">Д</div>
      </div>
      <div class="p-5 rounded-2xl bg-gradient-to-br from-purple-900/60 via-purple-950/40 to-black border border-purple-500/20 my-auto">
        <span class="text-[10px] uppercase font-bold tracking-widest text-amber-300">Моя Волна</span>
        <h2 class="text-xl font-bold mt-1 text-white">Бесконечный поток</h2>
        <p class="text-xs text-white/60 mt-1">7 000 треков и чарт готовы</p>
        <button class="mt-4 px-4 py-2 bg-gradient-to-r from-amber-400 to-pink-500 text-black text-xs font-bold rounded-full shadow-lg">Слушать</button>
      </div>
      <div class="text-center pb-2">
        <button onclick="resetSim()" class="text-xs text-amber-400/80 hover:text-amber-300 underline">Запустить загрузку снова</button>
      </div>
    </div>

  </div>

  <!-- Controls Panel -->
  <div class="w-full max-w-sm mt-3.5 p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
    <div class="flex items-center justify-between text-xs">
      <span class="text-white/60">Скорость (Текущая: Медленно):</span>
      <div class="flex gap-1">
        <button id="spd-slow" onclick="setSpeed('6.0s')" class="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/70">Очень мягко (6.0s)</button>
        <button id="spd-default" onclick="setSpeed('4.8s')" class="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40 font-bold">4.8s Медленно</button>
        <button id="spd-fast" onclick="setSpeed('3.0s')" class="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/70">Динамично (3.0s)</button>
      </div>
    </div>

    <div class="flex items-center justify-between text-xs">
      <span class="text-white/60">Элементы микса:</span>
      <div class="flex gap-1.5">
        <button onclick="toggleEq()" id="btn-eq" class="px-2.5 py-1 rounded-lg bg-pink-500/20 text-pink-300 border border-pink-500/30 font-medium text-[11px]">Эквалайзер: ВКЛ</button>
        <button onclick="toggleGlow()" id="btn-glow" class="px-2.5 py-1 rounded-lg bg-amber-400/20 text-amber-300 border border-amber-400/30 font-medium text-[11px]">Неон: Яркий</button>
      </div>
    </div>

    <button onclick="simulateBoot()" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 text-black font-extrabold text-xs shadow-lg shadow-pink-500/20 hover:brightness-110 transition active:scale-[0.98]">
      ▶ Имитация старта (Загрузка ➔ Главный экран Sway)
    </button>
  </div>

  <script>
    let eqEnabled = true;
    let glowBright = true;

    function setSpeed(spd) {
      document.documentElement.style.setProperty('--speed', spd);
      ['spd-slow', 'spd-default', 'spd-fast'].forEach(id => {
        const btn = document.getElementById(id);
        const match = (id === 'spd-slow' && spd === '6.0s') ||
                      (id === 'spd-default' && spd === '4.8s') ||
                      (id === 'spd-fast' && spd === '3.0s');
        btn.className = match 
          ? 'px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40 font-bold'
          : 'px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/70';
      });
    }

    function toggleEq() {
      eqEnabled = !eqEnabled;
      const eq = document.getElementById('eq-container');
      const btn = document.getElementById('btn-eq');
      eq.style.opacity = eqEnabled ? '1' : '0';
      btn.textContent = 'Эквалайзер: ' + (eqEnabled ? 'ВКЛ' : 'ВЫКЛ');
      btn.className = eqEnabled 
        ? 'px-2.5 py-1 rounded-lg bg-pink-500/20 text-pink-300 border border-pink-500/30 font-medium text-[11px]' 
        : 'px-2.5 py-1 rounded-lg bg-white/10 text-white/50 border border-white/10 font-medium text-[11px]';
    }

    function toggleGlow() {
      glowBright = !glowBright;
      document.documentElement.style.setProperty('--glow-opacity', glowBright ? '0.75' : '0.35');
      const btn = document.getElementById('btn-glow');
      btn.textContent = 'Неон: ' + (glowBright ? 'Яркий' : 'Мягкий');
      btn.className = glowBright
        ? 'px-2.5 py-1 rounded-lg bg-amber-400/20 text-amber-300 border border-amber-400/30 font-medium text-[11px]'
        : 'px-2.5 py-1 rounded-lg bg-white/10 text-white/50 border border-white/10 font-medium text-[11px]';
    }

    function simulateBoot() {
      const reveal = document.getElementById('app-reveal');
      reveal.classList.remove('opacity-0', 'pointer-events-none');
      reveal.classList.add('opacity-100', 'pointer-events-auto');
    }

    function resetSim() {
      const reveal = document.getElementById('app-reveal');
      reveal.classList.add('opacity-0', 'pointer-events-none');
      reveal.classList.remove('opacity-100', 'pointer-events-auto');
    }
  </script>
</body>
</html>`;

fs.writeFileSync('C:/Users/Даниил/.gemini/antigravity/brain/32b6f38f-24e5-405d-a29f-d3c896a7918c/loader_preview.html', html);
fs.writeFileSync('c:/Users/Даниил/Documents/Музыкальня площадка/public/loader-preview.html', html);
console.log('Successfully written new loader_preview.html in brain and public!');
