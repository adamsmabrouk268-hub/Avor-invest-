import React, { useEffect, useRef, useState } from 'react';

interface MachineNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  scale: number;
  alpha: number;
  model: 'AV1_GENESIS' | 'AV1_HIGH_YIELD' | 'AV2_SURGE' | 'AV2_TITAN' | 'AV_QUANTUM';
  name: string;
  tag: string;
  fanCount: number;
  fanAngle: number;
  fanSpeed: number;
  ledBlinkPhase: number;
  statusText: string;
  hashrate: string;
  driftSpeed: number;
  driftAmp: number;
  phase: number;
  accentColor: string;
  neonColor: string;
}

interface BokehParticle {
  x: number;
  y: number;
  radius: number;
  vy: number;
  vx: number;
  alpha: number;
  baseAlpha: number;
  color: string;
  pulseSpeed: number;
}

export const LiveWallpaper: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [_isVideoLoaded, setIsVideoLoaded] = useState(false);
  const isVideoLoadedRef = useRef(false);

  useEffect(() => {
    // Attempt background video playback (handles autoplay policies)
    const video = videoRef.current;
    if (video) {
      video.muted = true;
      const tryPlay = () => {
        video.play().then(() => {
          setIsVideoLoaded(true);
          isVideoLoadedRef.current = true;
        }).catch(() => {
          // Autoplay blocked by browser policy; canvas will deliver full 60fps cinematic animation
        });
      };
      tryPlay();

      const handleUserGesture = () => {
        if (video && video.paused) {
          video.play().then(() => {
            setIsVideoLoaded(true);
            isVideoLoadedRef.current = true;
          }).catch(() => {});
        }
      };
      window.addEventListener('click', handleUserGesture, { once: true });
      window.addEventListener('touchstart', handleUserGesture, { once: true });
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // Initial pool of moving high-tech compute machines (Categorized in AVs and AVclasses)
    const machineModels: Array<{
      model: MachineNode['model'];
      name: string;
      tag: string;
      width: number;
      height: number;
      fanCount: number;
      statusText: string;
      hashrate: string;
      accentColor: string;
      neonColor: string;
    }> = [
      // === AVs SERIES ===
      {
        model: 'AV1_GENESIS',
        name: 'AV1 - Node 01',
        tag: 'AV1 NODE',
        width: 175,
        height: 78,
        fanCount: 2,
        statusText: 'ACTIVE (1 UNIT)',
        hashrate: '120 TH/s',
        accentColor: '#2563eb',
        neonColor: '#38bdf8',
      },
      {
        model: 'AV1_HIGH_YIELD',
        name: 'AV1 - Machine 3',
        tag: 'HIGH YIELD',
        width: 185,
        height: 80,
        fanCount: 2,
        statusText: 'BOOSTED',
        hashrate: '380 TH/s',
        accentColor: '#0ea5e9',
        neonColor: '#00f0ff',
      },
      {
        model: 'AV2_SURGE',
        name: 'AV2 - Premier 01',
        tag: 'AV2 PREMIER',
        width: 215,
        height: 72,
        fanCount: 3,
        statusText: 'PREMIER TIER',
        hashrate: '550 TH/s',
        accentColor: '#1d4ed8',
        neonColor: '#60a5fa',
      },
      {
        model: 'AV2_TITAN',
        name: 'AV2 - Titan Matrix',
        tag: 'PREMIER TIER',
        width: 225,
        height: 84,
        fanCount: 3,
        statusText: 'PREMIER ARRAY',
        hashrate: '880 TH/s',
        accentColor: '#0284c7',
        neonColor: '#00f0ff',
      },
      // === AVCLASSES ONLY ===
      {
        model: 'AV_QUANTUM',
        name: 'AV Class A Prime',
        tag: 'AVCLASS A',
        width: 195,
        height: 82,
        fanCount: 2,
        statusText: 'MON-MON ⚡',
        hashrate: '120 TH/s',
        accentColor: '#06b6d4',
        neonColor: '#22d3ee',
      },
      {
        model: 'AV_QUANTUM',
        name: 'AV Class B Sovereign',
        tag: 'AVCLASS B',
        width: 205,
        height: 82,
        fanCount: 3,
        statusText: 'WALLET ONLY',
        hashrate: '280 TH/s',
        accentColor: '#2563eb',
        neonColor: '#00f0ff',
      },
      {
        model: 'AV_QUANTUM',
        name: 'AV Class I Supreme',
        tag: 'AVCLASS I',
        width: 230,
        height: 86,
        fanCount: 3,
        statusText: 'SUPREME GENESIS',
        hashrate: '50.0 GH/s',
        accentColor: '#0ea5e9',
        neonColor: '#38bdf8',
      },
    ];

    const count = Math.max(8, Math.min(14, Math.floor(width / 135)));
    const machines: MachineNode[] = [];

    for (let i = 0; i < count; i++) {
      const template = machineModels[i % machineModels.length];
      const scale = 0.58 + Math.random() * 0.46; // Depth layering
      const isHeadingRight = Math.random() > 0.35;
      const speedMagnitude = (0.45 + Math.random() * 0.65) * (0.8 + scale * 0.3);

      machines.push({
        x: Math.random() * width,
        y: (height * 0.08) + (Math.random() * (height * 0.82)),
        vx: isHeadingRight ? speedMagnitude : -speedMagnitude,
        vy: (Math.random() - 0.5) * 0.25,
        width: template.width,
        height: template.height,
        scale,
        alpha: 0.72 + scale * 0.28,
        model: template.model,
        name: template.name,
        tag: template.tag,
        fanCount: template.fanCount,
        fanAngle: Math.random() * Math.PI * 2,
        fanSpeed: 0.09 + Math.random() * 0.07,
        ledBlinkPhase: Math.random() * Math.PI * 2,
        statusText: template.statusText,
        hashrate: template.hashrate,
        driftSpeed: 0.6 + Math.random() * 0.6,
        driftAmp: 10 + Math.random() * 15,
        phase: Math.random() * Math.PI * 2,
        accentColor: template.accentColor,
        neonColor: template.neonColor,
      });
    }

    // Floating cinematic cyber dust / bokeh particles
    const bokehColors = ['#00f0ff', '#38bdf8', '#60a5fa', '#2563eb', '#93c5fd'];
    const bokehs: BokehParticle[] = [];
    const bokehCount = Math.min(50, Math.floor(width / 30));
    for (let i = 0; i < bokehCount; i++) {
      bokehs.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 1 + Math.random() * 2.8,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -0.2 - Math.random() * 0.55,
        alpha: 0.15 + Math.random() * 0.45,
        baseAlpha: 0.2 + Math.random() * 0.4,
        color: bokehColors[Math.floor(Math.random() * bokehColors.length)],
        pulseSpeed: 1 + Math.random() * 2,
      });
    }

    // Interactive pointer ripples
    const ripples: Array<{
      x: number;
      y: number;
      radius: number;
      maxRadius: number;
      alpha: number;
    }> = [];

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY;
      if (clientX !== undefined && clientY !== undefined && ripples.length < 8) {
        ripples.push({
          x: clientX,
          y: clientY,
          radius: 4,
          maxRadius: 105,
          alpha: 0.55,
        });

        // Boost fan speed of nearby machines on mouse proximity
        for (const m of machines) {
          const dx = m.x - clientX;
          const dy = m.y - clientY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180) {
            m.fanSpeed = Math.min(0.28, m.fanSpeed * 1.1);
          }
        }
      }
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    window.addEventListener('touchstart', handlePointerMove, { passive: true });

    let t = 0;

    // Helper: Draw spinning aerodynamic turbine fan with glowing cyan rim
    const drawFan = (
      x: number,
      y: number,
      radius: number,
      angle: number,
      accent: string,
      neon: string
    ) => {
      ctx.save();

      // Outer bezel with neon cyan glow
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = neon;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = neon;
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inner dark turbine chamber
      ctx.beginPath();
      ctx.arc(x, y, radius - 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#050c1e';
      ctx.fill();

      // Fan Blades (5 rotating aerodynamic curved blades)
      const bladeCount = 5;
      for (let i = 0; i < bladeCount; i++) {
        const bladeAngle = angle + (i * (Math.PI * 2)) / bladeCount;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const tipX = x + Math.cos(bladeAngle) * (radius * 0.85);
        const tipY = y + Math.sin(bladeAngle) * (radius * 0.85);
        const cpX = x + Math.cos(bladeAngle + 0.35) * (radius * 0.58);
        const cpY = y + Math.sin(bladeAngle + 0.35) * (radius * 0.58);
        ctx.quadraticCurveTo(cpX, cpY, tipX, tipY);
        ctx.strokeStyle = '#93c5fd';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Center motor rotor hub
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Center glowing cyan jewel
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = neon;
      ctx.shadowColor = neon;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
    };

    // Helper: Draw single high-tech compute machine node
    const drawMachine = (m: MachineNode, time: number) => {
      ctx.save();
      ctx.translate(m.x, m.y + Math.sin(time * m.driftSpeed + m.phase) * m.driftAmp);
      ctx.scale(m.scale, m.scale);
      ctx.globalAlpha = m.alpha;

      const w = m.width;
      const h = m.height;
      const r = 10;

      // Deep cinematic neon drop shadow
      ctx.shadowColor = m.neonColor;
      ctx.shadowBlur = 18 * m.scale;
      ctx.shadowOffsetY = 6 * m.scale;

      // 1. Machine Outer Casing: Sleek Dark Obsidian & Brushed Cyber Titanium
      const chassisGrad = ctx.createLinearGradient(0, 0, w, h);
      chassisGrad.addColorStop(0, '#0f1c3f');
      chassisGrad.addColorStop(0.3, '#091228');
      chassisGrad.addColorStop(0.7, '#050a16');
      chassisGrad.addColorStop(1, '#02050b');

      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, r);
      ctx.fillStyle = chassisGrad;
      ctx.fill();

      // Outer glowing neon border
      ctx.strokeStyle = m.neonColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Reset shadow for inner elements
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // 2. Top Heatsink Fins & Heat Pipes
      ctx.fillStyle = '#1e293b';
      for (let fx = 16; fx < w - 16; fx += 8) {
        ctx.fillRect(fx, -4, 3, 4);
      }
      // Glowing blue copper heat-pipe run
      ctx.beginPath();
      ctx.moveTo(12, -2);
      ctx.lineTo(w - 12, -2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 3. Top Accent Color Bar
      ctx.fillStyle = m.accentColor;
      ctx.fillRect(0, 0, w, 3);

      // 4. Side Handle Brackets (Rack mount hardware)
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.roundRect(-4, h * 0.2, 5, h * 0.6, 2);
      ctx.roundRect(w - 1, h * 0.2, 5, h * 0.6, 2);
      ctx.fill();

      // 5. Fans Zone & Dynamic Rotating Cooling Turbines
      const fanRadius = Math.min(26, (h - 16) / 2);
      const fanSpacing = (w * 0.58) / m.fanCount;
      const fanStartX = 18 + fanRadius;
      const fanCenterY = h / 2 + 1;

      for (let f = 0; f < m.fanCount; f++) {
        const fanX = fanStartX + f * fanSpacing;
        drawFan(fanX, fanCenterY, fanRadius, m.fanAngle * (f % 2 === 0 ? 1 : -1), m.accentColor, m.neonColor);
      }

      // 6. Right Tech Panel: LCD Hashrate Screen, Ports & Status
      const panelX = w * 0.66;
      const panelW = w * 0.30;

      // Digital Screen Box (Pitch Black Glass with neon border)
      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.roundRect(panelX, 10, panelW, 28, 4);
      ctx.fill();
      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth = 1;
      ctx.stroke();

      // LCD Text Readout (Hashrate & Tag)
      ctx.font = 'bold 8px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(m.tag, panelX + 4, 21);
      ctx.font = '900 9px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 5;
      ctx.fillText(m.hashrate, panelX + 4, 33);
      ctx.shadowBlur = 0;

      // Machine Title Label below LCD
      ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(m.name, panelX, 48);

      // Status indicator tag
      ctx.fillStyle = 'rgba(14, 165, 233, 0.2)';
      ctx.beginPath();
      ctx.roundRect(panelX, 52, panelW, 14, 3);
      ctx.fill();
      ctx.font = 'bold 7.5px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = m.neonColor;
      ctx.fillText(`• ${m.statusText}`, panelX + 4, 62);

      // 7. Blinking Status LEDs (Power, Data, Hardware Online)
      const ledY = h - 10;
      const isBlinking = Math.sin(time * 4 + m.ledBlinkPhase) > 0;

      // Green Power LED
      ctx.beginPath();
      ctx.arc(panelX + 4, ledY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 4;
      ctx.fill();

      // Cyan Data Rx/Tx LED
      ctx.beginPath();
      ctx.arc(panelX + 13, ledY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isBlinking ? '#00f0ff' : '#0e7490';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = isBlinking ? 6 : 0;
      ctx.fill();

      // Royal Blue Network Link LED
      ctx.beginPath();
      ctx.arc(panelX + 22, ledY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = !isBlinking ? '#38bdf8' : '#1e3a8a';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = !isBlinking ? 5 : 0;
      ctx.fill();
      ctx.shadowBlur = 0;

      // 8. Hexagonal Airflow Exhaust Vents
      ctx.fillStyle = '#0ea5e9';
      for (let vy = 12; vy < h - 14; vy += 6) {
        ctx.fillRect(8, vy, 4, 2.5);
      }

      ctx.restore();
    };

    // Main render loop
    const render = () => {
      t += 0.016;
      ctx.clearRect(0, 0, width, height);

      // 1. Cinematic Black & Blue Atmosphere
      if (!isVideoLoadedRef.current) {
        // High-fidelity fallback backdrop when video is loading
        const bgGrad = ctx.createLinearGradient(0, 0, width, height);
        bgGrad.addColorStop(0, '#01040a'); // Deepest obsidian black
        bgGrad.addColorStop(0.35, '#03081a'); // Midnight blue
        bgGrad.addColorStop(0.7, '#061338'); // Electric cobalt blue
        bgGrad.addColorStop(1, '#02050e'); // Vignette obsidian
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);
      } else {
        // Translucent cinema atmosphere letting the background video motion loop shine through
        const vignetteGrad = ctx.createRadialGradient(
          width * 0.5,
          height * 0.5,
          width * 0.15,
          width * 0.5,
          height * 0.5,
          width * 0.82
        );
        vignetteGrad.addColorStop(0, 'rgba(1, 4, 12, 0.10)');
        vignetteGrad.addColorStop(0.5, 'rgba(3, 8, 24, 0.35)');
        vignetteGrad.addColorStop(1, 'rgba(1, 3, 9, 0.82)');
        ctx.fillStyle = vignetteGrad;
        ctx.fillRect(0, 0, width, height);
      }

      // Radial Volumetric Spotlight Drifting (Cinematic blue lighting)
      const spotX = width * 0.5 + Math.cos(t * 0.4) * (width * 0.28);
      const spotY = height * 0.45 + Math.sin(t * 0.5) * (height * 0.18);
      const radGrad = ctx.createRadialGradient(spotX, spotY, 20, spotX, spotY, width * 0.65);
      radGrad.addColorStop(0, 'rgba(0, 240, 255, 0.18)');
      radGrad.addColorStop(0.35, 'rgba(14, 165, 233, 0.09)');
      radGrad.addColorStop(0.75, 'rgba(30, 58, 138, 0.04)');
      radGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Anamorphic Horizontal Movie Lens Flares (Sci-fi cinema anamorphic streak)
      ctx.save();
      const flareY1 = height * 0.35 + Math.sin(t * 0.3) * 35;
      const flareY2 = height * 0.65 + Math.cos(t * 0.25) * 45;

      // Flare 1 - Electric Cyan Panavision Anamorphic Streak
      const flareGrad1 = ctx.createLinearGradient(0, flareY1, width, flareY1);
      flareGrad1.addColorStop(0, 'rgba(0, 240, 255, 0)');
      flareGrad1.addColorStop(0.2, 'rgba(0, 240, 255, 0.08)');
      flareGrad1.addColorStop(0.5, 'rgba(255, 255, 255, 0.7)');
      flareGrad1.addColorStop(0.8, 'rgba(0, 240, 255, 0.08)');
      flareGrad1.addColorStop(1, 'rgba(0, 240, 255, 0)');
      ctx.fillStyle = flareGrad1;
      ctx.fillRect(0, flareY1 - 2, width, 4);

      // Flare 2 - Cobalt Blue Cine Streak
      const flareGrad2 = ctx.createLinearGradient(0, flareY2, width, flareY2);
      flareGrad2.addColorStop(0, 'rgba(37, 99, 235, 0)');
      flareGrad2.addColorStop(0.3, 'rgba(37, 99, 235, 0.12)');
      flareGrad2.addColorStop(0.5, 'rgba(96, 165, 250, 0.65)');
      flareGrad2.addColorStop(0.7, 'rgba(37, 99, 235, 0.12)');
      flareGrad2.addColorStop(1, 'rgba(37, 99, 235, 0)');
      ctx.fillStyle = flareGrad2;
      ctx.fillRect(0, flareY2 - 1.5, width, 3);
      ctx.restore();

      // 3. 3D Cyber Perspective Grid Floor (Receding into horizon)
      ctx.save();
      const horizonY = height * 0.62;
      const gridSpacing = 52;
      const gridSpeed = (t * 22) % gridSpacing;

      // Horizontal depth lines
      for (let y = horizonY; y <= height; y += 18) {
        const depth = (y - horizonY) / (height - horizonY); // 0 at horizon, 1 at bottom
        const lineAlpha = depth * depth * 0.18;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.strokeStyle = `rgba(0, 240, 255, ${lineAlpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Vertical perspective vanishing lines
      const vanishingX = width * 0.5;
      const spreadCount = 20;
      for (let i = -spreadCount; i <= spreadCount; i++) {
        const targetX = vanishingX + i * 85 + gridSpeed * (i >= 0 ? 1 : -1) * 0.2;
        ctx.beginPath();
        ctx.moveTo(vanishingX, horizonY);
        ctx.lineTo(targetX, height);
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.09)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      // 4. Floating Cinematic Data Dust / Bokeh Particles
      ctx.save();
      for (const p of bokehs) {
        p.y += p.vy;
        p.x += p.vx;
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        const pulse = 0.7 + 0.3 * Math.sin(t * p.pulseSpeed);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * pulse;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.fill();
      }
      ctx.restore();

      // 5. Laser Data Bus Beams connecting nearby machines
      ctx.save();
      for (let i = 0; i < machines.length; i++) {
        for (let j = i + 1; j < machines.length; j++) {
          const m1 = machines[i];
          const m2 = machines[j];
          const dx = (m2.x + m2.width * 0.5) - (m1.x + m1.width * 0.5);
          const dy = (m2.y + m2.height * 0.5) - (m1.y + m1.height * 0.5);
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 280) {
            const lineAlpha = (1 - dist / 280) * 0.35;
            ctx.beginPath();
            ctx.moveTo(m1.x + m1.width * 0.5, m1.y + m1.height * 0.5);
            ctx.lineTo(m2.x + m2.width * 0.5, m2.y + m2.height * 0.5);
            ctx.strokeStyle = `rgba(0, 240, 255, ${lineAlpha})`;
            ctx.lineWidth = 1.4;
            ctx.setLineDash([5, 4]);
            ctx.lineDashOffset = -t * 28;
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = 6;
            ctx.stroke();

            // Zipping laser photon packet
            const packetPos = (t * 0.65 + i * 0.25) % 1;
            const px = (m1.x + m1.width * 0.5) + dx * packetPos;
            const py = (m1.y + m1.height * 0.5) + dy * packetPos;
            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = 10;
            ctx.fill();
          }
        }
      }
      ctx.restore();

      // 6. Update and Render Moving Compute Machines (Smooth Loop Across Viewport)
      for (const m of machines) {
        m.x += m.vx;

        const totalW = m.width * m.scale;
        if (m.vx > 0 && m.x > width + 50) {
          m.x = -totalW - 50;
          m.y = (height * 0.08) + (Math.random() * (height * 0.82));
        } else if (m.vx < 0 && m.x < -totalW - 50) {
          m.x = width + 50;
          m.y = (height * 0.08) + (Math.random() * (height * 0.82));
        }

        m.fanAngle += m.fanSpeed;
        drawMachine(m, t);
      }

      // 7. Interactive Neon Blue Shockwave Ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += 2.2;
        r.alpha *= 0.94;

        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 240, 255, ${r.alpha})`;
        ctx.lineWidth = 1.75;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;

        if (r.alpha <= 0.02 || r.radius >= r.maxRadius) {
          ripples.splice(i, 1);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('touchstart', handlePointerMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="video-background black-blue-theme"
    >
      {/* Background Video Container with black and blue cinematic loop */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        id="bg-video"
        onCanPlay={() => {
          setIsVideoLoaded(true);
          isVideoLoadedRef.current = true;
        }}
        onPlaying={() => {
          setIsVideoLoaded(true);
          isVideoLoadedRef.current = true;
        }}
        onLoadedData={() => {
          setIsVideoLoaded(true);
          isVideoLoadedRef.current = true;
        }}
      >
        <source src="background.mp4" type="video/mp4" />
        <source src="/background.mp4" type="video/mp4" />
        Your browser does not support HTML5 video.
      </video>

      {/* Dynamic Moving Machines Canvas Motion Loop */}
      <canvas
        ref={canvasRef}
        className="live-wallpaper-canvas"
      />

      {/* Cinematic Anamorphic Blue Movie Overlay */}
      <div className="video-overlay-movie" />

      {/* Top & Bottom Cinematic Widescreen Letterbox */}
      <div className="cinema-letterbox-top" />
      <div className="cinema-letterbox-bottom" />
    </div>
  );
};
