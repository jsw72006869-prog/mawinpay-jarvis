/**
 * PlatformDataCards - 중앙 집중형 '아이언맨 스타일' 데이터 모핑 UI
 * 
 * 자비스 코어(중앙) 주변으로 플랫폼 카드들이 회오리치며 나타나고
 * 실시간 데이터를 포켓몬 카드 스타일로 표시한다.
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

export default function PlatformDataCards({ visible }: { visible: boolean }) {
  const [cards, setCards] = useState<Record<string, CardState>>(() => {
    const init: Record<string, CardState> = {};
    PLATFORMS.forEach(p => { init[p.id] = { ...DEFAULT_CARD_STATE }; });
    return init;
  });

  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [briefingActive, setBriefingActive] = useState(false);
  const autoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          <CentralDataCard 
            key={activeNodeId}
            platform={PLATFORMS.find(p => p.id === activeNodeId)!}
            card={cards[activeNodeId]}
          />
        )}
      </AnimatePresence>

      {/* 브리핑 시 전체 카드 회오리 효과 (선택사항) */}
      {briefingActive && !activeNodeId && (
        <div style={{ position: 'absolute', color: '#C8A96E', fontFamily: 'Orbitron', fontSize: '0.8rem', letterSpacing: '0.3em', opacity: 0.5 }}>
          INITIALIZING NEURAL NETWORK...
        </div>
      )}
    </div>
  );
}

function CentralDataCard({ platform, card }: { platform: PlatformTheme, card: CardState }) {
  const isError = card.nodeState === 'error';
  const isSuccess = card.nodeState === 'success';
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5, rotateY: 90, x: 100 }}
      animate={{ opacity: 1, scale: 1, rotateY: 0, x: 180 }} // 중앙 코어 우측에 배치
      exit={{ opacity: 0, scale: 0.8, rotateY: -90, x: 250 }}
      transition={{ type: 'spring', damping: 15 }}
      style={{
        width: 240,
        background: platform.bg,
        border: `1px solid ${isError ? '#FF3333' : isSuccess ? '#00FF88' : platform.primary}88`,
        borderRadius: 16,
        padding: 20,
        boxShadow: `0 0 30px ${isError ? '#FF3333' : isSuccess ? '#00FF88' : platform.glow}`,
        backdropFilter: 'blur(20px)',
        pointerEvents: 'auto',
        position: 'relative',
      }}
    >
      {/* 카드 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: '1.5rem' }}>{platform.icon}</div>
        <div>
          <div style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', color: platform.primary, letterSpacing: '0.1em' }}>{platform.label}</div>
          <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Live Telemetry</div>
        </div>
      </div>

      {/* 데이터 영역 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.entries(card.data).length > 0 ? (
          Object.entries(card.data).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 4 }}>
              <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{key}</span>
              <span style={{ fontSize: '0.65rem', color: '#fff', fontFamily: 'monospace', fontWeight: 'bold' }}>{val}</span>
            </div>
          ))
        ) : (
          <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>
            {card.nodeState === 'active' ? '수집 중...' : '데이터 대기 중'}
          </div>
        )}
      </div>

      {/* 최근 로그 */}
      {card.lastLog && (
        <div style={{ marginTop: 16, padding: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 4, borderLeft: `2px solid ${platform.primary}` }}>
          <div style={{ fontSize: '0.5rem', color: platform.primary, marginBottom: 4, fontWeight: 'bold' }}>MISSION LOG</div>
          <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.4 }}>{card.lastLog}</div>
        </div>
      )}

      {/* 상태 표시등 */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        width: 6, height: 6, borderRadius: '50%',
        background: isError ? '#FF3333' : isSuccess ? '#00FF88' : '#00D4FF',
        boxShadow: `0 0 8px ${isError ? '#FF3333' : isSuccess ? '#00FF88' : '#00D4FF'}`,
      }} />
    </motion.div>
  );
}
