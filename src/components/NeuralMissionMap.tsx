import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

// SSE 노드 ID -> 컴포넌트 노드 ID 매핑
const SSE_NODE_MAP: Record<string, string> = {
  brain:      'jarvis_brain',
  smartstore: 'smartstore',
  telegram:   'telegram',
  scheduler:  'scheduler',
  email:      'email',
  commander:  'user',
  ordersheet: 'ordersheet',
  settlement: 'settlement',
};

// SSE flow 문자열 -> 연결 키 매핑
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

export default function NeuralMissionMap({ onClose }: { onClose: () => void }) {
  const [nodes, setNodes] = useState<NodeStatus[]>([
    { id: 'jarvis_brain', label: 'JARVIS CORE', sublabel: 'Railway Server', icon: '[BRAIN]', status: 'idle', detail: 'Connecting...', x: 50, y: 35 },
    { id: 'smartstore', label: 'SMARTSTORE', sublabel: 'Naver Commerce', icon: '[CART]', status: 'idle', detail: 'Smartstore API', x: 15, y: 18 },
    { id: 'telegram', label: 'TELEGRAM', sublabel: 'Notification Bot', icon: '[SIGNAL]', status: 'idle', detail: 'Telegram Bot', x: 85, y: 18 },
    { id: 'scheduler', label: 'SCHEDULER', sublabel: 'Auto Task', icon: '[CLOCK]', status: 'idle', detail: 'Scheduler', x: 15, y: 55 },
    { id: 'email', label: 'EMAIL', sublabel: 'Order Dispatch', icon: '[MAIL]', status: 'idle', detail: 'Order Email', x: 85, y: 55 },
    { id: 'ordersheet', label: 'ORDER SHEET', sublabel: '밤(로젠)/옥수수(롯데)', icon: '[FILE]', status: 'idle', detail: '통합주문서 분류 대기', x: 30, y: 72 },
    { id: 'settlement', label: 'SETTLEMENT', sublabel: '정산서·원가계산', icon: '[CALC]', status: 'idle', detail: '정산서 생성 대기', x: 70, y: 72 },
    { id: 'user', label: 'COMMANDER', sublabel: 'Boss', icon: '[USER]', status: 'online', detail: 'Awaiting command', x: 50, y: 88 },
  ]);

  const [logs, setLogs] = useState<LogEntry[]>([
    { time: '--:--:--', text: 'JARVIS Neural Mission Map initializing...', type: 'info' },
  ]);
  const [selectedNode, setSelectedNode] = useState<string | null>('jarvis_brain');
  const [activeConnections, setActiveConnections] = useState<string[]>([]);
  const [missionPhase, setMissionPhase] = useState<string>('STANDBY');
  const [serverInfo, setServerInfo] = useState<{ nextRun?: string; lastTelegram?: string; orderCount?: number; ip?: string; sseConnected?: boolean; }>({});
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const nodeResetTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const addLog = useCallback((text: string, type: LogEntry['type'] = 'info') => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setLogs(prev => [...prev.slice(-49), { time, text, type }]);
  }, []);

  const updateNode = useCallback((id: string, updates: Partial<NodeStatus>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  }, []);

  // 노드 상태를 일정 시간 후 자동으로 online으로 복귀
  const scheduleNodeReset = useCallback((nodeId: string, delayMs: number = 5000) => {
    if (nodeResetTimers.current[nodeId]) {
      clearTimeout(nodeResetTimers.current[nodeId]);
    }
    nodeResetTimers.current[nodeId] = setTimeout(() => {
      setNodes(prev => prev.map(n => {
        if (n.id === nodeId && (n.status === 'processing')) {
          return { ...n, status: 'online', progress: undefined };
        }
        return n;
      }));
    }, delayMs);
  }, []);

  // SSE 이벤트 처리
  const handleSSEEvent = useCallback((eventData: {
    type: string;
    node?: string;
    message: string;
    progress?: number;
    flow?: string[];
    timestamp?: string;
  }) => {
    const { type, node, message, progress, flow } = eventData;
    const nodeId = node ? SSE_NODE_MAP[node] : null;

    // 로그 추가
    const logType: LogEntry['type'] =
      type === 'node_error' ? 'error' :
      type === 'node_complete' ? 'success' :
      type === 'node_active' ? 'info' :
      'info';
    addLog(`[SSE] ${node ? node.toUpperCase() + ' | ' : ''}${message}`, logType);

    // 노드 상태 업데이트
    if (nodeId) {
      const now = new Date().toLocaleTimeString('ko-KR');
      if (type === 'node_active') {
        updateNode(nodeId, {
          status: 'processing',
          detail: message,
          lastUpdate: now,
          progress: progress,
        });
        scheduleNodeReset(nodeId, 8000);
      } else if (type === 'node_complete') {
        updateNode(nodeId, {
          status: 'online',
          detail: message,
          lastUpdate: now,
          progress: 100,
        });
        // 완료 후 progress 제거
        setTimeout(() => {
          updateNode(nodeId, { progress: undefined });
        }, 3000);
      } else if (type === 'node_error') {
        updateNode(nodeId, {
          status: 'warning',
          detail: message,
          lastUpdate: now,
          progress: undefined,
        });
        scheduleNodeReset(nodeId, 10000);
      } else if (type === 'node_idle') {
        updateNode(nodeId, {
          status: 'idle',
          detail: message,
          lastUpdate: now,
          progress: undefined,
        });
      }
    }

    // 연결선 활성화 (flow 배열 기반)
    if (flow && flow.length > 0) {
      const connKeys = flow
        .map(f => SSE_FLOW_MAP[f])
        .filter(Boolean);
      if (connKeys.length > 0) {
        setActiveConnections(prev => [...new Set([...prev, ...connKeys])]);
        // 5초 후 flow 연결선 비활성화
        setTimeout(() => {
          setActiveConnections(prev => prev.filter(k => !connKeys.includes(k)));
        }, 5000);
      }
    }

    // 미션 페이즈 업데이트
    if (type === 'node_active') {
      setMissionPhase('ACTIVE');
    } else if (type === 'node_error') {
      setMissionPhase('WARNING');
    }
  }, [addLog, updateNode, scheduleNodeReset]);

  // SSE 연결 함수
  const connectSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
    }
    setSseStatus('connecting');
    addLog('[SSE] Railway 서버 실시간 스트림 연결 중...', 'info');

    const es = new EventSource(`${BOOKING_SERVER}/events`);
    sseRef.current = es;

    es.onopen = () => {
      setSseStatus('connected');
      setServerInfo(prev => ({ ...prev, sseConnected: true }));
      addLog('[SSE] 실시간 이벤트 스트림 연결 완료', 'success');
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
      } catch {
        // JSON 파싱 실패 무시
      }
    };

    es.onerror = () => {
      setSseStatus('disconnected');
      setServerInfo(prev => ({ ...prev, sseConnected: false }));
      addLog('[SSE] 연결 끊김 - 30초 후 재연결 시도', 'warn');
      es.close();
      sseRef.current = null;
      // 30초 후 재연결
      setTimeout(() => {
        connectSSE();
      }, 30000);
    };
  }, [addLog, handleSSEEvent]);

  const checkServerStatus = useCallback(async () => {
    try {
      addLog('Checking Railway server...', 'info');
      updateNode('jarvis_brain', { status: 'processing', detail: 'Waiting for response...' });
      const res = await fetch(`${BOOKING_SERVER}/health`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const nextRun = data.nextRun || 'Daily 09:00';
        updateNode('jarvis_brain', { status: 'online', detail: 'Server running', lastUpdate: new Date().toLocaleTimeString('ko-KR') });
        setServerInfo(prev => ({ ...prev, nextRun }));
        setActiveConnections(prev => [...new Set([...prev, 'brain_scheduler', 'brain_telegram', 'brain_smartstore', 'brain_email'])]);
        addLog(`[OK] Railway server online | Next run: ${nextRun}`, 'success');
        setMissionPhase('OPERATIONAL');
      } else { throw new Error(`HTTP ${res.status}`); }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      updateNode('jarvis_brain', { status: 'offline', detail: `Server offline: ${msg}` });
      addLog(`[X] Railway server offline: ${msg}`, 'error');
      setMissionPhase('OFFLINE');
    }
  }, [addLog, updateNode]);

  const checkTelegramStatus = useCallback(async () => {
    try {
      addLog('Checking Telegram bot...', 'info');
      updateNode('telegram', { status: 'processing', detail: 'Checking bot...' });
      const res = await fetch(`${BOOKING_SERVER}/webhook-info`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const isSet = (data.webhookUrl || data.url || '').includes('telegram-webhook');
        updateNode('telegram', { status: isSet ? 'online' : 'warning', detail: isSet ? 'Webhook registered' : 'Webhook not set', lastUpdate: new Date().toLocaleTimeString('ko-KR') });
        addLog(isSet ? '[OK] Telegram Webhook registered' : '[!] Telegram Webhook not set', isSet ? 'success' : 'warn');
      } else { throw new Error('No response'); }
    } catch {
      updateNode('telegram', { status: 'online', detail: 'Bot active (Webhook registered)', lastUpdate: new Date().toLocaleTimeString('ko-KR') });
      addLog('[OK] Telegram bot active', 'success');
    }
  }, [addLog, updateNode]);

  const checkSmartstore = useCallback(async () => {
    addLog('Checking Smartstore API...', 'info');
    updateNode('smartstore', { status: 'processing', detail: 'Checking API auth...' });
    try {
      const res = await fetch(`${BOOKING_SERVER}/run-order-report?secret=jarvis2024&dry_run=true`, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.success) {
          updateNode('smartstore', { status: 'online', detail: 'API connected', lastUpdate: new Date().toLocaleTimeString('ko-KR') });
          addLog('[OK] Smartstore API auth success', 'success');
        } else {
          updateNode('smartstore', { status: 'warning', detail: data.message || 'API error', lastUpdate: new Date().toLocaleTimeString('ko-KR') });
          addLog(`[!] Smartstore: ${data.message || 'API error'}`, 'warn');
        }
      }
    } catch {
      updateNode('smartstore', { status: 'warning', detail: 'API response timeout' });
      addLog('[!] Smartstore response delayed', 'warn');
    }
  }, [addLog, updateNode]);

  useEffect(() => {
    const init = async () => {
      addLog('[ROCKET] JARVIS Neural Mission Map activated', 'info');
      updateNode('scheduler', { status: 'idle', detail: 'Daily 09:00 auto-run' });
      updateNode('email', { status: 'idle', detail: 'Order email standby' });
      await checkServerStatus();
      await checkTelegramStatus();
      await checkSmartstore();
      updateNode('scheduler', { status: 'online', detail: 'Schedule active | 09:00 KST' });
      updateNode('email', { status: 'online', detail: 'jungsng805@naver.com' });
      addLog('[OK] All system nodes verified', 'success');
      // SSE 연결 시작
      connectSSE();
    };
    init();

    return () => {
      // 컴포넌트 언마운트 시 SSE 연결 해제
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      // 모든 타이머 정리
      Object.values(nodeResetTimers.current).forEach(t => clearTimeout(t));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  useEffect(() => {
    const interval = setInterval(() => { checkServerStatus(); }, 30000);
    return () => clearInterval(interval);
  }, [checkServerStatus]);

  const selectedNodeData = nodes.find(n => n.id === selectedNode);

  const connections = [
    { from: 'jarvis_brain', to: 'smartstore', key: 'brain_smartstore' },
    { from: 'jarvis_brain', to: 'telegram', key: 'brain_telegram' },
    { from: 'jarvis_brain', to: 'scheduler', key: 'brain_scheduler' },
    { from: 'jarvis_brain', to: 'email', key: 'brain_email' },
    { from: 'user', to: 'jarvis_brain', key: 'user_brain' },
    { from: 'scheduler', to: 'smartstore', key: 'scheduler_smartstore' },
    { from: 'email', to: 'telegram', key: 'email_telegram' },
    { from: 'jarvis_brain', to: 'ordersheet', key: 'brain_ordersheet' },
    { from: 'ordersheet', to: 'settlement', key: 'ordersheet_settlement' },
    { from: 'ordersheet', to: 'email', key: 'ordersheet_email' },
    { from: 'settlement', to: 'telegram', key: 'settlement_telegram' },
  ];

  const getNodeById = (id: string) => nodes.find(n => n.id === id);

  const phaseColor =
    missionPhase === 'OPERATIONAL' ? THEME.green :
    missionPhase === 'ACTIVE'      ? THEME.blue :
    missionPhase === 'WARNING'     ? THEME.warn :
    missionPhase === 'OFFLINE'     ? THEME.orange :
    THEME.gold;

  const sseColor =
    sseStatus === 'connected'    ? THEME.green :
    sseStatus === 'connecting'   ? THEME.blue :
    THEME.orange;

  const sseLabel =
    sseStatus === 'connected'    ? 'LIVE' :
    sseStatus === 'connecting'   ? 'CONNECTING' :
    'OFFLINE';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: THEME.bgDeep, display: 'flex', flexDirection: 'column', fontFamily: 'Orbitron, monospace', overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,212,255,0.015) 2px, rgba(0,212,255,0.015) 4px)' }} />

      {/* 헤더 */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 28px', borderBottom: `1px solid ${THEME.blue}22`, background: `linear-gradient(180deg, ${THEME.bgDeep} 0%, transparent 100%)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <motion.div style={{ width: 8, height: 8, borderRadius: '50%', background: THEME.blue, boxShadow: `0 0 12px ${THEME.blue}` }} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }} />
          <span style={{ color: THEME.blue, fontSize: '0.7rem', letterSpacing: '0.4em' }}>NEURAL MISSION MAP</span>
          <span style={{ color: THEME.textDim, fontSize: '0.45rem', letterSpacing: '0.2em' }}>v2.0 · JARVIS INTELLIGENCE SYSTEM</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* SSE 연결 상태 표시 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <motion.div
              style={{ width: 6, height: 6, borderRadius: '50%', background: sseColor, boxShadow: `0 0 8px ${sseColor}` }}
              animate={{ opacity: sseStatus === 'connected' ? [0.6, 1, 0.6] : [0.3, 1, 0.3] }}
              transition={{ duration: sseStatus === 'connected' ? 1 : 0.5, repeat: Infinity }}
            />
            <span style={{ color: sseColor, fontSize: '0.38rem', letterSpacing: '0.2em' }}>SSE {sseLabel}</span>
          </div>
          <motion.div style={{ padding: '4px 12px', border: `1px solid ${phaseColor}44`, borderRadius: 4, color: phaseColor, fontSize: '0.45rem', letterSpacing: '0.3em' }} animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 2, repeat: Infinity }}>
            {missionPhase}
          </motion.div>
          <button onClick={onClose} style={{ background: 'none', border: `1px solid ${THEME.orange}44`, borderRadius: 4, color: THEME.orange, padding: '4px 12px', cursor: 'pointer', fontSize: '0.45rem', letterSpacing: '0.2em' }}>CLOSE</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 5 }}>
        {/* 노드 맵 */}
        <div style={{ flex: 1, position: 'relative' }}>
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-strong">
                <feGaussianBlur stdDeviation="6" result="coloredBlur" />
                <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {connections.map(conn => {
              const fromNode = getNodeById(conn.from);
              const toNode = getNodeById(conn.to);
              if (!fromNode || !toNode) return null;
              const isActive = activeConnections.includes(conn.key);
              const fromProcessing = fromNode.status === 'processing';
              const toProcessing = toNode.status === 'processing';
              const isLive = isActive && (fromProcessing || toProcessing);
              const color = fromNode.status === 'offline' ? THEME.orange : isLive ? THEME.blue : THEME.blue;
              return (
                <g key={conn.key}>
                  <line x1={`${fromNode.x}%`} y1={`${fromNode.y}%`} x2={`${toNode.x}%`} y2={`${toNode.y}%`} stroke={`${color}33`} strokeWidth="1" />
                  {isActive && (
                    <>
                      <motion.line
                        x1={`${fromNode.x}%`} y1={`${fromNode.y}%`}
                        x2={`${toNode.x}%`} y2={`${toNode.y}%`}
                        stroke={color} strokeWidth={isLive ? '2' : '1.5'}
                        animate={{ opacity: isLive ? [0.4, 1, 0.4] : [0.4, 0.7, 0.4] }}
                        transition={{ duration: isLive ? 0.5 : 1.5, repeat: Infinity }}
                      />
                      <motion.circle r="3" fill={color} filter="url(#glow)"
                        animate={{
                          cx: [`${fromNode.x}%`, `${toNode.x}%`],
                          cy: [`${fromNode.y}%`, `${toNode.y}%`],
                          opacity: [0, 1, 1, 0],
                        }}
                        transition={{ duration: isLive ? 1 : 2, repeat: Infinity, ease: 'linear' }}
                      />
                    </>
                  )}
                </g>
              );
            })}
            {nodes.map(node => {
              const color = STATUS_COLOR[node.status];
              const isWarning = node.status === 'offline' || node.status === 'warning';
              const isProcessing = node.status === 'processing';
              const isSelected = selectedNode === node.id;
              return (
                <motion.g key={node.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedNode(node.id)}>
                  {/* 외부 링 - 처리 중일 때 강한 글로우 */}
                  <motion.circle
                    cx={`${node.x}%`} cy={`${node.y}%`} r="36"
                    fill="none" stroke={color} strokeWidth={isSelected ? '2' : '1'}
                    opacity={isSelected ? 0.9 : 0.4}
                    animate={isWarning ? { opacity: [0.4, 0.9, 0.4] } : isProcessing ? { opacity: [0.3, 1, 0.3], r: [34, 38, 34] } : {}}
                    transition={{ duration: isProcessing ? 0.8 : 1, repeat: Infinity }}
                    filter={isProcessing ? 'url(#glow-strong)' : undefined}
                  />
                  <circle cx={`${node.x}%`} cy={`${node.y}%`} r="28" fill={`${THEME.bgDeep}EE`} stroke={`${color}55`} strokeWidth="1" />
                  <motion.circle
                    cx={`${node.x}%`} cy={`${node.y}%`} r="28"
                    fill={isProcessing ? `${color}18` : `${color}08`}
                    animate={{ opacity: [0.3, isProcessing ? 1 : 0.8, 0.3] }}
                    transition={{ duration: isProcessing ? 0.6 : 2.5, repeat: Infinity }}
                  />
                  <text x={`${node.x}%`} y={`${node.y - 2}%`} textAnchor="middle" dominantBaseline="middle" fontSize="18" style={{ userSelect: 'none' }}>{node.icon}</text>
                  <text x={`${node.x}%`} y={`${node.y + 7}%`} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize="7" fontFamily="Orbitron, monospace" letterSpacing="1" style={{ userSelect: 'none' }}>{node.label}</text>
                  {/* 상태 표시 점 */}
                  <motion.circle
                    cx={`${node.x + 3.5}%`} cy={`${node.y - 5.5}%`} r="4"
                    fill={color}
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: isProcessing ? 0.4 : 2, repeat: Infinity }}
                    filter={isProcessing ? 'url(#glow)' : undefined}
                  />
                  {/* 진행률 바 (processing 상태에서 progress 값이 있을 때) */}
                  {isProcessing && node.progress !== undefined && (
                    <>
                      <rect x={`${node.x - 4}%`} y={`${node.y + 10}%`} width="8%" height="2" rx="1" fill={`${color}33`} />
                      <motion.rect
                        x={`${node.x - 4}%`} y={`${node.y + 10}%`}
                        width={`${(node.progress / 100) * 8}%`} height="2" rx="1"
                        fill={color}
                        filter="url(#glow)"
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                      />
                    </>
                  )}
                </motion.g>
              );
            })}
          </svg>
        </div>

        {/* 우측 패널 */}
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${THEME.blue}22`, background: `${THEME.bgDeep}CC` }}>
          <AnimatePresence mode="wait">
            {selectedNodeData && (
              <motion.div key={selectedNodeData.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                style={{ padding: '16px', borderBottom: `1px solid ${THEME.blue}22` }}
              >
                <div style={{ color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.3em', marginBottom: 8 }}>NODE DETAIL</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{selectedNodeData.icon}</span>
                  <div>
                    <div style={{ color: STATUS_COLOR[selectedNodeData.status], fontSize: '0.55rem', letterSpacing: '0.2em' }}>{selectedNodeData.label}</div>
                    <div style={{ color: THEME.textDim, fontSize: '0.38rem' }}>{selectedNodeData.sublabel}</div>
                  </div>
                </div>
                <div style={{ padding: '8px 10px', background: `${THEME.blue}0A`, borderRadius: 4, border: `1px solid ${THEME.blue}22`, marginBottom: 8 }}>
                  <div style={{ color: THEME.text, fontSize: '0.42rem', lineHeight: 1.6 }}>{selectedNodeData.detail}</div>
                  {selectedNodeData.lastUpdate && <div style={{ color: THEME.textDim, fontSize: '0.35rem', marginTop: 4 }}>Last update: {selectedNodeData.lastUpdate}</div>}
                  {selectedNodeData.progress !== undefined && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ color: THEME.textDim, fontSize: '0.35rem' }}>PROGRESS</span>
                        <span style={{ color: STATUS_COLOR[selectedNodeData.status], fontSize: '0.35rem' }}>{selectedNodeData.progress}%</span>
                      </div>
                      <div style={{ height: 3, background: `${THEME.blue}22`, borderRadius: 2 }}>
                        <motion.div
                          style={{ height: '100%', borderRadius: 2, background: STATUS_COLOR[selectedNodeData.status], boxShadow: `0 0 6px ${STATUS_COLOR[selectedNodeData.status]}` }}
                          animate={{ width: `${selectedNodeData.progress}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <motion.div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[selectedNodeData.status] }} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }} />
                  <span style={{ color: STATUS_COLOR[selectedNodeData.status], fontSize: '0.42rem', letterSpacing: '0.2em' }}>{STATUS_LABEL[selectedNodeData.status]}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ padding: '10px 16px 6px', color: THEME.textDim, fontSize: '0.4rem', letterSpacing: '0.3em' }}>ALL NODES</div>
          <div style={{ padding: '0 16px 12px', overflowY: 'auto' }}>
            {nodes.map(node => (
              <div key={node.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${THEME.blue}0A`, cursor: 'pointer' }} onClick={() => setSelectedNode(node.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11 }}>{node.icon}</span>
                  <span style={{ color: THEME.text, fontSize: '0.42rem' }}>{node.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <motion.div style={{ width: 4, height: 4, borderRadius: '50%', background: STATUS_COLOR[node.status] }} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: node.status === 'processing' ? 0.4 : 2, repeat: Infinity }} />
                  <span style={{ color: STATUS_COLOR[node.status], fontSize: '0.38rem', letterSpacing: '0.1em' }}>{STATUS_LABEL[node.status]}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: THEME.textDim, fontSize: '0.4rem', letterSpacing: '0.3em' }}>LIVE SYSTEM LOG</span>
              <motion.div
                style={{ width: 4, height: 4, borderRadius: '50%', background: sseColor }}
                animate={{ opacity: sseStatus === 'connected' ? [0.5, 1, 0.5] : [0.2, 0.6, 0.2] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 12px', scrollbarWidth: 'thin', scrollbarColor: `${THEME.blue}33 transparent` }}>
              <AnimatePresence>
                {logs.map((log, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    style={{ display: 'flex', gap: 6, marginBottom: 4, borderLeft: `2px solid ${log.type === 'success' ? THEME.green : log.type === 'error' ? THEME.orange : log.type === 'warn' ? THEME.warn : THEME.blue}44`, paddingLeft: 6 }}
                  >
                    <span style={{ color: THEME.textDim, fontSize: '0.38rem', whiteSpace: 'nowrap', minWidth: 52 }}>{log.time}</span>
                    <span style={{ color: log.type === 'success' ? THEME.green : log.type === 'error' ? THEME.orange : log.type === 'warn' ? THEME.warn : THEME.text, fontSize: '0.42rem', lineHeight: 1.5 }}>{log.text}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* 하단 상태 바 */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 28px', borderTop: `1px solid ${THEME.blue}22`, background: `linear-gradient(0deg, ${THEME.bgDeep} 0%, transparent 100%)` }}>
        <div style={{ display: 'flex', gap: 24 }}>
          {[
            { label: 'RAILWAY IP', value: '184.169.215.58', color: THEME.blue },
            { label: 'WEBHOOK', value: 'REGISTERED', color: THEME.green },
            { label: 'SCHEDULE', value: '09:00 KST', color: THEME.gold },
            { label: 'REALTIME', value: sseLabel, color: sseColor },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em' }}>{item.label}:</span>
              <span style={{ color: item.color, fontSize: '0.42rem', letterSpacing: '0.1em' }}>{item.value}</span>
            </div>
          ))}
        </div>
        <div style={{ color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em' }}>MAWINPAY INTELLIGENCE SYSTEM · JARVIS v2.0</div>
      </div>
    </motion.div>
  );
}
