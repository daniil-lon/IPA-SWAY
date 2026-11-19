/** Local, muted reference animation; no network or account access is needed. */
export function mountWave(surface) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const video = document.createElement('video');
  video.className = 'wave-video';
  video.src = './reference-art/vibe_animation_fallback_dark.mp4';
  video.poster = './reference-art/vibe_animation_fallback_dark.jpeg';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('aria-hidden', 'true');
  surface.append(video);
  let visible = true;
  let disposed = false;
  function updateMotion() {
    if (disposed) return;
    if (motion.matches || document.hidden || !visible) video.pause();
    else video.play().catch(() => { /* The poster remains visible if decoding is unavailable. */ });
  }
  const observer = new IntersectionObserver(entries => {
    visible = entries[0]?.isIntersecting ?? true;
    updateMotion();
  });
  observer.observe(surface);
  motion.addEventListener('change', updateMotion);
  document.addEventListener('visibilitychange', updateMotion);
  updateMotion();
  return {
    setPlaying(value) { surface.dataset.playing = String(Boolean(value)); },
    destroy() {
      disposed = true;
      observer.disconnect();
      motion.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateMotion);
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    },
  };
}
