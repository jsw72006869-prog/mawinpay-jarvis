/**
 * PlatformDataCards - 포켓몬 카드 스타일 플랫폼별 실시간 데이터 카드
 * 
 * 자비스가 작업할 때 해당 플랫폼 카드가 모핑 애니메이션으로 확대되며
 * 실시간 데이터를 표시한다. 대화창을 가리지 않고 화면 하단에 배치.
 * 
 * jarvis-telemetry의 CustomEvent/BroadcastChannel로 실시간 데이터 수신.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  onTelemetryEvent,
  closeTelemetry,
  type TelemetryEvent,
  type NodeState,
} from '../lib/jarvis-telemetry';

/* ─── 플랫폼 테마 ─── */
interface PlatformTheme {
  id: string;
  label: string;
  icon: string;
  primary: string;
  secondary: string;
  glow: string;
  bg: string;
}

const PLATFORMS: PlatformTheme[] = [
  { id: 'jarvis_brain', label: 'JARVIS', icon: '🧠', primary: '#9B8EC4', secondary: '#C4A8FF', glow: 'rgba(155,142,196,0.6)', bg: 'linear-gradient(160deg, #0a0510 0%, #150820 100%)' },
  { id: 'smartstore',   label: 'STORE',  icon: '🛒', primary: '#00E676', secondary: '#00FF88', glow: 'rgba(0,230,118,0.6)',   bg: 'linear-gradient(160deg, #001a08 0%, #002a10 100%)' },
  { id: 'youtube',      label: 'YOUTUBE', icon: '▶️', primary: '#FF3333', secondary: '#FF8C00', glow: 'rgba(255,51,51,0.6)',   bg: 'linear-gradient(160deg, #1a0000 0%, #2a0500 100%)' },
  { id: 'naver',        label: 'NAVER',  icon: '🔍', primary: '#03C75A', secondary: '#1EC800', glow: 'rgba(3,199,90,0.6)',    bg: 'linear-gradient(160deg, #000a03 0%, #001a08 100%)' },
  { id: 'instagram',    label: 'INSTA',  icon: '📸', primary: '#E1306C', secondary: '#F77737', glow: 'rgba(225,48,108,0.6)',  bg: 'linear-gradient(160deg, #1a000e 0%, #2a0015 100%)' },
  { id: 'email',        label: 'EMAIL',  icon: '✉️', primary: '#4A90E2', secondary: '#7BB3F0', glow: 'rgba(74,144,226,0.6)',  bg: 'linear-gradient(160deg, #000a1a 0%, #001530 100%)' },
  { id: 'sheets',       label: 'SHEETS', icon: '📋', primary: '#E8D5A3', secondary: '#C8A96E', glow: 'rgba(232,213,163,0.6)', bg: 'linear-gradient(160deg, #0a0800 0%, #1a1200 100%)' },
  { id: 'manus_agent',  label: 'MANUS',  icon: '🤖', primary: '#00D4FF', secondary: '#0066FF', glow: 'rgba(0,212,255,0.6)',   bg: 'linear-gradient(160deg, #000a14 0%, #001a2a 100%)' },
];

/* ─── 카드 상태 ─── */
interface CardState {
  nodeState: NodeState;
  data: Record<string, string | number>;
  lastLog: string;
  lastUpdate: number;
}

const DEFAULT_CARD_STATE: CardState = {
  nodeState: 'idle',
  data: {},
  lastLog: '',
  lastUpdate: 0,
};

