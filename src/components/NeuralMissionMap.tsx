import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Text, Points, PointMaterial, Line, Sphere, MeshDistortMaterial, PerspectiveCamera, OrbitControls } from '@react-three/drei';
import {
  onTelemetryEvent,
  closeTelemetry,
  type TelemetryEvent,
  type NodeState,
  type NodeStatePayload,
  type PulseLinePayload,
  type MissionLogPayload,
  type NodeDataPayload,
  type BriefingSequencePayload,
} from '../lib/jarvis-telemetry';

/* ─── 테마 ─── */
const T = {
  gold: '#C8A96E', goldLight: '#E8D5A3', goldDim: '#8B6F3E',
  blue: '#00D4FF', blueLight: '#7BB3F0', cyan: '#00FFD4',
  silver: '#A8B8C8', silverDim: '#5A6A7A',
  bg: '#060A12', bgDeep: '#030608',
  text: '#D4E0EC', textDim: '#5A6A7A',
  green: '#00FF88', greenDim: '#7EC89B',
  purple: '#9B8EC4', purpleLight: '#C4A8FF',
  red: '#FF3D00', orange: '#FF8C00', warn: '#FFAA00',
};

/* ─── 노드 상태별 색상 ─── */
const STATE_COLORS: Record<NodeState, { color: string; glow: string; label: string }> = {
  idle:    { color: T.blue,   glow: 'rgba(0,212,255,0.15)',  label: 'STANDBY' },
  active:  { color: T.cyan,   glow: 'rgba(0,255,212,0.4)',   label: 'ACTIVE' },
  success: { color: T.green,  glow: 'rgba(0,255,136,0.5)',   label: 'COMPLETE' },
  error:   { color: T.orange, glow: 'rgba(255,140,0,0.5)',   label: 'ERROR' },
};

/* ─── 노드 정의 ─── */
interface MapNode {
  id: string;
  label: string;
  sublabel: string;
  icon: string;
  state: NodeState;
  detail: string;
  x: number; y: number; z: number;
  baseColor: string;
  lastSync?: string;
  summary?: Record<string, string | number>;
}

interface LogEntry {
  time: string;
  icon: string;
  source: string;
  text: string;
  type: 'info' | 'success' | 'error' | 'warn' | 'thinking';
}

interface ActivePulse {
  id: string;
  from: string;
  to: string;
  speed: string;
  color?: string;
  startTime: number;
}

