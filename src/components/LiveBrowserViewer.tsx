import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LiveBrowserViewerProps {
  /** WebSocket URL (클라우드 서버) */
  wsUrl?: string;
  /** 뷰어 표시 여부 */
  visible: boolean;
  /** 닫기 콜백 */
  onClose: () => void;
  /** 현재 작업 정보 */
  taskInfo?: {
    type: string;
    businessName?: string;
    step?: number;
    message?: string;
  };
}

interface TaskLog {
  step: number;
  message: string;
  progress: number;
  timestamp: string;
}

export default function LiveBrowserViewer({ wsUrl, visible, onClose, taskInfo }: LiveBrowserViewerProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('대기 중...');
  const [isMinimized, setIsMinimized] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

  const cloudUrl = import.meta.env.VITE_CLOUD_SERVER_URL || 'http://35.243.215.119:3001';
  const CLOUD_WS_URL = wsUrl || cloudUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws';

  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(CLOUD_WS_URL);
      
      ws.onopen = () => {
        setConnected(true);
        setStatusMessage('서버 연결됨 - 대기 중');
        console.log('[LiveViewer] WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'screenshot':
              setScreenshot(data.image);
              setFrameCount(prev => prev + 1);
              break;
              
            case 'task_start':
              setLogs([]);
              setProgress(0);
              setStatusMessage(`작업 시작: ${data.taskType}`);
              break;
              
            case 'task_log':
              setLogs(prev => [...prev.slice(-20), {
                step: data.step,
                message: data.message,
                progress: data.progress,
                timestamp: data.timestamp || new Date().toISOString(),
              }]);
              setProgress(data.progress || 0);
              setStatusMessage(data.message || '');
              break;
              
            case 'task_complete':
              setProgress(100);
              setStatusMessage(`✅ 작업 완료: ${data.taskType}`);
              break;
              
            case 'task_error':
              setStatusMessage(`❌ 오류: ${data.error}`);
              break;
              
            case 'system':
              if (data.event === 'browser_ready') {
                setStatusMessage('브라우저 엔진 온라인');
              }
              break;
          }
        } catch (e) {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setStatusMessage('연결 끊김 - 재연결 중...');
        // 자동 재연결
        if (visible) {
          reconnectTimer.current = setTimeout(connectWs, 3000);
        }
      };

      ws.onerror = () => {
        setConnected(false);
      };

      wsRef.current = ws;
    } catch (e) {
      console.error('[LiveViewer] WebSocket error:', e);
    }
  }, [CLOUD_WS_URL, visible]);

  useEffect(() => {
    if (visible) {
      connectWs();
    } else {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, [visible, connectWs]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'fixed',
          bottom: isMinimized ? '20px' : '20px',
          right: '20px',
          width: isMinimized ? '320px' : '680px',
          height: isMinimized ? '48px' : '520px',
          zIndex: 9999,
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid rgba(74, 144, 226, 0.4)',
          boxShadow: '0 0 30px rgba(74, 144, 226, 0.2), inset 0 0 60px rgba(0,0,0,0.5)',
          background: 'linear-gradient(135deg, #0a1628 0%, #0d1f3c 100%)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.3s, height 0.3s',
        }}
      >
        {/* Header Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'linear-gradient(90deg, rgba(74,144,226,0.15) 0%, rgba(200,169,110,0.1) 100%)',
          borderBottom: '1px solid rgba(74,144,226,0.2)',
          minHeight: '44px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Connection indicator */}
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: connected ? '#4ADE80' : '#EF4444',
              boxShadow: connected ? '0 0 8px #4ADE80' : '0 0 8px #EF4444',
              animation: connected ? 'pulse 2s infinite' : 'none',
            }} />
            <span style={{ color: '#C8A96E', fontSize: '12px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>
              J.A.R.V.I.S. LIVE VIEW
            </span>
            {frameCount > 0 && (
              <span style={{ color: '#4A90E2', fontSize: '10px', opacity: 0.7 }}>
                [{frameCount} frames]
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              style={{
                background: 'rgba(74,144,226,0.2)', border: '1px solid rgba(74,144,226,0.3)',
                borderRadius: '4px', color: '#4A90E2', cursor: 'pointer',
                padding: '2px 8px', fontSize: '11px',
              }}
            >
              {isMinimized ? '▲' : '▼'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '4px', color: '#EF4444', cursor: 'pointer',
                padding: '2px 8px', fontSize: '11px',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Screenshot Area */}
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#000',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {screenshot ? (
                <img
                  src={screenshot}
                  alt="Live Browser"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
              ) : (
                <div style={{
                  color: '#5A6A7A',
                  fontSize: '14px',
                  textAlign: 'center',
                  padding: '40px',
                }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.5 }}>🖥️</div>
                  <div>작업이 시작되면 실시간 화면이 표시됩니다</div>
                  <div style={{ fontSize: '11px', marginTop: '8px', opacity: 0.6 }}>
                    {connected ? '서버 연결됨 - 대기 중' : '서버 연결 중...'}
                  </div>
                </div>
              )}

              {/* Scanline effect */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
                pointerEvents: 'none',
              }} />
            </div>

            {/* Progress Bar */}
            <div style={{
              height: '3px',
              background: 'rgba(74,144,226,0.1)',
              position: 'relative',
            }}>
              <motion.div
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
                style={{
                  height: '100%',
                  background: progress >= 100
                    ? 'linear-gradient(90deg, #4ADE80, #22C55E)'
                    : 'linear-gradient(90deg, #4A90E2, #C8A96E)',
                  boxShadow: '0 0 10px rgba(74,144,226,0.5)',
                }}
              />
            </div>

            {/* Status & Logs */}
            <div style={{
              padding: '8px 12px',
              background: 'rgba(0,0,0,0.3)',
              borderTop: '1px solid rgba(74,144,226,0.1)',
              maxHeight: '100px',
              overflowY: 'auto',
            }}>
              <div style={{
                color: '#C8A96E',
                fontSize: '11px',
                fontFamily: 'monospace',
                marginBottom: '4px',
              }}>
                {statusMessage}
              </div>
              {logs.slice(-3).map((log, i) => (
                <div key={i} style={{
                  color: '#7BB3F0',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  opacity: 0.8,
                  lineHeight: '1.4',
                }}>
                  [{log.step}] {log.message} ({log.progress}%)
                </div>
              ))}
            </div>
          </>
        )}

        {/* Minimized status */}
        {isMinimized && (
          <div style={{
            display: 'none', // header already shows status
          }} />
        )}

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
}
