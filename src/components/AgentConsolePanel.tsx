/**
 * AgentConsolePanel.tsx v1.0
 * 에이전트 비주얼라이저 - 실시간 작업 상태를 채팅 버블 형태로 표시
 * 
 * 기능:
 * - 텔레메트리 이벤트를 구독하여 자동으로 최신 메시지 표시
 * - 실시간 스크린샷/이미지 표시
 * - 상태 아이콘 (진행 중, 성공, 실패, 대기)
 * - 캡차/OTP 입력 요청 UI
 * - 코어 빛 조절과 연동
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onTelemetryEvent, type TelemetryEvent } from '../lib/jarvis-telemetry';

// ─── 타입 정의 ───
interface AgentMessage {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'thinking' | 'user_input';
  text: string;
  timestamp: number;
  screenshot?: string; // base64 이미지
  functionName?: string;
  nodeId?: string;
}

interface AgentConsolePanelProps {
  visible: boolean;
  onClose?: () => void;
  onUserInput?: (value: string) => void;
  captchaImage?: string | null;
  captchaMode?: 'captcha' | 'otp' | null;
  isWorking?: boolean;
}

// ─── 상태 아이콘 매핑 ───
const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  info:       { icon: '▶', color: '#00D4FF' },
  success:    { icon: '✓', color: '#00FF88' },
  error:      { icon: '✗', color: '#FF3D00' },
  warning:    { icon: '⚠', color: '#FFAA00' },
  thinking:   { icon: '…', color: '#9B8EC4' },
  user_input: { icon: '?', color: '#FFD700' },
};

export default function AgentConsolePanel({ visible, onClose, onUserInput, captchaImage, captchaMode, isWorking }: AgentConsolePanelProps) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── 텔레메트리 이벤트 구독 ───
  useEffect(() => {
    const cleanup = onTelemetryEvent((event: TelemetryEvent) => {
      if (event.type === 'mission_log') {
        const payload = event.payload;
        const msgType = payload.logType === 'success' ? 'success'
          : payload.logType === 'error' ? 'error'
          : payload.logType === 'warn' ? 'warning'
          : payload.logType === 'thinking' ? 'thinking'
          : 'info';

        const newMsg: AgentMessage = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          type: msgType,
          text: payload.message,
          timestamp: event.timestamp,
          functionName: payload.source,
        };
        setMessages(prev => [...prev.slice(-50), newMsg]); // 최대 50개 유지
      }

      if (event.type === 'node_state') {
        const payload = event.payload;
        if (payload.state === 'active' && payload.detail) {
          const newMsg: AgentMessage = {
            id: `state-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            type: 'thinking',
            text: payload.detail,
            timestamp: event.timestamp,
            nodeId: payload.nodeId,
          };
          setMessages(prev => [...prev.slice(-50), newMsg]);
        }
      }
    });

    return cleanup;
  }, []);

  // ─── 자동 스크롤 ───
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ─── 캡차/OTP 입력 요청 시 메시지 추가 ───
  useEffect(() => {
    if (captchaMode) {
      const msg: AgentMessage = {
        id: `captcha-${Date.now()}`,
        type: 'user_input',
        text: captchaMode === 'captcha' ? 'Sir, 캡차 인증이 필요합니다. 아래 이미지의 문자를 입력해 주세요.' : 'Sir, OTP 인증번호를 입력해 주세요.',
        timestamp: Date.now(),
        screenshot: captchaImage || undefined,
      };
      setMessages(prev => [...prev, msg]);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [captchaMode, captchaImage]);

  // ─── 사용자 입력 제출 ───
  const handleSubmit = useCallback(() => {
    if (!inputValue.trim()) return;
    onUserInput?.(inputValue.trim());
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: 'info',
      text: `입력 완료: ${inputValue}`,
      timestamp: Date.now(),
    }]);
    setInputValue('');
  }, [inputValue, onUserInput]);

  // ─── 시간 포맷 ───
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 40, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 40, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '380px',
          maxHeight: '520px',
          background: 'rgba(6, 10, 18, 0.92)',
          border: '1px solid rgba(0, 212, 255, 0.3)',
          borderRadius: '16px',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 30px rgba(0, 212, 255, 0.15), inset 0 0 60px rgba(0, 0, 0, 0.3)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ─── 헤더 ─── */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(0, 212, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <motion.div
              animate={{ opacity: isWorking ? [0.5, 1, 0.5] : 1 }}
              transition={{ duration: 1.5, repeat: isWorking ? Infinity : 0 }}
              style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: isWorking ? '#00FFD4' : '#00D4FF',
                boxShadow: `0 0 8px ${isWorking ? '#00FFD4' : '#00D4FF'}`,
              }}
            />
            <span style={{ color: '#D4E0EC', fontSize: '13px', fontWeight: 600, letterSpacing: '1px' }}>
              AGENT CONSOLE
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#5A6A7A',
              cursor: 'pointer', fontSize: '16px', padding: '4px',
            }}
          >
            ×
          </button>
        </div>

        {/* ─── 메시지 영역 ─── */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '380px',
          }}
        >
          {messages.length === 0 && (
            <div style={{ color: '#5A6A7A', fontSize: '12px', textAlign: 'center', padding: '40px 0' }}>
              에이전트 대기 중...
            </div>
          )}
          {messages.map((msg) => {
            const statusConfig = STATUS_ICONS[msg.type] || STATUS_ICONS.info;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-start',
                }}
              >
                {/* 상태 아이콘 */}
                <span style={{
                  color: statusConfig.color,
                  fontSize: '12px',
                  fontWeight: 700,
                  minWidth: '16px',
                  textAlign: 'center',
                  marginTop: '2px',
                  textShadow: `0 0 6px ${statusConfig.color}`,
                }}>
                  {statusConfig.icon}
                </span>
                
                {/* 메시지 본문 */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    color: '#D4E0EC',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    wordBreak: 'break-word',
                  }}>
                    {msg.text}
                  </div>
                  
                  {/* 스크린샷 표시 */}
                  {msg.screenshot && (
                    <div style={{
                      marginTop: '6px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid rgba(0, 212, 255, 0.2)',
                    }}>
                      <img
                        src={msg.screenshot.startsWith('data:') ? msg.screenshot : `data:image/png;base64,${msg.screenshot}`}
                        alt="Agent Screenshot"
                        style={{ width: '100%', height: 'auto', display: 'block' }}
                      />
                    </div>
                  )}
                  
                  {/* 타임스탬프 */}
                  <div style={{ color: '#5A6A7A', fontSize: '10px', marginTop: '2px' }}>
                    {formatTime(msg.timestamp)}
                    {msg.functionName && ` · ${msg.functionName}`}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ─── 캡차/OTP 입력 영역 ─── */}
        {captchaMode && (
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255, 215, 0, 0.3)',
            background: 'rgba(255, 215, 0, 0.05)',
          }}>
            {captchaImage && (
              <div style={{
                marginBottom: '8px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid rgba(255, 215, 0, 0.3)',
              }}>
                <img
                  src={captchaImage.startsWith('data:') ? captchaImage : `data:image/png;base64,${captchaImage}`}
                  alt="Captcha"
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder={captchaMode === 'captcha' ? '캡차 문자 입력...' : 'OTP 번호 입력...'}
                style={{
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 215, 0, 0.4)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#FFD700',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSubmit}
                style={{
                  background: 'rgba(255, 215, 0, 0.2)',
                  border: '1px solid rgba(255, 215, 0, 0.5)',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  color: '#FFD700',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                전송
              </button>
            </div>
          </div>
        )}

        {/* ─── 스캔라인 효과 ─── */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 212, 255, 0.02) 2px, rgba(0, 212, 255, 0.02) 4px)',
          borderRadius: '16px',
        }} />
      </motion.div>
    </AnimatePresence>
  );
}
