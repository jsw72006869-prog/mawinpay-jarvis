

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface HoloDataPanelProps {
  type: 'collect' | 'send_email' | 'create_banner' | 'report' | null;
  progress: number;
  message: string;
}

const PANEL_CONFIG = {
  collect: {
    title: 'INFLUENCER SCAN',
    icon: '◉',
    color: '#00F5FF',
    color2: '#0066FF',
    steps: ['SCANNING PROFILES', 'EXTRACTING EMAILS', 'VERIFYING DATA', 'SAVING TO DB'],
  },
  send_email: {
    title: 'EMAIL DISPATCH',
    icon: '◈',
    color: '#0066FF',
    color2: '#7C3AED',
    steps: ['LOADING TEMPLATES', 'PERSONALIZING', 'SMTP HANDSHAKE', 'DELIVERING'],
  },
  create_banner: {
    title: 'AI BANNER GEN',
    icon: '◆',
    color: '#7C3AED',
    color2: '#FF6B35',
    steps: ['ANALYZING PRODUCT', 'GENERATING LAYOUT', 'APPLYING STYLE', 'RENDERING'],
  },
  report: {
    title: 'DATA ANALYSIS',
    icon: '◇',
    color: '#22C55E',
    color2: '#00F5FF',
    steps: ['QUERYING DATABASE', 'COMPUTING METRICS', 'TREND ANALYSIS', 'GENERATING REPORT'],
  },
};

const mockInfluencers = [
  { name: '맛집탐방러', platform: 'INSTA', followers: '125K', status: 'OK' },
  { name: '서울미식가', platform: 'YTUBE', followers: '89K', status: 'OK' },
  { name: '푸드크리에이터', platform: 'INSTA', followers: '234K', status: 'OK' },
  { name: '맛집일기', platform: 'TIKTOK', followers: '67K', status: 'FAIL' },
  { name: '오늘뭐먹지', platform: 'NAVER', followers: '45K', status: 'OK' },
  { name: '먹방킹', platform: 'YTUBE', followers: '312K', status: 'OK' },
  { name: '미식여행자', platform: 'INSTA', followers: '178K', status: 'OK' },
];

export default function HoloDataPanel({ type, progress, message }: HoloDataPanelProps) {
  const [visibleRows, setVisibleRows] = useState(0);
  const [dataLines, setDataLines] = useState<string[]>([]);

  const config = type ? PANEL_CONFIG[type] : PANEL_CONFIG.collect;
  const activeStep = Math.min(Math.floor(progress / 25), 3);
  const completedSteps = Array.from({ length: activeStep }, (_, i) => i);

  useEffect(() => {
    if (type === 'collect') {
      setVisibleRows(0);
      const interval = setInterval(() => {
        setVisibleRows(prev => {
          if (prev >= mockInfluencers.length) { clearInterval(interval); return prev; }
          return prev + 1;
        });
      }, 350);
      return () => clearInterval(interval);
    }
  }, [type]);

  useEffect(() => {
    const chars = '0123456789ABCDEF';
    const newLine = Array.from({ length: 28 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    setDataLines(prev => [...prev.slice(-5), newLine]);
  }, [progress]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -60, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -60, scale: 0.9 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{ position: 'fixed', left: 20, top: '50%', transform: 'translateY(-50%)', zIndex: 30, width: 230 }}
    >
      {type && (
        <div>
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'rgba(2,8,20,0.88)',
              border: `1px solid ${config.color}25`,
              backdropFilter: 'blur(24px)',
              boxShadow: `0 0 50px ${config.color}15, inset 0 1px 0 ${config.color}10`,
            }}
          >
            {/* 헤더 */}
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${config.color}12` }}>
              <div className="flex items-center gap-2">
                <motion.span
                  style={{ color: config.color, fontSize: '1rem' }}
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                >
                  {config.icon}
                </motion.span>
                <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.56rem', color: config.color, letterSpacing: '0.15em' }}>
                  {config.title}
                </span>
              </div>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-1 h-1 rounded-full"
                    style={{ backgroundColor: config.color }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
            </div>

            {/* 진행 바 */}
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${config.color}08` }}>
              <div className="flex justify-between mb-1.5">
                <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.42rem', color: 'rgba(100,116,139,0.55)' }}>PROGRESS</span>
                <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.52rem', color: config.color }}>{Math.round(progress)}%</span>
              </div>
              <div style={{ height: 3.5, background: 'rgba(255,255,255,0.04)', borderRadius: 9999, overflow: 'hidden' }}>
                <motion.div
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                  style={{
                    height: '100%',
                    background: `linear-gradient(90deg, ${config.color2}, ${config.color})`,
                    boxShadow: `0 0 8px ${config.color}`,
                    borderRadius: 9999,
                  }}
                />
              </div>
            </div>

            {/* 단계 표시 */}
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${config.color}08` }}>
              {config.steps.map((step, i) => {
                const isDone = completedSteps.includes(i);
                const isActive = i === activeStep && progress < 100;
                return (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                      backgroundColor: isDone ? '#22C55E' : isActive ? config.color : 'rgba(100,116,139,0.15)',
                      boxShadow: isDone ? '0 0 5px #22C55E' : isActive ? `0 0 5px ${config.color}` : 'none',
                    }} />
                    <span style={{
                      fontFamily: 'Orbitron, monospace',
                      fontSize: '0.42rem',
                      color: isDone ? '#22C55E80' : isActive ? config.color : 'rgba(100,116,139,0.25)',
                      letterSpacing: '0.06em',
                    }}>
                      {step}
                      {isActive && (
                        <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>...</motion.span>
                      )}
                      {isDone && ' ✓'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 수집 결과 테이블 (collect 타입) */}
            {type === 'collect' && (
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${config.color}08` }}>
                <div className="grid mb-1.5" style={{ gridTemplateColumns: '2fr 1.2fr 1fr 0.8fr' }}>
                  {['NAME', 'PLAT', 'FLWR', 'STAT'].map(h => (
                    <span key={h} style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.38rem', color: 'rgba(100,116,139,0.35)', letterSpacing: '0.1em' }}>{h}</span>
                  ))}
                </div>
                <AnimatePresence>
                  {mockInfluencers.slice(0, visibleRows).map((inf, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 15 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className="grid mb-1"
                      style={{ gridTemplateColumns: '2fr 1.2fr 1fr 0.8fr' }}
                    >
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.5rem', color: 'rgba(224,242,254,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inf.name}</span>
                      <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.42rem', color: '#0066FF' }}>{inf.platform}</span>
                      <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.42rem', color: '#00F5FF' }}>{inf.followers}</span>
                      <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.42rem', color: inf.status === 'OK' ? '#22C55E' : '#EF4444' }}>{inf.status}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* 데이터 스트림 */}
            <div className="px-4 py-2">
              {dataLines.slice(-3).map((line, i) => (
                <motion.div
                  key={`${line}-${i}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: (i + 1) / 3 * 0.3 }}
                  style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '0.36rem',
                    color: config.color,
                    letterSpacing: '0.04em',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    marginBottom: 2,
                  }}
                >
                  {line}
                </motion.div>
              ))}
            </div>

            {/* 메시지 */}
            <div className="px-4 py-2.5" style={{ background: `${config.color}06`, borderTop: `1px solid ${config.color}10` }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.6rem', color: 'rgba(224,242,254,0.65)', lineHeight: 1.5 }}>
                {message}
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
