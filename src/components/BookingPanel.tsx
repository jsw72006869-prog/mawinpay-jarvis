/**
 * BookingPanel.tsx v2.0
 * 시안 디자인 기준 - DATE SELECTION + TIME SELECTION 레이아웃
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onTelemetryEvent, type TelemetryEvent } from '../lib/jarvis-telemetry';

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

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

const DEFAULT_STEPS: BookingStep[] = [
  { id: 'login', label: '로그인 확인', status: 'pending' },
  { id: 'search', label: '업체 검색', status: 'pending' },
  { id: 'availability', label: '시간 조회', status: 'pending' },
  { id: 'form', label: '폼 작성', status: 'pending' },
  { id: 'confirm', label: '예약 확정', status: 'pending' },
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export default function BookingPanel({
  visible, businessName = '', date, time,
  availableSlots = [], onSlotSelect, onCaptchaSubmit,
  captchaImage, screenshot, currentStep = 0, onClose,
}: BookingPanelProps) {
  const [steps, setSteps] = useState<BookingStep[]>(DEFAULT_STEPS);
  const [captchaInput, setCaptchaInput] = useState('');
  const captchaRef = useRef<HTMLInputElement>(null);
  
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [amPm, setAmPm] = useState<'am' | 'pm'>('am');

  useEffect(() => {
    setSteps(prev => prev.map((step, idx) => ({
      ...step,
      status: idx < currentStep ? 'success' : idx === currentStep ? 'active' : 'pending',
    })));
  }, [currentStep]);

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
              if (activeIdx + 1 < next.length) next[activeIdx + 1].status = 'active';
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

  useEffect(() => {
    if (captchaImage && captchaRef.current) captchaRef.current.focus();
  }, [captchaImage]);

  if (!visible) return null;

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const today = now.getDate();
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  const selectedDate = selectedDay
    ? `${viewMonth + 1}월 ${selectedDay}일 (${DAYS[new Date(viewYear, viewMonth, selectedDay).getDay()]})`
    : '';

  // 시간 슬롯 (가능한 시간대가 있으면 사용, 없으면 기본 생성)
  const timeSlots = availableSlots.length > 0
    ? availableSlots
    : amPm === 'am'
      ? ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']
      : ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -30, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        style={{
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
          width: '680px', maxWidth: '95vw',
          background: 'rgba(6,10,18,0.96)',
          border: '1px solid rgba(244,67,54,0.2)',
          borderRadius: '16px', backdropFilter: 'blur(20px)',
          boxShadow: '0 0 40px rgba(244,67,54,0.1)',
          zIndex: 10000, overflow: 'hidden',
        }}
      >
        {/* 헤더 */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(244,67,54,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '8px',
              background: 'rgba(244,67,54,0.12)', border: '1px solid rgba(244,67,54,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '14px',
            }}>📅</div>
            <span style={{ color: '#ffffff', fontSize: '13px', fontWeight: 700, letterSpacing: '2px' }}>
              BOOKING UI
            </span>
            {businessName && (
              <span style={{ color: '#6b7280', fontSize: '12px', marginLeft: '8px' }}>
                {businessName}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#5A6A7A',
            cursor: 'pointer', fontSize: '18px',
          }}>×</button>
        </div>

        {/* 진행 단계 */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {steps.map((step, idx) => (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <motion.div
                  animate={{
                    background: step.status === 'success' ? '#22C55E'
                      : step.status === 'active' ? '#F44336'
                      : step.status === 'error' ? '#EF4444'
                      : 'rgba(90,106,122,0.3)',
                    boxShadow: step.status === 'active' ? '0 0 8px #F44336' : 'none',
                  }}
                  style={{
                    width: '22px', height: '22px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', color: '#fff', fontWeight: 700,
                  }}
                >
                  {step.status === 'success' ? '✓' : step.status === 'error' ? '✗' : idx + 1}
                </motion.div>
                <span style={{
                  fontSize: '10px', color: step.status === 'active' ? '#F44336' : '#6b7280',
                  marginLeft: '4px', whiteSpace: 'nowrap',
                }}>
                  {step.label}
                </span>
                {idx < steps.length - 1 && (
                  <div style={{
                    flex: 1, height: '1px', margin: '0 6px',
                    background: step.status === 'success' ? '#22C55E' : 'rgba(90,106,122,0.15)',
                  }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 스크린샷 */}
        {screenshot && (
          <div style={{ padding: '12px 20px 0' }}>
            <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(244,67,54,0.15)' }}>
              <img
                src={screenshot.startsWith('data:') ? screenshot : `data:image/png;base64,${screenshot}`}
                alt="Browser" style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          </div>
        )}

        {/* DATE + TIME 선택 패널 */}
        <div style={{ display: 'flex', gap: '12px', padding: '16px 20px' }}>
          {/* DATE SELECTION */}
          <div style={{
            flex: 1, background: '#0d1420', borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#F44336', letterSpacing: '1px' }}>
                DATE SELECTION
              </span>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>
                {viewYear}년 {viewMonth + 1}월
              </span>
            </div>
            
            {/* 월 네비게이션 */}
            <div style={{
              padding: '10px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <button onClick={prevMonth} style={{
                background: 'none', border: 'none', color: '#6b7280',
                cursor: 'pointer', fontSize: '16px', padding: '4px 8px',
              }}>◀</button>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', letterSpacing: '1px' }}>
                {MONTHS[viewMonth].toUpperCase()} {viewYear}
              </span>
              <button onClick={nextMonth} style={{
                background: 'none', border: 'none', color: '#6b7280',
                cursor: 'pointer', fontSize: '16px', padding: '4px 8px',
              }}>▶</button>
            </div>

            {/* 요일 헤더 */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
              padding: '0 12px', gap: '2px',
            }}>
              {DAYS.map(d => (
                <div key={d} style={{
                  textAlign: 'center', fontSize: '10px', color: '#4b5563',
                  padding: '4px 0',
                }}>
                  {d}
                </div>
              ))}
            </div>

            {/* 날짜 그리드 */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
              padding: '4px 12px 12px', gap: '2px',
            }}>
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isPast = isCurrentMonth && day < today;
                const isSelected = selectedDay === day;
                const isToday = isCurrentMonth && day === today;
                return (
                  <motion.button
                    key={day}
                    whileHover={!isPast ? { scale: 1.1 } : {}}
                    whileTap={!isPast ? { scale: 0.95 } : {}}
                    onClick={() => !isPast && setSelectedDay(day)}
                    style={{
                      width: '32px', height: '32px', margin: '0 auto',
                      borderRadius: '50%',
                      background: isSelected ? '#00f5ff' : isToday ? 'rgba(0,245,255,0.1)' : 'transparent',
                      border: isToday && !isSelected ? '1px solid rgba(0,245,255,0.3)' : 'none',
                      color: isSelected ? '#000' : isPast ? '#333' : '#d1d5db',
                      fontSize: '12px', fontWeight: isSelected ? 700 : 400,
                      cursor: isPast ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {day}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* TIME SELECTION */}
          <div style={{
            flex: 1, background: '#0d1420', borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '12px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#00f5ff', letterSpacing: '1px' }}>
                TIME SELECTION
              </span>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>
                {selectedDate || '날짜를 선택하세요'}
              </span>
            </div>

            {/* 오전/오후 토글 */}
            {availableSlots.length === 0 && (
              <div style={{ padding: '10px 16px', display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setAmPm('am')}
                  style={{
                    flex: 1, padding: '6px',
                    background: amPm === 'am' ? 'rgba(0,245,255,0.1)' : 'transparent',
                    border: `1px solid ${amPm === 'am' ? '#00f5ff' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '6px', color: amPm === 'am' ? '#00f5ff' : '#555',
                    fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  오전
                </button>
                <button
                  onClick={() => setAmPm('pm')}
                  style={{
                    flex: 1, padding: '6px',
                    background: amPm === 'pm' ? 'rgba(0,245,255,0.1)' : 'transparent',
                    border: `1px solid ${amPm === 'pm' ? '#00f5ff' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '6px', color: amPm === 'pm' ? '#00f5ff' : '#555',
                    fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  오후
                </button>
              </div>
            )}

            {/* 시간 슬롯 */}
            <div style={{
              flex: 1, padding: '8px 16px 16px',
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px',
              overflowY: 'auto', maxHeight: '200px',
            }}>
              {timeSlots.map((slot, idx) => (
                <motion.button
                  key={idx}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setSelectedSlot(slot);
                    onSlotSelect?.(slot);
                  }}
                  style={{
                    background: selectedSlot === slot ? 'rgba(0,245,255,0.15)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${selectedSlot === slot ? '#00f5ff' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '8px', padding: '10px',
                    color: selectedSlot === slot ? '#00f5ff' : '#d1d5db',
                    fontSize: '13px', fontWeight: selectedSlot === slot ? 700 : 400,
                    cursor: 'pointer', textAlign: 'center',
                    transition: 'all 0.15s',
                  }}
                >
                  {slot}
                </motion.button>
              ))}
            </div>
          </div>
        </div>

        {/* 캡차 입력 */}
        {captchaImage && (
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255,215,0,0.2)',
            background: 'rgba(255,215,0,0.02)',
          }}>
            <div style={{ color: '#FFD700', fontSize: '11px', marginBottom: '8px', fontWeight: 600 }}>
              보안 문자 인증 필요
            </div>
            <div style={{
              marginBottom: '8px', borderRadius: '6px', overflow: 'hidden',
              border: '1px solid rgba(255,215,0,0.2)',
            }}>
              <img
                src={captchaImage.startsWith('data:') ? captchaImage : `data:image/png;base64,${captchaImage}`}
                alt="Captcha" style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                ref={captchaRef}
                type="text" value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && captchaInput.trim()) {
                    onCaptchaSubmit?.(captchaInput.trim());
                    setCaptchaInput('');
                  }
                }}
                placeholder="보안 문자 입력..."
                style={{
                  flex: 1, background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,215,0,0.3)',
                  borderRadius: '8px', padding: '8px 12px',
                  color: '#FFD700', fontSize: '13px', outline: 'none',
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
                  background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.4)',
                  borderRadius: '8px', padding: '8px 14px',
                  color: '#FFD700', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
                }}
              >
                확인
              </button>
            </div>
          </div>
        )}

        {/* 하단 */}
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#4b5563', fontSize: '10px' }}>
            {selectedDate && `📅 ${selectedDate}`} {selectedSlot && `⏰ ${selectedSlot}`}
          </span>
          {selectedDay && selectedSlot && (
            <button
              onClick={() => onSlotSelect?.(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')} ${selectedSlot}`)}
              style={{
                background: '#00f5ff', border: 'none', color: '#000',
                fontSize: '12px', fontWeight: 700, padding: '8px 20px',
                borderRadius: '8px', cursor: 'pointer',
              }}
            >
              예약 확정
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
