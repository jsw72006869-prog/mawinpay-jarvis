/**
 * EmailHistoryCards.tsx
 * 시안 디자인 기준 이메일 히스토리 카드 UI
 * - 제목 + 수신자 + 상태 뱃지 + 내용 미리보기 + 날짜 + 액션 버튼
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

export interface EmailRecord {
  id: string;
  title: string;
  to: string;
  toName?: string;
  body: string;
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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  replied: { label: '답장', color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  sent: { label: '발송', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  contract: { label: '계약', color: '#A855F7', bg: 'rgba(168,85,247,0.12)' },
  opened: { label: '열람', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  failed: { label: '실패', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
};

function EmailCard({ email, index, onResend, onViewDetail }: {
  email: EmailRecord; index: number;
  onResend?: (e: EmailRecord) => void;
  onViewDetail?: (e: EmailRecord) => void;
}) {
  const statusCfg = STATUS_CONFIG[email.status] || STATUS_CONFIG.sent;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      style={{
        background: '#111827',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        minWidth: '260px',
        maxWidth: '320px',
        flex: '1 1 280px',
      }}
    >
      {/* 상단: 제목 + 상태 뱃지 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          fontSize: '14px', fontWeight: 700, color: '#ffffff',
          lineHeight: '1.4', flex: 1, marginRight: '10px',
        }}>
          {email.title}
        </div>
        <span style={{
          fontSize: '11px', fontWeight: 600,
          color: statusCfg.color, background: statusCfg.bg,
          padding: '3px 10px', borderRadius: '12px',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {statusCfg.label}
        </span>
      </div>

      {/* 수신자 */}
      <div style={{ fontSize: '12px', color: '#6b7280' }}>
        To: {email.to}
      </div>

      {/* 내용 미리보기 */}
      <div style={{
        fontSize: '12px', color: '#9ca3af', lineHeight: '1.5',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
        overflow: 'hidden',
      }}>
        {email.body}
      </div>

      {/* 하단: 날짜 + 버튼 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <span style={{ fontSize: '11px', color: '#4b5563' }}>
          {email.sentAt}
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {email.status === 'replied' && (
            <button
              onClick={() => onViewDetail?.(email)}
              style={{
                background: '#00f5ff', border: 'none', color: '#000',
                fontSize: '11px', fontWeight: 700, padding: '5px 12px',
                borderRadius: '6px', cursor: 'pointer',
              }}
            >
              담장 확인
            </button>
          )}
          {email.status === 'contract' && (
            <button
              onClick={() => onViewDetail?.(email)}
              style={{
                background: '#00f5ff', border: 'none', color: '#000',
                fontSize: '11px', fontWeight: 700, padding: '5px 12px',
                borderRadius: '6px', cursor: 'pointer',
              }}
            >
              계약서 보기
            </button>
          )}
          {(email.status === 'sent' || email.status === 'failed') && (
            <button
              onClick={() => onResend?.(email)}
              style={{
                background: 'transparent', border: '1px solid rgba(0,245,255,0.3)',
                color: '#00f5ff', fontSize: '11px', fontWeight: 600,
                padding: '5px 12px', borderRadius: '6px', cursor: 'pointer',
              }}
            >
              재발송
            </button>
          )}
          <button
            onClick={() => onViewDetail?.(email)}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: '#9ca3af', fontSize: '11px', fontWeight: 600,
              padding: '5px 12px', borderRadius: '6px', cursor: 'pointer',
            }}
          >
            상세
          </button>
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
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(6,10,20,0.97)',
            backdropFilter: 'blur(20px)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* 헤더 */}
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid rgba(0,245,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'rgba(0,245,255,0.1)', border: '1px solid rgba(0,245,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px',
              }}>✉</div>
              <span style={{ fontSize: '14px', color: '#fff', fontWeight: 700, letterSpacing: '2px' }}>
                EMAILS
              </span>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                {stats.total}통 · 답장 {stats.replied} · 계약 {stats.contract}
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,50,50,0.08)', border: '1px solid rgba(255,80,80,0.3)',
                color: '#FF6666', cursor: 'pointer', fontSize: '12px',
                padding: '6px 16px', borderRadius: '6px',
              }}
            >
              ✕ 닫기
            </button>
          </motion.div>

          {/* 필터 바 */}
          <div style={{
            padding: '10px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)',
            display: 'flex', gap: '6px', flexShrink: 0,
          }}>
            {[
              { key: 'all', label: '전체' },
              { key: 'replied', label: '답장' },
              { key: 'contract', label: '계약' },
              { key: 'sent', label: '발송' },
              { key: 'failed', label: '실패' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterStatus(f.key)}
                style={{
                  background: filterStatus === f.key ? 'rgba(0,245,255,0.1)' : 'transparent',
                  border: `1px solid ${filterStatus === f.key ? '#00f5ff' : 'rgba(255,255,255,0.1)'}`,
                  color: filterStatus === f.key ? '#00f5ff' : '#555',
                  fontSize: '11px', fontWeight: 600,
                  padding: '5px 14px', borderRadius: '16px', cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* 카드 그리드 */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '24px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(0,245,255,0.15) transparent',
          }}>
            {filteredEmails.length === 0 ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '200px', color: '#444', fontSize: '14px',
              }}>
                이메일 기록이 없습니다
              </div>
            ) : (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '16px',
                justifyContent: 'flex-start',
              }}>
                {filteredEmails.map((email, i) => (
                  <EmailCard
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
