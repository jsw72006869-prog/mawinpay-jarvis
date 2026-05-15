import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DailyBriefPanel from './DailyBriefPanel';
import OrderFlowRadar from './OrderFlowRadar';
import ApprovalQueuePanel from './ApprovalQueuePanel';
import MissionStatusStrip from './MissionStatusStrip';
import ActionCard, { type ActionContext, type WorkflowStep, type ApprovalPreviewData } from '../ActionCard';
import type { Message, STTStatus } from '../ConversationPanel';

/* ── UI-ORCH-A.1: Smartstore Mission Workspace ──
   전체 화면 4-zone 레이아웃:
   좌측: Brief / Order Flow
   중앙: 주문현황 결과 카드 (가장 크게)
   우측: Next Actions / Approval Queue
   하단: Dialogue / Workflow Log
   
   독립 팝업 없음 — 모든 패널이 workspace 안에 매핑됨
   cinematic 순차 등장 (Framer Motion)
*/

interface OrderData {
  newOrders?: number;
  pendingShipping?: number;
  purchaseConfirmed?: number;
  fetchedAt?: string | null;
}

interface Props {
  visible: boolean;
  onClose?: () => void;
  orderData?: OrderData | null;
  // 통합 props
  messages?: Message[];
  isTyping?: boolean;
  sttStatus?: STTStatus;
  actionContext?: ActionContext | null;
  workflowSteps?: WorkflowStep[];
  approvalPreview?: ApprovalPreviewData | null;
  onActionSelect?: (cmd: string) => void;
  onActionDismiss?: () => void;
  onApprovalDismiss?: () => void;
}

// ── 주문현황 결과 카드 (중앙 메인) ──
function OrderResultCard({ messages }: { messages: Message[] }) {
  // [PKG] 타입 메시지 중 가장 최신 것 찾기
  const pkgMsg = [...messages].reverse().find(m => m.role === 'jarvis' && m.text.includes('[PKG]'));
  
  if (!pkgMsg) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        opacity: 0.4,
      }}>
        <div style={{ fontSize: 32, filter: 'drop-shadow(0 0 8px rgba(0,245,255,0.3))' }}>◈</div>
        <div style={{
          fontFamily: 'Orbitron, monospace',
          fontSize: '0.6rem',
          color: 'rgba(0,245,255,0.5)',
          letterSpacing: '0.2em',
          textAlign: 'center',
        }}>
          주문 현황 조회 대기 중
        </div>
        <div style={{
          fontSize: '0.65rem',
          color: 'rgba(148,163,184,0.4)',
          textAlign: 'center',
        }}>
          "전체주문현황 알려줘"
        </div>
      </div>
    );
  }

  const lines = pkgMsg.text.replace('[PKG]', '').trim().split('\n').filter(l => l.trim());
  const title = lines[0]?.replace(/\*\*/g, '') || '주문 현황';
  const dataLines = lines.slice(1).filter(l => l.includes(':') || l.includes('건') || l.includes('원'));
  const fetchTime = (() => {
    const timeLine = lines.find(l => l.includes('기준') || l.includes('조회'));
    return timeLine || '';
  })();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 카드 헤더 */}
      <div style={{
        fontFamily: 'Orbitron, monospace',
        fontSize: '0.6rem',
        color: '#00F5FF',
        letterSpacing: '0.2em',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingBottom: 10,
        borderBottom: '1px solid rgba(0,245,255,0.12)',
      }}>
        <span style={{ fontSize: '1rem', filter: 'drop-shadow(0 0 6px rgba(0,245,255,0.6))' }}>◈</span>
        {title}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00FF88', boxShadow: '0 0 8px #00FF88', display: 'inline-block' }} />
          <span style={{ fontSize: '0.48rem', color: 'rgba(0,255,136,0.6)', letterSpacing: '0.1em' }}>LIVE</span>
        </span>
      </div>

      {/* 주문 수치 그리드 — 크게 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
        gap: 10,
        flex: 1,
      }}>
        {dataLines.map((line, i) => {
          const parts = line.replace(/[-•]/g, '').trim().split(/[:：]/);
          const label = parts[0]?.replace(/\*\*/g, '').trim() || '';
          const value = parts.slice(1).join(':').replace(/\*\*/g, '').trim() || '';
          const isHighlight = value.includes('건') || value.includes('원');
          const isZero = /^0건$/.test(value.trim());
          const isNew = label.includes('신규');
          const isPending = label.includes('배송준비');
          const accentColor = isNew ? '#00F5FF' : isPending ? '#A78BFA' : isHighlight ? '#22d3ee' : 'rgba(224,242,254,0.7)';
          
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{
                background: isNew
                  ? 'linear-gradient(135deg, rgba(0,245,255,0.06), rgba(0,245,255,0.02))'
                  : isPending
                  ? 'linear-gradient(135deg, rgba(167,139,250,0.06), rgba(167,139,250,0.02))'
                  : 'rgba(0,245,255,0.025)',
                border: `1px solid ${isNew ? 'rgba(0,245,255,0.2)' : isPending ? 'rgba(167,139,250,0.2)' : 'rgba(0,245,255,0.08)'}`,
                borderRadius: 12,
                padding: '14px 12px',
                textAlign: 'center',
                boxShadow: isNew || isPending ? `0 0 16px ${accentColor}12` : 'none',
              }}
            >
              <div style={{
                fontSize: '0.58rem',
                color: 'rgba(140,170,200,0.65)',
                marginBottom: 8,
                letterSpacing: '0.08em',
                fontFamily: 'monospace',
              }}>
                {label}
              </div>
              <div style={{
                fontSize: isHighlight ? '1.4rem' : '1rem',
                fontWeight: 700,
                color: isZero ? 'rgba(100,130,160,0.45)' : accentColor,
                fontFamily: isHighlight ? 'Orbitron, monospace' : 'Inter, sans-serif',
                textShadow: isHighlight && !isZero ? `0 0 14px ${accentColor}60` : 'none',
                lineHeight: 1.1,
              }}>
                {value}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* 하단 타임스탬프 */}
      {fetchTime && (
        <div style={{
          fontSize: '0.5rem',
          color: 'rgba(148,163,184,0.35)',
          textAlign: 'right',
          fontFamily: 'monospace',
          letterSpacing: '0.05em',
        }}>
          {fetchTime}
        </div>
      )}
    </div>
  );
}

