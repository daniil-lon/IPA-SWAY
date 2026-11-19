import sharp from 'sharp';
import fs from 'fs';

const { data, info } = await sharp('C:/Users/Даниил/.gemini/antigravity/brain/32b6f38f-24e5-405d-a29f-d3c896a7918c/star_crop.png')
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const isY = (x, y) => {
  if (x < 0 || x >= width || y < 0 || y >= height) return 0;
  const idx = (y * width + x) * channels;
  return (data[idx] > 200 && data[idx+1] > 200 && data[idx+2] < 50) ? 1 : 0;
};

const cx = 211.28, cy = 190.20;
const N = 240;
const rawPoints = [];
for (let i = 0; i < N; i++) {
  const a = (i * 2 * Math.PI) / N;
  const cos = Math.cos(a), sin = Math.sin(a);
  let maxR = 0;
  for (let r = 85; r >= 0; r--) {
    const x = Math.round(cx + r * cos);
    const y = Math.round(cy + r * sin);
    if (isY(x, y)) { maxR = r; break; }
  }
  const px = cx + maxR * cos;
  const py = cy + maxR * sin;
  const nx = (px - 126) / 147 * 80 + 10;
  const ny = (py - 126) / 147 * 80 + 10;
  rawPoints.push([nx, ny]);
}

// 2 passes of gentle smoothing
let pts = rawPoints;
for (let pass = 0; pass < 2; pass++) {
  pts = pts.map((p, i) => {
    const prev = pts[(i - 1 + N) % N];
    const next = pts[(i + 1) % N];
    return [
      0.2 * prev[0] + 0.6 * p[0] + 0.2 * next[0],
      0.2 * prev[1] + 0.6 * p[1] + 0.2 * next[1]
    ];
  });
}

const polyStr = pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <polygon points="${polyStr}" fill="#ffee00"/>
</svg>`;

fs.writeFileSync('C:/Users/Даниил/.gemini/antigravity/brain/32b6f38f-24e5-405d-a29f-d3c896a7918c/star_smooth.svg', svg);
await sharp(Buffer.from(svg)).resize(300, 300).png().toFile('C:/Users/Даниил/.gemini/antigravity/brain/32b6f38f-24e5-405d-a29f-d3c896a7918c/star_smooth_preview.png');
console.log('Smoothed SVG rendered successfully!');
