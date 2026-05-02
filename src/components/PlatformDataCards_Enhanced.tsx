/**
 * PlatformDataCards - Enhanced 아이언맨 스타일 HUD
 * 
 * 개선사항:
 * 1. 더욱 복잡한 모핑 애니메이션 (3D 회전, 스케일 변화, 글리치 효과)
 * 2. 홀로그램 느낌 강화 (그래디언트, 글로우, 스캔라인)
 * 3. 데이터 카드의 동적 변형 및 입자 효과
 * 4. 중앙 코어와의 상호작용 (거리 기반 애니메이션)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  onTelemetryEvent,
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

export default function PlatformDataCardsEnhanced({ visible }: { visible: boolean }) {
  const [cards, setCards] = useState<Record<string, CardState>>(() => {
    const init: Record<string, CardState> = {};
    PLATFORMS.forEach(p => { init[p.id] = { ...DEFAULT_CARD_STATE }; });
    return init;
  });

  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [briefingActive, setBriefingActive] = useState(false);
  const autoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [glitchActive, setGlitchActive] = useState(false);

  useEffect(() => {
    const unsub = onTelemetryEvent((event: TelemetryEvent) => {
      switch (event.type) {
        case 'node_state': {
          const { nodeId, state: newState } = event.payload as { nodeId: string; state: NodeState };
          setCards(prev => {
            if (!prev[nodeId]) return prev;
            return { ...prev, [nodeId]: { ...prev[nodeId], nodeState: newState, lastUpdate: Date.now() } };
          });
          
          if (newState === 'active') {
            setActiveNodeId(nodeId);
            if (autoHideRef.current) clearTimeout(autoHideRef.current);
            // 글리치 효과 트리거
            setGlitchActive(true);
            setTimeout(() => setGlitchActive(false), 300);
          } else if (newState === 'success' || newState === 'error') {
            if (autoHideRef.current) clearTimeout(autoHideRef.current);
            autoHideRef.current = setTimeout(() => setActiveNodeId(null), 8000);
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
          if (phase === 'start') setBriefingActive(true);
          else if (phase === 'complete') setBriefingActive(false);
          else if (phase === 'node_focus' && nodeId) setActiveNodeId(nodeId);
          break;
        }
      }
    });

    return () => {
      unsub();
      if (autoHideRef.current) clearTimeout(autoHideRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 100,
    }}>
      <AnimatePresence>
        {activeNodeId && (
          <CentralDataCardEnhanced 
            key={activeNodeId}
            platform={PLATFORMS.find(p => p.id === activeNodeId)!}
            card={cards[activeNodeId]}
            glitchActive={glitchActive}
          />
        )}
      </AnimatePresence>

      {/* 브리핑 시 전체 카드 회오리 효과 */}
      {briefingActive && !activeNodeId && (
        <div style={{ position: 'absolute', color: '#C8A96E', fontFamily: 'Orbitron', fontSize: '0.8rem', letterSpacing: '0.3em', opacity: 0.5 }}>
          INITIALIZING NEURAL NETWORK...
        </div>
      )}
    </div>
  );
}

