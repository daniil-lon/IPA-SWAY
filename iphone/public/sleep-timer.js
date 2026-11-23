// Sway Sleep Timer (Таймер сна)
// The timer never touches media elements directly: the player owns volume
// (crossfade swaps elements, iOS ignores element volume) and passes callbacks.
export const sleepFadeSeconds = 45;
let timerId = null;
let endTime = null;
let tracksLeft = 0;
let tracksTotal = 0;
let fade = null;
let lastNotice = 0;
let updateCallbacks = new Set();

export function onTimerUpdate(cb) {
  updateCallbacks.add(cb);
  return () => updateCallbacks.delete(cb);
}

function notify() {
  const status = getSleepTimerStatus();
  for (const cb of updateCallbacks) {
    try { cb(status); } catch {}
  }
}

const trackWord = n => {
  const tens = n % 100, ones = n % 10;
  if (tens >= 11 && tens <= 14) return 'треков';
  return ones === 1 ? 'трек' : ones >= 2 && ones <= 4 ? 'трека' : 'треков';
};

export function getSleepTimerStatus() {
  if (tracksLeft === 1) {
    return { active: true, mode: 'end-of-track', remainingSeconds: null, tracksLeft, tracksTotal, label: 'В конце трека' };
  }
  if (tracksLeft > 1) {
    return { active: true, mode: 'tracks', remainingSeconds: null, tracksLeft, tracksTotal, label: `Ещё ${tracksLeft} ${trackWord(tracksLeft)}` };
  }
  if (!endTime) {
    return { active: false, mode: null, remainingSeconds: 0, tracksLeft: 0, label: '' };
  }
  const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
  const mins = Math.ceil(remaining / 60);
  return {
    active: remaining > 0,
    mode: 'time',
    remainingSeconds: remaining,
    tracksLeft: 0,
    label: remaining > 0 ? `${mins} мин` : ''
  };
}

// True while the current track is the last one before the timer stops music.
export const isEndOfTrackSleep = () => tracksLeft === 1;

// Equal steps on this curve sound even: the level drops slowly at first, then settles into silence.
export const sleepFadeLevel = left => Math.max(0.02, Math.min(1, left / sleepFadeSeconds) ** 1.6);

function restoreFade() {
  const restore = fade;
  fade = null;
  try { restore?.(1); } catch {}
}

export function cancelSleepTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  endTime = null;
  tracksLeft = 0;
  tracksTotal = 0;
  restoreFade();
  notify();
}

export function setSleepTimer(minutes, { onFade, onTrigger }) {
  cancelSleepTimer();
  if (!minutes || minutes <= 0) return;
  endTime = Date.now() + minutes * 60 * 1000;
  fade = onFade || null;

  timerId = setInterval(() => {
    const left = (endTime - Date.now()) / 1000;
    if (left <= 0) {
      const restore = fade;
      fade = null;
      cancelSleepTimer();
      triggerSleep(onTrigger);
      // Pause first, then return the level so the next start is not silent.
      try { restore?.(1); } catch {}
      return;
    }
    if (left <= sleepFadeSeconds) {
      try { fade?.(sleepFadeLevel(left)); } catch {}
    }
    if (Date.now() - lastNotice >= 1000) {
      lastNotice = Date.now();
      notify();
    }
  }, 250);

  notify();
}

export function setSleepTimerAfterTracks(count) {
  cancelSleepTimer();
  tracksLeft = tracksTotal = Math.max(1, Math.min(50, Math.round(Number(count)) || 1));
  notify();
}

export const setSleepTimerAtTrackEnd = () => setSleepTimerAfterTracks(1);

// Call once per finished track. Returns true when the timer stopped playback,
// so the caller must not advance.
export function checkTrackEndSleep({ onTrigger }) {
  if (!tracksLeft) return false;
  if (tracksLeft > 1) {
    tracksLeft--;
    notify();
    return false;
  }
  cancelSleepTimer();
  triggerSleep(onTrigger);
  return true;
}

function triggerSleep(onTrigger) {
  try { onTrigger?.(); } catch {}
}
