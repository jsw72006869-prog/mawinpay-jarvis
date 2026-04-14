

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
  life: number;
  maxLife: number;
  type: 'dot' | 'star';
}

interface DataStream {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  currentChar: number;
  opacity: number;
  color: string;
}

export default function ParticleBackground({ isActive }: { isActive: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const streamsRef = useRef<DataStream[]>([]);
  const isActiveRef = useRef(isActive);
  const timeRef = useRef(0);

  isActiveRef.current = isActive;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const streamChars = '01アイウエオ∑∆∏∫ABCDEF0123456789◈◉◊◌';

    const createParticle = (): Particle => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4 - 0.05,
      size: Math.random() * 1.8 + 0.4,
      opacity: Math.random() * 0.5 + 0.1,
      color: ['#00F5FF', '#0066FF', '#7C3AED', '#00B4FF'][Math.floor(Math.random() * 4)],
      life: 0,
      maxLife: Math.random() * 400 + 150,
      type: Math.random() < 0.15 ? 'star' : 'dot',
    });

    const createStream = (): DataStream => ({
      x: Math.random() * canvas.width,
      y: -20,
      speed: Math.random() * 1.2 + 0.4,
      chars: Array.from({ length: Math.floor(Math.random() * 12) + 4 }, () =>
        streamChars[Math.floor(Math.random() * streamChars.length)]
      ),
      currentChar: 0,
      opacity: Math.random() * 0.2 + 0.04,
      color: Math.random() > 0.5 ? '#00F5FF' : '#0066FF',
    });

    // 초기화
    for (let i = 0; i < 80; i++) {
      const p = createParticle();
      p.life = Math.random() * p.maxLife;
      particlesRef.current.push(p);
    }
    for (let i = 0; i < 15; i++) {
      const s = createStream();
      s.y = Math.random() * canvas.height;
      streamsRef.current.push(s);
    }

    let frame = 0;

    const animate = () => {
      timeRef.current += 0.008;
      const t = timeRef.current;
      const active = isActiveRef.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // ── 그리드 ──
      ctx.lineWidth = 0.5;
      const gridSize = 55;
      for (let x = 0; x < canvas.width; x += gridSize) {
        const alpha = 0.018 + Math.sin(t * 0.3 + x * 0.005) * 0.008;
        ctx.strokeStyle = `rgba(0,245,255,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        const alpha = 0.018 + Math.sin(t * 0.3 + y * 0.005) * 0.008;
        ctx.strokeStyle = `rgba(0,245,255,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // ── 파티클 ──
      particlesRef.current = particlesRef.current.filter(p => p.life < p.maxLife);
      const targetCount = active ? 130 : 80;
      while (particlesRef.current.length < targetCount) {
        particlesRef.current.push(createParticle());
      }

      particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        const lifeRatio = p.life / p.maxLife;
        const fade = lifeRatio < 0.1 ? lifeRatio / 0.1 : lifeRatio > 0.8 ? (1 - lifeRatio) / 0.2 : 1;
        const alpha = p.opacity * fade;

        if (p.type === 'star') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(t * 0.8);
          ctx.globalAlpha = alpha;
          const spikes = 4;
          const outerR = p.size * 2.5;
          const innerR = p.size;
          ctx.beginPath();
          for (let s = 0; s < spikes * 2; s++) {
            const r = s % 2 === 0 ? outerR : innerR;
            const a = (s / (spikes * 2)) * Math.PI * 2;
            if (s === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.restore();
        } else {
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
          // 글로우
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
          ctx.fillStyle = p.color.replace(')', ',0.08)').replace('rgb', 'rgba');
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      });

      // ── 파티클 연결선 (활성 상태) ──
      if (active) {
        const dots = particlesRef.current.filter(p => p.type === 'dot').slice(0, 60);
        for (let i = 0; i < dots.length; i++) {
          for (let j = i + 1; j < Math.min(i + 8, dots.length); j++) {
            const dx = dots[i].x - dots[j].x;
            const dy = dots[i].y - dots[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 90) {
              ctx.globalAlpha = (1 - dist / 90) * 0.07;
              ctx.beginPath();
              ctx.moveTo(dots[i].x, dots[i].y);
              ctx.lineTo(dots[j].x, dots[j].y);
              ctx.strokeStyle = '#00F5FF';
              ctx.lineWidth = 0.5;
              ctx.stroke();
              ctx.globalAlpha = 1;
            }
          }
        }
      }

      // ── 데이터 스트림 ──
      if (frame % 3 === 0) {
        streamsRef.current.forEach(s => {
          s.y += s.speed;
          s.currentChar = (s.currentChar + 1) % s.chars.length;
          if (s.y > canvas.height + 20) {
            s.x = Math.random() * canvas.width;
            s.y = -20;
            s.chars = Array.from({ length: Math.floor(Math.random() * 12) + 4 }, () =>
              streamChars[Math.floor(Math.random() * streamChars.length)]
            );
          }
          ctx.font = '10px Orbitron, monospace';
          s.chars.forEach((char, i) => {
            const alpha = s.opacity * (1 - i / s.chars.length);
            ctx.fillStyle = `rgba(0,245,255,${alpha})`;
            ctx.fillText(char, s.x, s.y - i * 14);
          });
        });

        const targetStreams = active ? 28 : 15;
        while (streamsRef.current.length < targetStreams) {
          streamsRef.current.push(createStream());
        }
      }

      // ── 수평 스캔 라인 (활성 상태) ──
      if (active) {
        const scanY = (t * 120) % canvas.height;
        const scanGrad = ctx.createLinearGradient(0, scanY - 60, 0, scanY + 60);
        scanGrad.addColorStop(0, 'rgba(0,245,255,0)');
        scanGrad.addColorStop(0.5, 'rgba(0,245,255,0.03)');
        scanGrad.addColorStop(1, 'rgba(0,245,255,0)');
        ctx.fillStyle = scanGrad;
        ctx.fillRect(0, scanY - 60, canvas.width, 120);
      }

      frame++;
      animRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="particles-canvas"
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}