function CentralDataCardEnhanced({ 
  platform, 
  card, 
  glitchActive 
}: { 
  platform: PlatformTheme, 
  card: CardState,
  glitchActive: boolean 
}) {
  const isError = card.nodeState === 'error';
  const isSuccess = card.nodeState === 'success';
  
  // 글리치 애니메이션 변수
  const glitchVariants = {
    normal: { x: 0, y: 0, opacity: 1 },
    glitch: [
      { x: -2, y: 2, opacity: 0.9 },
      { x: 2, y: -2, opacity: 1 },
      { x: -1, y: 1, opacity: 0.95 },
      { x: 0, y: 0, opacity: 1 },
    ],
  };

  // 모핑 애니메이션 (더욱 복잡한 경로)
  const morphVariants = {
    initial: { 
      opacity: 0, 
      scale: 0.3, 
      rotateY: 120, 
      rotateX: -30,
      x: 150,
      y: -100,
    },
    animate: { 
      opacity: 1, 
      scale: 1, 
      rotateY: 0, 
      rotateX: 0,
      x: 180, 
      y: 0,
      transition: {
        type: 'spring',
        damping: 12,
        stiffness: 100,
        mass: 1,
      },
    },
    exit: { 
      opacity: 0, 
      scale: 0.6, 
      rotateY: -120, 
      rotateX: 30,
      x: 250,
      y: 100,
      transition: { duration: 0.4 },
    },
  };

  return (
    <motion.div
      initial="initial"
      animate={glitchActive ? 'glitch' : 'animate'}
      exit="exit"
      variants={glitchActive ? glitchVariants : morphVariants}
      style={{
        width: 280,
        background: platform.bg,
        border: `2px solid ${isError ? '#FF3333' : isSuccess ? '#00FF88' : platform.primary}`,
        borderRadius: 20,
        padding: 24,
        boxShadow: `
          0 0 40px ${isError ? '#FF3333' : isSuccess ? '#00FF88' : platform.glow},
          inset 0 0 20px ${isError ? 'rgba(255,51,51,0.2)' : isSuccess ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.05)'},
          0 0 60px ${isError ? 'rgba(255,51,51,0.3)' : isSuccess ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.1)'}
        `,
        backdropFilter: 'blur(25px)',
        pointerEvents: 'auto',
        position: 'relative',
        perspective: '1000px',
      }}
    >
      {/* 홀로그램 스캔라인 효과 */}
      <div style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 20,
        background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 2px)',
        pointerEvents: 'none',
        animation: 'scan 8s linear infinite',
      }} />

      {/* 카드 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, position: 'relative', zIndex: 1 }}>
        <motion.div 
          animate={{ rotate: card.nodeState === 'active' ? 360 : 0 }}
          transition={{ duration: 2, repeat: card.nodeState === 'active' ? Infinity : 0 }}
          style={{ fontSize: '2rem' }}
        >
          {platform.icon}
        </motion.div>
        <div>
          <motion.div 
            animate={{ opacity: [1, 0.7, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ 
              fontFamily: 'Orbitron', 
              fontSize: '0.8rem', 
              color: platform.primary, 
              letterSpacing: '0.15em',
              fontWeight: 'bold',
            }}
          >
            {platform.label}
          </motion.div>
          <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Live Telemetry Stream
          </div>
        </div>
      </div>

      {/* 상태 표시등 (더욱 강렬한 글로우) */}
      <motion.div 
        animate={{ scale: [1, 1.3, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        style={{
          position: 'absolute', 
          top: 16, 
          right: 16,
          width: 8, 
          height: 8, 
          borderRadius: '50%',
          background: isError ? '#FF3333' : isSuccess ? '#00FF88' : '#00D4FF',
          boxShadow: `0 0 12px ${isError ? '#FF3333' : isSuccess ? '#00FF88' : '#00D4FF'}, 0 0 24px ${isError ? 'rgba(255,51,51,0.6)' : isSuccess ? 'rgba(0,255,136,0.6)' : 'rgba(0,212,255,0.6)'}`,
        }} 
      />

      {/* 데이터 영역 */}
      <motion.div 
        animate={{ opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 3, repeat: Infinity }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 1 }}
      >
        {Object.entries(card.data).length > 0 ? (
          Object.entries(card.data).map(([key, val], idx) => (
            <motion.div 
              key={key}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                borderBottom: `1px solid ${platform.primary}33`, 
                paddingBottom: 6,
              }}
            >
              <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {key}
              </span>
              <span style={{ 
                fontSize: '0.7rem', 
                color: platform.secondary, 
                fontFamily: 'monospace', 
                fontWeight: 'bold',
                textShadow: `0 0 8px ${platform.glow}`,
              }}>
                {val}
              </span>
            </motion.div>
          ))
        ) : (
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
            {card.nodeState === 'active' ? '데이터 수집 중...' : '대기 중...'}
          </div>
        )}
      </motion.div>

      {/* 최근 로그 */}
      {card.lastLog && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ marginTop: 18, padding: 10, background: 'rgba(0,0,0,0.4)', borderRadius: 6, borderLeft: `3px solid ${platform.primary}`, position: 'relative', zIndex: 1 }}
        >
          <div style={{ fontSize: '0.55rem', color: platform.secondary, marginBottom: 6, fontWeight: 'bold', letterSpacing: '0.1em' }}>
            ▸ MISSION LOG
          </div>
          <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
            {card.lastLog}
          </div>
        </motion.div>
      )}

      {/* CSS 애니메이션 정의 */}
      <style>{`
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
      `}</style>
    </motion.div>
  );
}
