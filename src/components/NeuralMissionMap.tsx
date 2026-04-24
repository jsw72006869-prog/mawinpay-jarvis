import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Text, Points, PointMaterial, Line, Sphere, MeshDistortMaterial, PerspectiveCamera, Environment, OrbitControls, ContactShadows } from '@react-three/drei';

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
  color?: string;
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
    const p = new Float32Array(2000 * 3);
    for (let i = 0; i < 2000; i++) {
      p[i * 3] = (Math.random() - 0.5) * 200;
      p[i * 3 + 1] = (Math.random() - 0.5) * 200;
      p[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    return p;
  }, []);

  const ref = useRef<THREE.Points>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.getElapsedTime() * 0.01;
    }
  });

  return (
    <Points ref={ref} positions={points} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color={THEME.blue}
        size={0.25}
        sizeAttenuation={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        opacity={0.3}
      />
    </Points>
  );
}

function Node3D({ node, isSelected, onSelect }: { node: NodeStatus, isSelected: boolean, onSelect: (id: string) => void }) {
  const baseColor = node.color || STATUS_COLOR[node.status];
  const isProcessing = node.status === 'processing';
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child) => {
        if (child.name === 'billboard') {
          child.quaternion.copy(state.camera.quaternion);
        }
      });
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += isProcessing ? 0.05 : 0.01;
    }
  });
  
  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={0.6} position={[node.x, node.y, node.z]}>
      <group ref={groupRef} onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}>
        {/* Core Sphere */}
        <Sphere args={[1.5, 32, 32]}>
          <MeshDistortMaterial
            color={baseColor}
            speed={isProcessing ? 4 : 1.5}
            distort={isProcessing ? 0.4 : 0.15}
            radius={1}
            emissive={baseColor}
            emissiveIntensity={isSelected ? 5 : 2}
          />
        </Sphere>
        
        {/* Icon (Emoji as Text) */}
        <Text
          name="billboard"
          position={[0, 0, 0.5]}
          fontSize={1.8}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          {node.icon}
        </Text>

        {/* Outer Ring */}
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.8, 0.08, 16, 100]} />
          <meshStandardMaterial 
            color={baseColor} 
            emissive={baseColor} 
            emissiveIntensity={3} 
            transparent 
            opacity={0.5} 
          />
        </mesh>

        {/* Label & Status */}
        <group name="billboard" position={[0, -3.5, 0]}>
          <Text
            fontSize={1.0}
            color={THEME.text}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.08}
            outlineColor="#000000"
            fontWeight="bold"
          >
            {node.label}
          </Text>
          <Text
            position={[0, -1.2, 0]}
            fontSize={0.6}
            color={baseColor}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.04}
            outlineColor="#000000"
          >
            {STATUS_LABEL[node.status]}
          </Text>
        </group>
        
        {/* Selection Glow */}
        {isSelected && (
          <Sphere args={[2.2, 32, 32]}>
            <meshStandardMaterial color={baseColor} transparent opacity={0.2} />
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
      lineWidth={active ? 4 : 1.2}
      transparent
      opacity={active ? 1 : 0.25}
      dashed={!active}
      dashScale={3}
      gapSize={0.5}
    />
  );
}

