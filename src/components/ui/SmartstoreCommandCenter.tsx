import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DailyBriefPanel from './DailyBriefPanel';
import OrderFlowRadar from './OrderFlowRadar';
import ApprovalQueuePanel from './ApprovalQueuePanel';
import MissionStatusStrip from './MissionStatusStrip';
import ActionCard, { type ActionContext, type WorkflowStep, type ApprovalPreviewData } from '../ActionCard';
import type { Message, STTStatus } from '../ConversationPanel';

/* ── UI-LAYOUT-ORCH-A.1: Collision-aware Panel Layout ──
   
   구조:
   scc-stage (fixed inset:0, grid place-items:center, z:40)
     └─ scc-dim (backdrop, z:39)
     └─ scc-workspace (motion panel, opacity/scale only, z:auto)
           └─ workspace-header (Mission Status Strip + title)
           └─ mission-layout (CSS grid: left-rail | main | sidecar)
                 ├─ .mission-left   (Brief + Order Flow)
                 ├─ .mission-main   (주문현황 결과 카드 — 항상 중앙)
                 └─ .mission-sidecar (Next Actions + Approval Queue)
           └─ .mission-log (Dialogue Log — 하단 full-width)
   
   패널 우선순위:
   1. ApprovalGate modal (z:60)
   2. Command Dock (z:70)
   3. Main Result (mission-main)
   4. Next Actions / Approval Queue (mission-sidecar)
   5. Dialogue / Workflow Log (mission-log)
   6. Background HUD
   
   금지:
   - z-index 땜질 금지
   - transform으로 위치 제어 금지 (Framer Motion x/y 금지)
   - 패널 랜덤 fixed 배치 금지
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

// ── 주문현황 결과 카드 (mission-main 슬롯) ──
function OrderResultCard({ messages }: { messages: Message[] }) {
  const pkgMsg = [...messages].reverse().find(
    m => m.role === 'jarvis' && m.text.includes('[PKG]')
  );

  if (!pkgMsg) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 14, opacity: 0.4,
      }}>
        <div style={{ fontSize: 36, filter: 'drop-shadow(0 0 10px rgba(0,245,255,0.3))' }}>◈</div>
        <div style={{
          fontFamily: 'Orbitron, monospace', fontSize: '0.62rem',
          color: 'rgba(0,245,255,0.5)', letterSpacing: '0.2em', textAlign: 'center',
        }}>
          주문 현황 조회 대기 중
        </div>
        <div style={{ fontSize: '0.68rem', color: 'rgba(148,163,184,0.4)', textAlign: 'center' }}>
          "전체주문현황 알려줘"
        </div>
      </div>
    );
  }

  const lines = pkgMsg.text.replace('[PKG]', '').trim().split('\n').filter(l => l.trim());
  let title = lines[0]?.replace(/\*\*/g, '') || '주문 현황';
  if (title.includes('실시간 주문/발주 현황')) {
    title = '실시간 주문/발주 현황';
  }
  const dataLines = lines.slice(1).filter(l => l.includes(':') || l.includes('건') || l.includes('원'));
  const fetchTime = lines.find(l => l.includes('기준') || l.includes('조회')) || '';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 카드 헤더 */}
      <div style={{
        fontFamily: 'Orbitron, monospace', fontSize: '0.62rem', color: '#00F5FF',
        letterSpacing: '0.2em', display: 'flex', alignItems: 'center', gap: 8,
        paddingBottom: 12, borderBottom: '1px solid rgba(0,245,255,0.12)',
      }}>
        <span style={{ fontSize: '1.1rem', filter: 'drop-shadow(0 0 6px rgba(0,245,255,0.6))' }}>◈</span>
        {title}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00FF88', boxShadow: '0 0 8px #00FF88', display: 'inline-block' }} />
          <span style={{ fontSize: '0.5rem', color: 'rgba(0,255,136,0.6)', letterSpacing: '0.1em' }}>LIVE</span>
        </span>
      </div>

      {/* 주문 수치 그리드 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 14, flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        paddingRight: 4,
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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.07, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              style={{
                background: isNew
                  ? 'linear-gradient(135deg, rgba(0,245,255,0.08), rgba(0,245,255,0.02))'
                  : isPending
                  ? 'linear-gradient(135deg, rgba(167,139,250,0.08), rgba(167,139,250,0.02))'
                  : 'rgba(0,245,255,0.03)',
                border: `1px solid ${isNew ? 'rgba(0,245,255,0.22)' : isPending ? 'rgba(167,139,250,0.22)' : 'rgba(0,245,255,0.09)'}`,
                borderRadius: 14, padding: '16px 14px', textAlign: 'center',
                boxShadow: isNew || isPending ? `0 0 20px ${accentColor}14` : 'none',
              }}
            >
              <div style={{
                fontSize: '0.6rem', color: 'rgba(140,170,200,0.65)',
                marginBottom: 10, letterSpacing: '0.08em', fontFamily: 'monospace',
              }}>
                {label}
              </div>
              <div style={{
                fontSize: isHighlight ? '1.6rem' : '1.1rem',
                fontWeight: 700,
                color: isZero ? 'rgba(100,130,160,0.45)' : accentColor,
                fontFamily: isHighlight ? 'Orbitron, monospace' : 'Inter, sans-serif',
                textShadow: isHighlight && !isZero ? `0 0 16px ${accentColor}60` : 'none',
                lineHeight: 1.1,
              }}>
                {value}
              </div>
            </motion.div>
          );
        })}
      </div>

      {fetchTime && (
        <div style={{
          fontSize: '0.5rem', color: 'rgba(148,163,184,0.35)',
          textAlign: 'right', fontFamily: 'monospace', letterSpacing: '0.05em',
        }}>
          {fetchTime}
        </div>
      )}
    </div>
  );
}

// ── Dialogue Log (mission-log 슬롯) ──
function DialogueLog({ messages, isTyping }: { messages: Message[]; isTyping?: boolean }) {
  const recentMessages = messages.slice(-4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '100%', overflowY: 'auto' }}>
      {recentMessages.length === 0 && (
        <div style={{
          fontSize: '0.6rem', color: 'rgba(148,163,184,0.3)',
          fontFamily: 'monospace', letterSpacing: '0.08em',
          textAlign: 'center', padding: '8px 0',
        }}>
          — DIALOGUE LOG —
        </div>
      )}
      {recentMessages.map((msg, i) => {
        const isJarvis = msg.role === 'jarvis';
        const isCompletion = msg.isCompletion;
        const isPkg = msg.text.includes('[PKG]');
        const displayText = isPkg
          ? '◈ 주문 현황 조회 완료'
          : msg.text.replace('[LIST]', '').replace('[PKG]', '').trim().slice(0, 90) + (msg.text.length > 90 ? '…' : '');

        return (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
            style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}
          >
            <span style={{
              fontFamily: 'Orbitron, monospace', fontSize: '0.42rem',
              color: isCompletion ? '#00F5FF' : isJarvis ? 'rgba(0,245,255,0.45)' : 'rgba(100,180,255,0.45)',
              letterSpacing: '0.1em', whiteSpace: 'nowrap', paddingTop: 2, minWidth: 60,
            }}>
              {isCompletion ? 'COMPLETE' : isJarvis ? 'JARVIS' : 'CMD'}
            </span>
            <span style={{
              fontSize: '0.7rem',
              color: isCompletion ? '#00F5FF' : isJarvis ? 'rgba(224,242,254,0.75)' : 'rgba(148,163,184,0.65)',
              lineHeight: 1.5, wordBreak: 'break-word',
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
            {[0, 1, 2].map(j => (
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
    <>
      {/* ── scc-dim: 배경 어둡게 (z:39) ── */}
      <motion.div
        className="scc-dim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
      />

      {/* ── scc-stage: 위치 담당 (fixed inset:0, grid center, z:40) ── */}
      <div className="scc-stage">
        {/* ── scc-workspace: 애니메이션 담당 (opacity/scale only) ── */}
        <motion.div
          className="scc-workspace"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* 배경 그리드 오버레이 */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `
              linear-gradient(rgba(34,211,238,0.025) 1px, transparent 1px),
              linear-gradient(90deg, rgba(34,211,238,0.025) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
            pointerEvents: 'none', zIndex: 0, borderRadius: 24,
          }} />

          {/* X 닫기 버튼 */}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                position: 'absolute', top: 14, right: 16, zIndex: 20,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '50%', width: 30, height: 30,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'rgba(255,255,255,0.45)',
                fontSize: 13, lineHeight: 1, transition: 'all 0.2s ease', fontFamily: 'sans-serif',
              }}
              onMouseEnter={e => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.background = 'rgba(255,70,70,0.22)';
                b.style.color = '#ff5555';
                b.style.borderColor = 'rgba(255,70,70,0.4)';
              }}
              onMouseLeave={e => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.background = 'rgba(255,255,255,0.06)';
                b.style.color = 'rgba(255,255,255,0.45)';
                b.style.borderColor = 'rgba(255,255,255,0.12)';
              }}
            >
              ✕
            </button>
          )}

          {/* ── workspace-header: Mission Status Strip + 타이틀 ── */}
          <div className="workspace-header" style={{ position: 'relative', zIndex: 1 }}>
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.3 }}
            >
              <MissionStatusStrip />
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              style={{ textAlign: 'center', marginTop: 6, marginBottom: 10 }}
            >
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '3px',
                color: 'rgba(34,211,238,0.45)', textTransform: 'uppercase', fontFamily: 'monospace',
              }}>
                ── SMARTSTORE MISSION WORKSPACE ──
              </span>
            </motion.div>
          </div>

          {/* ── mission-layout: 3열 grid (left-rail | main | sidecar) ── */}
          <div className={`mission-layout${hasActionContext ? ' layout-with-sidecar' : ' layout-focus-result'}`}
            style={{ position: 'relative', zIndex: 1 }}
          >
            {/* ── mission-left: Brief + Order Flow ── */}
            <motion.div
              className="mission-left"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <DailyBriefPanel orderData={orderData} />
              <OrderFlowRadar />
            </motion.div>

            {/* ── mission-main: 주문현황 결과 카드 (항상 중앙, 가장 크게) ── */}
            <motion.div
              className="mission-main"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <OrderResultCard messages={messages} />
            </motion.div>

            {/* ── mission-sidecar: Next Actions + Approval Queue ── */}
            <motion.div
              className="mission-sidecar"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Next Actions 슬롯 */}
              <div className="sidecar-actions">
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
                    display: 'flex', flexDirection: 'column', gap: 6,
                    alignItems: 'center', justifyContent: 'center',
                    padding: '20px 0', opacity: 0.35,
                  }}>
                    <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.5rem', color: '#22C55E', letterSpacing: '0.15em' }}>
                      NEXT ACTIONS
                    </div>
                    <div style={{ fontSize: '0.62rem', color: 'rgba(148,163,184,0.5)' }}>
                      주문 조회 후 표시됩니다
                    </div>
                  </div>
                )}
              </div>

              {/* Approval Queue 슬롯 */}
              <div className="sidecar-approval">
                <ApprovalQueuePanel />
              </div>
            </motion.div>
          </div>

          {/* ── mission-log: Dialogue / Workflow Log (하단 full-width) ── */}
          <motion.div
            className="mission-log"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 8, paddingBottom: 6,
              borderBottom: '1px solid rgba(0,245,255,0.06)',
            }}>
              <span style={{
                fontFamily: 'Orbitron, monospace', fontSize: '0.45rem',
                color: 'rgba(0,245,255,0.4)', letterSpacing: '0.15em',
              }}>
                ◈ DIALOGUE LOG
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
                {['OBSERVE MODE', 'EXECUTE LOCKED', 'APPROVAL GATE ACTIVE'].map((label, i) => (
                  <span key={i} style={{
                    fontSize: 8, fontWeight: 700, letterSpacing: '1.5px',
                    color: i === 1 ? '#ef4444' : 'rgba(255,255,255,0.18)',
                    textTransform: 'uppercase', fontFamily: 'monospace',
                  }}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <DialogueLog messages={messages} isTyping={isTyping} />
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}
