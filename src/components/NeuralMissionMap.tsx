import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Text, Points, PointMaterial, Line, Sphere, MeshDistortMaterial, PerspectiveCamera, Environment } from '@react-three/drei';

const THEME = {
  gold:       '#C8A96E',
  goldLight:  '#E8D5A3',
  goldDim:    '#8B6F3E',
  blue:       '#00D4FF',
  blueLight:  '#7BB3F0',
  silver:     '#A8B8C8',
  silverDim:  '#5A6A7A',
  bg:         '#060A12',
  bgDeep:     '#030608',
  text:       '#D4E0EC',
  textDim:    '#5A6A7A',
  green:      '#7EC89B',
  purple:     '#9B8EC4',
  orange:     '#FF3D00',
  warn:       '#FF8C00',
};

const BOOKING_SERVER = 'https://jarvis-booking-server-production.up.railway.app';

const SSE_NODE_MAP: Record<string, string> = {
  brain:      'jarvis_brain',
  smartstore: 'smartstore',
  telegram:   'telegram',
  scheduler:  'scheduler',
  email:      'email',
  commander:  'user',
  ordersheet: 'ordersheet',
  settlement: 'settlement',
  manus:      'manus_agent',
};

const SSE_FLOW_MAP: Record<string, string> = {
  'brain->smartstore':     'brain_smartstore',
  'brain->telegram':       'brain_telegram',
  'brain->scheduler':      'brain_scheduler',
  'brain->email':          'brain_email',
  'commander->brain':      'user_brain',
  'scheduler->brain':      'brain_scheduler',
  'telegram->brain':       'user_brain',
  'smartstore->brain':     'brain_smartstore',
  'email->telegram':       'email_telegram',
  'scheduler->smartstore': 'scheduler_smartstore',
  'brain->ordersheet':     'brain_ordersheet',
  'ordersheet->settlement':'ordersheet_settlement',
  'ordersheet->email':     'ordersheet_email',
  'settlement->telegram':  'settlement_telegram',
  'brain->manus':          'brain_manus',
  'manus->brain':          'brain_manus',
  'manus->telegram':       'manus_telegram',
};

interface NodeStatus {
  id: string;
  label: string;
  sublabel: string;
  icon: string;
  status: 'online' | 'offline' | 'warning' | 'processing' | 'idle';
  detail: string;
  lastUpdate?: string;
  progress?: number;
  x: number;
  y: number;
  z: number;
}

interface LogEntry {
  time: string;
  text: string;
  type: 'info' | 'success' | 'error' | 'warn';
}

const STATUS_COLOR: Record<string, string> = {
  online:     THEME.green,
  offline:    THEME.orange,
  warning:    THEME.warn,
  processing: THEME.blue,
  idle:       THEME.gold,
};

const STATUS_LABEL: Record<string, string> = {
  online:     'ONLINE',
  offline:    'OFFLINE',
  warning:    'WARNING',
  processing: 'PROCESSING',
  idle:       'STANDBY',
};

// --- 3D Components ---

function BackgroundParticles() {
  const points = useMemo(() => {
    const p = new Float32Array(2000 * 3);
    for (let i = 0; i < 2000; i++) {
      p[i * 3] = (Math.random() - 0.5) * 100;
      p[i * 3 + 1] = (Math.random() - 0.5) * 100;
      p[i * 3 + 2] = (Math.random() - 0.5) * 100;
    }
    return p;
  }, []);

  const ref = useRef<THREE.Points>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.getElapsedTime() * 0.05;
      ref.current.rotation.x = state.clock.getElapsedTime() * 0.02;
    }
  });

  return (
    <Points ref={ref} positions={points} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color={THEME.blue}
        size={0.15}
        sizeAttenuation={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

function Node3D({ node, isSelected, onSelect }: { node: NodeStatus, isSelected: boolean, onSelect: (id: string) => void }) {
  const color = STATUS_COLOR[node.status];
  const isProcessing = node.status === 'processing';
  
  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5} position={[node.x, node.y, node.z]}>
      <group onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}>
        {/* Core Sphere */}
        <Sphere args={[0.8, 32, 32]}>
          <MeshDistortMaterial
            color={color}
            speed={isProcessing ? 4 : 1}
            distort={isProcessing ? 0.4 : 0.2}
            radius={1}
            emissive={color}
            emissiveIntensity={isSelected ? 2 : 0.5}
          />
        </Sphere>
        
        {/* Outer Ring */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.5, 0.02, 16, 100]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} transparent opacity={0.3} />
        </mesh>

        {/* Label */}
        <Text
          position={[0, -1.8, 0]}
          fontSize={0.4}
          color={THEME.text}
          font="/fonts/Inter-Bold.woff" // 실제 프로젝트 폰트 경로에 맞춰야 함
          anchorX="center"
          anchorY="middle"
        >
          {node.label}
        </Text>
        
        {/* Selection Glow */}
        {isSelected && (
          <Sphere args={[1.2, 32, 32]}>
            <meshStandardMaterial color={color} transparent opacity={0.1} />
          </Sphere>
        )}
      </group>
    </Float>
  );
}