/* ─── 메인 컴포넌트 ─── */
export default function PlatformDataCards({ visible }: { visible: boolean }) {
  const [cards, setCards] = useState<Record<string, CardState>>(() => {
    const init: Record<string, CardState> = {};
    PLATFORMS.forEach(p => { init[p.id] = { ...DEFAULT_CARD_STATE }; });
    // localStorage에서 저장된 데이터 복원
    try {
      const saved = localStorage.getItem('jarvis-node-data');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.keys(parsed).forEach(key => {
          if (init[key]) {
            init[key].data = parsed[key].data || {};
            init[key].lastLog = parsed[key].lastLog || '';
          }
        });
      }
    } catch {}
    return init;
  });

  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [briefingActive, setBriefingActive] = useState(false);
  const autoCollapseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 텔레메트리 이벤트 수신
  useEffect(() => {
    const unsub = onTelemetryEvent((event: TelemetryEvent) => {
      switch (event.type) {
        case 'node_state': {
          const { nodeId, state: newState } = event.payload as { nodeId: string; state: NodeState };
          setCards(prev => {
            if (!prev[nodeId]) return prev;
            return { ...prev, [nodeId]: { ...prev[nodeId], nodeState: newState, lastUpdate: Date.now() } };
          });
          // 활성화된 카드 자동 확장
          if (newState === 'active') {
            setExpandedCard(nodeId);
            // 자동 축소 타이머 리셋
            if (autoCollapseRef.current) clearTimeout(autoCollapseRef.current);
          }
          if (newState === 'success' || newState === 'error') {
            // 5초 후 자동 축소
            if (autoCollapseRef.current) clearTimeout(autoCollapseRef.current);
            autoCollapseRef.current = setTimeout(() => setExpandedCard(null), 5000);
          }
          break;
        }
        case 'node_data': {
          const { nodeId, data } = event.payload as { nodeId: string; data: Record<string, string | number> };
          setCards(prev => {
            if (!prev[nodeId]) return prev;
            return { ...prev, [nodeId]: { ...prev[nodeId], data: { ...prev[nodeId].data, ...data }, lastUpdate: Date.now() } };
          });
          break;
        }
        case 'mission_log': {
          const { source, text } = event.payload as { source: string; text: string };
          // 소스에 해당하는 노드 찾기
          const nodeId = PLATFORMS.find(p =>
            p.label.toLowerCase().includes(source.toLowerCase()) ||
            p.id.toLowerCase().includes(source.toLowerCase())
          )?.id;
          if (nodeId) {
            setCards(prev => {
              if (!prev[nodeId]) return prev;
              return { ...prev, [nodeId]: { ...prev[nodeId], lastLog: text, lastUpdate: Date.now() } };
            });
          }
          break;
        }
        case 'briefing_sequence': {
          const { phase, nodeId } = event.payload as { phase: string; nodeId?: string };
          if (phase === 'start') {
            setBriefingActive(true);
          } else if (phase === 'complete') {
            setBriefingActive(false);
          } else if (phase === 'node_focus' && nodeId) {
            setExpandedCard(nodeId);
          }
          break;
        }
        case 'pulse_line': {
          const { to } = event.payload as { from: string; to: string };
          if (to) setExpandedCard(to);
          break;
        }
      }
    });

    return () => {
      unsub();
      if (autoCollapseRef.current) clearTimeout(autoCollapseRef.current);
    };
  }, []);

  // idle 상태로 자동 리셋 (30초 후)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setCards(prev => {
        let changed = false;
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          if (next[key].nodeState !== 'idle' && now - next[key].lastUpdate > 30000) {
            next[key] = { ...next[key], nodeState: 'idle' };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCardClick = useCallback((id: string) => {
    setExpandedCard(prev => prev === id ? null : id);
  }, []);

  if (!visible) return null;

  const activeCount = Object.values(cards).filter(c => c.nodeState !== 'idle').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 25,
        pointerEvents: 'auto',
        padding: '0 12px 8px',
      }}
    >
      {/* 브리핑 배너 */}
      <AnimatePresence>
        {briefingActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              textAlign: 'center',
              padding: '6px 16px',
              marginBottom: 6,
              background: 'rgba(200,169,110,0.12)',
              borderRadius: 8,
              border: '1px solid rgba(200,169,110,0.25)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.6rem', color: '#C8A96E', letterSpacing: '0.2em' }}>
              ☀️ MORNING BRIEFING IN PROGRESS
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 카드 컨테이너 */}
      <div style={{
        display: 'flex',
        gap: 6,
        justifyContent: 'center',
        alignItems: 'flex-end',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        overflowY: 'visible',
        scrollbarWidth: 'none',
        padding: '4px 0',
      }}>
        {PLATFORMS.map((platform, index) => {
          const card = cards[platform.id];
          const isExpanded = expandedCard === platform.id;
          const isActive = card.nodeState === 'active';
          const isSuccess = card.nodeState === 'success';
          const isError = card.nodeState === 'error';
          const hasData = Object.keys(card.data).length > 0;

          return (
            <PlatformCard
              key={platform.id}
              platform={platform}
              card={card}
              isExpanded={isExpanded}
              index={index}
              onClick={() => handleCardClick(platform.id)}
            />
          );
        })}
      </div>

      {/* 하단 상태 바 */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 16,
        marginTop: 4,
        padding: '2px 0',
      }}>
        <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.4rem', color: 'rgba(100,116,139,0.4)', letterSpacing: '0.15em' }}>
          NODES: <span style={{ color: activeCount > 0 ? '#00FF88' : 'rgba(100,116,139,0.4)' }}>{activeCount}</span>/8 ACTIVE
        </span>
        <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.4rem', color: 'rgba(100,116,139,0.4)', letterSpacing: '0.15em' }}>
          SYNC: <span style={{ color: '#00D4FF' }}>LIVE</span>
        </span>
      </div>
    </motion.div>
  );
}

