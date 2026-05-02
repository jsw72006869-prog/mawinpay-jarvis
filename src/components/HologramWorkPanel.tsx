/**
 * HologramWorkPanel.tsx v1.0
 * 명령 실행 시 시각적 UI 피드백 - 코어 빛 감소 + 작업 패널 표시
 * 
 * 기능:
 * - 작업 시작 시 코어 빛 감소 애니메이션
 * - 홀로그램 형태의 작업 진행 패널
 * - 실시간 진행률 표시
 * - 데이터 요약 카드
 * - 작업 완료 후 자동 복원
 * - 텔레메트리 이벤트 기반 자동 제어
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onTelemetryEvent, type TelemetryEvent, type NodeState } from '../lib/jarvis-telemetry';

// ─── 타입 정의 ───
interface WorkTask {
  id: string;
  functionName: string;
  title: string;
  nodeId: string;
  state: NodeState;
  progress: number;
  startTime: number;
  data?: Record<string, any>;
  detail?: string;
}

interface HologramWorkPanelProps {
  onCoreDimChange?: (dimLevel: number) => void; // 0 = 정상, 1 = 최대 감소
}

// ─── 함수명 → 한글 제목 매핑 ───
const TASK_TITLES: Record<string, string> = {
  'market_intelligence': '농산물 시장 분석',
  'influencer_agent': '인플루언서 스캔',
  'rank_tracker': '쇼핑 순위 추적',
  'naver_booking': '네이버 예약',
  'real_action_agent': '실행 에이전트',
  'morning_briefing': '모닝 브리핑',
  'smartstore_action': '스마트스토어',
  'execute_web_task': '웹 작업 수행',
  'search_youtube': '유튜브 검색',
  'search_naver': '네이버 검색',
  'generate_report': '보고서 생성',
  'send_email_campaign': '이메일 캠페인',
};

// ─── 노드별 색상 ───
const NODE_COLORS: Record<string, string> = {
  market_intel: '#FF9800',
  influencer: '#9C27B0',
  rank_tracker: '#FFD700',
  booking: '#F44336',
  smartstore: '#00E676',
  youtube: '#FF0000',
  manus_agent: '#00D4FF',
  jarvis_brain: '#9B8EC4',
  default: '#00D4FF',
};

export default function HologramWorkPanel({ onCoreDimChange }: HologramWorkPanelProps) {
  const [activeTasks, setActiveTasks] = useState<Map<string, WorkTask>>(new Map());
  const [isVisible, setIsVisible] = useState(false);

  // ─── 텔레메트리 이벤트 구독 ───
  useEffect(() => {
    const cleanup = onTelemetryEvent((event: TelemetryEvent) => {
      if (event.type === 'node_state') {
        const { nodeId, state, detail, data } = event.payload;
        
        setActiveTasks(prev => {
          const next = new Map(prev);
          
          if (state === 'active') {
            // 새 작업 시작 또는 기존 작업 업데이트
            const existing = next.get(nodeId);
            next.set(nodeId, {
              id: nodeId,
              functionName: nodeId,
              title: TASK_TITLES[nodeId] || detail || nodeId,
              nodeId,
              state: 'active',
              progress: existing ? Math.min(existing.progress + 20, 80) : 10,
              startTime: existing?.startTime || Date.now(),
              data: data || existing?.data,
              detail: detail || existing?.detail,
            });
          } else if (state === 'success') {
            const existing = next.get(nodeId);
            if (existing) {
              next.set(nodeId, { ...existing, state: 'success', progress: 100, data: data || existing.data, detail: detail || '완료' });
              // 3초 후 제거
              setTimeout(() => {
                setActiveTasks(p => { const n = new Map(p); n.delete(nodeId); return n; });
              }, 3000);
            }
          } else if (state === 'error') {
            const existing = next.get(nodeId);
            if (existing) {
              next.set(nodeId, { ...existing, state: 'error', detail: detail || '오류 발생' });
              setTimeout(() => {
                setActiveTasks(p => { const n = new Map(p); n.delete(nodeId); return n; });
              }, 5000);
            }
          } else if (state === 'idle') {
            next.delete(nodeId);
          }
          
          return next;
        });
      }

      // node_data 이벤트로 진행률 업데이트
      if (event.type === 'node_data') {
        const { nodeId, summary } = event.payload;
        setActiveTasks(prev => {
          const next = new Map(prev);
          const existing = next.get(nodeId);
          if (existing) {
            next.set(nodeId, { ...existing, data: summary, progress: Math.min(existing.progress + 15, 90) });
          }
          return next;
        });
      }
    });

    return cleanup;
  }, []);

  // ─── 코어 빛 조절 ───
  useEffect(() => {
    const hasActive = Array.from(activeTasks.values()).some(t => t.state === 'active');
    const hasError = Array.from(activeTasks.values()).some(t => t.state === 'error');
    
    setIsVisible(activeTasks.size > 0);
    
    if (hasError) {
      onCoreDimChange?.(0.8); // 에러 시 강하게 감소
    } else if (hasActive) {
      onCoreDimChange?.(0.5); // 작업 중 중간 감소
    } else {
      onCoreDimChange?.(0); // 복원
    }
  }, [activeTasks, onCoreDimChange]);

  const taskArray = Array.from(activeTasks.values());

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          style={{
            position: 'fixed',
            top: '80px',
            right: '20px',
            width: '340px',
            background: 'rgba(6, 10, 18, 0.88)',
            border: '1px solid rgba(0, 212, 255, 0.25)',
            borderRadius: '14px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 0 40px rgba(0, 212, 255, 0.1), inset 0 0 40px rgba(0, 0, 0, 0.2)',
            zIndex: 9998,
            overflow: 'hidden',
          }}
        >
          {/* ─── 헤더 ─── */}
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid rgba(0, 212, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              style={{ fontSize: '14px' }}
            >
              ⚙
            </motion.div>
            <span style={{ color: '#D4E0EC', fontSize: '12px', fontWeight: 600, letterSpacing: '1.5px' }}>
              TASK EXECUTION
            </span>
            <span style={{ color: '#5A6A7A', fontSize: '11px', marginLeft: 'auto' }}>
              {taskArray.length} active
            </span>
          </div>

          {/* ─── 작업 카드들 ─── */}
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
            {taskArray.map((task) => {
              const color = NODE_COLORS[task.nodeId] || NODE_COLORS.default;
              const isError = task.state === 'error';
              const isSuccess = task.state === 'success';
              
              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  style={{
                    background: `rgba(${isError ? '255,61,0' : isSuccess ? '0,255,136' : '0,212,255'}, 0.05)`,
                    border: `1px solid ${isError ? 'rgba(255,61,0,0.3)' : isSuccess ? 'rgba(0,255,136,0.3)' : `rgba(0,212,255,0.2)`}`,
                    borderRadius: '10px',
                    padding: '10px 14px',
                  }}
                >
                  {/* 작업 제목 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color, fontSize: '12px', fontWeight: 600 }}>
                      {task.title}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      color: isError ? '#FF3D00' : isSuccess ? '#00FF88' : '#5A6A7A',
                      fontWeight: 500,
                    }}>
                      {isError ? 'ERROR' : isSuccess ? 'DONE' : `${task.progress}%`}
                    </span>
                  </div>

                  {/* 진행률 바 */}
                  <div style={{
                    height: '3px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                    marginBottom: '6px',
                  }}>
                    <motion.div
                      animate={{ width: `${task.progress}%` }}
                      transition={{ duration: 0.5 }}
                      style={{
                        height: '100%',
                        background: isError ? '#FF3D00' : isSuccess ? '#00FF88' : color,
                        boxShadow: `0 0 8px ${isError ? '#FF3D00' : color}`,
                      }}
                    />
                  </div>

                  {/* 상세 정보 */}
                  {task.detail && (
                    <div style={{ color: '#8A9AAA', fontSize: '11px', marginBottom: '4px' }}>
                      {task.detail}
                    </div>
                  )}

                  {/* 데이터 요약 */}
                  {task.data && Object.keys(task.data).length > 0 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '4px',
                      marginTop: '6px',
                      padding: '6px 8px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '6px',
                    }}>
                      {Object.entries(task.data).slice(0, 6).map(([key, value]) => (
                        <div key={key} style={{ fontSize: '10px' }}>
                          <span style={{ color: '#5A6A7A' }}>{key}: </span>
                          <span style={{ color: '#D4E0EC' }}>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 경과 시간 */}
                  <div style={{ color: '#5A6A7A', fontSize: '10px', marginTop: '4px', textAlign: 'right' }}>
                    {Math.round((Date.now() - task.startTime) / 1000)}s elapsed
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* ─── 홀로그램 스캔라인 ─── */}
          <motion.div
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            style={{
              position: 'absolute',
              left: 0, right: 0,
              height: '2px',
              background: 'linear-gradient(90deg, transparent, rgba(0, 212, 255, 0.4), transparent)',
              pointerEvents: 'none',
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
