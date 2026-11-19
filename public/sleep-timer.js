// Sway Sleep Timer (Таймер сна)
let timerId = null;
let endTime = null;
let endOfTrackActive = false;
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

export function getSleepTimerStatus() {
  if (endOfTrackActive) {
    return { active: true, mode: 'end-of-track', remainingSeconds: null, label: 'В конце трека' };
  }
  if (!endTime) {
    return { active: false, mode: null, remainingSeconds: 0, label: '' };
  }
  const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
  const mins = Math.ceil(remaining / 60);
  return {
    active: remaining > 0,
    mode: 'time',
    remainingSeconds: remaining,
    label: remaining > 0 ? `${mins} мин` : ''
  };
}

export function cancelSleepTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  endTime = null;
  endOfTrackActive = false;
  notify();
}

export function setSleepTimer(minutes, { audio, onTrigger }) {
  cancelSleepTimer();
  if (!minutes || minutes <= 0) return;
  endTime = Date.now() + minutes * 60 * 1000;
  
  timerId = setInterval(() => {
    const left = (endTime - Date.now()) / 1000;
    if (left <= 0) {
      cancelSleepTimer();
      triggerSleep({ audio, onTrigger });
    } else {
      // In the last 12 seconds, gently fade volume down
      if (left <= 12 && audio && !audio.paused && audio.volume > 0.08) {
        audio.volume = Math.max(0.02, audio.volume * 0.82);
      }
      notify();
    }
  }, 1000);

  notify();
}

export function setSleepTimerAtTrackEnd({ audio, onTrigger }) {
  cancelSleepTimer();
  endOfTrackActive = true;
  notify();
}

export function checkTrackEndSleep({ audio, onTrigger }) {
  if (endOfTrackActive) {
    cancelSleepTimer();
    triggerSleep({ audio, onTrigger });
  }
}

function triggerSleep({ audio, onTrigger }) {
  try {
    if (onTrigger) {
      onTrigger();
    } else if (audio) {
      audio.pause();
    }
  } catch {}
}
