import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Text, Points, PointMaterial, Line, Sphere, MeshDistortMaterial, PerspectiveCamera, Environment, OrbitControls } from '@react-three/drei';

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

function BackgroundParticles() {
  const points = useMemo(() => {
    const p = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      p[i * 3] = (Math.random() - 0.5) * 150;
      p[i * 3 + 1] = (Math.random() - 0.5) * 150;
      p[i * 3 + 2] = (Math.random() - 0.5) * 150;
    }
    return p;
  }, []);

  const ref = useRef<THREE.Points>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.getElapsedTime() * 0.02;
    }
  });

  return (
    <Points ref={ref} positions={points} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color={THEME.blue}
        size={0.2}
        sizeAttenuation={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        opacity={0.4}
      />
    </Points>
  );
}

function Node3D({ node, isSelected, onSelect }: { node: NodeStatus, isSelected: boolean, onSelect: (id: string) => void }) {
  const color = STATUS_COLOR[node.status];
  const isProcessing = node.status === 'processing';
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.name === 'label') {
          child.quaternion.copy(state.camera.quaternion);
        }
      });
    }
  });
  
  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5} position={[node.x, node.y, node.z]}>
      <group ref={groupRef} onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}>
        <Sphere args={[1.2, 32, 32]}>
          <MeshDistortMaterial
            color={color}
            speed={isProcessing ? 3 : 1}
            distort={isProcessing ? 0.3 : 0.1}
            radius={1}
            emissive={color}
            emissiveIntensity={isSelected ? 4 : 1.5}
          />
        </Sphere>
        
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.2, 0.05, 16, 100]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} transparent opacity={0.4} />
        </mesh>

        <Text
          name="label"
          position={[0, -2.8, 0]}
          fontSize={0.8}
          color={THEME.text}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.05}
          outlineColor="#000000"
        >
          {node.label}
        </Text>
        
        {isSelected && (
          <Sphere args={[1.8, 32, 32]}>
            <meshStandardMaterial color={color} transparent opacity={0.15} />
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
      lineWidth={active ? 3 : 1}
      transparent
      opacity={active ? 1 : 0.2}
      dashed={!active}
      dashScale={2}
      gapSize={0.5}
    />
  );
}