function ConnectionLine({ start, end, active }: { start: [number, number, number], end: [number, number, number], active: boolean }) {
  const points = useMemo(() => [new THREE.Vector3(...start), new THREE.Vector3(...end)], [start, end]);
  
  return (
    <Line
      points={points}
      color={active ? THEME.blue : THEME.blue}
      lineWidth={active ? 2 : 0.5}
      transparent
      opacity={active ? 0.8 : 0.15}
      dashed={!active}
      dashScale={5}
      gapSize={0.5}
    />
  );
}

// --- Main Component ---

export default function NeuralMissionMap({ onClose }: { onClose: () => void }) {
  const [nodes, setNodes] = useState<NodeStatus[]>([
    { id: 'jarvis_brain', label: 'JARVIS CORE', sublabel: 'Railway Server', icon: '🧠', status: 'idle', detail: 'Connecting...', x: 0, y: 0, z: 0 },
    { id: 'smartstore', label: 'SMARTSTORE', sublabel: 'Naver Commerce', icon: '🛒', status: 'idle', detail: 'Smartstore API', x: -12, y: 8, z: -5 },
    { id: 'telegram', label: 'TELEGRAM', sublabel: 'Notification Bot', icon: '📡', status: 'idle', detail: 'Telegram Bot', x: 12, y: 8, z: -5 },
    { id: 'scheduler', label: 'SCHEDULER', sublabel: 'Auto Task', icon: '⏰', status: 'idle', detail: 'Scheduler', x: -12, y: -8, z: -5 },
    { id: 'email', label: 'EMAIL', sublabel: 'Order Dispatch', icon: '✉️', status: 'idle', detail: 'Order Email', x: 12, y: -8, z: -5 },
    { id: 'ordersheet', label: 'ORDER SHEET', sublabel: 'Logistics', icon: '📋', status: 'idle', detail: 'Sorting...', x: -6, y: -12, z: 5 },
    { id: 'settlement', label: 'SETTLEMENT', sublabel: 'Accounting', icon: '🧮', status: 'idle', detail: 'Calculating...', x: 6, y: -12, z: 5 },
    { id: 'manus_agent', label: 'MANUS AI', sublabel: 'Autonomous Agent', icon: '🤖', status: 'idle', detail: 'Manus 1.6 Max Standby', x: 0, y: 15, z: 0 },
    { id: 'user', label: 'COMMANDER', sublabel: 'Boss', icon: '👤', status: 'online', detail: 'Awaiting command', x: 0, y: -18, z: 10 },
  ]);

  const [logs, setLogs] = useState<LogEntry[]>([
    { time: '--:--:--', text: 'JARVIS Neural Mission Map v3.0 initializing...', type: 'info' },
  ]);
  const [selectedNode, setSelectedNode] = useState<string | null>('jarvis_brain');
  const [activeConnections, setActiveConnections] = useState<string[]>([]);
  const [missionPhase, setMissionPhase] = useState<string>('STANDBY');
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  const addLog = useCallback((text: string, type: LogEntry['type'] = 'info') => {
    const now = new Date();
    const time = now.toLocaleTimeString('ko-KR', { hour12: false });
    setLogs(prev => [...prev.slice(-49), { time, text, type }]);
  }, []);

  const updateNode = useCallback((id: string, updates: Partial<NodeStatus>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  }, []);

  // SSE & Health Check Logic (기존 로직 유지)
  useEffect(() => {
    const connectSSE = () => {
      if (sseRef.current) sseRef.current.close();
      setSseStatus('connecting');
      const es = new EventSource(`${BOOKING_SERVER}/events`);
      sseRef.current = es;
      es.onopen = () => setSseStatus('connected');
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const nodeId = data.node ? SSE_NODE_MAP[data.node] : null;
          if (nodeId) {
            updateNode(nodeId, { 
              status: data.type === 'node_active' ? 'processing' : 'online',
              detail: data.message,
              progress: data.progress
            });
          }
          if (data.flow) {
            const conns = data.flow.map((f: string) => SSE_FLOW_MAP[f]).filter(Boolean);
            setActiveConnections(prev => [...new Set([...prev, ...conns])]);
            setTimeout(() => setActiveConnections(prev => prev.filter(c => !conns.includes(c))), 5000);
          }
          addLog(data.message, data.type === 'node_error' ? 'error' : 'info');
        } catch (err) {}
      };
      es.onerror = () => {
        setSseStatus('disconnected');
        es.close();
        setTimeout(connectSSE, 10000);
      };
    };

    connectSSE();
    return () => sseRef.current?.close();
  }, [addLog, updateNode]);

  const selectedNodeData = useMemo(() => nodes.find(n => n.id === selectedNode), [nodes, selectedNode]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: THEME.bgDeep, color: THEME.text,
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Inter, sans-serif', overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${THEME.blue}22` }}>
        <div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', letterSpacing: '0.2em', color: THEME.gold }}>JARVIS NEURAL MISSION MAP v3.0</div>
          <div style={{ fontSize: '0.7rem', color: THEME.textDim, letterSpacing: '0.1em' }}>MISSION PHASE: <span style={{ color: THEME.blue }}>{missionPhase}</span></div>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${THEME.blue}44`, color: THEME.blue, padding: '8px 20px', cursor: 'pointer', borderRadius: '4px' }}>CLOSE TERMINAL</button>
      </div>

      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        {/* 3D Canvas Area */}
        <div style={{ flex: 1, position: 'relative' }}>
          <Canvas shadows dpr={[1, 2]}>
            <PerspectiveCamera makeDefault position={[0, 0, 40]} fov={45} />
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            <spotLight position={[-10, 20, 10]} angle={0.15} penumbra={1} intensity={2} castShadow />
            
            <BackgroundParticles />
            
            <Suspense fallback={null}>
              {nodes.map(node => (
                <Node3D key={node.id} node={node} isSelected={selectedNode === node.id} onSelect={setSelectedNode} />
              ))}
              
              {/* Connections */}
              <ConnectionLine start={[0, 0, 0]} end={[-12, 8, -5]} active={activeConnections.includes('brain_smartstore')} />
              <ConnectionLine start={[0, 0, 0]} end={[12, 8, -5]} active={activeConnections.includes('brain_telegram')} />
              <ConnectionLine start={[0, 0, 0]} end={[-12, -8, -5]} active={activeConnections.includes('brain_scheduler')} />
              <ConnectionLine start={[0, 0, 0]} end={[12, -8, -5]} active={activeConnections.includes('brain_email')} />
              <ConnectionLine start={[0, 0, 0]} end={[0, 15, 0]} active={activeConnections.includes('brain_manus')} />
              <ConnectionLine start={[0, -18, 10]} end={[0, 0, 0]} active={activeConnections.includes('user_brain')} />
              <ConnectionLine start={[0, 0, 0]} end={[-6, -12, 5]} active={activeConnections.includes('brain_ordersheet')} />
              <ConnectionLine start={[-6, -12, 5]} end={[6, -12, 5]} active={activeConnections.includes('ordersheet_settlement')} />
              <ConnectionLine start={[6, -12, 5]} end={[12, 8, -5]} active={activeConnections.includes('settlement_telegram')} />
              <ConnectionLine start={[0, 15, 0]} end={[12, 8, -5]} active={activeConnections.includes('manus_telegram')} />
            </Suspense>

            <Environment preset="city" />
          </Canvas>

          {/* Overlay Info */}
          <div style={{ position: 'absolute', bottom: 20, left: 20, pointerEvents: 'none' }}>
            <div style={{ fontSize: '0.6rem', color: THEME.textDim, marginBottom: 4 }}>SYSTEM STATUS</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ padding: '4px 12px', background: `${THEME.blue}22`, border: `1px solid ${THEME.blue}44`, borderRadius: 4, fontSize: '0.7rem' }}>
                SSE: <span style={{ color: sseStatus === 'connected' ? THEME.green : THEME.orange }}>{sseStatus.toUpperCase()}</span>
              </div>
              <div style={{ padding: '4px 12px', background: `${THEME.gold}22`, border: `1px solid ${THEME.gold}44`, borderRadius: 4, fontSize: '0.7rem' }}>
                NODES: {nodes.length} ACTIVE
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar (Logs & Details) */}
        <div style={{ width: 350, background: `${THEME.bgDeep}EE`, borderLeft: `1px solid ${THEME.blue}22`, display: 'flex', flexDirection: 'column' }}>
          {/* Node Detail */}
          <div style={{ padding: 24, borderBottom: `1px solid ${THEME.blue}22` }}>
            <div style={{ fontSize: '0.6rem', color: THEME.textDim, letterSpacing: '0.2em', marginBottom: 12 }}>NODE INSPECTOR</div>
            {selectedNodeData ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={selectedNodeData.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: '2rem' }}>{selectedNodeData.icon}</div>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: STATUS_COLOR[selectedNodeData.status] }}>{selectedNodeData.label}</div>
                    <div style={{ fontSize: '0.7rem', color: THEME.textDim }}>{selectedNodeData.sublabel}</div>
                  </div>
                </div>
                <div style={{ padding: 12, background: `${THEME.blue}11`, borderRadius: 4, border: `1px solid ${THEME.blue}33`, marginBottom: 16 }}>
                  <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>{selectedNodeData.detail}</div>
                  {selectedNodeData.progress !== undefined && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ height: 4, background: `${THEME.blue}22`, borderRadius: 2, overflow: 'hidden' }}>
                        <motion.div 
                          initial={{ width: 0 }} 
                          animate={{ width: `${selectedNodeData.progress}%` }} 
                          style={{ height: '100%', background: STATUS_COLOR[selectedNodeData.status], boxShadow: `0 0 10px ${STATUS_COLOR[selectedNodeData.status]}` }} 
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '0.7rem', color: STATUS_COLOR[selectedNodeData.status], fontWeight: 'bold' }}>● {STATUS_LABEL[selectedNodeData.status]}</div>
              </motion.div>
            ) : (
              <div style={{ color: THEME.textDim, fontSize: '0.8rem' }}>Select a node to inspect</div>
            )}
          </div>

          {/* Logs */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px 8px', fontSize: '0.6rem', color: THEME.textDim, letterSpacing: '0.2em' }}>MISSION LOGS</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px', fontSize: '0.75rem' }}>
              {logs.map((log, i) => (
                <div key={i} style={{ marginBottom: 8, display: 'flex', gap: 10 }}>
                  <span style={{ color: THEME.textDim, opacity: 0.5 }}>{log.time}</span>
                  <span style={{ color: log.type === 'error' ? THEME.orange : log.type === 'success' ? THEME.green : THEME.text }}>{log.text}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 40px', background: THEME.bgDeep, borderTop: `1px solid ${THEME.blue}22`, display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: THEME.textDim }}>
        <div>MAWINPAY INTELLIGENCE · SYSTEM v3.0.4</div>
        <div style={{ display: 'flex', gap: 20 }}>
          <span>LATENCY: 24ms</span>
          <span>UPTIME: 99.9%</span>
          <span style={{ color: THEME.green }}>SECURE CONNECTION</span>
        </div>
      </div>
    </motion.div>
  );
}
