// Sway PWA Install Prompt & Standalone Mode Detection
const DISMISS_KEY = 'tonika.pwa-dismissed';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

let deferredPrompt = null;
export async function requestInstall(onToast){
 if(isStandaloneApp()){onToast?.('Sway уже открыт как приложение');return;}
 if(deferredPrompt){const prompt=deferredPrompt;deferredPrompt=null;await prompt.prompt();await prompt.userChoice;hideBanner();return;}
 if(isIOS()){showIOSInstallModal();return;}
 onToast?.('Открой меню браузера → «Установить приложение» или «Добавить на главный экран»');
}

// EXACT CHECK: If already installed / running in standalone mode on iPhone (or Android/desktop), return true.
export function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  if (window.navigator?.standalone === true) return true;
  if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
  if (window.matchMedia?.('(display-mode: fullscreen)')?.matches) return true;
  return false;
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function initPwaPrompt({ onToast, offer=false } = {}) {
  // CRITICAL CHECK:
  // If already installed/running on iPhone (standalone), DO NOT show any message or banner!
  if (isStandaloneApp()) {
    return;
  }

  // Capture native install prompt for Android/Chrome/Edge
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if(offer)renderBanner({ onToast });
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideBanner();
  });

  // On iOS Safari (not standalone), show after a brief delay if not recently dismissed
  if (offer && isIOS()) {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY)) || 0;
    if (Date.now() - dismissedAt > SEVEN_DAYS) {
      setTimeout(() => {
        if (!isStandaloneApp()) {
          renderBanner({ onToast });
        }
      }, 3500);
    }
  }
}

export function renderBanner({ onToast } = {}) {
  // Guard again in case user launched into standalone
  if (isStandaloneApp() || document.getElementById('pwa-install-banner')) {
    return;
  }

  const dismissedAt = Number(localStorage.getItem(DISMISS_KEY)) || 0;
  if (Date.now() - dismissedAt < SEVEN_DAYS) {
    return;
  }

  const banner = document.createElement('aside');
  banner.id = 'pwa-install-banner';
  banner.className = 'pwa-install-banner glass';
  banner.setAttribute('aria-label', 'Установка приложения Sway');
  banner.innerHTML = `
    <div class="pwa-banner-art">
      <img src="/art/logo.svg" alt="Sway" width="38" height="38">
    </div>
    <div class="pwa-banner-info">
      <strong>Установить Sway</strong>
      <span>Работает офлайн и с экрана блокировки</span>
    </div>
    <button type="button" class="btn primary pwa-install-action" id="pwa-install-btn">Установить</button>
    <button type="button" class="btn icon pwa-banner-close" id="pwa-close-btn" aria-label="Закрыть">&times;</button>
  `;

  document.body.appendChild(banner);

  const syncVisibility = () => {
    const hash = window.location.hash || '#home';
    const isHome = hash === '#home' || hash === '' || hash === '#';
    banner.classList.toggle('pwa-hidden-route', !isHome);
  };
  window.addEventListener('hashchange', syncVisibility);
  syncVisibility();

  banner.querySelector('#pwa-close-btn')?.addEventListener('click', () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    hideBanner();
  });

  banner.querySelector('#pwa-install-btn')?.addEventListener('click', () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => {
        deferredPrompt = null;
        hideBanner();
      });
    } else if (isIOS()) {
      showIOSInstallModal();
    } else {
      onToast?.('Для установки откройте меню браузера и выберите «Установить приложение»');
    }
  });
}

export function hideBanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) {
    banner.classList.add('is-dismissed');
    setTimeout(() => banner.remove(), 320);
  }
}

export function showIOSInstallModal() {
  const existing = document.getElementById('pwa-ios-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'pwa-ios-modal';
  modal.className = 'pwa-ios-modal-backdrop';
  modal.innerHTML = `
    <div class="pwa-ios-modal glass" role="dialog" aria-modal="true" aria-label="Установка на iPhone">
      <div class="pwa-ios-header">
        <div class="pwa-ios-icon"><img src="/art/logo.svg" alt="Sway" width="48" height="48"></div>
        <h3>Установка на iPhone / iPad</h3>
        <button type="button" class="btn icon pwa-modal-close" aria-label="Закрыть">&times;</button>
      </div>
      <ol class="pwa-ios-steps">
        <li>
          <span class="step-num">1</span>
          <div class="step-desc">
            Нажмите кнопку <strong>«Поделиться»</strong> в нижней панели Safari:
            <div class="step-icon-badge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </div>
          </div>
        </li>
        <li>
          <span class="step-num">2</span>
          <div class="step-desc">
            Прокрутите вниз и выберите <strong>«На экран “Домой”»</strong>:
            <div class="step-icon-badge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </div>
          </div>
        </li>
        <li>
          <span class="step-num">3</span>
          <div class="step-desc">
            Оставьте <strong>«Открывать как веб-приложение»</strong> включённым, если этот переключатель есть. Нажмите <strong>«Добавить»</strong> и запускайте Sway с новой иконки.
          </div>
        </li>
      </ol>
      <button type="button" class="btn primary pwa-modal-done">Понятно</button>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    modal.classList.add('is-closing');
    setTimeout(() => modal.remove(), 250);
  };

  modal.querySelector('.pwa-modal-close')?.addEventListener('click', close);
  modal.querySelector('.pwa-modal-done')?.addEventListener('click', close);
  modal.addEventListener('click', e => {
    if (e.target === modal) close();
  });
}