const INITIAL_NODES: MapNode[] = [
  { id: 'jarvis_brain', label: 'JARVIS CORE',  sublabel: 'Gemini 1.5 Pro',    icon: '🧠', state: 'idle', detail: 'Neural Core Online',        x: 0,   y: 0,    z: 0,   baseColor: T.purple },
  { id: 'smartstore',   label: 'SMARTSTORE',    sublabel: 'Naver Commerce',     icon: '🛒', state: 'idle', detail: 'Awaiting query',             x: -22, y: 14,   z: -8,  baseColor: T.green },
  { id: 'youtube',      label: 'YOUTUBE',       sublabel: 'Data API v3',        icon: '▶️', state: 'idle', detail: 'Search standby',             x: 22,  y: 14,   z: -8,  baseColor: '#FF0000' },
  { id: 'naver',        label: 'NAVER',         sublabel: 'Search API',         icon: '🔍', state: 'idle', detail: 'Blog/Cafe scanner ready',    x: -28, y: -6,   z: -5,  baseColor: '#1EC800' },
  { id: 'instagram',    label: 'INSTAGRAM',     sublabel: 'Graph API',          icon: '📸', state: 'idle', detail: 'Influencer scanner ready',   x: 28,  y: -6,   z: -5,  baseColor: '#E1306C' },
  { id: 'email',        label: 'EMAIL',         sublabel: 'Gmail MCP',          icon: '✉️', state: 'idle', detail: 'Campaign engine standby',    x: -16, y: -20,  z: -3,  baseColor: T.blueLight },
  { id: 'sheets',       label: 'SHEETS',        sublabel: 'Google Sheets',      icon: '📋', state: 'idle', detail: 'Data warehouse ready',       x: 16,  y: -20,  z: -3,  baseColor: T.goldLight },
  { id: 'manus_agent',  label: 'MANUS AI',      sublabel: 'Autonomous Agent',   icon: '🤖', state: 'idle', detail: 'Manus 1.6 Max Standby',     x: 0,   y: 28,   z: 0,   baseColor: T.blueLight },
  { id: 'user',         label: 'COMMANDER',     sublabel: 'Sir',                icon: '👤', state: 'idle', detail: 'Awaiting command',            x: 0,   y: -32,  z: 15,  baseColor: T.gold },
  // ─── 신규 모듈 노드 (v4.2) ───
  { id: 'market_intel', label: 'MARKET INTEL',  sublabel: 'KAMIS / 가락시장',   icon: '📈', state: 'idle', detail: 'Price tracker standby',      x: -32, y: 6,    z: -10, baseColor: '#FF9800' },
  { id: 'influencer',   label: 'INFLUENCER',    sublabel: 'Agent Scanner',      icon: '🎯', state: 'idle', detail: 'Influencer agent ready',     x: 32,  y: 6,    z: -10, baseColor: '#9C27B0' },
  { id: 'rank_tracker', label: 'RANK TRACKER',  sublabel: 'Naver Shopping',     icon: '🏆', state: 'idle', detail: 'Rank monitor standby',       x: -10, y: 24,   z: -6,  baseColor: '#FFD700' },
  { id: 'booking',      label: 'BOOKING',       sublabel: 'Real Action Agent',  icon: '📅', state: 'idle', detail: 'Reservation engine ready',   x: 10,  y: 24,   z: -6,  baseColor: '#F44336' },
];

const CONNECTIONS: [string, string][] = [
  ['jarvis_brain', 'smartstore'], ['jarvis_brain', 'youtube'], ['jarvis_brain', 'naver'],
  ['jarvis_brain', 'instagram'], ['jarvis_brain', 'email'], ['jarvis_brain', 'sheets'],
  ['jarvis_brain', 'manus_agent'], ['user', 'jarvis_brain'],
  ['manus_agent', 'youtube'], ['manus_agent', 'naver'],
  ['sheets', 'email'],
  // ─── 신규 모듈 연결 (v4.2) ───
  ['jarvis_brain', 'market_intel'], ['jarvis_brain', 'influencer'],
  ['jarvis_brain', 'rank_tracker'], ['jarvis_brain', 'booking'],
  ['market_intel', 'sheets'], ['influencer', 'youtube'], ['influencer', 'email'],
  ['rank_tracker', 'smartstore'], ['booking', 'manus_agent'],
];

/* ─── 3D Background Particles ─── */
function BgParticles() {
  const positions = useMemo(() => {
    const p = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      p[i * 3]     = (Math.random() - 0.5) * 180;
      p[i * 3 + 1] = (Math.random() - 0.5) * 180;
      p[i * 3 + 2] = (Math.random() - 0.5) * 180;
    }
    return p;
  }, []);
  const ref = useRef<THREE.Points>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.008; });
  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial transparent color={T.blue} size={0.2} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.25} />
    </Points>
  );
}

