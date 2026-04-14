

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import type { JarvisState } from '../lib/jarvis-brain';

interface StatusPanelProps {
  state: JarvisState;
  stats: {
    collected: number;
    emailsSent: number;
    responseRate: number;
    contracts: number;
  };
  isVisible: boolean;
}

// 카운트업 훅
function useCountUp(target: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let current = 0;
    const step = Math.max(1, Math.floor(target / 60));
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      setValue(current);
      if (current >= target) clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, [target]);
  return value;
}

export default function StatusPanel({ state, stats, isVisible }: StatusPanelProps) {
  const [time, setTime] = useState('');
  const [cpuLoad, setCpuLoad] = useState(18);
  const [memLoad, setMemLoad] = useState(42);
  const [netLoad, setNetLoad] = useState(7);

  const collectedCount = useCountUp(stats.collected);
  const emailsCount = useCountUp(stats.emailsSent);

  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      setCpuLoad(prev => Math.max(10, Math.min(85, prev + (Math.random() - 0.5) * 6)));
      setMemLoad(prev => Math.max(30, Math.min(70, prev + (Math.random() - 0.5) * 4)));
      setNetLoad(state !== 'idle' ? Math.random() * 55 + 20 : Math.random() * 12 + 3);
    };
    update();
    const interval = setInterval(update, 2000);
    return () => clearInterval(interval);
  }, [state]);

  const stateColors: Record<JarvisState, string> = {
    idle: '#0066FF', listening: '#FF6B35', thinking: '#7C3AED', speaking: '#00F5FF', working: '#22C55E',
  };
  const stateLabels: Record<JarvisState, string> = {
    idle: 'STANDBY', listening: 'LISTENING', thinking: 'ANALYZING', speaking: 'RESPONDING', working: 'EXECUTING',
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 60 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="fixed right-5 top-1/2 -translate-y-1/2 flex flex-col gap-2.5"
          style={{ zIndex: 20, width: 165 }}
        >
          {/* ── 상태 패널 ── */}
          <div className="holo-panel rounded-xl p-3 relative overflow-hidden">
            <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.46rem', color: 'rgba(0,245,255,0.4)', letterSpacing: '0.2em', marginBottom: 8 }}>
              ◈ SYSTEM STATUS
            </div>

            {/* 상태 표시 */}
            <div className="flex items-center gap-2 mb-3">
              <motion.div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: stateColors[state], boxShadow: `0 0 8px ${stateColors[state]}` }}
                animate={{ scale: [1, 1.5, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.58rem', color: stateColors[state], letterSpacing: '0.08em' }}>
                {stateLabels[state]}
              </span>
            </div>

            {/* 시스템 부하 바 */}
            {[
              { label: 'CPU', value: cpuLoad, color: '#00F5FF' },
              { label: 'MEM', value: memLoad, color: '#0066FF' },
              { label: 'NET', value: netLoad, color: '#7C3AED' },
            ].map(item => (
              <div key={item.label} className="mb-2">
                <div className="flex justify-between mb-1">
                  <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.44rem', color: 'rgba(100,116,139,0.55)' }}>{item.label}</span>
                  <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.44rem', color: item.color }}>{Math.round(item.value)}%</span>
                </div>
                <div style={{ height: 2.5, background: 'rgba(255,255,255,0.05)', borderRadius: 9999, overflow: 'hidden' }}>
                  <motion.div
                    animate={{ width: `${item.value}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{
                      height: '100%',
                      background: `linear-gradient(90deg, ${item.color}50, ${item.color})`,
                      boxShadow: `0 0 5px ${item.color}80`,
                      borderRadius: 9999,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* ── 통계 패널 ── */}
          <div className="holo-panel rounded-xl p-3">
            <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.46rem', color: 'rgba(0,245,255,0.4)', letterSpacing: '0.2em', marginBottom: 8 }}>
              ◈ ANALYTICS
            </div>

            {[
              { label: 'INFLUENCERS', value: collectedCount, unit: '', color: '#00F5FF' },
              { label: 'EMAILS SENT', value: emailsCount, unit: '', color: '#0066FF' },
              { label: 'RESP RATE', value: stats.responseRate.toFixed(1), unit: '%', color: '#22C55E' },
              { label: 'CONTRACTS', value: stats.contracts, unit: '', color: '#7C3AED' },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center mb-2">
                <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.42rem', color: 'rgba(100,116,139,0.45)', letterSpacing: '0.06em' }}>
                  {item.label}
                </span>
                <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.68rem', color: item.color, textShadow: `0 0 8px ${item.color}60` }}>
                  {item.value}{item.unit}
                </span>
              </div>
            ))}
          </div>

          {/* ── 시간 패널 ── */}
          <div className="holo-panel rounded-xl p-3 text-center">
            <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.46rem', color: 'rgba(0,245,255,0.4)', letterSpacing: '0.2em', marginBottom: 5 }}>
              ◈ CLOCK
            </div>
            <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.78rem', color: '#00F5FF', textShadow: '0 0 10px rgba(0,245,255,0.5)', letterSpacing: '0.08em' }}>
              {time}
            </div>
            <div className="flex justify-center gap-2 mt-2">
              {['NEURAL', 'VOICE', 'DATA'].map((label) => (
                <div key={label} className="flex items-center gap-1">
                  <div style={{ width: 3.5, height: 3.5, borderRadius: '50%', backgroundColor: '#22C55E', boxShadow: '0 0 4px #22C55E' }} />
                  <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.36rem', color: 'rgba(100,116,139,0.4)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
