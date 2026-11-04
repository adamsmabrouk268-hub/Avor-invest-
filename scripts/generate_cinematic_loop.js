import fs from 'fs';
import { spawn } from 'child_process';

const W = 1280;
const H = 720;
const FPS = 30;
const DURATION = 6;
const TOTAL_FRAMES = FPS * DURATION;

console.log('Generating cinematic black & blue movie loop...');

const ffmpeg = spawn('ffmpeg', [
  '-y',
  '-f', 'rawvideo',
  '-pix_fmt', 'rgb24',
  '-s', `${W}x${H}`,
  '-r', `${FPS}`,
  '-i', '-',
  '-c:v', 'libx264',
  '-preset', 'veryfast',
  '-crf', '19',
  '-pix_fmt', 'yuv420p',
  'public/background.mp4'
]);

ffmpeg.stderr.on('data', data => {
  // ffmpeg logs
});

const frameBuffer = Buffer.alloc(W * H * 3);

// Generate procedural cinematic black & blue movie scene
// Includes: Deep space obsidian base, moving volumetric blue light rays, anamorphic horizontal flares, cyber grid & particle bokeh
for (let f = 0; f < TOTAL_FRAMES; f++) {
  const t = f / TOTAL_FRAMES; // 0 to 1 loop
  const angle = t * Math.PI * 2;

  // Moving light centers
  const cx1 = 0.5 + 0.28 * Math.cos(angle);
  const cy1 = 0.42 + 0.16 * Math.sin(angle);
  const cx2 = 0.5 - 0.22 * Math.cos(angle + 1.2);
  const cy2 = 0.58 - 0.14 * Math.sin(angle + 0.8);

  // Anamorphic horizontal lens flare parameters (sweeping slowly)
  const flareY1 = 0.38 + 0.08 * Math.sin(angle);
  const flareY2 = 0.62 + 0.08 * Math.cos(angle);

  for (let y = 0; y < H; y++) {
    const ny = y / H;
    const rowOffset = y * W * 3;

    // Flare profiles
    const flare1 = Math.exp(-Math.pow((ny - flareY1) * 35, 2));
    const flare2 = Math.exp(-Math.pow((ny - flareY2) * 45, 2));

    for (let x = 0; x < W; x++) {
      const nx = x / W;
      const idx = rowOffset + x * 3;

      // Volumetric radial blue light cores
      const d1 = Math.hypot((nx - cx1) * 1.6, ny - cy1);
      const d2 = Math.hypot((nx - cx2) * 1.4, (ny - cy2) * 1.2);
      const glow1 = Math.exp(-d1 * 2.8);
      const glow2 = Math.exp(-d2 * 3.2);

      // Deep obsidian gradient (darkest at bottom and corners)
      const vignette = 1.0 - Math.hypot(nx - 0.5, ny - 0.5) * 0.7;

      // Anamorphic horizontal lens streak intensity
      const streak1 = flare1 * (0.6 + 0.4 * Math.sin(nx * Math.PI * 2 + angle));
      const streak2 = flare2 * (0.5 + 0.5 * Math.cos(nx * Math.PI * 2 - angle));

      // Cyber digital horizon grid line
      const horizonDist = Math.abs(ny - 0.5);
      const perspectiveGrid = ny > 0.5 ? Math.sin((1 / Math.max(0.01, horizonDist)) * 25 + angle * 3) : 0;
      const gridGlow = ny > 0.5 && perspectiveGrid > 0.85 ? (1 - horizonDist) * 0.4 : 0;

      // Color composition (Black & Electric Blue)
      // Base: Pure obsidian black #01040a
      let r = 1 + glow1 * 12 + glow2 * 8 + streak1 * 35 + streak2 * 20;
      let g = 4 + glow1 * 60 + glow2 * 45 + streak1 * 130 + streak2 * 90 + gridGlow * 80;
      let b = 14 + glow1 * 165 + glow2 * 140 + streak1 * 255 + streak2 * 220 + gridGlow * 180;

      // Apply vignette
      r = Math.min(255, Math.max(0, Math.floor(r * vignette)));
      g = Math.min(255, Math.max(0, Math.floor(g * vignette)));
      b = Math.min(255, Math.max(0, Math.floor(b * vignette)));

      frameBuffer[idx] = r;
      frameBuffer[idx + 1] = g;
      frameBuffer[idx + 2] = b;
    }
  }

  ffmpeg.stdin.write(frameBuffer);
}

ffmpeg.stdin.end();

ffmpeg.on('close', code => {
  if (code === 0) {
    console.log('Successfully generated public/background.mp4');
    fs.copyFileSync('public/background.mp4', 'background.mp4');
    console.log('Copied to background.mp4');
  } else {
    console.error('FFmpeg exited with error code:', code);
  }
});
