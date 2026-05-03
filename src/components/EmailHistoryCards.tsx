/**
 * EmailHistoryCards.tsx
 * 3D 홀로그램 스타일 이메일 히스토리 카드 UI
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useCallback } from 'react';

export interface EmailRecord {
  id: string;
  subject?: string;
  title?: string;
  to: string;
  toName?: string;
  preview?: string;
  body?: string;
  sentAt: string;
  status: 'sent' | 'replied' | 'contract' | 'opened' | 'failed';
  template?: string;
}

interface EmailHistoryCardsProps {
  emails: EmailRecord[];
  visible: boolean;
  onClose: () => void;
  onResend?: (email: EmailRecord) => void;
  onViewDetail?: (email: EmailRecord) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; glow: string }> = {
  replied: { label: '답장', color: '#22C55E', bg: 'rgba(34,197,94,0.1)', glow: 'rgba(34,197,94,0.3)' },
  sent: { label: '발송', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', glow: 'rgba(245,158,11,0.3)' },
  contract: { label: '계약', color: '#A855F7', bg: 'rgba(168,85,247,0.1)', glow: 'rgba(168,85,247,0.3)' },
  opened: { label: '열람', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', glow: 'rgba(59,130,246,0.3)' },
  failed: { label: '실패', color: '#EF4444', bg: 'rgba(239,68,68,0.1)', glow: 'rgba(239,68,68,0.3)' },
};

function HoloEmailCard({ email, index, onResend, onViewDetail }: {
  email: EmailRecord; index: number;
  onResend?: (e: EmailRecord) => void;
  onViewDetail?: (e: EmailRecord) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const statusCfg = STATUS_CONFIG[email.status] || STATUS_CONFIG.sent;
  const displayTitle = email.subject || email.title || '마케팅 제안';
  const displayBody = email.preview || email.body || '';

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (y - 0.5) * -12, y: (x - 0.5) * 12 });
  }, []);

  const dirs = [
    { x: -150, y: -80, rotateY: -25 },
    { x: 150, y: -60, rotateY: 25 },
    { x: -80, y: 150, rotateY: -15 },
    { x: 120, y: 120, rotateY: 20 },
    { x: 0, y: -150, rotateY: 0 },
  ];
  const dir = dirs[index % dirs.length];

  const formattedDate = (() => {
    try {
      const d = new Date(email.sentAt);
      return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    } catch { return email.sentAt; }
  })();

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, x: dir.x, y: dir.y, rotateY: dir.rotateY, scale: 0.7 }}
      animate={{
        opacity: 1, x: 0, y: 0,
        rotateY: isHovered ? tilt.y : 0,
        rotateX: isHovered ? tilt.x : 0,
        scale: 1,
      }}
      exit={{ opacity: 0, scale: 0.5, y: 80 }}
      transition={{
        delay: index * 0.06,
        duration: 0.7,
        ease: [0.16, 1, 0.3, 1],
        rotateX: { duration: 0.15, ease: 'linear' },
        rotateY: { duration: 0.15, ease: 'linear' },
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setTilt({ x: 0, y: 0 }); setIsHovered(false); }}
      style={{
        minWidth: '260px', maxWidth: '320px', flex: '1 1 280px',
        perspective: '800px', transformStyle: 'preserve-3d',
      }}
    >
      <div style={{
        background: 'linear-gradient(135deg, rgba(10,20,40,0.95), rgba(6,12,28,0.98))',
        borderRadius: '12px',
        border: isHovered
          ? `1px solid ${statusCfg.color}66`
          : '1px solid rgba(255,255,255,0.06)',
        padding: '16px 18px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        position: 'relative', overflow: 'hidden',
        boxShadow: isHovered
          ? `0 0 25px ${statusCfg.glow}, inset 0 0 20px rgba(0,245,255,0.02)`
          : '0 4px 16px rgba(0,0,0,0.3)',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}>
        {/* 스캔라인 */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,245,255,0.01) 3px, rgba(0,245,255,0.01) 6px)`,
          pointerEvents: 'none', opacity: isHovered ? 0.6 : 0.2,
          transition: 'opacity 0.3s',
        }} />

        {/* 글로우 스위프 */}
        <motion.div
          animate={{ x: isHovered ? ['-100%', '200%'] : '-100%' }}
          transition={{ duration: 1.2, ease: 'linear', repeat: isHovered ? Infinity : 0 }}
          style={{
            position: 'absolute', top: 0, left: 0, zIndex: 1,
            width: '40%', height: '1px',
            background: `linear-gradient(90deg, transparent, ${statusCfg.color}, transparent)`,
          }}
        />

        {/* 상단: 제목 + 상태 뱃지 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 2 }}>
          <div style={{
            fontSize: '13px', fontWeight: 700, color: '#ffffff',
            lineHeight: '1.4', flex: 1, marginRight: '10px',
            textShadow: isHovered ? `0 0 6px ${statusCfg.glow}` : 'none',
          }}>
            {displayTitle}
          </div>
          <motion.span
            animate={isHovered ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 1, repeat: Infinity }}
            style={{
              fontSize: '10px', fontWeight: 700,
              color: statusCfg.color, background: statusCfg.bg,
              padding: '3px 10px', borderRadius: '3px',
              whiteSpace: 'nowrap', flexShrink: 0,
              fontFamily: "'Orbitron', monospace",
              letterSpacing: '0.5px',
              border: `1px solid ${statusCfg.color}33`,
            }}
          >
            ● {statusCfg.label}
          </motion.span>
        </div>

        {/* 수신자 */}
        <div style={{
          fontSize: '11px', color: 'rgba(0,245,255,0.6)',
          fontFamily: 'monospace',
          position: 'relative', zIndex: 2,
        }}>
          To: {email.toName || ''} {email.to && `<${email.to}>`}
        </div>

        {/* 내용 미리보기 */}
        <div style={{
          fontSize: '12px', color: '#9ca3af', lineHeight: '1.5',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
          overflow: 'hidden', position: 'relative', zIndex: 2,
        }}>
          {displayBody}
        </div>

        {/* 하단: 날짜 + 버튼 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: '4px', position: 'relative', zIndex: 2,
        }}>
          <span style={{
            fontSize: '10px', color: '#4b5563',
            fontFamily: "'Orbitron', monospace",
          }}>
            {formattedDate}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {email.status === 'replied' && (
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: '0 0 10px rgba(0,245,255,0.3)' }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onViewDetail?.(email)}
                style={{
                  background: 'linear-gradient(135deg, #00f5ff, #00c8ff)',
                  border: 'none', color: '#000',
                  fontSize: '10px', fontWeight: 700, padding: '5px 12px',
                  borderRadius: '4px', cursor: 'pointer',
                  fontFamily: "'Orbitron', monospace",
                }}
              >
                답장 확인
              </motion.button>
            )}
            {email.status === 'contract' && (
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: '0 0 10px rgba(168,85,247,0.3)' }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onViewDetail?.(email)}
                style={{
                  background: 'linear-gradient(135deg, #A855F7, #7C3AED)',
                  border: 'none', color: '#fff',
                  fontSize: '10px', fontWeight: 700, padding: '5px 12px',
                  borderRadius: '4px', cursor: 'pointer',
                  fontFamily: "'Orbitron', monospace",
                }}
              >
                계약서 보기
              </motion.button>
            )}
            {(email.status === 'sent' || email.status === 'failed') && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onResend?.(email)}
                style={{
                  background: 'transparent', border: '1px solid rgba(0,245,255,0.25)',
                  color: '#00f5ff', fontSize: '10px', fontWeight: 600,
                  padding: '5px 12px', borderRadius: '4px', cursor: 'pointer',
                  fontFamily: "'Orbitron', monospace",
                }}
              >
                재발송
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onViewDetail?.(email)}
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                color: '#6b7280', fontSize: '10px', fontWeight: 600,
                padding: '5px 12px', borderRadius: '4px', cursor: 'pointer',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              상세
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function EmailHistoryCards({ emails, visible, onClose, onResend, onViewDetail }: EmailHistoryCardsProps) {
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredEmails = filterStatus === 'all'
    ? emails
    : emails.filter(e => e.status === filterStatus);

  const stats = {
    total: emails.length,
    replied: emails.filter(e => e.status === 'replied').length,
    contract: emails.filter(e => e.status === 'contract').length,
    sent: emails.filter(e => e.status === 'sent').length,
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'radial-gradient(ellipse at center, rgba(0,20,40,0.98) 0%, rgba(2,6,15,0.99) 70%)',
            backdropFilter: 'blur(30px)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* 배경 그리드 */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `
              linear-gradient(rgba(0,245,255,0.025) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,245,255,0.025) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
            pointerEvents: 'none',
          }} />

          {/* 헤더 */}
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid rgba(0,245,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0, position: 'relative', zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: 'rgba(0,245,255,0.08)',
                  border: '1px solid rgba(0,245,255,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px',
                }}
              >✉</motion.div>
              <span style={{
                fontSize: '14px', color: '#00f5ff', fontWeight: 700,
                letterSpacing: '3px',
                fontFamily: "'Orbitron', monospace",
                textShadow: '0 0 10px rgba(0,245,255,0.3)',
              }}>
                EMAILS
              </span>
              <span style={{
                fontSize: '12px', color: 'rgba(255,255,255,0.4)',
                fontFamily: "'Orbitron', monospace",
              }}>
                {stats.total}통 · REPLY {stats.replied} · CONTRACT {stats.contract}
              </span>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              style={{
                background: 'rgba(255,50,50,0.06)', border: '1px solid rgba(255,80,80,0.25)',
                color: '#FF6666', cursor: 'pointer', fontSize: '11px',
                padding: '6px 16px', borderRadius: '4px',
                fontFamily: "'Orbitron', monospace",
                letterSpacing: '1px',
              }}
            >
              CLOSE ✕
            </motion.button>
          </motion.div>

          {/* 필터 바 */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            style={{
              padding: '10px 24px', borderBottom: '1px solid rgba(255,255,255,0.03)',
              display: 'flex', gap: '6px', flexShrink: 0,
              position: 'relative', zIndex: 10,
            }}
          >
            {[
              { key: 'all', label: 'ALL' },
              { key: 'replied', label: 'REPLIED' },
              { key: 'contract', label: 'CONTRACT' },
              { key: 'sent', label: 'SENT' },
              { key: 'failed', label: 'FAILED' },
            ].map(f => {
              const cfg = STATUS_CONFIG[f.key] || { color: '#00f5ff' };
              return (
                <motion.button
                  key={f.key}
                  whileHover={{ scale: 1.05 }}
                  onClick={() => setFilterStatus(f.key)}
                  style={{
                    background: filterStatus === f.key ? `${cfg.color || '#00f5ff'}15` : 'transparent',
                    border: `1px solid ${filterStatus === f.key ? (cfg.color || '#00f5ff') : 'rgba(255,255,255,0.08)'}`,
                    color: filterStatus === f.key ? (cfg.color || '#00f5ff') : '#555',
                    fontSize: '10px', fontWeight: 600,
                    padding: '5px 14px', borderRadius: '3px', cursor: 'pointer',
                    fontFamily: "'Orbitron', monospace",
                    letterSpacing: '1px',
                  }}
                >
                  {f.label}
                </motion.button>
              );
            })}
          </motion.div>

          {/* 카드 그리드 */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '24px',
            perspective: '1000px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(0,245,255,0.15) transparent',
            position: 'relative', zIndex: 5,
          }}>
            {filteredEmails.length === 0 ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '200px', color: '#444', fontSize: '13px',
                fontFamily: "'Orbitron', monospace",
                letterSpacing: '2px',
              }}>
                NO EMAIL RECORDS
              </div>
            ) : (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '16px',
                justifyContent: 'center',
              }}>
                {filteredEmails.map((email, i) => (
                  <HoloEmailCard
                    key={email.id}
                    email={email}
                    index={i}
                    onResend={onResend}
                    onViewDetail={onViewDetail}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 하단 상태바 */}
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            style={{
              padding: '10px 24px',
              borderTop: '1px solid rgba(0,245,255,0.08)',
              background: 'rgba(0,245,255,0.015)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0, position: 'relative', zIndex: 10,
            }}
          >
            <span style={{
              fontSize: '11px', color: 'rgba(255,255,255,0.3)',
              fontFamily: "'Orbitron', monospace",
              letterSpacing: '1px',
            }}>
              {filteredEmails.length} / {stats.total} DISPLAYED
            </span>
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: '#00f5ff', boxShadow: '0 0 8px #00f5ff',
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
