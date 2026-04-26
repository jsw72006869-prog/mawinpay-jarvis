

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';

interface ActionLog {
  step: string;
  status: 'start' | 'success' | 'fail' | 'info' | 'warning' | 'running' | 'done';
  detail: string;
  timestamp: string;
  elapsed: string;
  data?: any;
}

interface HoloDataPanelProps {
  type: 'collect' | 'send_email' | 'create_banner' | 'report' | 'booking' | 'smartstore' | 'youtube' | 'influencer_content' | 'manus' | null;
  progress: number;
  message: string;
  bookingSteps?: string[];
  actionLogs?: ActionLog[];
}

const PANEL_CONFIG = {
  smartstore: {
    title: 'SMARTSTORE (PATH A)',
    icon: '⬡',
    color: '#00E676',
    color2: '#00B0FF',
    steps: ['PROXY AUTH', 'API CONNECT', 'DATA FETCH', 'CLASSIFY', 'PROCESS', 'REPORT'],
  },
  booking: {
    title: 'BROWSER (PATH B)',
    icon: '◈',
    color: '#F59E0B',
    color2: '#EF4444',
    steps: ['NAVER LOGIN', 'SEARCH BUSINESS', 'TIME SELECTION', 'FORM FILLING', 'CONFIRMATION'],
  },
  youtube: {
    title: 'YOUTUBE (PATH B/C)',
    icon: '▶',
    color: '#FF0000',
    color2: '#FF6B6B',
    steps: ['API CONNECT', 'VIDEO FETCH', 'COMMENT SCAN', 'AI ANALYZE', 'REPORT'],
  },
  manus: {
    title: 'MANUS ENGINE (PATH C)',
    icon: '🧠',
    color: '#C8A96E',
    color2: '#E8D5A3',
    steps: ['PLANNING', 'EXECUTING', 'REASONING', 'VALIDATING', 'COMPLETING'],
  },
  influencer_content: {
    title: 'INFLUENCER CONTENT ENGINE',
    icon: '✉',
    color: '#9C27B0',
    color2: '#E91E63',
    steps: ['PROFILE ANALYSIS', 'CONTENT GENERATION', 'PERSONALIZATION', 'COMPLETION'],
  },
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

const STATUS_ICON: Record<string, { icon: string; color: string }> = {
  start: { icon: '▶', color: '#00B0FF' },
  success: { icon: '✓', color: '#00E676' },
  fail: { icon: '✗', color: '#FF1744' },
  info: { icon: '●', color: '#FFD740' },
  warning: { icon: '△', color: '#FF9100' },
};

export default function HoloDataPanel({ type, progress, message, bookingSteps, actionLogs = [] }: HoloDataPanelProps) {
  const [visibleRows, setVisibleRows] = useState(0);
  const [dataLines, setDataLines] = useState<string[]>([]);
  const [visibleLogs, setVisibleLogs] = useState<ActionLog[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const config = type ? (PANEL_CONFIG[type as keyof typeof PANEL_CONFIG] || PANEL_CONFIG.collect) : PANEL_CONFIG.collect;
  const steps = (type === 'booking' && bookingSteps) ? bookingSteps : config.steps;
  const stepCount = steps.length;
  const activeStep = Math.min(Math.floor((progress / 100) * stepCount), stepCount - 1);
  const completedSteps = Array.from({ length: activeStep }, (_, i) => i);

  // 행동 로그 순차 표시 애니메이션
  useEffect(() => {
    if ((type === 'smartstore' || type === 'booking' || type === 'youtube' || type === 'manus') && actionLogs.length > 0) {
      setVisibleLogs([]);
      let idx = 0;
      const interval = setInterval(() => {
        if (idx < actionLogs.length) {
          setVisibleLogs(prev => [...prev, actionLogs[idx]]);
          idx++;
        } else {
          clearInterval(interval);
        }
      }, 280);
      return () => clearInterval(interval);
    }
  }, [actionLogs, type]);

  // 로그 자동 스크롤
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [visibleLogs]);

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
      style={{
        position: 'fixed',
        left: 12,
        top: 12,
        zIndex: 30,
        width: (type === 'smartstore' || type === 'booking' || type === 'youtube' || type === 'manus') ? 280 : 200,
        maxHeight: '45vh',
        overflowY: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {type && (
        <div>
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'rgba(2,8,20,0.92)',
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
              <div className="flex items-center gap-2">
                {(type === 'smartstore' || type === 'booking' || type === 'youtube' || type === 'manus') && (
                  <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.38rem', color: 'rgba(100,116,139,0.55)' }}>
                    {visibleLogs.length}/{actionLogs.length}
                  </span>
                )}
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

            {/* ── 행동 로그 (스마트스토어 + 브라우저 에이전트 공용) ── */}
            {(type === 'smartstore' || type === 'booking' || type === 'youtube' || type === 'manus') && (
              <div
                ref={logContainerRef}
                className="px-3 py-2"
                style={{
                  maxHeight: 320,
                  overflowY: 'auto',
                  borderBottom: `1px solid ${config.color}08`,
                  scrollbarWidth: 'thin',
                  scrollbarColor: `${config.color}30 transparent`,
                }}
              >
                {/* 로그 헤더 */}
                <div className="flex items-center gap-1.5 mb-2">
                  <div style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: config.color, boxShadow: `0 0 6px ${config.color}` }} />
                  <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.38rem', color: 'rgba(100,116,139,0.5)', letterSpacing: '0.12em' }}>
                    ACTION LOG
                  </span>
                  <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${config.color}20, transparent)` }} />
                </div>

                <AnimatePresence>
                  {visibleLogs.map((log, i) => {
                    const statusConfig = STATUS_ICON[log.status] || STATUS_ICON.info;
                    return (
                      <motion.div
                        key={`${log.step}-${i}`}
                        initial={{ opacity: 0, x: -20, height: 0 }}
                        animate={{ opacity: 1, x: 0, height: 'auto' }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        style={{ marginBottom: 4 }}
                      >
                        <div className="flex items-start gap-1.5">
                          {/* 타임라인 도트 */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 10, paddingTop: 2 }}>
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                backgroundColor: statusConfig.color,
                                boxShadow: `0 0 4px ${statusConfig.color}80`,
                                flexShrink: 0,
                              }}
                            />
                            {i < visibleLogs.length - 1 && (
                              <div style={{ width: 1, flex: 1, minHeight: 8, background: `${config.color}15`, marginTop: 2 }} />
                            )}
                          </div>

                          {/* 로그 내용 */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="flex items-center gap-1">
                              <span style={{
                                fontFamily: 'Orbitron, monospace',
                                fontSize: '0.34rem',
                                color: statusConfig.color,
                                letterSpacing: '0.05em',
                              }}>
                                {statusConfig.icon}
                              </span>
                              <span style={{
                                fontFamily: 'Orbitron, monospace',
                                fontSize: '0.32rem',
                                color: 'rgba(100,116,139,0.45)',
                                letterSpacing: '0.08em',
                              }}>
                                [{log.elapsed}]
                              </span>
                            </div>
                            <p style={{
                              fontFamily: 'Inter, sans-serif',
                              fontSize: '0.52rem',
                              color: log.status === 'fail' ? '#FF1744' :
                                     log.status === 'success' ? 'rgba(224,242,254,0.75)' :
                                     log.status === 'warning' ? '#FF9100' :
                                     log.status === 'info' ? '#FFD740' :
                                     'rgba(224,242,254,0.55)',
                              lineHeight: 1.4,
                              margin: '1px 0 0 0',
                              wordBreak: 'break-word',
                            }}>
                              {log.detail}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {/* 로딩 인디케이터 */}
                {progress < 100 && visibleLogs.length > 0 && visibleLogs.length >= actionLogs.length && (
                  <motion.div
                    className="flex items-center gap-1.5 mt-1"
                    animate={{ opacity: [0.3, 0.8, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: '50%', border: `1px solid ${config.color}40` }} />
                    <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.36rem', color: `${config.color}60` }}>
                      AWAITING NEXT ACTION...
                    </span>
                  </motion.div>
                )}
              </div>
            )}

            {/* 단계 표시 (smartstore/booking이 아닌 경우) */}
            {type !== 'smartstore' && type !== 'booking' && type !== 'youtube' && (
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${config.color}08` }}>
                {steps.map((step, i) => {
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
            )}

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

            {/* 데이터 스트림 (smartstore가 아닌 경우) */}
            {type !== 'smartstore' && type !== 'youtube' && (
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
            )}

            {/* 스마트스토어 요약 통계 */}
            {(type === 'smartstore' || type === 'youtube') && progress >= 100 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-3 py-2"
                style={{ borderBottom: `1px solid ${config.color}08` }}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.38rem', color: 'rgba(100,116,139,0.5)', letterSpacing: '0.12em' }}>
                    MISSION COMPLETE
                  </span>
                </div>
                <div style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: `${config.color}08`,
                  border: `1px solid ${config.color}15`,
                }}>
                  <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.42rem', color: config.color }}>
                    ✓ ALL TASKS FINISHED
                  </span>
                </div>
              </motion.div>
            )}

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
