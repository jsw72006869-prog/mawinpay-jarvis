import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import DailyBriefPanel from './DailyBriefPanel';
import OrderFlowRadar from './OrderFlowRadar';
import ApprovalQueuePanel from './ApprovalQueuePanel';
import MissionStatusStrip from './MissionStatusStrip';
import ActionCard, { type ActionContext, type WorkflowStep, type ApprovalPreviewData } from '../ActionCard';
import type { Message, STTStatus } from '../ConversationPanel';

/* ── UI-ORCH-A.11 + MOTION-ORCH-A.1 ──
   
   구조:
   scc-stage (fixed inset:0, grid place-items:center, z:40)
     └─ scc-dim (backdrop, z:39)
     └─ scc-workspace order-focus-layout (motion panel, opacity/scale only, z:auto)
           ├─ workspace-header (Mission Status Strip)
           ├─ compact-brief-strip (Horizontal Daily Brief)
           ├─ order-focus-main (주문현황 compact metric tiles — 최대화)
           ├─ order-focus-side (Next Actions + Approval Queue)
           ├─ order-focus-flow (Horizontal Order Flow)
           └─ order-focus-log (Dialogue Log — 하단 full-width)

   Motion 원칙:
   - 최초 등장 시 7단계 staged entrance (0.7~0.95s 내 완성)
   - 데이터 갱신 시 전체 재등장 금지 (hasEnteredRef로 제어)
   - 숫자 갱신 시 micro highlight만 허용
   - exit: 150~220ms fade out
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

// ── Premium cubic-bezier easings ──
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

// ── Staged entrance variants ──
const workspaceVariants = {
  hidden: { opacity: 0, scale: 0.985, y: 8 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { duration: 0.32, ease: EASE_OUT_EXPO },
  },
  exit: {
    opacity: 0, scale: 0.99,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
  },
};

const dimVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};

// Stage 3: 중앙 주문현황 main board
const mainVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1, y: 0,
    transition: { delay: 0.18, duration: 0.38, ease: EASE_OUT_EXPO },
  },
};

// Stage 4: metric card stagger container
const metricGridVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.28 },
  },
};

const metricCardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.22, ease: EASE_OUT_QUART },
  },
};

// Stage 5: 우측 side panel (오른쪽에서 미세하게 들어옴)
const sideVariants = {
  hidden: { opacity: 0, x: 14 },
  visible: {
    opacity: 1, x: 0,
    transition: { delay: 0.32, duration: 0.32, ease: EASE_OUT_EXPO },
  },
};

// Stage 6: 하단 flow + log (은은하게 마지막 등장)
const bottomVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1, y: 0,
    transition: { delay: 0.44, duration: 0.3, ease: EASE_OUT_QUART },
  },
};

// ── 주문현황 결과 카드 (compact metric tile) ──
function OrderResultCard({
  messages,
  animateState,
}: {
  messages: Message[];
  animateState: 'hidden' | 'visible';
}) {
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
  if (title.includes('주문') || title.includes('발주') || title.includes('현황')) {
    title = '실시간 주문/발주 현황';
  }
  const dataLines = lines.slice(1).filter(l => l.includes(':') || l.includes('건') || l.includes('원'));
  const fetchTime = lines.find(l => l.includes('기준') || l.includes('조회')) || '';

  // GPT 분석 텍스트 추출 (PKG 메시지 이전의 마지막 jarvis 메시지)
  const analysisMsg = [...messages].reverse().find(
    m => m.role === 'jarvis' && !m.text.includes('[PKG]') && !m.text.includes('[LIST]') && m.text.length > 20
  );
  const analysisText = analysisMsg?.text?.replace(/\[.*?\]/g, '').trim() || '';

  return (
    <div style={{ height: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 카드 헤더 */}
      <div style={{
        fontFamily: 'Orbitron, monospace', fontSize: '0.62rem', color: '#00F5FF',
        letterSpacing: '0.2em', display: 'flex', alignItems: 'center', gap: 8,
        paddingBottom: 10, borderBottom: '1px solid rgba(0,245,255,0.12)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '1.1rem', filter: 'drop-shadow(0 0 6px rgba(0,245,255,0.6))' }}>◈</span>
        {title}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00FF88', boxShadow: '0 0 8px #00FF88', display: 'inline-block' }} />
          <span style={{ fontSize: '0.5rem', color: 'rgba(0,255,136,0.6)', letterSpacing: '0.1em' }}>LIVE</span>
        </span>
      </div>

      {/* ── Compact Metric Tile Grid ── */}
      <motion.div
        className="metric-tile-grid"
        variants={metricGridVariants}
        initial="hidden"
        animate={animateState}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: '100%', flexShrink: 0 }}
      >
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
              key={`tile-${label}`}
              className="metric-tile"
              variants={metricCardVariants}
              initial="hidden"
              animate={animateState}
              style={{
                width: 'calc(33.333% - 4px)',
                height: 72,
                minHeight: 72,
                maxHeight: 72,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: '0 14px',
                overflow: 'hidden',
                background: isNew
                  ? 'linear-gradient(135deg, rgba(0,245,255,0.09), rgba(0,245,255,0.03))'
                  : isPending
                  ? 'linear-gradient(135deg, rgba(167,139,250,0.09), rgba(167,139,250,0.03))'
                  : 'rgba(0,245,255,0.03)',
                border: `1px solid ${isNew ? 'rgba(0,245,255,0.24)' : isPending ? 'rgba(167,139,250,0.24)' : 'rgba(0,245,255,0.09)'}`,
                borderRadius: 12,
                boxShadow: isNew || isPending ? `0 0 18px ${accentColor}12` : 'none',
              }}
            >
              <div className="metric-tile-label">{label}</div>
              <div
                className="metric-tile-value"
                style={{
                  color: isZero ? 'rgba(100,130,160,0.45)' : accentColor,
                  textShadow: isHighlight && !isZero ? `0 0 14px ${accentColor}55` : 'none',
                }}
              >
                {value}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── GPT 분석 텍스트 영역 ── */}
      {analysisText && (
        <div className="order-analysis-area">
          <div className="order-analysis-title">◈ JARVIS ANALYSIS</div>
          <div className="order-analysis-text">{analysisText}</div>
        </div>
      )}
      {fetchTime && (
        <div style={{
          fontSize: '0.5rem', color: 'rgba(148,163,184,0.3)',
          textAlign: 'right', fontFamily: 'monospace', letterSpacing: '0.05em',
          flexShrink: 0,
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
          <div
            key={msg.id}
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
          </div>
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
  // ── 최초 등장 1회만 staged entrance 실행 ──
  // useState로 관리하여 animate prop이 'visible'로 안정적으로 유지되도록 함
  const [animateState, setAnimateState] = useState<'hidden' | 'visible'>('hidden');
  const hasEnteredRef = useRef(false);

  useEffect(() => {
    if (visible) {
      if (!hasEnteredRef.current) {
        hasEnteredRef.current = true;
        // 최초 등장: hidden → visible 트랜지션 실행
        setAnimateState('visible');
      }
      // 이미 entered: animateState는 'visible' 유지 (재트랜지션 없음)
    } else {
      // 닫힐 때: 다음 열림 시 다시 entrance 실행하도록 리셋
      hasEnteredRef.current = false;
      setAnimateState('hidden');
    }
  }, [visible]);

  if (!visible) return null;

  const hasActionContext = !!actionContext && actionContext.type === 'smartstore';

  return (
    <>
      {/* ── Stage 1: scc-dim (배경 opacity 위주, 120~180ms) ── */}
      <motion.div
        className="scc-dim"
        variants={dimVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      />

      {/* ── scc-stage: 위치 담당 ── */}
      <div className="scc-stage">
        {/* ── Stage 2: workspace shell (scale 0.985→1, y 8→0, 220~320ms) ── */}
        <motion.div
          className="scc-workspace order-focus-layout"
          variants={workspaceVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {/* 배경 그리드 오버레이 */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `
              linear-gradient(rgba(34,211,238,0.022) 1px, transparent 1px),
              linear-gradient(90deg, rgba(34,211,238,0.022) 1px, transparent 1px)
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

          {/* ── status: Mission Status Strip ── */}
          <div className="order-focus-status" style={{ position: 'relative', zIndex: 1 }}>
            <MissionStatusStrip />
          </div>

          {/* ── brief: Compact Brief Strip ── */}
          <div className="order-focus-brief" style={{ position: 'relative', zIndex: 1 }}>
            <DailyBriefPanel orderData={orderData} variant="horizontal" />
          </div>

          {/* ── Stage 3+4: main 주문현황 compact metric tiles ── */}
          <motion.div
            className="order-focus-main"
            variants={mainVariants}
            initial="hidden"
            animate={animateState}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <OrderResultCard messages={messages} animateState={animateState} />
          </motion.div>

          {/* ── Stage 5: side (오른쪽에서 12~14px 미세하게 들어옴) ── */}
          <motion.div
            className="order-focus-side"
            variants={sideVariants}
            initial="hidden"
            animate={animateState}
            style={{ position: 'relative', zIndex: 1 }}
          >
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
            <div className="sidecar-approval">
              <ApprovalQueuePanel />
            </div>
          </motion.div>

          {/* ── Stage 6: flow + log (마지막에 은은하게) ── */}
          <motion.div
            className="order-focus-flow"
            variants={bottomVariants}
            initial="hidden"
            animate={animateState}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <OrderFlowRadar variant="horizontal" />
          </motion.div>

          <motion.div
            className="order-focus-log"
            variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { delay: 0.5, duration: 0.28, ease: EASE_OUT_QUART } } }}
            initial="hidden"
            animate={animateState}
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