export default function NeuralMissionMap({ onClose }: { onClose: () => void }) {
  const [nodes, setNodes] = useState<NodeStatus[]>([
    { id: 'jarvis_brain', label: 'JARVIS CORE', sublabel: 'Railway Server', icon: '🧠', status: 'idle', detail: 'Connecting...', x: 0, y: 0, z: 0 },
    { id: 'smartstore', label: 'SMARTSTORE', sublabel: 'Naver Commerce', icon: '🛒', status: 'idle', detail: 'Smartstore API', x: -18, y: 10, z: -10 },
    { id: 'telegram', label: 'TELEGRAM', sublabel: 'Notification Bot', icon: '📡', status: 'idle', detail: 'Telegram Bot', x: 18, y: 10, z: -10 },
    { id: 'scheduler', label: 'SCHEDULER', sublabel: 'Auto Task', icon: '⏰', status: 'idle', detail: 'Scheduler', x: -18, y: -10, z: -10 },
    { id: 'email', label: 'EMAIL', sublabel: 'Order Dispatch', icon: '✉️', status: 'idle', detail: 'Order Email', x: 18, y: -10, z: -10 },
    { id: 'ordersheet', label: 'ORDER SHEET', sublabel: 'Logistics', icon: '📋', status: 'idle', detail: 'Sorting...', x: -10, y: -18, z: 5 },
    { id: 'settlement', label: 'SETTLEMENT', sublabel: 'Accounting', icon: '🧮', status: 'idle', detail: 'Calculating...', x: 10, y: -18, z: 5 },
    { id: 'manus_agent', label: 'MANUS AI', sublabel: 'Autonomous Agent', icon: '🤖', status: 'idle', detail: 'Manus 1.6 Max Standby', x: 0, y: 22, z: 0 },
    { id: 'user', label: 'COMMANDER', sublabel: 'Boss', icon: '👤', status: 'online', detail: 'Awaiting command', x: 0, y: -25, z: 15 },
  ]);

  const [logs, setLogs] = useState<LogEntry[]>([
    { time: '--:--:--', text: 'JARVIS Neural Mission Map v3.1 initializing...', type: 'info' },
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

  useEffect(() => {
    const connectSSE = () => {
      if (sseRef.current) sseRef.current.close();
      setSseStatus('connecting');
      const es = new EventSource(`${BOOKING_SERVER}/events`);
      sseRef.current = es;
      es.onopen = () => {
        setSseStatus('connected');
        addLog('JARVIS 시스템 연결됨 | 실시간 모니터링 시작', 'success');
      };
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
      <div style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${THEME.blue}22`, background: 'rgba(6,10,18,0.8)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
        <div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', letterSpacing: '0.2em', color: THEME.gold }}>JARVIS NEURAL MISSION MAP v3.1</div>
          <div style={{ fontSize: '0.7rem', color: THEME.textDim, letterSpacing: '0.1em' }}>MISSION PHASE: <span style={{ color: THEME.blue }}>{missionPhase}</span></div>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${THEME.blue}44`, color: THEME.blue, padding: '8px 20px', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}>CLOSE TERMINAL</button>
      </div>

      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        <div style={{ flex: 1, position: 'relative', background: 'radial-gradient(circle at center, #0a1525 0%, #030608 100%)' }}>
          <Canvas shadows dpr={[1, 2]}>
            <PerspectiveCamera makeDefault position={[0, 0, 60]} fov={50} />
            <OrbitControls enablePan={true} enableZoom={true} maxDistance={120} minDistance={20} />
            
            <ambientLight intensity={0.8} />
            <pointLight position={[20, 20, 20]} intensity={2} color={THEME.blue} />
            <pointLight position={[-20, -20, -20]} intensity={1} color={THEME.gold} />
            
            <BackgroundParticles />
            
            <Suspense fallback={null}>
              {nodes.map(node => (
                <Node3D key={node.id} node={node} isSelected={selectedNode === node.id} onSelect={setSelectedNode} />
              ))}
              
              <ConnectionLine start={[0, 0, 0]} end={[-18, 10, -10]} active={activeConnections.includes('brain_smartstore')} />
              <ConnectionLine start={[0, 0, 0]} end={[18, 10, -10]} active={activeConnections.includes('brain_telegram')} />
              <ConnectionLine start={[0, 0, 0]} end={[-18, -10, -10]} active={activeConnections.includes('brain_scheduler')} />
              <ConnectionLine start={[0, 0, 0]} end={[18, -10, -10]} active={activeConnections.includes('brain_email')} />
              <ConnectionLine start={[0, 0, 0]} end={[0, 22, 0]} active={activeConnections.includes('brain_manus')} />
              <ConnectionLine start={[0, -25, 15]} end={[0, 0, 0]} active={activeConnections.includes('user_brain')} />
              <ConnectionLine start={[0, 0, 0]} end={[-10, -18, 5]} active={activeConnections.includes('brain_ordersheet')} />
              <ConnectionLine start={[-10, -18, 5]} end={[10, -18, 5]} active={activeConnections.includes('ordersheet_settlement')} />
              <ConnectionLine start={[10, -18, 5]} end={[18, 10, -10]} active={activeConnections.includes('settlement_telegram')} />
              <ConnectionLine start={[0, 22, 0]} end={[18, 10, -10]} active={activeConnections.includes('manus_telegram')} />
            </Suspense>

            <Environment preset="night" />
          </Canvas>

          <div style={{ position: 'absolute', bottom: 30, left: 30, pointerEvents: 'none', zIndex: 10 }}>
            <div style={{ fontSize: '0.6rem', color: THEME.textDim, marginBottom: 8, letterSpacing: '0.2em' }}>SYSTEM STATUS</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ padding: '6px 16px', background: 'rgba(0,212,255,0.1)', border: `1px solid ${THEME.blue}44`, borderRadius: 4, fontSize: '0.75rem', backdropFilter: 'blur(5px)' }}>
                SSE: <span style={{ color: sseStatus === 'connected' ? THEME.green : THEME.orange, fontWeight: 'bold' }}>{sseStatus.toUpperCase()}</span>
              </div>
              <div style={{ padding: '6px 16px', background: 'rgba(200,169,110,0.1)', border: `1px solid ${THEME.gold}44`, borderRadius: 4, fontSize: '0.75rem', backdropFilter: 'blur(5px)' }}>
                NODES: <span style={{ fontWeight: 'bold' }}>{nodes.length} ACTIVE</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ width: 380, background: 'rgba(3,6,8,0.9)', borderLeft: `1px solid ${THEME.blue}22`, display: 'flex', flexDirection: 'column', zIndex: 10, backdropFilter: 'blur(20px)' }}>
          <div style={{ padding: 30, borderBottom: `1px solid ${THEME.blue}22` }}>
            <div style={{ fontSize: '0.65rem', color: THEME.textDim, letterSpacing: '0.3em', marginBottom: 20 }}>NODE INSPECTOR</div>
            {selectedNodeData ? (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} key={selectedNodeData.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 20 }}>
                  <div style={{ fontSize: '2.5rem', filter: 'drop-shadow(0 0 10px rgba(0,212,255,0.5))' }}>{selectedNodeData.icon}</div>
                  <div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: STATUS_COLOR[selectedNodeData.status], letterSpacing: '0.05em' }}>{selectedNodeData.label}</div>
                    <div style={{ fontSize: '0.8rem', color: THEME.textDim }}>{selectedNodeData.sublabel}</div>
                  </div>
                </div>
                <div style={{ padding: 18, background: 'rgba(0,212,255,0.05)', borderRadius: 8, border: `1px solid ${THEME.blue}33`, marginBottom: 20 }}>
                  <div style={{ fontSize: '0.95rem', lineHeight: 1.6, color: THEME.text }}>{selectedNodeData.detail}</div>
                  {selectedNodeData.progress !== undefined && (
                    <div style={{ marginTop: 15 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.7rem', color: THEME.textDim }}>
                        <span>PROCESSING</span>
                        <span>{selectedNodeData.progress}%</span>
                      </div>
                      <div style={{ height: 6, background: 'rgba(0,212,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                        <motion.div 
                          initial={{ width: 0 }} 
                          animate={{ width: `${selectedNodeData.progress}%` }} 
                          style={{ height: '100%', background: STATUS_COLOR[selectedNodeData.status], boxShadow: `0 0 15px ${STATUS_COLOR[selectedNodeData.status]}` }} 
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', color: STATUS_COLOR[selectedNodeData.status], fontWeight: 'bold', letterSpacing: '0.1em' }}>● {STATUS_LABEL[selectedNodeData.status]}</div>
              </motion.div>
            ) : (
              <div style={{ color: THEME.textDim, fontSize: '0.9rem', textAlign: 'center', padding: '40px 0' }}>Select a node to inspect</div>
            )}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '20px 30px 10px', fontSize: '0.65rem', color: THEME.textDim, letterSpacing: '0.3em' }}>MISSION LOGS</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 30px 30px', fontSize: '0.8rem', scrollbarWidth: 'thin', scrollbarColor: `${THEME.blue}33 transparent` }}>
              {logs.map((log, i) => (
                <div key={i} style={{ marginBottom: 10, display: 'flex', gap: 12, borderLeft: `2px solid ${log.type === 'error' ? THEME.orange : log.type === 'success' ? THEME.green : THEME.blue}44`, paddingLeft: 10 }}>
                  <span style={{ color: THEME.textDim, opacity: 0.6, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{log.time}</span>
                  <span style={{ color: log.type === 'error' ? THEME.orange : log.type === 'success' ? THEME.green : THEME.text, lineHeight: 1.4 }}>{log.text}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '15px 40px', background: THEME.bgDeep, borderTop: `1px solid ${THEME.blue}22`, display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: THEME.textDim, zIndex: 10 }}>
        <div>MAWINPAY INTELLIGENCE · SYSTEM v3.1.2</div>
        <div style={{ display: 'flex', gap: 25 }}>
          <span>LATENCY: <span style={{ color: THEME.blue }}>24ms</span></span>
          <span>UPTIME: <span style={{ color: THEME.blue }}>99.9%</span></span>
          <span style={{ color: THEME.green, fontWeight: 'bold' }}>SECURE CONNECTION</span>
        </div>
      </div>
    </motion.div>
  );
}