// ── 하단 Dialogue Log ──
function DialogueLog({ messages, isTyping }: { messages: Message[]; isTyping?: boolean }) {
  const recentMessages = messages.slice(-4);
  
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      maxHeight: '100%',
      overflowY: 'auto',
    }}>
      {recentMessages.length === 0 && (
        <div style={{
          fontSize: '0.6rem',
          color: 'rgba(148,163,184,0.3)',
          fontFamily: 'monospace',
          letterSpacing: '0.08em',
          textAlign: 'center',
          padding: '8px 0',
        }}>
          — DIALOGUE LOG —
        </div>
      )}
      {recentMessages.map((msg, i) => {
        const isJarvis = msg.role === 'jarvis';
        const isCompletion = msg.isCompletion;
        const isPkg = msg.text.includes('[PKG]');
        
        // PKG 메시지는 중앙 카드에 이미 표시되므로 간략히만
        const displayText = isPkg
          ? '◈ 주문 현황 조회 완료'
          : msg.text.replace('[LIST]', '').replace('[PKG]', '').trim().slice(0, 80) + (msg.text.length > 80 ? '…' : '');
        
        return (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <span style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.42rem',
              color: isCompletion ? '#00F5FF' : isJarvis ? 'rgba(0,245,255,0.45)' : 'rgba(100,180,255,0.45)',
              letterSpacing: '0.1em',
              whiteSpace: 'nowrap',
              paddingTop: 2,
              minWidth: 60,
            }}>
              {isCompletion ? 'COMPLETE' : isJarvis ? 'JARVIS' : 'CMD'}
            </span>
            <span style={{
              fontSize: '0.68rem',
              color: isCompletion ? '#00F5FF' : isJarvis ? 'rgba(224,242,254,0.75)' : 'rgba(148,163,184,0.65)',
              lineHeight: 1.5,
              wordBreak: 'break-word',
            }}>
              {displayText}
            </span>
          </motion.div>
        );
      })}
      {isTyping && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.42rem', color: 'rgba(0,245,255,0.45)', minWidth: 60 }}>JARVIS</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {[0,1,2].map(j => (
              <motion.span
                key={j}
                style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(0,245,255,0.5)', display: 'inline-block' }}
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1, repeat: Infinity, delay: j * 0.2 }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SmartstoreCommandCenter({
  visible,
  onClose,
  orderData,
  messages = [],
  isTyping,
  actionContext,
  workflowSteps = [],
  approvalPreview,
  onActionSelect,
  onActionDismiss,
  onApprovalDismiss,
}: Props) {
  if (!visible) return null;

  const hasActionContext = !!actionContext && actionContext.type === 'smartstore';

  return (
    <motion.div
      className={`scc-root scc-visible`}
      initial={{ opacity: 0, scale: 0.96, y: 18 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 10 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{ perspective: '1800px', transformStyle: 'preserve-3d' }}
    >
      {/* 배경 그리드 오버레이 */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(rgba(34,211,238,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(34,211,238,0.025) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
        zIndex: 0,
        borderRadius: 20,
      }} />

      {/* X 닫기 버튼 */}
      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            zIndex: 20,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '50%',
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.45)',
            fontSize: 13,
            lineHeight: 1,
            transition: 'all 0.2s ease',
            fontFamily: 'sans-serif',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,70,70,0.22)';
            (e.currentTarget as HTMLButtonElement).style.color = '#ff5555';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,70,70,0.4)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)';
          }}
        >
          ✕
        </button>
      )}

      {/* ── Zone 0: 상단 Mission Status Strip ── */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3 }}
        style={{ position: 'relative', zIndex: 1 }}
      >
        <MissionStatusStrip />
      </motion.div>

      {/* 운영실 타이틀 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        style={{ textAlign: 'center', marginBottom: 10, position: 'relative', zIndex: 1 }}
      >
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '3px',
          color: 'rgba(34,211,238,0.45)',
          textTransform: 'uppercase',
          fontFamily: 'monospace',
        }}>
          ── SMARTSTORE MISSION WORKSPACE ──
        </span>
      </motion.div>

      {/* ── Zone 1-2-3: 3열 메인 레이아웃 ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '260px 1fr 280px',
        gap: 10,
        position: 'relative',
        zIndex: 1,
        flex: 1,
        minHeight: 0,
      }}>
        {/* ── Zone 1: 좌측 — Brief + Order Flow ── */}
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}
        >
          <DailyBriefPanel orderData={orderData} />
          <OrderFlowRadar />
        </motion.div>

        {/* ── Zone 2: 중앙 — 주문현황 결과 카드 (메인) ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: 'linear-gradient(145deg, rgba(0,20,50,0.88), rgba(0,10,30,0.82))',
            border: '1px solid rgba(0,245,255,0.18)',
            borderRadius: 14,
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 0 30px rgba(0,245,255,0.06), inset 0 1px 0 rgba(0,245,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <OrderResultCard messages={messages} />
        </motion.div>

        {/* ── Zone 3: 우측 — Next Actions + Approval Queue ── */}
        <motion.div
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.25, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}
        >
          {/* Next Actions */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(6,15,30,0.88), rgba(0,10,25,0.82))',
            border: '1px solid rgba(0,245,255,0.12)',
            borderRadius: 14,
            padding: '12px 14px',
            flex: hasActionContext ? 1 : 0,
            overflow: 'hidden',
          }}>
            {hasActionContext && onActionSelect && onActionDismiss ? (
              <ActionCard
                context={actionContext!}
                workflowSteps={workflowSteps}
                approvalPreview={approvalPreview}
                onApprovalDismiss={onApprovalDismiss}
                onActionSelect={onActionSelect}
                onDismiss={onActionDismiss}
              />
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px 0',
                opacity: 0.35,
              }}>
                <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.48rem', color: '#22C55E', letterSpacing: '0.15em' }}>
                  NEXT ACTIONS
                </div>
                <div style={{ fontSize: '0.6rem', color: 'rgba(148,163,184,0.5)' }}>
                  주문 조회 후 표시됩니다
                </div>
              </div>
            )}
          </div>
          {/* Approval Queue */}
          <ApprovalQueuePanel />
        </motion.div>
      </div>

      {/* ── Zone 4: 하단 — Dialogue / Workflow Log ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative',
          zIndex: 1,
          marginTop: 10,
          background: 'rgba(4,8,18,0.7)',
          border: '1px solid rgba(0,245,255,0.08)',
          borderRadius: 12,
          padding: '10px 14px',
          maxHeight: 100,
          overflow: 'hidden',
        }}
      >
        {/* 하단 헤더 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: '1px solid rgba(0,245,255,0.06)',
        }}>
          <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.45rem', color: 'rgba(0,245,255,0.4)', letterSpacing: '0.15em' }}>
            ◈ DIALOGUE LOG
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
            {['OBSERVE MODE', 'EXECUTE LOCKED', 'APPROVAL GATE ACTIVE'].map((label, i) => (
              <span key={i} style={{
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: '1.5px',
                color: i === 1 ? '#ef4444' : 'rgba(255,255,255,0.18)',
                textTransform: 'uppercase',
                fontFamily: 'monospace',
              }}>
                {label}
              </span>
            ))}
          </div>
        </div>
        <DialogueLog messages={messages} isTyping={isTyping} />
      </motion.div>
    </motion.div>
  );
}
