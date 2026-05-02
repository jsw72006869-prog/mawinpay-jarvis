/**
 * BookingPanel.tsx v1.0
 * 네이버 예약 전용 홀로그램 패널
 * 
 * 기능:
 * - 예약 진행 단계 시각화 (로그인 → 조회 → 폼 작성 → 확인)
 * - 가능한 시간대 리스트 표시
 * - 캡차/OTP 입력 인터페이스
 * - 실시간 스크린샷 표시
 * - 텔레메트리 이벤트 구독으로 자동 업데이트
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onTelemetryEvent, type TelemetryEvent } from '../lib/jarvis-telemetry';

// ─── 타입 정의 ───
interface BookingStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'success' | 'error' | 'waiting';
  detail?: string;
}

interface BookingPanelProps {
  visible: boolean;
  businessName?: string;
  date?: string;
  time?: string;
  availableSlots?: string[];
  onSlotSelect?: (slot: string) => void;
  onCaptchaSubmit?: (code: string) => void;
  captchaImage?: string | null;
  screenshot?: string | null;
  currentStep?: number;
  onClose?: () => void;
}

const DEFAULT_STEPS: BookingStep[] = [
  { id: 'login', label: '로그인 확인', status: 'pending' },
  { id: 'search', label: '업체 검색', status: 'pending' },
  { id: 'availability', label: '시간 조회', status: 'pending' },
  { id: 'form', label: '폼 작성', status: 'pending' },
  { id: 'confirm', label: '예약 확정', status: 'pending' },
];

export default function BookingPanel({
  visible,
  businessName = '',
  date,
  time,
  availableSlots = [],
  onSlotSelect,
  onCaptchaSubmit,
  captchaImage,
  screenshot,
  currentStep = 0,
  onClose,
}: BookingPanelProps) {
  const [steps, setSteps] = useState<BookingStep[]>(DEFAULT_STEPS);
  const [captchaInput, setCaptchaInput] = useState('');
  const captchaRef = useRef<HTMLInputElement>(null);

  // ─── 단계 업데이트 ───
  useEffect(() => {
    setSteps(prev => prev.map((step, idx) => ({
      ...step,
      status: idx < currentStep ? 'success' : idx === currentStep ? 'active' : 'pending',
    })));
  }, [currentStep]);

  // ─── 텔레메트리 구독 ───
  useEffect(() => {
    const cleanup = onTelemetryEvent((event: TelemetryEvent) => {
      if (event.type === 'node_state' && event.payload.nodeId === 'booking') {
        const { state, detail } = event.payload;
        setSteps(prev => {
          const next = [...prev];
          const activeIdx = next.findIndex(s => s.status === 'active');
          if (activeIdx >= 0) {
            if (state === 'success') {
              next[activeIdx].status = 'success';
              next[activeIdx].detail = detail;
              if (activeIdx + 1 < next.length) {
                next[activeIdx + 1].status = 'active';
              }
            } else if (state === 'error') {
              next[activeIdx].status = 'error';
              next[activeIdx].detail = detail;
            }
          }
          return next;
        });
      }
    });
    return cleanup;
  }, []);

  // ─── 캡차 포커스 ───
  useEffect(() => {
    if (captchaImage && captchaRef.current) {
      captchaRef.current.focus();
    }
  }, [captchaImage]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -30, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        style={{
          position: 'fixed',
          top: '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '420px',
          maxHeight: '600px',
          background: 'rgba(6, 10, 18, 0.94)',
          border: '1px solid rgba(244, 67, 54, 0.3)',
          borderRadius: '16px',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 40px rgba(244, 67, 54, 0.12), inset 0 0 60px rgba(0, 0, 0, 0.3)',
          zIndex: 10000,
          overflow: 'hidden',
        }}
      >
        {/* ─── 헤더 ─── */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(244, 67, 54, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: '#F44336',
                boxShadow: '0 0 12px #F44336',
              }}
            />
            <span style={{ color: '#F44336', fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', fontFamily: 'Orbitron, monospace' }}>
              BOOKING AGENT
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#8A9AAA', fontSize: '11px' }}>
              {businessName}
            </span>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#5A6A7A', cursor: 'pointer', fontSize: '16px' }}
            >
              ×
            </button>
          </div>
        </div>

        {/* ─── 진행 단계 ─── */}
        <div style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '12px' }}>
            {steps.map((step, idx) => (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <motion.div
                  animate={{
                    background: step.status === 'success' ? '#00FF88'
                      : step.status === 'active' ? '#F44336'
                      : step.status === 'error' ? '#FF3D00'
                      : 'rgba(90, 106, 122, 0.3)',
                    boxShadow: step.status === 'active' ? '0 0 8px #F44336' : 'none',
                  }}
                  style={{
                    width: '24px', height: '24px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', color: '#fff', fontWeight: 700,
                  }}
                >
                  {step.status === 'success' ? '✓' : step.status === 'error' ? '✗' : idx + 1}
                </motion.div>
                {idx < steps.length - 1 && (
                  <div style={{
                    flex: 1, height: '2px', margin: '0 4px',
                    background: step.status === 'success' ? '#00FF88' : 'rgba(90, 106, 122, 0.2)',
                  }} />
                )}
              </div>
            ))}
          </div>
          {/* 현재 단계 라벨 */}
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <span style={{ color: '#D4E0EC', fontSize: '12px' }}>
              {steps.find(s => s.status === 'active')?.label || '대기 중'}
            </span>
            {steps.find(s => s.status === 'active')?.detail && (
              <div style={{ color: '#8A9AAA', fontSize: '11px', marginTop: '4px' }}>
                {steps.find(s => s.status === 'active')?.detail}
              </div>
            )}
          </div>
        </div>

        {/* ─── 스크린샷 표시 ─── */}
        {screenshot && (
          <div style={{ padding: '0 18px 12px' }}>
            <div style={{
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid rgba(244, 67, 54, 0.2)',
            }}>
              <img
                src={screenshot.startsWith('data:') ? screenshot : `data:image/png;base64,${screenshot}`}
                alt="Browser Screenshot"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          </div>
        )}

        {/* ─── 예약 가능 시간대 ─── */}
        {availableSlots.length > 0 && (
          <div style={{ padding: '0 18px 14px' }}>
            <div style={{ color: '#8A9AAA', fontSize: '11px', marginBottom: '8px', letterSpacing: '0.5px' }}>
              예약 가능 시간대
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
              {availableSlots.slice(0, 8).map((slot, idx) => (
                <motion.button
                  key={idx}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onSlotSelect?.(slot)}
                  style={{
                    background: 'rgba(244, 67, 54, 0.08)',
                    border: '1px solid rgba(244, 67, 54, 0.3)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    color: '#D4E0EC',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  {slot}
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* ─── 캡차 입력 ─── */}
        {captchaImage && (
          <div style={{
            padding: '12px 18px',
            borderTop: '1px solid rgba(255, 215, 0, 0.3)',
            background: 'rgba(255, 215, 0, 0.03)',
          }}>
            <div style={{ color: '#FFD700', fontSize: '11px', marginBottom: '8px', fontWeight: 600 }}>
              보안 문자 인증 필요
            </div>
            <div style={{
              marginBottom: '8px',
              borderRadius: '6px',
              overflow: 'hidden',
              border: '1px solid rgba(255, 215, 0, 0.3)',
            }}>
              <img
                src={captchaImage.startsWith('data:') ? captchaImage : `data:image/png;base64,${captchaImage}`}
                alt="Captcha"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                ref={captchaRef}
                type="text"
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && captchaInput.trim()) {
                    onCaptchaSubmit?.(captchaInput.trim());
                    setCaptchaInput('');
                  }
                }}
                placeholder="보안 문자 입력..."
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
                onClick={() => {
                  if (captchaInput.trim()) {
                    onCaptchaSubmit?.(captchaInput.trim());
                    setCaptchaInput('');
                  }
                }}
                style={{
                  background: 'rgba(255, 215, 0, 0.2)',
                  border: '1px solid rgba(255, 215, 0, 0.5)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  color: '#FFD700',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                확인
              </button>
            </div>
          </div>
        )}

        {/* ─── 하단 정보 ─── */}
        <div style={{
          padding: '10px 18px',
          borderTop: '1px solid rgba(244, 67, 54, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ color: '#5A6A7A', fontSize: '10px' }}>
            {date && `📅 ${date}`} {time && `⏰ ${time}`}
          </span>
          <span style={{ color: '#5A6A7A', fontSize: '10px', fontFamily: 'Orbitron, monospace' }}>
            NAVER BOOKING v4.2
          </span>
        </div>

        {/* ─── 스캔라인 효과 ─── */}
        <motion.div
          animate={{ top: ['0%', '100%', '0%'] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute',
            left: 0, right: 0,
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(244, 67, 54, 0.3), transparent)',
            pointerEvents: 'none',
          }}
        />
      </motion.div>
    </AnimatePresence>
  );
}
