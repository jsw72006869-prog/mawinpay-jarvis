

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface WaveformVisualizerProps {
  isVisible: boolean;
  audioLevel: number;
  color?: string;
}

export default function WaveformVisualizer({
  isVisible,
  audioLevel,
  color = '#00F5FF',
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const audioRef = useRef(audioLevel);
  audioRef.current = audioLevel;

  useEffect(() => {
    if (!isVisible) {
      cancelAnimationFrame(animRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 480;
    const H = 56;
    canvas.width = W;
    canvas.height = H;

    const draw = () => {
      timeRef.current += 0.05;
      const t = timeRef.current;
      const level = audioRef.current;

      ctx.clearRect(0, 0, W, H);

      const bars = 48;
      const barW = W / bars;
      const cy = H / 2;

      for (let i = 0; i < bars; i++) {
        const x = i * barW + barW / 2;
        const phase = (i / bars) * Math.PI * 2;

        // 여러 주파수 합성으로 자연스러운 파형
        const wave1 = Math.sin(phase * 3 + t * 4) * (0.4 + level * 0.6);
        const wave2 = Math.sin(phase * 5 + t * 2.5) * (0.2 + level * 0.3);
        const wave3 = Math.sin(phase * 7 + t * 6) * (0.1 + level * 0.2);
        const combined = wave1 + wave2 + wave3;

        const barH = Math.max(3, (combined + 1) * 0.5 * (cy - 4) + 4 + level * 10);

        // 그라디언트 바
        const grad = ctx.createLinearGradient(x, cy - barH, x, cy + barH);
        grad.addColorStop(0, `${color}00`);
        grad.addColorStop(0.3, `${color}88`);
        grad.addColorStop(0.5, `${color}FF`);
        grad.addColorStop(0.7, `${color}88`);
        grad.addColorStop(1, `${color}00`);

        ctx.fillStyle = grad;
        ctx.fillRect(x - barW * 0.3, cy - barH, barW * 0.6, barH * 2);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [isVisible, color]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          exit={{ opacity: 0, scaleY: 0 }}
          transition={{ duration: 0.3 }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <canvas
            ref={canvasRef}
            style={{ width: '480px', height: '56px', display: 'block' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