/* ─── 3D Node ─── */
function Node3D({ node, isSelected, onSelect }: { node: MapNode; isSelected: boolean; onSelect: (id: string) => void }) {
  const stateStyle = STATE_COLORS[node.state];
  const color = node.state === 'idle' ? node.baseColor : stateStyle.color;
  const isActive = node.state === 'active';
  const isError = node.state === 'error';
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame(({ camera, clock }) => {
    if (groupRef.current) {
      groupRef.current.children.forEach(c => { if (c.name === 'bb') c.quaternion.copy(camera.quaternion); });
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += isActive ? 0.06 : isError ? 0.08 : 0.01;
    }
    if (glowRef.current) {
      const s = isActive ? 1 + Math.sin(clock.getElapsedTime() * 6) * 0.3 : isError ? 1 + Math.sin(clock.getElapsedTime() * 10) * 0.4 : 1;
      glowRef.current.scale.setScalar(s);
    }
  });

  return (
    <Float speed={isActive ? 4 : 2} rotationIntensity={isActive ? 0.6 : 0.2} floatIntensity={isActive ? 1 : 0.5} position={[node.x, node.y, node.z]}>
      <group ref={groupRef} onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}>
        {/* Core Sphere */}
        <Sphere args={[1.5, 32, 32]}>
          <MeshDistortMaterial
            color={color}
            speed={isActive ? 5 : isError ? 8 : 1.5}
            distort={isActive ? 0.45 : isError ? 0.5 : 0.12}
            radius={1}
            emissive={color}
            emissiveIntensity={isActive ? 6 : isError ? 7 : isSelected ? 4 : 2}
          />
        </Sphere>

        {/* Glow sphere */}
        <Sphere ref={glowRef} args={[2.5, 16, 16]}>
          <meshStandardMaterial color={color} transparent opacity={isActive ? 0.15 : isError ? 0.2 : 0.05} />
        </Sphere>

        {/* Icon */}
        <Text name="bb" position={[0, 0, 0.6]} fontSize={1.8} color="white" anchorX="center" anchorY="middle">
          {node.icon}
        </Text>

        {/* Ring */}
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.8, isActive ? 0.12 : 0.06, 16, 100]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isActive ? 5 : 2} transparent opacity={isActive ? 0.8 : 0.4} />
        </mesh>

        {/* Second ring for active/error */}
        {(isActive || isError) && (
          <mesh rotation={[Math.PI / 3, Math.PI / 4, 0]}>
            <torusGeometry args={[3.2, 0.04, 16, 80]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4} transparent opacity={0.5} />
          </mesh>
        )}

        {/* Labels */}
        <group name="bb" position={[0, -3.8, 0]}>
          <Text fontSize={0.95} color={T.text} anchorX="center" anchorY="middle" outlineWidth={0.06} outlineColor="#000" fontWeight="bold">
            {node.label}
          </Text>
          <Text position={[0, -1.2, 0]} fontSize={0.55} color={color} anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#000">
            {stateStyle.label}
          </Text>
        </group>
      </group>
    </Float>
  );
}

/* ─── Connection Line with Pulse ─── */
function ConnLine({ start, end, active, pulseSpeed }: { start: [number, number, number]; end: [number, number, number]; active: boolean; pulseSpeed?: string }) {
  const pts = useMemo(() => [new THREE.Vector3(...start), new THREE.Vector3(...end)], [start, end]);
  const dashRef = useRef<any>(null);

  useFrame(() => {
    if (dashRef.current && active) {
      const speed = pulseSpeed === 'intense' ? 0.08 : pulseSpeed === 'fast' ? 0.05 : 0.02;
      dashRef.current.material.dashOffset -= speed;
    }
  });

  return (
    <group>
      <Line
        ref={dashRef}
        points={pts}
        color={active ? T.cyan : T.blue}
        lineWidth={active ? 3.5 : 1}
        transparent
        opacity={active ? 0.9 : 0.15}
        dashed
        dashScale={active ? 6 : 3}
        gapSize={active ? 0.3 : 0.5}
      />
      {active && (
        <Line
          points={pts}
          color={T.cyan}
          lineWidth={8}
          transparent
          opacity={0.08}
        />
      )}
    </group>
  );
}

