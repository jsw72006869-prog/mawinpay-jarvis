

import { motion, AnimatePresence } from 'framer-motion';
import type { JarvisState } from '../lib/jarvis-brain';

interface ScreenPulseProps {
  state: JarvisState;
  clapDetected: boolean;
}

export default function ScreenPulse({ state, clapDetected }: ScreenPulseProps) {
  const borderColors: Record<JarvisState, string> = {
    idle:      'rgba(0,102,255,0.12)',
    listening: 'rgba(255,107,53,0.45)',
    thinking:  'rgba(124,58,237,0.35)',
    speaking:  'rgba(0,245,255,0.45)',
    working:   'rgba(34,197,94,0.35)',
  };

  const glowColors: Record<JarvisState, string> = {
    idle:      '#0066FF',
    listening: '#FF6B35',
    thinking:  '#7C3AED',
    speaking:  '#00F5FF',
    working:   '#22C55E',
  };

  const color = glowColors[state];

  return (
    <>
      {/* 상태별 화면 테두리 글로우 */}
      <motion.div
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 50 }}
        animate={{
          boxShadow: `inset 0 0 80px ${borderColors[state]}, inset 0 0 30px ${borderColors[state]}`,
        }}
        transition={{ duration: 0.6 }}
      />

      {/* 박수 감지 시 강한 펄스 */}
      <AnimatePresence>
        {clapDetected && (
          <motion.div
            className="fixed inset-0 pointer-events-none"
            style={{ zIndex: 55 }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 1, 0.5, 0],
              boxShadow: [
                'inset 0 0 0px rgba(0,245,255,0)',
                'inset 0 0 120px rgba(0,245,255,0.8)',
                'inset 0 0 80px rgba(0,245,255,0.4)',
                'inset 0 0 0px rgba(0,245,255,0)',
              ],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* 코너 장식 (4개) */}
      {(['tl', 'tr', 'bl', 'br'] as const).map(corner => (
        <CornerDecor key={corner} position={corner} color={color} state={state} />
      ))}

      {/* 상단/하단 엣지 라인 */}
      <motion.div
        className="fixed top-0 left-0 right-0 pointer-events-none"
        style={{ height: 1, zIndex: 45 }}
        animate={{
          background: `linear-gradient(90deg, transparent 0%, ${color}60 30%, ${color}90 50%, ${color}60 70%, transparent 100%)`,
          opacity: state !== 'idle' ? [0.4, 0.9, 0.4] : 0.2,
        }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 pointer-events-none"
        style={{ height: 1, zIndex: 45 }}
        animate={{
          background: `linear-gradient(90deg, transparent 0%, ${color}60 30%, ${color}90 50%, ${color}60 70%, transparent 100%)`,
          opacity: state !== 'idle' ? [0.4, 0.9, 0.4] : 0.2,
        }}
        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
      />
    </>
  );
}

function CornerDecor({ position, color, state }: { position: 'tl' | 'tr' | 'bl' | 'br'; color: string; state: JarvisState }) {
  const posStyle: Record<string, React.CSSProperties> = {
    tl: { top: 12, left: 12 },
    tr: { top: 12, right: 12 },
    bl: { bottom: 12, left: 12 },
    br: { bottom: 12, right: 12 },
  };
  const rotations = { tl: 0, tr: 90, bl: 270, br: 180 };

  return (
    <motion.div
      className="fixed pointer-events-none"
      style={{ ...posStyle[position], zIndex: 45, transform: `rotate(${rotations[position]}deg)` }}
      animate={{ opacity: state !== 'idle' ? [0.5, 1, 0.5] : [0.2, 0.5, 0.2] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        {/* 외부 L자 */}
        <path d="M0 36 L0 0 L36 0" stroke={color} strokeWidth="2" opacity="0.7" />
        {/* 내부 L자 */}
        <path d="M0 24 L0 0 L24 0" stroke={color} strokeWidth="1" opacity="0.35" />
        {/* 코너 점 */}
        <circle cx="0" cy="0" r="2.5" fill={color} opacity="0.9" />
        {/* 작은 점들 */}
        <circle cx="8" cy="0" r="1" fill={color} opacity="0.4" />
        <circle cx="0" cy="8" r="1" fill={color} opacity="0.4" />
      </svg>
    </motion.div>
  );
}
