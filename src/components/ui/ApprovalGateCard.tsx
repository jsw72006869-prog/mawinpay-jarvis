import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── ACTION-A.1: Approval Gate Card ──
   approval_gate scene 전용 LOCKED 카드
   실제 실행 절대 금지 — toast/log만 */

interface ApprovalGateCardProps {
  visible: boolean;
  onDryRun: () => void;
  onPreview: () => void;
  onCancel: () => void;
  statusMessage?: string;
}

const ApprovalGateCard: React.FC<ApprovalGateCardProps> = ({
  visible,
  onDryRun,
  onPreview,
  onCancel,
  statusMessage,
}) => {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="approval-gate-card"
          initial={{ opacity: 0, scale: 0.92, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 30 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 100,
            transform: 'translateX(-50%)',
            width: 420,
            zIndex: 60,
            background: 'rgba(0, 8, 20, 0.95)',
            border: '1px solid rgba(255, 23, 68, 0.3)',
            borderRadius: 10,
            backdropFilter: 'blur(20px)',
            boxShadow: '0 0 40px rgba(255, 23, 68, 0.12), 0 0 80px rgba(255, 171, 0, 0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
            padding: '20px 24px',
            fontFamily: 'Orbitron, monospace',
          }}
        >
          {/* Danger glow bar */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: 'linear-gradient(90deg, transparent, #ff1744, #ffab00, #ff1744, transparent)',
            borderRadius: '10px 10px 0 0',
            opacity: 0.8,
          }} />

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontSize: '0.9rem', filter: 'drop-shadow(0 0 6px rgba(255,23,68,0.5))',
              }}>🔒</span>
              <div>
                <div style={{
                  color: '#ff1744', fontSize: '0.52rem', fontWeight: 700,
                  letterSpacing: '0.2em',
                }}>
                  APPROVAL REQUIRED
                </div>
                <div style={{
                  color: '#ffab00', fontSize: '0.36rem', letterSpacing: '0.12em',
                  marginTop: 2,
                }}>
                  EXECUTE LOCKED
                </div>
              </div>
            </div>
            <div style={{
              padding: '3px 10px', border: '1px solid #ff174450',
              borderRadius: 4, background: 'rgba(255,23,68,0.08)',
              color: '#ff1744', fontSize: '0.34rem', letterSpacing: '0.15em',
            }}>
              DANGER
            </div>
          </div>

          {/* Description */}
          <div style={{
            fontSize: '0.4rem', color: '#b0bec5', lineHeight: 1.6,
            fontFamily: "'Noto Sans KR', sans-serif",
            marginBottom: 16, letterSpacing: '0.02em',
          }}>
            대표 승인 전 실행되지 않습니다.
            <br />
            이메일 발송 · 발주확인 · 송장입력 · 발송처리 · 환불 승인 — 모두 LOCKED 상태입니다.
          </div>

          {/* Locked items */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16,
          }}>
            {['이메일 발송', 'CS 발송', '발주확인', '송장입력', '발송처리', '환불 승인'].map(item => (
              <span key={item} style={{
                fontSize: '0.32rem', color: '#ffab00', letterSpacing: '0.08em',
                padding: '2px 8px', border: '1px solid rgba(255,171,0,0.25)',
                borderRadius: 3, background: 'rgba(255,171,0,0.06)',
                fontFamily: "'Noto Sans KR', sans-serif",
              }}>
                🔒 {item}
              </span>
            ))}
          </div>

          {/* Action buttons */}
          <div style={{
            display: 'flex', gap: 10, justifyContent: 'center',
          }}>
            <motion.button
              whileHover={{ scale: 1.04, boxShadow: '0 0 16px rgba(179,136,255,0.3)' }}
              whileTap={{ scale: 0.97 }}
              onClick={onDryRun}
              style={{
                padding: '8px 20px', border: '1px solid #b388ff50',
                borderRadius: 5, background: 'rgba(179,136,255,0.08)',
                color: '#b388ff', fontSize: '0.38rem', fontWeight: 600,
                fontFamily: 'Orbitron, monospace', letterSpacing: '0.12em',
                cursor: 'pointer', transition: 'all 0.2s ease',
              }}
            >
              Dry-run 보기
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04, boxShadow: '0 0 16px rgba(0,229,255,0.3)' }}
              whileTap={{ scale: 0.97 }}
              onClick={onPreview}
              style={{
                padding: '8px 20px', border: '1px solid #00e5ff50',
                borderRadius: 5, background: 'rgba(0,229,255,0.08)',
                color: '#00e5ff', fontSize: '0.38rem', fontWeight: 600,
                fontFamily: 'Orbitron, monospace', letterSpacing: '0.12em',
                cursor: 'pointer', transition: 'all 0.2s ease',
              }}
            >
              초안만 보기
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04, boxShadow: '0 0 16px rgba(120,144,156,0.3)' }}
              whileTap={{ scale: 0.97 }}
              onClick={onCancel}
              style={{
                padding: '8px 20px', border: '1px solid #546e7a50',
                borderRadius: 5, background: 'rgba(84,110,122,0.08)',
                color: '#78909c', fontSize: '0.38rem', fontWeight: 600,
                fontFamily: 'Orbitron, monospace', letterSpacing: '0.12em',
                cursor: 'pointer', transition: 'all 0.2s ease',
              }}
            >
              취소
            </motion.button>
          </div>

          {/* Status Message */}
          <AnimatePresence>
            {statusMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  marginTop: 12, paddingTop: 10,
                  borderTop: '1px solid rgba(255,171,0,0.15)',
                  fontSize: '0.36rem', color: '#ffab00',
                  fontFamily: "'Noto Sans KR', sans-serif",
                  textAlign: 'center', letterSpacing: '0.02em',
                }}
              >
                {statusMessage}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ApprovalGateCard;