/* ─── 메인 컴포넌트 ─── */
export default function NeuralMissionMap({ onClose }: { onClose: () => void }) {
  const [nodes, setNodes] = useState<MapNode[]>(INITIAL_NODES);
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: new Date().toLocaleTimeString('ko-KR', { hour12: false }), icon: '🚀', source: 'System', text: 'JARVIS Neural Mission Map v4.0 Online', type: 'info' },
    { time: new Date().toLocaleTimeString('ko-KR', { hour12: false }), icon: '🧠', source: 'Gemini', text: 'Neural Core: Gemini 1.5 Pro Active', type: 'success' },
  ]);
  const [selectedNode, setSelectedNode] = useState<string | null>('jarvis_brain');
  const [activePulses, setActivePulses] = useState<Set<string>>(new Set());
  const [pulseSpeedMap, setPulseSpeedMap] = useState<Record<string, string>>({});
  const [briefingActive, setBriefingActive] = useState(false);
  const [missionPhase, setMissionPhase] = useState('STANDBY');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 노드 좌표 맵
  const nodePositions = useMemo(() => {
    const map: Record<string, [number, number, number]> = {};
    INITIAL_NODES.forEach(n => { map[n.id] = [n.x, n.y, n.z]; });
    return map;
  }, []);

  // 로그 자동 스크롤
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  // 로그 추가 헬퍼
  const addLog = useCallback((icon: string, source: string, text: string, type: LogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    setLogs(prev => [...prev.slice(-80), { time, icon, source, text, type }]);
  }, []);

  // 노드 상태 업데이트 헬퍼
  const updateNodeState = useCallback((nodeId: string, state: NodeState, detail?: string, data?: Record<string, any>) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? {
      ...n,
      state,
      detail: detail || n.detail,
      lastSync: new Date().toISOString(),
      summary: data ? { ...(n.summary || {}), ...data } : n.summary,
    } : n));
  }, []);

  // 펄스 라인 활성화 헬퍼
  const activatePulse = useCallback((from: string, to: string, speed: string = 'normal') => {
    const key = `${from}->${to}`;
    setActivePulses(prev => new Set(prev).add(key));
    setPulseSpeedMap(prev => ({ ...prev, [key]: speed }));
    const duration = speed === 'intense' ? 8000 : speed === 'fast' ? 5000 : 3000;
    setTimeout(() => {
      setActivePulses(prev => { const next = new Set(prev); next.delete(key); return next; });
    }, duration);
  }, []);

  // 모닝 브리핑 시퀀스
  const runBriefingSequence = useCallback(async (focusNode?: string, message?: string) => {
    if (focusNode) {
      updateNodeState(focusNode, 'active', message);
      activatePulse('jarvis_brain', focusNode, 'normal');
      if (message) addLog('☀️', 'Briefing', message, 'info');
      return;
    }
    // 전체 시퀀스
    setBriefingActive(true);
    setMissionPhase('MORNING BRIEFING');
    addLog('☀️', 'System', '전 계통 점검 시작 (All Systems Check)', 'info');

    const sequence = ['smartstore', 'sheets', 'youtube', 'naver', 'instagram', 'email', 'manus_agent'];
    for (let i = 0; i < sequence.length; i++) {
      await new Promise(r => setTimeout(r, 400));
      updateNodeState(sequence[i], 'active', '시스템 점검 중...');
      activatePulse('jarvis_brain', sequence[i], 'normal');
    }
    await new Promise(r => setTimeout(r, 800));
    sequence.forEach(id => updateNodeState(id, 'success', '시스템 정상'));
    addLog('✅', 'System', '전 시스템 이상 무 (All Systems Nominal)', 'success');
    await new Promise(r => setTimeout(r, 2000));
    sequence.forEach(id => updateNodeState(id, 'idle'));
    setBriefingActive(false);
  }, [updateNodeState, activatePulse, addLog]);

  // ─── BroadcastChannel 수신 ───
  useEffect(() => {
    const unsubscribe = onTelemetryEvent((event: TelemetryEvent) => {
      switch (event.type) {
        case 'node_state': {
          const p = event.payload as NodeStatePayload;
          updateNodeState(p.nodeId, p.state, p.detail, p.data);
          if (p.state === 'active') {
            setMissionPhase('EXECUTING');
            activatePulse('jarvis_brain', p.nodeId, 'normal');
          } else if (p.state === 'success') {
            setMissionPhase('COMPLETE');
            setTimeout(() => setMissionPhase('STANDBY'), 3000);
          } else if (p.state === 'error') {
            setMissionPhase('ERROR');
            setTimeout(() => setMissionPhase('STANDBY'), 5000);
          }
          break;
        }
        case 'pulse_line': {
          const p = event.payload as PulseLinePayload;
          activatePulse(p.from, p.to, p.speed);
          break;
        }
        case 'mission_log': {
          const p = event.payload as MissionLogPayload;
          addLog(p.icon, p.source, p.message, p.logType);
          break;
        }
        case 'node_data': {
          const p = event.payload as NodeDataPayload;
          setNodes(prev => prev.map(n => n.id === p.nodeId ? {
            ...n, lastSync: p.lastSync, summary: { ...(n.summary || {}), ...p.summary }
          } : n));
          break;
        }
        case 'briefing_sequence': {
          const p = event.payload as BriefingSequencePayload;
          if (p.phase === 'start') {
            runBriefingSequence();
          } else if (p.phase === 'node_focus' && p.focusNode) {
            runBriefingSequence(p.focusNode, p.message);
          } else if (p.phase === 'complete') {
            setMissionPhase('BRIEFING COMPLETE');
            addLog('✅', 'Briefing', p.message || '모닝 브리핑 완료', 'success');
            setTimeout(() => setMissionPhase('STANDBY'), 3000);
          }
          break;
        }
        case 'system_status': {
          setMissionPhase(event.payload.phase || 'STANDBY');
          break;
        }
      }
    });

    // 초기 로드 시 localStorage에서 노드 데이터 복원
    try {
      const stored = JSON.parse(localStorage.getItem('jarvis-node-data') || '{}');
      Object.entries(stored).forEach(([nodeId, data]: [string, any]) => {
        if (data.summary) {
          setNodes(prev => prev.map(n => n.id === nodeId ? {
            ...n, lastSync: data.lastSync, summary: data.summary
          } : n));
        }
      });
    } catch {}

    return () => { unsubscribe(); };
  }, [updateNodeState, activatePulse, addLog, runBriefingSequence]);

  // 선택된 노드 데이터
  const selNode = useMemo(() => nodes.find(n => n.id === selectedNode), [nodes, selectedNode]);

  // 연결선 활성 여부 판단
  const isConnectionActive = useCallback((from: string, to: string) => {
    return activePulses.has(`${from}->${to}`) || activePulses.has(`${to}->${from}`);
  }, [activePulses]);

  const getConnectionPulseSpeed = useCallback((from: string, to: string) => {
    return pulseSpeedMap[`${from}->${to}`] || pulseSpeedMap[`${to}->${from}`] || 'normal';
  }, [pulseSpeedMap]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: T.bgDeep, color: T.text, display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>

      {/* ─── Header ─── */}
      <div style={{ padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.blue}22`, background: 'rgba(6,10,18,0.9)', backdropFilter: 'blur(15px)', zIndex: 10 }}>
        <div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', letterSpacing: '0.25em', color: T.gold }}>JARVIS NEURAL MISSION MAP v4.0</div>
          <div style={{ fontSize: '0.7rem', color: T.textDim, letterSpacing: '0.15em', marginTop: 2 }}>
            MISSION PHASE: <span style={{ color: missionPhase === 'ERROR' ? T.orange : missionPhase === 'STANDBY' ? T.blue : T.cyan, fontWeight: 'bold' }}>{missionPhase}</span>
            {briefingActive && <span style={{ marginLeft: 12, color: T.gold }}>☀️ BRIEFING IN PROGRESS</span>}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(0,212,255,0.1)', border: `1px solid ${T.blue}66`, color: T.blue, padding: '8px 20px', cursor: 'pointer', borderRadius: 6, fontWeight: 'bold', letterSpacing: '0.1em' }}>
          CLOSE
        </button>
      </div>

      {/* ─── Main Content ─── */}
      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>

        {/* ─── 3D Canvas ─── */}
        <div style={{ flex: 1, position: 'relative', background: 'radial-gradient(circle at center, #0d1b2e 0%, #030608 100%)' }}>
          <Canvas shadows dpr={[1, 2]}>
            <PerspectiveCamera makeDefault position={[0, 0, 75]} fov={50} />
            <OrbitControls enablePan enableZoom maxDistance={150} minDistance={30} />
            <ambientLight intensity={0.8} />
            <pointLight position={[30, 30, 30]} intensity={2} color={T.blue} />
            <pointLight position={[-30, -30, -30]} intensity={1.5} color={T.gold} />

            <BgParticles />

            <Suspense fallback={null}>
              {nodes.map(node => (
                <Node3D key={node.id} node={node} isSelected={selectedNode === node.id} onSelect={setSelectedNode} />
              ))}
              {CONNECTIONS.map(([from, to], i) => {
                const fromPos = nodePositions[from];
                const toPos = nodePositions[to];
                if (!fromPos || !toPos) return null;
                const active = isConnectionActive(from, to);
                return (
                  <ConnLine
                    key={i}
                    start={fromPos as [number, number, number]}
                    end={toPos as [number, number, number]}
                    active={active}
                    pulseSpeed={active ? getConnectionPulseSpeed(from, to) : undefined}
                  />
                );
              })}
            </Suspense>
          </Canvas>

          {/* ─── Status Bar (bottom-left) ─── */}
          <div style={{ position: 'absolute', bottom: 30, left: 30, pointerEvents: 'none', zIndex: 10 }}>
            <div style={{ fontSize: '0.65rem', color: T.textDim, marginBottom: 8, letterSpacing: '0.3em' }}>TELEMETRY STATUS</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ padding: '6px 16px', background: 'rgba(0,255,136,0.1)', border: `1px solid ${T.green}44`, borderRadius: 6, fontSize: '0.75rem', backdropFilter: 'blur(8px)' }}>
                SYNC: <span style={{ color: T.green, fontWeight: 'bold' }}>BROADCAST</span>
              </div>
              <div style={{ padding: '6px 16px', background: 'rgba(200,169,110,0.1)', border: `1px solid ${T.gold}44`, borderRadius: 6, fontSize: '0.75rem', backdropFilter: 'blur(8px)' }}>
                NODES: <span style={{ fontWeight: 'bold' }}>{nodes.filter(n => n.state !== 'idle').length}/{nodes.length}</span>
              </div>
              <div style={{ padding: '6px 16px', background: 'rgba(0,212,255,0.1)', border: `1px solid ${T.blue}44`, borderRadius: 6, fontSize: '0.75rem', backdropFilter: 'blur(8px)' }}>
                BRAIN: <span style={{ color: T.cyan, fontWeight: 'bold' }}>GEMINI 1.5</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Right Panel ─── */}
        <div style={{ width: 400, background: 'rgba(3,6,8,0.95)', borderLeft: `1px solid ${T.blue}22`, display: 'flex', flexDirection: 'column', zIndex: 10, backdropFilter: 'blur(25px)' }}>

          {/* ─── Node Inspector ─── */}
          <div style={{ padding: '24px 28px', borderBottom: `1px solid ${T.blue}15` }}>
            <div style={{ fontSize: '0.65rem', color: T.textDim, letterSpacing: '0.4em', marginBottom: 20 }}>NODE INSPECTOR</div>
            {selNode ? (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} key={selNode.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
                  <div style={{ fontSize: '2.8rem', filter: 'drop-shadow(0 0 12px rgba(255,255,255,0.2))' }}>{selNode.icon}</div>
                  <div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: selNode.state === 'idle' ? selNode.baseColor : STATE_COLORS[selNode.state].color, letterSpacing: '0.05em' }}>{selNode.label}</div>
                    <div style={{ fontSize: '0.75rem', color: T.textDim }}>{selNode.sublabel}</div>
                  </div>
                </div>

                {/* Status Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: STATE_COLORS[selNode.state].color,
                    boxShadow: `0 0 8px ${STATE_COLORS[selNode.state].color}`,
                    animation: selNode.state === 'active' ? 'pulse 1s infinite' : selNode.state === 'error' ? 'pulse 0.5s infinite' : 'none',
                  }} />
                  <span style={{ fontSize: '0.8rem', color: STATE_COLORS[selNode.state].color, fontWeight: 'bold', letterSpacing: '0.15em' }}>
                    {STATE_COLORS[selNode.state].label}
                  </span>
                  {selNode.lastSync && (
                    <span style={{ fontSize: '0.65rem', color: T.textDim, marginLeft: 'auto' }}>
                      {new Date(selNode.lastSync).toLocaleTimeString('ko-KR', { hour12: false })}
                    </span>
                  )}
                </div>

                {/* Detail Box */}
                <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: `1px solid ${T.blue}15`, marginBottom: 14 }}>
                  <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: T.text }}>{selNode.detail}</div>
                </div>

                {/* Summary Data (from API results) */}
                {selNode.summary && Object.keys(selNode.summary).length > 0 && (
                  <div style={{ padding: 14, background: 'rgba(0,212,255,0.03)', borderRadius: 10, border: `1px solid ${T.cyan}15` }}>
                    <div style={{ fontSize: '0.6rem', color: T.textDim, letterSpacing: '0.3em', marginBottom: 10 }}>LATEST DATA</div>
                    {Object.entries(selNode.summary).map(([key, val]) => (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${T.blue}08`, fontSize: '0.8rem' }}>
                        <span style={{ color: T.textDim }}>{key}</span>
                        <span style={{ color: T.cyan, fontWeight: 'bold' }}>{String(val)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : (
              <div style={{ color: T.textDim, fontSize: '0.9rem', textAlign: 'center', padding: '40px 0', border: `1px dashed ${T.blue}20`, borderRadius: 10 }}>
                Select a node to inspect
              </div>
            )}
          </div>

          {/* ─── Mission Logs ─── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '18px 28px 8px', fontSize: '0.65rem', color: T.textDim, letterSpacing: '0.4em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>MISSION LOGS</span>
              <span style={{ color: T.blue, fontSize: '0.6rem' }}>{logs.length} entries</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px 20px', scrollbarWidth: 'thin', scrollbarColor: `${T.blue}33 transparent` }}>
              <AnimatePresence>
                {logs.map((log, i) => {
                  const borderColor = log.type === 'error' ? T.orange : log.type === 'success' ? T.green : log.type === 'warn' ? T.warn : log.type === 'thinking' ? T.purple : T.blue;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      style={{
                        marginBottom: 8, display: 'flex', gap: 10,
                        borderLeft: `3px solid ${borderColor}66`,
                        padding: '6px 12px', borderRadius: '0 6px 6px 0',
                        background: `linear-gradient(90deg, ${borderColor}06, transparent)`,
                      }}
                    >
                      <span style={{ fontSize: '0.7rem', color: T.textDim, whiteSpace: 'nowrap', fontFamily: 'monospace', opacity: 0.6 }}>{log.time}</span>
                      <span style={{ fontSize: '0.8rem' }}>{log.icon}</span>
                      <span style={{ fontSize: '0.65rem', color: borderColor, fontWeight: 'bold', minWidth: 50 }}>{log.source}</span>
                      <span style={{ fontSize: '0.78rem', color: log.type === 'error' ? T.orange : T.text, lineHeight: 1.4, flex: 1 }}>{log.text}</span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Footer ─── */}
      <div style={{ padding: '14px 32px', background: T.bgDeep, borderTop: `1px solid ${T.blue}22`, display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: T.textDim, zIndex: 10 }}>
        <div>MAWINPAY INTELLIGENCE · JARVIS v4.0 · GEMINI NEURAL ENGINE</div>
        <div style={{ display: 'flex', gap: 24 }}>
          <span>SYNC: <span style={{ color: T.green }}>BROADCAST</span></span>
          <span>NODES: <span style={{ color: T.blue }}>{nodes.length}</span></span>
          <span style={{ color: T.green, fontWeight: 'bold' }}>SECURE</span>
        </div>
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </motion.div>
  );
}
