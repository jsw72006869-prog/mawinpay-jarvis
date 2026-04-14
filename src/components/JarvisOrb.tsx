

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { JarvisState } from '../lib/jarvis-brain';

interface JarvisOrbProps {
  state: JarvisState;
  audioLevel?: number;
}

export default function JarvisOrb({ state, audioLevel = 0 }: JarvisOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 510;
    canvas.width = size;
    canvas.height = size;
    const cx = size / 2;
    const cy = size / 2;

    const animate = () => {
      timeRef.current += 0.018;
      const t = timeRef.current;

      ctx.clearRect(0, 0, size, size);

      // 상태별 색상
      const colors: Record<JarvisState, { primary: string; secondary: string; r: number; g: number; b: number; r2: number; g2: number; b2: number }> = {
        idle:      { primary: '#0066FF', secondary: '#00F5FF', r: 0, g: 102, b: 255, r2: 0, g2: 245, b2: 255 },
        listening: { primary: '#FF6B35', secondary: '#FFB347', r: 255, g: 107, b: 53, r2: 255, g2: 179, b2: 71 },
        thinking:  { primary: '#7C3AED', secondary: '#A78BFA', r: 124, g: 58, b: 237, r2: 167, g2: 139, b2: 250 },
        speaking:  { primary: '#00F5FF', secondary: '#FFFFFF', r: 0, g: 245, b: 255, r2: 255, g2: 255, b2: 255 },
        working:   { primary: '#22C55E', secondary: '#86EFAC', r: 34, g: 197, b: 94, r2: 134, g2: 239, b2: 172 },
      };

      const c = colors[state];
      const audioBoost = audioLevel * 25;
      const baseRadius = 135;
      const pulseRadius = baseRadius + Math.sin(t * 2) * 6 + audioBoost;

      // ── 외부 글로우 링들 ──
      for (let i = 3; i >= 1; i--) {
        const r = pulseRadius + i * 20 + Math.sin(t * 1.2 + i) * 4;
        const alpha = 0.08 + (3 - i) * 0.06;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${c.r2},${c.g2},${c.b2},${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // ── 레이더 스캔 (working 상태) ──
      if (state === 'working') {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * 2.5);
        // 레이더 선
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(pulseRadius + 50, 0);
        ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},0.9)`;
        ctx.lineWidth = 2;
        ctx.stroke();
        // 레이더 페이드 아크
        for (let angle = 0; angle < Math.PI * 0.6; angle += 0.04) {
          const alpha = (1 - angle / (Math.PI * 0.6)) * 0.15;
          ctx.beginPath();
          ctx.arc(0, 0, pulseRadius + 50, -angle, 0);
          ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${alpha})`;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.restore();
      }

      // ── 오디오 파형 (listening/speaking) ──
      if (state === 'listening' || state === 'speaking') {
        const wavePoints = 128;
        ctx.beginPath();
        for (let i = 0; i <= wavePoints; i++) {
          const angle = (i / wavePoints) * Math.PI * 2;
          const freq1 = Math.sin(angle * 8 + t * 6) * (6 + audioLevel * 18);
          const freq2 = Math.sin(angle * 12 + t * 4) * (3 + audioLevel * 8);
          const wave = freq1 + freq2;
          const r = pulseRadius + wave;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},0.7)`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // ── 회전 링 (thinking) ──
      if (state === 'thinking') {
        for (let i = 0; i < 4; i++) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(t * (0.8 + i * 0.4) * (i % 2 === 0 ? 1 : -1));
          ctx.beginPath();
          ctx.ellipse(0, 0, 60 + i * 18, 22 + i * 6, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${c.r2},${c.g2},${c.b2},${0.5 - i * 0.08})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }
      }

      // ── 메인 오브 그라디언트 ──
      const grad = ctx.createRadialGradient(
        cx - pulseRadius * 0.25, cy - pulseRadius * 0.25, 0,
        cx, cy, pulseRadius
      );
      grad.addColorStop(0, `rgba(${c.r2},${c.g2},${c.b2},0.35)`);
      grad.addColorStop(0.35, `rgba(${c.r},${c.g},${c.b},0.25)`);
      grad.addColorStop(0.75, `rgba(${c.r},${c.g},${c.b},0.12)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.beginPath();
      ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // ── 오브 테두리 글로우 ──
      const edgeGrad = ctx.createRadialGradient(cx, cy, pulseRadius - 8, cx, cy, pulseRadius + 25);
      edgeGrad.addColorStop(0, `rgba(${c.r2},${c.g2},${c.b2},0.9)`);
      edgeGrad.addColorStop(0.4, `rgba(${c.r2},${c.g2},${c.b2},0.4)`);
      edgeGrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.beginPath();
      ctx.arc(cx, cy, pulseRadius + 12, 0, Math.PI * 2);
      ctx.fillStyle = edgeGrad;
      ctx.fill();

      // ── 내부 코어 ──
      const coreGrad = ctx.createRadialGradient(cx - 18, cy - 18, 0, cx, cy, 45);
      coreGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
      coreGrad.addColorStop(0.3, `rgba(${c.r2},${c.g2},${c.b2},0.8)`);
      coreGrad.addColorStop(0.7, `rgba(${c.r},${c.g},${c.b},0.3)`);
      coreGrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.beginPath();
      ctx.arc(cx, cy, 45, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();

      // ── 십자선 (idle) ──
      if (state === 'idle') {
        const crossAlpha = 0.15 + Math.sin(t * 0.8) * 0.08;
        ctx.save();
        ctx.globalAlpha = crossAlpha;
        ctx.strokeStyle = `rgba(${c.r2},${c.g2},${c.b2},1)`;
        ctx.lineWidth = 0.7;
        ctx.setLineDash([5, 10]);
        ctx.beginPath();
        ctx.moveTo(cx - pulseRadius - 40, cy);
        ctx.lineTo(cx + pulseRadius + 40, cy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - pulseRadius - 40);
        ctx.lineTo(cx, cy + pulseRadius + 40);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // ── 회전 데이터 포인트 ──
      const dotCount = state === 'working' ? 16 : state === 'thinking' ? 10 : 8;
      for (let i = 0; i < dotCount; i++) {
        const angle = (i / dotCount) * Math.PI * 2 + t * (state === 'working' ? 2.5 : 0.6);
        const r = pulseRadius + 22 + Math.sin(t * 2 + i) * 5;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        const dotSize = i % 4 === 0 ? 4 : i % 2 === 0 ? 2.5 : 1.5;
        const dotAlpha = i % 4 === 0 ? 1 : 0.6;
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c.r2},${c.g2},${c.b2},${dotAlpha})`;
        ctx.fill();
        // 큰 점에 글로우
        if (i % 4 === 0) {
          ctx.beginPath();
          ctx.arc(x, y, dotSize + 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${c.r2},${c.g2},${c.b2},0.15)`;
          ctx.fill();
        }
      }

      // ── HUD 눈금 ──
      const tickCount = 36;
      for (let i = 0; i < tickCount; i++) {
        const angle = (i / tickCount) * Math.PI * 2;
        const isLong = i % 9 === 0;
        const isMed = i % 3 === 0;
        const len = isLong ? 14 : isMed ? 8 : 4;
        const r1 = pulseRadius + 28;
        const r2 = r1 + len;
        const alpha = isLong ? 0.8 : isMed ? 0.5 : 0.25;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
        ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
        ctx.strokeStyle = `rgba(${c.r2},${c.g2},${c.b2},${alpha})`;
        ctx.lineWidth = isLong ? 1.5 : 0.8;
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, [state, audioLevel]);

  const glowColors: Record<JarvisState, string> = {
    idle:      'rgba(0,102,255,0.35)',
    listening: 'rgba(255,107,53,0.45)',
    thinking:  'rgba(124,58,237,0.4)',
    speaking:  'rgba(0,245,255,0.55)',
    working:   'rgba(34,197,94,0.4)',
  };

  const filterColors: Record<JarvisState, string[]> = {
    idle:      ['drop-shadow(0 0 20px #0066FF)', 'drop-shadow(0 0 40px #0066FF80)', 'drop-shadow(0 0 20px #0066FF)'],
    listening: ['drop-shadow(0 0 25px #FF6B35)', 'drop-shadow(0 0 50px #FF6B35)', 'drop-shadow(0 0 25px #FF6B35)'],
    thinking:  ['drop-shadow(0 0 20px #7C3AED)', 'drop-shadow(0 0 40px #7C3AED)', 'drop-shadow(0 0 20px #7C3AED)'],
    speaking:  ['drop-shadow(0 0 30px #00F5FF)', 'drop-shadow(0 0 60px #00F5FF)', 'drop-shadow(0 0 30px #00F5FF)'],
    working:   ['drop-shadow(0 0 20px #22C55E)', 'drop-shadow(0 0 40px #22C55E)', 'drop-shadow(0 0 20px #22C55E)'],
  };

  return (
    <div className="relative flex items-center justify-center" style={{ width: 570, height: 570 }}>
      {/* 배경 글로우 */}
      <motion.div
        className="absolute rounded-full"
        style={{ width: 570, height: 570, background: `radial-gradient(circle, ${glowColors[state]} 0%, transparent 70%)` }}
        animate={{ scale: state === 'speaking' ? [1, 1.08, 1] : state === 'listening' ? [1, 1.04, 1] : [1, 1.02, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* 확장 링 (활성 상태) */}
      <AnimatePresence>
        {state !== 'idle' && (
          <>
            <motion.div
              className="absolute rounded-full border border-cyan-400/15"
              initial={{ width: 500, height: 500, opacity: 0 }}
              animate={{ width: 700, height: 700, opacity: [0, 0.4, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
            />
            <motion.div
              className="absolute rounded-full border border-cyan-400/08"
              initial={{ width: 500, height: 500, opacity: 0 }}
              animate={{ width: 800, height: 800, opacity: [0, 0.25, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut', delay: 0.7 }}
            />
          </>
        )}
      </AnimatePresence>

      {/* 메인 캔버스 */}
      <motion.canvas
        ref={canvasRef}
        className="relative z-10 cursor-pointer"
        style={{ width: '510px', height: '510px', display: 'block', minWidth: '510px', minHeight: '510px' }}
        animate={{ filter: filterColors[state] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      />
    </div>
  );
}