/* ─── 개별 플랫폼 카드 ─── */
function PlatformCard({
  platform,
  card,
  isExpanded,
  index,
  onClick,
}: {
  platform: PlatformTheme;
  card: CardState;
  isExpanded: boolean;
  index: number;
  onClick: () => void;
}) {
  const isActive = card.nodeState === 'active';
  const isSuccess = card.nodeState === 'success';
  const isError = card.nodeState === 'error';
  const hasData = Object.keys(card.data).length > 0;
  const stateColor = isError ? '#FF8C00' : isSuccess ? '#00FF88' : isActive ? platform.primary : 'rgba(100,116,139,0.3)';

  // 부유 애니메이션
  const floatDuration = 2.5 + (index % 4) * 0.3;
  const floatDelay = index * 0.15;

  return (
    <motion.div
      layout
      onClick={onClick}
      style={{
        cursor: 'pointer',
        flexShrink: 0,
        perspective: '600px',
      }}
      initial={{ opacity: 0, y: 30, scale: 0.7 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* 부유 래퍼 */}
      <motion.div
        animate={isActive ? {
          y: [0, -8, 0, -5, 0],
          rotateZ: [0, 0.5, 0, -0.5, 0],
        } : { y: 0, rotateZ: 0 }}
        transition={{
          duration: floatDuration,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: floatDelay,
        }}
      >
        {/* 그림자 */}
        {isActive && (
          <motion.div
            animate={{
              scaleX: [1, 0.8, 1],
              opacity: [0.5, 0.2, 0.5],
            }}
            transition={{ duration: floatDuration, repeat: Infinity, ease: 'easeInOut', delay: floatDelay }}
            style={{
              position: 'absolute',
              bottom: '-8px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '70%',
              height: '8px',
              background: `radial-gradient(ellipse, ${platform.glow} 0%, transparent 70%)`,
              borderRadius: '50%',
              filter: 'blur(3px)',
            }}
          />
        )}

        {/* 메인 카드 */}
        <motion.div
          layout
          animate={{
            width: isExpanded ? 160 : 56,
            height: isExpanded ? (hasData ? 140 : 90) : 56,
          }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{
            borderRadius: isExpanded ? 12 : 10,
            overflow: 'hidden',
            background: isExpanded ? platform.bg : 'rgba(6,10,18,0.85)',
            border: `1px solid ${stateColor}${isActive || isExpanded ? '60' : '20'}`,
            backdropFilter: 'blur(12px)',
            boxShadow: isActive || isExpanded
              ? `0 0 20px ${platform.glow}, 0 4px 15px rgba(0,0,0,0.4), inset 0 1px 0 ${platform.primary}15`
              : '0 2px 8px rgba(0,0,0,0.3)',
            position: 'relative',
          }}
        >
          {/* 홀로그램 쉬머 효과 */}
          {(isActive || isExpanded) && (
            <motion.div
              animate={{
                backgroundPosition: ['0% 0%', '200% 200%'],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(135deg, transparent 30%, ${platform.primary}08 50%, transparent 70%)`,
                backgroundSize: '200% 200%',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          )}

          {/* 에러 깜빡임 */}
          {isError && (
            <motion.div
              animate={{ opacity: [0, 0.3, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(255,140,0,0.15)',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          )}

          {/* 컨텐츠 */}
          <div style={{ position: 'relative', zIndex: 2, padding: isExpanded ? 10 : 0, height: '100%' }}>
            {isExpanded ? (
              /* ── 확장 모드 ── */
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* 헤더 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: '1rem' }}>{platform.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.5rem', color: platform.primary, letterSpacing: '0.15em', fontWeight: 'bold' }}>
                      {platform.label}
                    </div>
                    <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.32rem', color: stateColor, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      {isError ? '⚠ ERROR' : isSuccess ? '✓ COMPLETE' : isActive ? '● ACTIVE' : '○ STANDBY'}
                    </div>
                  </div>
                  {/* 상태 도트 */}
                  <motion.div
                    animate={isActive ? { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] } : isError ? { opacity: [1, 0.3, 1] } : {}}
                    transition={{ duration: isError ? 0.5 : 1.2, repeat: Infinity }}
                    style={{
                      width: 6, height: 6, borderRadius: '50%',
                      backgroundColor: stateColor,
                      boxShadow: `0 0 8px ${stateColor}`,
                    }}
                  />
                </div>

                {/* 구분선 */}
                <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${platform.primary}30, transparent)`, marginBottom: 6 }} />

                {/* 데이터 영역 */}
                {hasData ? (
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    {Object.entries(card.data).slice(0, 4).map(([key, val], i) => (
                      <motion.div
                        key={key}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '2px 0',
                          borderBottom: `1px solid ${platform.primary}08`,
                        }}
                      >
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.45rem', color: 'rgba(200,210,220,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
                          {key}
                        </span>
                        <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.48rem', color: platform.primary, fontWeight: 'bold' }}>
                          {val}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.36rem', color: 'rgba(100,116,139,0.3)', letterSpacing: '0.1em' }}>
                      {isActive ? 'PROCESSING...' : 'NO DATA'}
                    </span>
                  </div>
                )}

                {/* 마지막 로그 */}
                {card.lastLog && (
                  <div style={{
                    marginTop: 4,
                    padding: '3px 6px',
                    borderRadius: 4,
                    background: `${platform.primary}08`,
                    border: `1px solid ${platform.primary}12`,
                  }}>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.38rem', color: 'rgba(200,210,220,0.5)', lineHeight: 1.3, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {card.lastLog}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* ── 축소 모드 (아이콘만) ── */
              <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}>
                <span style={{ fontSize: '1.2rem', filter: isActive ? 'none' : 'grayscale(0.5) brightness(0.7)' }}>
                  {platform.icon}
                </span>
                <span style={{
                  fontFamily: 'Orbitron, monospace',
                  fontSize: '0.28rem',
                  color: isActive ? platform.primary : 'rgba(100,116,139,0.35)',
                  letterSpacing: '0.08em',
                  textAlign: 'center',
                }}>
                  {platform.label}
                </span>
                {/* 상태 인디케이터 */}
                {card.nodeState !== 'idle' && (
                  <motion.div
                    animate={isError ? { opacity: [1, 0.2, 1] } : isActive ? { scale: [1, 1.5, 1] } : {}}
                    transition={{ duration: isError ? 0.4 : 1, repeat: Infinity }}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      backgroundColor: stateColor,
                      boxShadow: `0 0 6px ${stateColor}`,
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
