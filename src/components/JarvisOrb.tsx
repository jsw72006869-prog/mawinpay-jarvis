
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { JarvisState } from '../lib/jarvis-brain';

interface JarvisOrbProps {
  state: JarvisState;
  audioLevel?: number;
}

export default function JarvisOrb({ state, audioLevel = 0 }: JarvisOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const stateRef = useRef(state);
  const audioRef = useRef(audioLevel);
  stateRef.current = state;
  audioRef.current = audioLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 화면 크기에 맞게 동적으로 설정
    const updateSize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const size = Math.min(vw, vh) * 0.72;
      canvas.width = size;
      canvas.height = size;
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    const stateColors: Record<JarvisState, { core: string; mid: string; outer: string; glow: string }> = {
      idle:      { core: '#0066FF', mid: '#0044CC', outer: '#001A66', glow: 'rgba(0,102,255,0.6)' },
      listening: { core: '#FF8C42', mid: '#FF6B35', outer: '#662200', glow: 'rgba(255,107,53,0.8)' },
      thinking:  { core: '#A855F7', mid: '#7C3AED', outer: '#3B0764', glow: 'rgba(124,58,237,0.8)' },
      speaking:  { core: '#00F5FF', mid: '#00BFCC', outer: '#003344', glow: 'rgba(0,245,255,0.9)' },
      working:   { core: '#4ADE80', mid: '#22C55E', outer: '#052E16', glow: 'rgba(34,197,94,0.8)' },
    };

    // 스파클 파티클 배열
    const sparkles: Array<{
      x: number; y: number; vx: number; vy: number;
      life: number; maxLife: number; size: number; color: string;
    }> = [];

    const addSparkles = (cx: number, cy: number, count: number, colors: string[]) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 3;
        sparkles.push({
          x: cx + (Math.random() - 0.5) * 20,
          y: cy + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 40 + Math.random() * 40,
          size: 1 + Math.random() * 3,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    };

    const animate = () => {
      timeRef.current += 0.018;
      const t = timeRef.current;
      const s = stateRef.current;
      const al = audioRef.current;
      const size = canvas.width;
      const cx = size / 2;
      const cy = size / 2;
      const baseR = size * 0.28;
      const colors = stateColors[s];

      ctx.clearRect(0, 0, size, size);

      // ── 외부 글로우 링 (대형) ──
      const outerGlow = ctx.createRadialGradient(cx, cy, baseR * 0.8, cx, cy, baseR * 1.8);
      outerGlow.addColorStop(0, colors.glow.replace('0.6', '0.12').replace('0.8', '0.15').replace('0.9', '0.18'));
      outerGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // ── 회전하는 외부 링들 ──
      for (let i = 0; i < 3; i++) {
        const ringR = baseR * (1.15 + i * 0.18);
        const speed = (i % 2 === 0 ? 1 : -1) * (0.3 + i * 0.15);
        const alpha = 0.3 - i * 0.08;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * speed);
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = colors.core + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.lineWidth = 1.5 - i * 0.3;
        ctx.setLineDash([8 + i * 4, 12 + i * 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 링 위의 빛나는 점들
        for (let j = 0; j < 4 + i * 2; j++) {
          const angle = (j / (4 + i * 2)) * Math.PI * 2 + t * speed;
          const px = Math.cos(angle) * ringR;
          const py = Math.sin(angle) * ringR;
          ctx.beginPath();
          ctx.arc(px, py, 2.5 - i * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = colors.core;
          ctx.shadowBlur = 8;
          ctx.shadowColor = colors.core;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }

      // ── HUD 눈금 링 ──
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.2);
      for (let i = 0; i < 72; i++) {
        const angle = (i / 72) * Math.PI * 2;
        const isLong = i % 6 === 0;
        const isMed = i % 3 === 0;
        const innerR = baseR * 1.05;
        const outerR = innerR + (isLong ? 14 : isMed ? 9 : 5);
        const alpha = isLong ? 0.9 : isMed ? 0.6 : 0.3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR);
        ctx.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR);
        ctx.strokeStyle = `${colors.core}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`;
        ctx.lineWidth = isLong ? 2 : 1;
        ctx.stroke();
      }
      ctx.restore();

      // ── 오브 본체 (구체 그라디언트) ──
      const pulse = 1 + Math.sin(t * 2.5) * 0.04 + al * 0.12;
      const orbR = baseR * pulse;

      // 외부 글로우
      const glowGrad = ctx.createRadialGradient(cx, cy, orbR * 0.3, cx, cy, orbR * 1.4);
      glowGrad.addColorStop(0, colors.glow.replace('0.6', '0.4').replace('0.8', '0.5').replace('0.9', '0.6'));
      glowGrad.addColorStop(0.5, colors.glow.replace('0.6', '0.15').replace('0.8', '0.2').replace('0.9', '0.25'));
      glowGrad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx, cy, orbR * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();

      // 메인 오브
      const orbGrad = ctx.createRadialGradient(cx - orbR * 0.25, cy - orbR * 0.25, 0, cx, cy, orbR);
      orbGrad.addColorStop(0, '#FFFFFF');
      orbGrad.addColorStop(0.15, colors.core);
      orbGrad.addColorStop(0.5, colors.mid);
      orbGrad.addColorStop(0.85, colors.outer);
      orbGrad.addColorStop(1, '#000510');
      ctx.beginPath();
      ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
      ctx.fillStyle = orbGrad;
      ctx.fill();

      // 오브 테두리 글로우
      ctx.beginPath();
      ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
      ctx.strokeStyle = colors.core;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 20;
      ctx.shadowColor = colors.core;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // ── 오브 내부 — 에너지 코어 ──
      const coreR = orbR * 0.35;
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      coreGrad.addColorStop(0, '#FFFFFF');
      coreGrad.addColorStop(0.3, colors.core + 'EE');
      coreGrad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();

      // ── 오브 내부 — 회전하는 에너지 라인 ──
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 1.5);
      ctx.beginPath();
      ctx.arc(0, 0, orbR * 0.6, 0, Math.PI * 2);
      ctx.strokeStyle = colors.core + '40';
      ctx.lineWidth = 1;
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * orbR * 0.55, Math.sin(angle) * orbR * 0.55);
        ctx.strokeStyle = colors.core + '30';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      // ── 오브 하이라이트 (반짝이는 빛 반사) ──
      const hlGrad = ctx.createRadialGradient(cx - orbR * 0.3, cy - orbR * 0.35, 0, cx - orbR * 0.3, cy - orbR * 0.35, orbR * 0.4);
      hlGrad.addColorStop(0, 'rgba(255,255,255,0.5)');
      hlGrad.addColorStop(0.5, 'rgba(255,255,255,0.1)');
      hlGrad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
      ctx.fillStyle = hlGrad;
      ctx.fill();

      // ── 스파클 생성 (상태에 따라 다르게) ──
      const sparkRate = s === 'listening' ? 4 : s === 'speaking' ? 6 : s === 'working' ? 8 : s === 'thinking' ? 3 : 1;
      if (Math.random() < sparkRate * 0.1) {
        const angle = Math.random() * Math.PI * 2;
        const r = orbR * (0.9 + Math.random() * 0.3);
        addSparkles(
          cx + Math.cos(angle) * r,
          cy + Math.sin(angle) * r,
          2 + Math.floor(Math.random() * 3),
          [colors.core, '#FFFFFF', colors.mid]
        );
      }

      // ── 스파클 렌더링 ──
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const sp = sparkles[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.05; // 중력
        sp.life++;

        if (sp.life >= sp.maxLife) {
          sparkles.splice(i, 1);
          continue;
        }

        const progress = sp.life / sp.maxLife;
        const alpha = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;
        const currentSize = sp.size * (1 - progress * 0.5);

        ctx.save();
        ctx.globalAlpha = alpha;
        // 별 모양 스파클
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          const r1 = currentSize * 2.5;
          const r2 = currentSize * 0.8;
          if (k === 0) ctx.moveTo(sp.x + Math.cos(a) * r1, sp.y + Math.sin(a) * r1);
          else ctx.lineTo(sp.x + Math.cos(a) * r1, sp.y + Math.sin(a) * r1);
          ctx.lineTo(sp.x + Math.cos(a + Math.PI / 4) * r2, sp.y + Math.sin(a + Math.PI / 4) * r2);
        }
        ctx.closePath();
        ctx.fillStyle = sp.color;
        ctx.shadowBlur = 6;
        ctx.shadowColor = sp.color;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // ── 음성 파형 링 (듣는 중 / 말하는 중) ──
      if (s === 'listening' || s === 'speaking') {
        const waveR = baseR * 1.35 + al * baseR * 0.3;
        for (let i = 0; i < 3; i++) {
          const r = waveR + i * 15;
          const alpha = (0.6 - i * 0.15) * (0.5 + al * 0.5);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.strokeStyle = `${colors.core}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`;
          ctx.lineWidth = 2 - i * 0.5;
          ctx.stroke();
        }
      }

      // ── 데이터 스트림 라인 (작업 중) ──
      if (s === 'working' || s === 'thinking') {
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + t * 0.5;
          const startR = baseR * 1.2;
          const endR = baseR * 1.6 + Math.sin(t * 3 + i) * 20;
          const alpha = 0.3 + Math.sin(t * 2 + i) * 0.2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * startR, cy + Math.sin(angle) * startR);
          ctx.lineTo(cx + Math.cos(angle) * endR, cy + Math.sin(angle) * endR);
          ctx.strokeStyle = `${colors.core}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* 외부 CSS 글로우 링 */}
      <motion.div
        style={{
          position: 'absolute',
          width: '110%',
          height: '110%',
          borderRadius: '50%',
          border: `1px solid ${
            state === 'listening' ? 'rgba(255,107,53,0.3)' :
            state === 'speaking' ? 'rgba(0,245,255,0.4)' :
            state === 'working' ? 'rgba(34,197,94,0.3)' :
            state === 'thinking' ? 'rgba(124,58,237,0.3)' :
            'rgba(0,102,255,0.2)'
          }`,
          boxShadow: `0 0 40px ${
            state === 'listening' ? 'rgba(255,107,53,0.2)' :
            state === 'speaking' ? 'rgba(0,245,255,0.3)' :
            state === 'working' ? 'rgba(34,197,94,0.2)' :
            state === 'thinking' ? 'rgba(124,58,237,0.2)' :
            'rgba(0,102,255,0.15)'
          }`,
        }}
        animate={{ scale: [1, 1.03, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        style={{
          position: 'absolute',
          width: '125%',
          height: '125%',
          borderRadius: '50%',
          border: `1px solid ${
            state === 'idle' ? 'rgba(0,102,255,0.1)' : 'rgba(0,245,255,0.08)'
          }`,
        }}
        animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          filter: `drop-shadow(0 0 30px ${
            state === 'listening' ? 'rgba(255,107,53,0.6)' :
            state === 'speaking' ? 'rgba(0,245,255,0.7)' :
            state === 'working' ? 'rgba(34,197,94,0.6)' :
            state === 'thinking' ? 'rgba(124,58,237,0.6)' :
            'rgba(0,102,255,0.5)'
          })`,
        }}
      />
    </div>
  );
}
