// Sway Social Share Card Generator & Web Share API
export async function createTrackCardBlob(track, { quote = '', timestamp = 0 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const [h, s, l, a] = track?.palette || [271, 53, 36, 299];

  // 1. Background deep gradient
  const bg = ctx.createRadialGradient(540, 420, 80, 540, 540, 800);
  bg.addColorStop(0, `hsla(${h}, ${s}%, ${Math.min(45, l + 12)}%, 0.95)`);
  bg.addColorStop(0.5, `hsla(${a || (h + 45) % 360}, ${Math.max(35, s - 10)}%, 18%, 0.98)`);
  bg.addColorStop(1, '#07060b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1080);

  // 2. Ambient subtle accent glow
  const glow = ctx.createRadialGradient(280, 260, 20, 280, 260, 480);
  glow.addColorStop(0, `hsla(${(h + 60) % 360}, 80%, 55%, 0.35)`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 1080);

  // 3. Load and draw album cover
  let img = null;
  if (track?.art) {
    try {
      img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = track.art;
      });
    } catch {}
  }

  const artSize = quote ? 380 : 560;
  const artX = (1080 - artSize) / 2;
  const artY = quote ? 120 : 160;
  const radius = 38;

  ctx.save();
  // Drop shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 24;

  // Rounded rectangle path
  ctx.beginPath();
  ctx.moveTo(artX + radius, artY);
  ctx.arcTo(artX + artSize, artY, artX + artSize, artY + artSize, radius);
  ctx.arcTo(artX + artSize, artY + artSize, artX, artY + artSize, radius);
  ctx.arcTo(artX, artY + artSize, artX, artY, radius);
  ctx.arcTo(artX, artY, artX + artSize, artY, radius);
  ctx.closePath();
  ctx.fillStyle = '#17151e';
  ctx.fill();

  ctx.restore();

  // Clip and draw image
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(artX + radius, artY);
    ctx.arcTo(artX + artSize, artY, artX + artSize, artY + artSize, radius);
    ctx.arcTo(artX + artSize, artY + artSize, artX, artY + artSize, radius);
    ctx.arcTo(artX, artY + artSize, artX, artY, radius);
    ctx.arcTo(artX, artY, artX + artSize, artY, radius);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, artX, artY, artSize, artSize);
    ctx.restore();
  }

  // 4. Quote (if provided)
  let textY = artY + artSize + 70;
  if (quote) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.font = '600 38px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    
    // Wrap quote text into lines
    const maxQuoteWidth = 840;
    const words = String(quote).trim().split(/\s+/);
    let curLine = '«';
    const quoteLines = [];
    for (const w of words) {
      const test = curLine + (curLine === '«' ? '' : ' ') + w;
      if (ctx.measureText(test).width > maxQuoteWidth && curLine !== '«') {
        quoteLines.push(curLine);
        curLine = w;
      } else {
        curLine = test;
      }
    }
    curLine += '»';
    quoteLines.push(curLine);

    for (const line of quoteLines.slice(0, 3)) {
      ctx.fillText(line, 540, textY);
      textY += 52;
    }
    textY += 30;
  }

  // 5. Track Title
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 52px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  const title = track.title.length > 32 ? track.title.slice(0, 31) + '…' : track.title;
  ctx.fillText(title, 540, textY);

  // 6. Artist
  textY += 60;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.68)';
  ctx.font = '500 36px system-ui, -apple-system, sans-serif';
  const artist = track.artist.length > 40 ? track.artist.slice(0, 39) + '…' : track.artist;
  ctx.fillText(artist, 540, textY);

  // 7. Footer Sway branding
  ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.font = '600 24px system-ui, -apple-system, sans-serif';
  ctx.letterSpacing = '0.08em';
  ctx.fillText('SWAY · music.academmix.ru', 540, 1010);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

export async function shareTrack(track, { quote = '', timestamp = 0 } = {}) {
  const shareUrl = `${location.origin}/#track/${encodeURIComponent(track.id)}${timestamp > 0 ? `?t=${Math.floor(timestamp)}` : ''}`;
  const text = quote ? `«${quote}» — ${track.artist} · ${track.title}` : `${track.artist} — ${track.title}`;

  // Try generating image card
  let blob = null;
  try {
    blob = await createTrackCardBlob(track, { quote, timestamp });
  } catch {}

  const file = blob ? new File([blob], `${track.id}-sway.png`, { type: 'image/png' }) : null;

  if (navigator.share) {
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${track.artist} — ${track.title}`,
          text,
          files: [file],
          url: shareUrl
        });
        return { success: true, method: 'share-file' };
      }
      await navigator.share({
        title: `${track.artist} — ${track.title}`,
        text,
        url: shareUrl
      });
      return { success: true, method: 'share-url' };
    } catch (err) {
      if (err.name === 'AbortError') return { success: false, aborted: true };
    }
  }

  // Fallback: copy link & download image
  try {
    await navigator.clipboard.writeText(shareUrl);
  } catch {}

  if (blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Sway-${track.title}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  return { success: true, method: 'fallback-copied' };
}