export default function NeuralMissionMap({ onClose }: { onClose: () => void }) {
  const [nodes, setNodes] = useState<NodeStatus[]>([
    { id: 'jarvis_brain', label: 'JARVIS CORE', sublabel: 'Railway Server', icon: '🧠', status: 'idle', detail: 'Connecting...', x: 0, y: 0, z: 0, color: THEME.purple },
    { id: 'smartstore', label: 'SMARTSTORE', sublabel: 'Naver Commerce', icon: '🛒', status: 'idle', detail: 'Smartstore API', x: -22, y: 12, z: -12, color: THEME.green },
    { id: 'telegram', label: 'TELEGRAM', sublabel: 'Notification Bot', icon: '📡', status: 'idle', detail: 'Telegram Bot', x: 22, y: 12, z: -12, color: THEME.blue },
    { id: 'scheduler', label: 'SCHEDULER', sublabel: 'Auto Task', icon: '⏰', status: 'idle', detail: 'Scheduler', x: -22, y: -12, z: -12, color: THEME.gold },
    { id: 'email', label: 'EMAIL', sublabel: 'Order Dispatch', icon: '✉️', status: 'idle', detail: 'Order Email', x: 22, y: -12, z: -12, color: THEME.silver },
    { id: 'ordersheet', label: 'ORDER SHEET', sublabel: 'Logistics', icon: '📋', status: 'idle', detail: 'Sorting...', x: -12, y: -22, z: 8, color: THEME.orange },
    { id: 'settlement', label: 'SETTLEMENT', sublabel: 'Accounting', icon: '🧮', status: 'idle', detail: 'Calculating...', x: 12, y: -22, z: 8, color: THEME.green },
    { id: 'manus_agent', label: 'MANUS AI', sublabel: 'Autonomous Agent', icon: '🤖', status: 'idle', detail: 'Manus 1.6 Max Standby', x: 0, y: 28, z: 0, color: THEME.blueLight },
    { id: 'user', label: 'COMMANDER', sublabel: 'Boss', icon: '👤', status: 'online', detail: 'Awaiting command', x: 0, y: -32, z: 20, color: THEME.gold },
  ]);

  const [logs, setLogs] = useState<LogEntry[]>([
    { time: '--:--:--', text: 'JARVIS Neural Mission Map v3.2 initializing...', type: 'info' },
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
      <div style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${THEME.blue}22`, background: 'rgba(6,10,18,0.85)', backdropFilter: 'blur(15px)', zIndex: 10 }}>
        <div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', letterSpacing: '0.25em', color: THEME.gold }}>JARVIS NEURAL MISSION MAP v3.2</div>
          <div style={{ fontSize: '0.75rem', color: THEME.textDim, letterSpacing: '0.15em' }}>MISSION PHASE: <span style={{ color: THEME.blue, fontWeight: 'bold' }}>{missionPhase}</span></div>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(0,212,255,0.1)', border: `1px solid ${THEME.blue}66`, color: THEME.blue, padding: '10px 24px', cursor: 'pointer', borderRadius: '6px', fontWeight: 'bold', letterSpacing: '0.1em', transition: 'all 0.3s' }}>CLOSE TERMINAL</button>
      </div>

      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        <div style={{ flex: 1, position: 'relative', background: 'radial-gradient(circle at center, #0d1b2e 0%, #030608 100%)' }}>
          <Canvas shadows dpr={[1, 2]}>
            <PerspectiveCamera makeDefault position={[0, 0, 75]} fov={50} />
            <OrbitControls enablePan={true} enableZoom={true} maxDistance={150} minDistance={30} />
            
            <ambientLight intensity={1.0} />
            <pointLight position={[30, 30, 30]} intensity={2.5} color={THEME.blue} />
            <pointLight position={[-30, -30, -30]} intensity={1.5} color={THEME.gold} />
            
            <BackgroundParticles />
            
            <Suspense fallback={null}>
              {nodes.map(node => (
                <Node3D key={node.id} node={node} isSelected={selectedNode === node.id} onSelect={setSelectedNode} />
              ))}
              
              <ConnectionLine start={[0, 0, 0]} end={[-22, 12, -12]} active={activeConnections.includes('brain_smartstore')} />
              <ConnectionLine start={[0, 0, 0]} end={[22, 12, -12]} active={activeConnections.includes('brain_telegram')} />
              <ConnectionLine start={[0, 0, 0]} end={[-22, -12, -12]} active={activeConnections.includes('brain_scheduler')} />
              <ConnectionLine start={[0, 0, 0]} end={[22, -12, -12]} active={activeConnections.includes('brain_email')} />
              <ConnectionLine start={[0, 0, 0]} end={[0, 28, 0]} active={activeConnections.includes('brain_manus')} />
              <ConnectionLine start={[0, -32, 20]} end={[0, 0, 0]} active={activeConnections.includes('user_brain')} />
              <ConnectionLine start={[0, 0, 0]} end={[-12, -22, 8]} active={activeConnections.includes('brain_ordersheet')} />
              <ConnectionLine start={[-12, -22, 8]} end={[12, -22, 8]} active={activeConnections.includes('ordersheet_settlement')} />
              <ConnectionLine start={[12, -22, 8]} end={[22, 12, -12]} active={activeConnections.includes('settlement_telegram')} />
              <ConnectionLine start={[0, 28, 0]} end={[22, 12, -12]} active={activeConnections.includes('manus_telegram')} />
            </Suspense>

            <Environment preset="night" />
            <ContactShadows position={[0, -40, 0]} opacity={0.4} scale={100} blur={2} far={10} />
          </Canvas>

          <div style={{ position: 'absolute', bottom: 35, left: 35, pointerEvents: 'none', zIndex: 10 }}>
            <div style={{ fontSize: '0.7rem', color: THEME.textDim, marginBottom: 10, letterSpacing: '0.3em' }}>SYSTEM STATUS</div>
            <div style={{ display: 'flex', gap: 15 }}>
              <div style={{ padding: '8px 20px', background: 'rgba(0,212,255,0.15)', border: `1px solid ${THEME.blue}55`, borderRadius: 6, fontSize: '0.8rem', backdropFilter: 'blur(8px)', boxShadow: '0 0 15px rgba(0,212,255,0.2)' }}>
                SSE: <span style={{ color: sseStatus === 'connected' ? THEME.green : THEME.orange, fontWeight: 'bold' }}>{sseStatus.toUpperCase()}</span>
              </div>
              <div style={{ padding: '8px 20px', background: 'rgba(200,169,110,0.15)', border: `1px solid ${THEME.gold}55`, borderRadius: 6, fontSize: '0.8rem', backdropFilter: 'blur(8px)', boxShadow: '0 0 15px rgba(200,169,110,0.2)' }}>
                NODES: <span style={{ fontWeight: 'bold' }}>{nodes.length} ACTIVE</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ width: 420, background: 'rgba(3,6,8,0.92)', borderLeft: `1px solid ${THEME.blue}33`, display: 'flex', flexDirection: 'column', zIndex: 10, backdropFilter: 'blur(25px)' }}>
          <div style={{ padding: 35, borderBottom: `1px solid ${THEME.blue}22` }}>
            <div style={{ fontSize: '0.7rem', color: THEME.textDim, letterSpacing: '0.4em', marginBottom: 25 }}>NODE INSPECTOR</div>
            {selectedNodeData ? (
              <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} key={selectedNodeData.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 25 }}>
                  <div style={{ fontSize: '3.5rem', filter: 'drop-shadow(0 0 15px rgba(255,255,255,0.3))' }}>{selectedNodeData.icon}</div>
                  <div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: selectedNodeData.color || STATUS_COLOR[selectedNodeData.status], letterSpacing: '0.05em' }}>{selectedNodeData.label}</div>
                    <div style={{ fontSize: '0.85rem', color: THEME.textDim }}>{selectedNodeData.sublabel}</div>
                  </div>
                </div>
                <div style={{ padding: 22, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: `1px solid ${THEME.blue}22`, marginBottom: 25, boxShadow: 'inset 0 0 20px rgba(0,212,255,0.05)' }}>
                  <div style={{ fontSize: '1.05rem', lineHeight: 1.7, color: THEME.text }}>{selectedNodeData.detail}</div>
                  {selectedNodeData.progress !== undefined && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.75rem', color: THEME.textDim }}>
                        <span>TASK PROGRESS</span>
                        <span>{selectedNodeData.progress}%</span>
                      </div>
                      <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                        <motion.div 
                          initial={{ width: 0 }} 
                          animate={{ width: `${selectedNodeData.progress}%` }} 
                          style={{ height: '100%', background: selectedNodeData.color || STATUS_COLOR[selectedNodeData.status], boxShadow: `0 0 20px ${selectedNodeData.color || STATUS_COLOR[selectedNodeData.status]}` }} 
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLOR[selectedNodeData.status], boxShadow: `0 0 10px ${STATUS_COLOR[selectedNodeData.status]}` }} />
                  <div style={{ fontSize: '0.9rem', color: STATUS_COLOR[selectedNodeData.status], fontWeight: 'bold', letterSpacing: '0.15em' }}>{STATUS_LABEL[selectedNodeData.status]}</div>
                </div>
              </motion.div>
            ) : (
              <div style={{ color: THEME.textDim, fontSize: '1rem', textAlign: 'center', padding: '60px 0', border: '1px dashed rgba(0,212,255,0.2)', borderRadius: 12 }}>Select a node to inspect</div>
            )}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '25px 35px 12px', fontSize: '0.7rem', color: THEME.textDim, letterSpacing: '0.4em' }}>MISSION LOGS</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 35px 35px', fontSize: '0.85rem', scrollbarWidth: 'thin', scrollbarColor: `${THEME.blue}33 transparent` }}>
              {logs.map((log, i) => (
                <div key={i} style={{ marginBottom: 12, display: 'flex', gap: 15, borderLeft: `3px solid ${log.type === 'error' ? THEME.orange : log.type === 'success' ? THEME.green : THEME.blue}55`, paddingLeft: 15, background: 'rgba(255,255,255,0.01)', padding: '8px 15px', borderRadius: '0 8px 8px 0' }}>
                  <span style={{ color: THEME.textDim, opacity: 0.7, fontSize: '0.75rem', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{log.time}</span>
                  <span style={{ color: log.type === 'error' ? THEME.orange : log.type === 'success' ? THEME.green : THEME.text, lineHeight: 1.5 }}>{log.text}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '18px 40px', background: THEME.bgDeep, borderTop: `1px solid ${THEME.blue}33`, display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: THEME.textDim, zIndex: 10 }}>
        <div>MAWINPAY INTELLIGENCE · SYSTEM v3.2.0</div>
        <div style={{ display: 'flex', gap: 30 }}>
          <span>LATENCY: <span style={{ color: THEME.blue }}>24ms</span></span>
          <span>UPTIME: <span style={{ color: THEME.blue }}>99.9%</span></span>
          <span style={{ color: THEME.green, fontWeight: 'bold', letterSpacing: '0.05em' }}>SECURE CONNECTION</span>
        </div>
      </div>
    </motion.div>
  );
}
