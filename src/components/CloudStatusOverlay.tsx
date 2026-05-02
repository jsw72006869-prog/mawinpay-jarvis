/**
 * CloudStatusOverlay — 클라우드 엔진 실시간 상태 표시 HUD 오버레이
 * 
 * 화면 우측 상단에 항상 표시되며:
 * - 서버 연결 상태 (초록/빨강 점)
 * - 현재 실행 중인 작업 진행률
 * - 최근 스크린샷 미리보기
 * - 업타임 표시
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import cloudEngine, { type CloudStatus, type TaskLog, type ScreenshotEvent } from '../lib/jarvis-cloud-engine';

export default function CloudStatusOverlay() {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [currentTaskType, setCurrentTaskType] = useState<string | null>(null);
  const [latestScreenshot, setLatestScreenshot] = useState<string | null>(null);
  const [showScreenshot, setShowScreenshot] = useState(false);
  const [pulseActive, setPulseActive] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 이벤트 핸들러 등록
    cloudEngine.setHandlers({
      onConnected: () => {
        setConnected(true);
        setPulseActive(true);
        setTimeout(() => setPulseActive(false), 2000);
      },
      onDisconnected: () => {
        setConnected(false);
      },
      onStatusUpdate: (s) => {
        setStatus(s);
      },
      onTaskStart: (_id, taskType, _msg) => {
        setCurrentTaskType(taskType);
        setTaskLogs([]);
      },
      onTaskLog: (log) => {
        setTaskLogs(prev => [...prev.slice(-5), log]);
      },
      onTaskComplete: () => {
        setCurrentTaskType(null);
        setTaskLogs([]);
      },
      onTaskError: () => {
        setCurrentTaskType(null);
      },
      onScreenshot: (ss: ScreenshotEvent) => {
        setLatestScreenshot(ss.image);
        setShowScreenshot(true);
        setTimeout(() => setShowScreenshot(false), 5000);
      }
    });

    // REST 폴링 (WebSocket 실패 시 백업)
    pollRef.current = setInterval(async () => {
      const s = await cloudEngine.getStatus();
      if (s) {
        setStatus(s);
        setConnected(true);
      }
    }, 15000);

    // 초기 상태 조회
    cloudEngine.getStatus().then(s => {
      if (s) {
        setStatus(s);
        setConnected(true);
      }
    });

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
  };

  const latestLog = taskLogs[taskLogs.length - 1];

  return (
    <div className="fixed top-3 right-3 z-[9999] pointer-events-none" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {/* 메인 상태 카드 */}
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        className="pointer-events-auto"
        style={{
          background: 'rgba(6, 10, 18, 0.85)',
          border: `1px solid ${connected ? 'rgba(100, 220, 140, 0.4)' : 'rgba(255, 80, 80, 0.4)'}`,
          borderRadius: '8px',
          padding: '10px 14px',
          minWidth: '220px',
          backdropFilter: 'blur(10px)',
          boxShadow: connected 
            ? '0 0 15px rgba(100, 220, 140, 0.1), inset 0 0 20px rgba(100, 220, 140, 0.02)'
            : '0 0 15px rgba(255, 80, 80, 0.1)',
        }}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-2">
          {/* 연결 상태 점 */}
          <motion.div
            animate={pulseActive ? { scale: [1, 1.5, 1] } : connected ? { opacity: [0.6, 1, 0.6] } : {}}
            transition={{ repeat: Infinity, duration: 2 }}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: connected ? '#64DC8C' : '#FF5050',
              boxShadow: connected ? '0 0 6px #64DC8C' : '0 0 6px #FF5050',
            }}
          />
          <span style={{ color: '#A8B8C8', fontSize: '10px', letterSpacing: '1px' }}>
            CLOUD ENGINE
          </span>
          <span style={{ 
            color: connected ? '#64DC8C' : '#FF5050', 
            fontSize: '9px', 
            marginLeft: 'auto',
            textTransform: 'uppercase'
          }}>
            {connected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        {/* 상태 정보 */}
        {status && connected && (
          <div style={{ fontSize: '9px', color: '#5A6A7A', lineHeight: '1.6' }}>
            <div className="flex justify-between">
              <span>UPTIME</span>
              <span style={{ color: '#C8A96E' }}>{formatUptime(status.uptime)}</span>
            </div>
            <div className="flex justify-between">
              <span>BROWSER</span>
              <span style={{ color: status.browserReady ? '#64DC8C' : '#FF5050' }}>
                {status.browserReady ? 'READY' : 'INIT...'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>TASKS</span>
              <span style={{ color: '#7BB3F0' }}>{status.tasksCompleted}</span>
            </div>
          </div>
        )}

        {/* 현재 작업 진행률 */}
        <AnimatePresence>
          {currentTaskType && latestLog && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ marginTop: '8px', borderTop: '1px solid rgba(200, 169, 110, 0.2)', paddingTop: '8px' }}
            >
              <div style={{ fontSize: '9px', color: '#C8A96E', marginBottom: '4px' }}>
                {currentTaskType.toUpperCase()}
              </div>
              <div style={{ fontSize: '8px', color: '#A8B8C8', marginBottom: '4px' }}>
                {latestLog.message}
              </div>
              {/* 프로그레스 바 */}
              <div style={{ 
                height: '2px', 
                background: 'rgba(200, 169, 110, 0.1)', 
                borderRadius: '1px',
                overflow: 'hidden'
              }}>
                <motion.div
                  animate={{ width: `${latestLog.progress}%` }}
                  transition={{ duration: 0.3 }}
                  style={{ 
                    height: '100%', 
                    background: 'linear-gradient(90deg, #C8A96E, #E8D5A3)',
                    borderRadius: '1px'
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 스크린샷 미리보기 */}
      <AnimatePresence>
        {showScreenshot && latestScreenshot && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            className="pointer-events-auto mt-2"
            style={{
              background: 'rgba(6, 10, 18, 0.9)',
              border: '1px solid rgba(200, 169, 110, 0.3)',
              borderRadius: '6px',
              padding: '6px',
              width: '220px',
            }}
          >
            <div style={{ fontSize: '8px', color: '#C8A96E', marginBottom: '4px', letterSpacing: '1px' }}>
              LIVE CAPTURE
            </div>
            <img 
              src={latestScreenshot} 
              alt="Screenshot" 
              style={{ 
                width: '100%', 
                borderRadius: '4px',
                border: '1px solid rgba(100, 220, 140, 0.2)'
              }} 
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
