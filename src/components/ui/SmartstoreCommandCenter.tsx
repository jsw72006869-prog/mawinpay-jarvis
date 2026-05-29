import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  fullOrderSummary?: {
    productOrderCount?: number;
    totalOrderQuantity?: number;
    actionBuckets?: {
      confirmNeededCount?: number;
      pendingShippingCount?: number;
      preShipTotal?: number;
    };
    dataReliable?: boolean;
    source?: string;
  };
  fetchedAt?: string | null;
  source?: string;
  dataReliable?: boolean;
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
  purchaseOrderBulkPreview?: any | null;
  onActionSelect?: (cmd: string) => void;
  onActionDismiss?: () => void;
  onApprovalDismiss?: () => void;
  onSupplierCarrierSave?: (group: any, carrier: 'lotte' | 'logen') => void;
  onSupplierEmailSave?: (group: any, email: string) => void;
}

// ── Premium cubic-bezier easings ──
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;
const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const; // 약간 스프링감

// ── Staged entrance variants ──
const workspaceVariants: import('framer-motion').Variants = {
  hidden: { opacity: 0, scale: 0.985, y: 8 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { duration: 0.32, ease: EASE_OUT_EXPO as unknown as import('framer-motion').Easing },
  },
  exit: {
    opacity: 0, scale: 0.99,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as unknown as import('framer-motion').Easing },
  },
};

const dimVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};

// ── 패널별 reveal variants (Staged Panel Reveal) ──
// 각 패널이 서로 다른 방향에서 등장하여 시각적 다양성 제공
const makeRevealVariants = (
  fromDir: 'up' | 'down' | 'left' | 'right',
  delay = 0,
  duration = 0.42
) => {
  const offset = 18;
  const from = {
    up: { y: offset, x: 0 },
    down: { y: -offset, x: 0 },
    left: { x: offset, y: 0 },
    right: { x: -offset, y: 0 },
  }[fromDir];
  return {
    hidden: { opacity: 0, ...from, scale: 0.97 },
    visible: {
      opacity: 1, x: 0, y: 0, scale: 1,
      transition: { delay, duration, ease: EASE_SPRING },
    },
  };
};

// 각 패널별 reveal variants
const mainRevealVariants = makeRevealVariants('up', 0, 0.44);
const sideRevealVariants = makeRevealVariants('left', 0, 0.44);
const flowRevealVariants = makeRevealVariants('down', 0, 0.38);
const logRevealVariants = makeRevealVariants('down', 0, 0.38);

// 레거시 호환 (기존 코드에서 참조)
const mainVariants = makeRevealVariants('up', 0.18, 0.38);
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
const sideVariants = makeRevealVariants('left', 0.32, 0.32);
const bottomVariants = makeRevealVariants('down', 0.44, 0.3);

// ── Staged Panel Reveal 타이밍 설정 ──
// 자비스가 말하는 동안 패널이 순서대로 등장
const PANEL_REVEAL_DELAYS: Record<string, number> = {
  status: 0,      // 즉시
  brief: 200,     // 0.2초 후
  main: 700,      // 0.7초 후 (자비스 첫 문장 이후)
  side: 1400,     // 1.4초 후
  flow: 2100,     // 2.1초 후
  log: 2800,      // 2.8초 후 (마지막)
};

// 브리핑 메시지 감지 시 더 빠른 타이밍
const BRIEFING_REVEAL_DELAYS: Record<string, number> = {
  status: 0,
  brief: 150,
  main: 500,
  side: 1000,
  flow: 1600,
  log: 2200,
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
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: '100%', flexShrink: 0, alignContent: 'flex-start', alignSelf: 'flex-start' }}
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

// ── 브리핑 타입 감지 헬퍼 ──
function isBriefingMessage(text: string): boolean {
  return (
    text.includes('커맨드 리포트') ||
    text.includes('자비스 일일') ||
    text.includes('[1. 스마트스토어 현황]') ||
    text.includes('[스마트스토어]') ||
    (text.startsWith('[LIST]') && (text.includes('브리핑') || text.includes('리포트')))
  );
}

// ── 브리핑 섹션 아이콘/색상 ──
const BRIEF_SECTION_ICONS: Record<string, { icon: string; color: string }> = {
  '주문': { icon: '📦', color: '#00F5FF' },
  '스마트스토어': { icon: '🛒', color: '#00F5FF' },
  '콘텐츠': { icon: '✍️', color: '#E040FB' },
  '아우트리치': { icon: '📧', color: '#00FF88' },
  '시장 가격': { icon: '📊', color: '#FF9800' },
  '농산물': { icon: '🌾', color: '#FF9800' },
  '자비스 기능': { icon: '🤖', color: '#C8A96E' },
  '기능': { icon: '🤖', color: '#C8A96E' },
  '추천 액션': { icon: '🚀', color: '#76FF03' },
  '액션': { icon: '🚀', color: '#76FF03' },
  '시스템': { icon: '🛡️', color: '#00F5FF' },
};

function getBriefSectionMeta(title: string) {
  for (const [key, meta] of Object.entries(BRIEF_SECTION_ICONS)) {
    if (title.includes(key)) return meta;
  }
  return { icon: '◈', color: '#C8A96E' };
}

// ── 인라인 BriefingCard (SCC 전용) ──
function SccBriefingCard({ text }: { text: string }) {
  const sections = text.replace('[LIST]', '').trim().split(/\*\*\[/).filter(Boolean);
  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(6,12,24,0.95), rgba(0,8,20,0.9))',
      border: '1px solid rgba(200,169,110,0.2)',
      borderRadius: 12,
      padding: '14px 16px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    }}>
      {/* 헤더 */}
      <div style={{
        fontFamily: 'Orbitron, monospace', fontSize: '0.52rem',
        color: '#C8A96E', letterSpacing: '0.18em',
        marginBottom: 12, paddingBottom: 8,
        borderBottom: '1px solid rgba(200,169,110,0.15)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontSize: '0.8rem', filter: 'drop-shadow(0 0 4px rgba(200,169,110,0.5))' }}>◈</span>
        MORNING BRIEFING v3.0
        <span style={{ marginLeft: 'auto', fontSize: '0.42rem', color: 'rgba(148,163,184,0.5)' }}>
          {new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
        </span>
      </div>
      {/* 섹션들 */}
      {sections.map((section, i) => {
        const titleEnd = section.indexOf(']');
        const sectionTitle = titleEnd > 0 ? section.substring(0, titleEnd).replace(/\*\*/g, '') : '';
        const content = titleEnd > 0 ? section.substring(titleEnd + 1) : section;
        const items = content.split('\n').filter(l => l.trim().startsWith('-'));
        const meta = getBriefSectionMeta(sectionTitle);
        return (
          <div key={i} style={{
            marginBottom: i < sections.length - 1 ? 10 : 0,
            padding: '8px 10px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 8,
            borderLeft: `3px solid ${meta.color}44`,
          }}>
            {sectionTitle && (
              <div style={{
                fontSize: '0.65rem', fontWeight: 600, color: meta.color,
                marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ fontSize: '0.75rem' }}>{meta.icon}</span>
                {sectionTitle}
              </div>
            )}
            {items.map((item, j) => {
              const cleaned = item.replace(/^-\s*/, '').replace(/\*\*/g, '');
              const parts = cleaned.split(/[:：]/);
              const label = parts[0]?.trim() || '';
              const value = parts.slice(1).join(':').trim() || '';
              const isNumber = /\d+건|\d+원|\d+명|\d+%/.test(value);
              const isZero = /^0건$/.test(value.trim());
              return (
                <div key={j} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 0',
                  borderBottom: j < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <span style={{ fontSize: '0.68rem', color: 'rgba(180,195,210,0.8)' }}>{label}</span>
                  <span style={{
                    fontSize: isNumber ? '0.78rem' : '0.68rem',
                    fontWeight: isNumber ? 700 : 400,
                    color: isZero ? 'rgba(100,120,140,0.6)' : isNumber ? meta.color : 'rgba(224,242,254,0.9)',
                    fontFamily: isNumber ? 'Orbitron, monospace' : 'Inter, sans-serif',
                  }}>
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Dialogue Log (mission-log 슬롯) ──
function DialogueLog({ messages, isTyping }: { messages: Message[]; isTyping?: boolean }) {
  // 최근 메시지 중 브리핑이 있으면 전체 표시, 없으면 최근 4개
  const lastBriefingIdx = [...messages].reverse().findIndex(
    m => m.role === 'jarvis' && isBriefingMessage(m.text)
  );
  const hasBriefing = lastBriefingIdx !== -1;
  const recentMessages = hasBriefing ? messages.slice(-Math.max(4, messages.length - lastBriefingIdx + 1)) : messages.slice(-4);

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
      {recentMessages.map((msg) => {
        const isJarvis = msg.role === 'jarvis';
        const isCompletion = msg.isCompletion;
        const isPkg = msg.text.includes('[PKG]');
        const isBriefing = isJarvis && isBriefingMessage(msg.text);

        if (isBriefing) {
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{
                fontFamily: 'Orbitron, monospace', fontSize: '0.42rem',
                color: '#C8A96E', letterSpacing: '0.1em',
              }}>
                ◈ MORNING BRIEFING
              </span>
              <SccBriefingCard text={msg.text} />
            </div>
          );
        }

        const displayText = isPkg
          ? '◈ 주문 현황 조회 완료'
          : msg.text.replace('[LIST]', '').replace('[PKG]', '').trim();

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
              lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
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
  purchaseOrderBulkPreview,
  onActionSelect,
  onActionDismiss,
  onApprovalDismiss,
  onSupplierCarrierSave,
  onSupplierEmailSave,
}: Props) {
  // ── 기본 animate 상태 ──
  const [animateState, setAnimateState] = useState<'hidden' | 'visible'>('hidden');
  const hasEnteredRef = useRef(false);
  const [supplierEmailDrafts, setSupplierEmailDrafts] = useState<Record<string, string>>({});

  // ── Staged Panel Reveal: 패널별 표시 상태 ──
  // 각 패널이 순서대로 등장하도록 개별 제어
  const [panelVisible, setPanelVisible] = useState({
    status: false,
    brief: false,
    main: false,
    side: false,
    flow: false,
    log: false,
  });
  const revealTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastMessageCountRef = useRef(0);
  const lastJarvisMessageRef = useRef('');

  // 패널 순차 reveal 함수
  const triggerStagedReveal = useCallback((isBriefing = false) => {
    // 기존 타이머 정리
    revealTimersRef.current.forEach(t => clearTimeout(t));
    revealTimersRef.current = [];

    const delays = isBriefing ? BRIEFING_REVEAL_DELAYS : PANEL_REVEAL_DELAYS;
    const panels: (keyof typeof panelVisible)[] = ['status', 'brief', 'main', 'side', 'flow', 'log'];

    // 우선 모두 숨기기 (status/brief는 즉시 표시)
    setPanelVisible({ status: true, brief: true, main: false, side: false, flow: false, log: false });

    panels.slice(2).forEach(panel => {
      const t = setTimeout(() => {
        setPanelVisible(prev => ({ ...prev, [panel]: true }));
      }, delays[panel]);
      revealTimersRef.current.push(t);
    });
  }, []);

  // 자비스 메시지 변경 감지 → 새 메시지 등장 시 staged reveal 트리거
  useEffect(() => {
    if (!visible) return;
    const jarvisMessages = messages.filter(m => m.role === 'jarvis');
    if (jarvisMessages.length === 0) return;
    const lastMsg = jarvisMessages[jarvisMessages.length - 1];
    // 새 자비스 메시지인지 확인
    if (lastMsg.id !== lastJarvisMessageRef.current) {
      lastJarvisMessageRef.current = lastMsg.id;
      const isBriefing = isBriefingMessage(lastMsg.text);
      triggerStagedReveal(isBriefing);
    }
  }, [messages, visible, triggerStagedReveal]);

  useEffect(() => {
    if (visible) {
      if (!hasEnteredRef.current) {
        hasEnteredRef.current = true;
        setAnimateState('visible');
        // 워크스페이스 열릴 때 기본 패널 즐시 표시
        setPanelVisible({ status: true, brief: true, main: false, side: false, flow: false, log: false });
      }
    } else {
      hasEnteredRef.current = false;
      setAnimateState('hidden');
      // 닫힐 때 모두 숨기기
      revealTimersRef.current.forEach(t => clearTimeout(t));
      setPanelVisible({ status: false, brief: false, main: false, side: false, flow: false, log: false });
      lastJarvisMessageRef.current = '';
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
          data-testid="smartstore-workspace"
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

          {/* ── status: Mission Status Strip (Staged Panel Reveal - 즉시) ── */}
          <motion.div
            className="order-focus-status"
            variants={makeRevealVariants('down', 0, 0.32)}
            initial="hidden"
            animate={panelVisible.status ? 'visible' : 'hidden'}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <MissionStatusStrip />
          </motion.div>

          {/* ── brief: Compact Brief Strip (Staged Panel Reveal - 0.15~0.2초) ── */}
          <motion.div
            className="order-focus-brief"
            variants={makeRevealVariants('down', 0, 0.36)}
            initial="hidden"
            animate={panelVisible.brief ? 'visible' : 'hidden'}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <DailyBriefPanel orderData={orderData} variant="horizontal" />
            <div style={{
              marginTop: 6,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              fontSize: '10px',
              color: orderData?.dataReliable === false ? '#ffb86b' : 'rgba(148,163,184,0.65)',
              letterSpacing: '0.04em',
            }}>
              <span>ProductOrderId 기준</span>
              {orderData?.dataReliable === false && <span>API 상태 확인 필요</span>}
            </div>
          </motion.div>

          {/* ── main: 주문현황 (Staged Panel Reveal - 자비스 첫 말 이후) ── */}
          <AnimatePresence>
            {panelVisible.main && (
              <motion.div
                className="order-focus-main"
                key="panel-main"
                variants={mainRevealVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.2 } }}
                style={{ position: 'relative', zIndex: 1 }}
              >
                <OrderResultCard messages={messages} animateState={animateState} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── side: Next Actions + Approval (Staged Panel Reveal - 중반) ── */}
          <AnimatePresence>
            {panelVisible.side && (
              <motion.div
                className="order-focus-side"
                key="panel-side"
                variants={sideRevealVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, x: 14, transition: { duration: 0.2 } }}
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
                  {purchaseOrderBulkPreview?.summary && (
                    <div
                      data-testid="purchase-order-bulk-preview"
                      style={{
                        marginTop: 10,
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid rgba(34,211,238,0.16)',
                        background: 'rgba(2,8,23,0.72)',
                      }}
                    >
                      <div style={{
                        fontFamily: 'Orbitron, monospace',
                        fontSize: '0.5rem',
                        letterSpacing: '0.14em',
                        color: '#22d3ee',
                        marginBottom: 8,
                      }}>
                        BULK PURCHASE ORDER
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                        {[
                          ['전체 대상', `${purchaseOrderBulkPreview.summary.totalProductOrderCount || 0}건`],
                          ['전체 수량', `${purchaseOrderBulkPreview.summary.totalQuantity || 0}개`],
                          ['상품군', `${purchaseOrderBulkPreview.summary.groupCount || 0}개`],
                          ['이메일 필요', `${purchaseOrderBulkPreview.summary.emailMissingGroupCount || 0}곳`],
                        ].map(([label, value]) => (
                          <div key={label} style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '7px 8px' }}>
                            <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.72)' }}>{label}</div>
                            <div style={{ fontSize: 14, color: '#e0f2fe', fontWeight: 800 }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {(purchaseOrderBulkPreview.groups || []).slice(0, 4).map((group: any) => (
                          <div key={group.groupId} style={{ fontSize: 11, color: 'rgba(226,232,240,0.86)', lineHeight: 1.45 }}>
                            <strong>{group.productGroupName}</strong> {group.totalQuantity}개 · {group.carrierName || group.carrier} · {group.emailConfigured ? group.emailMasked : '이메일 필요'}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        {(purchaseOrderBulkPreview.groups || []).slice(0, 4).map((group: any) => {
                          const draftKey = group.groupId || group.productGroupCode;
                          const emailDraft = supplierEmailDrafts[draftKey] || '';
                          return (
                            <div key={`${group.groupId}-settings`} style={{ fontSize: 11, color: 'rgba(226,232,240,0.86)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 8 }}>
                      {group.routingStatus === 'carrier_missing' && (
                                <div data-testid="purchase-order-group-card" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <span style={{ color: '#fbbf24' }}>택배사 설정 필요</span>
                                  <button data-testid="carrier-save-logen-button" type="button" onClick={() => onSupplierCarrierSave?.(group, 'logen')} style={{ fontSize: 10, padding: '4px 7px', borderRadius: 6, border: '1px solid rgba(34,211,238,0.3)', background: 'rgba(34,211,238,0.08)', color: '#bae6fd' }}>로젠으로 저장</button>
                                  <button data-testid="carrier-save-lotte-button" type="button" onClick={() => onSupplierCarrierSave?.(group, 'lotte')} style={{ fontSize: 10, padding: '4px 7px', borderRadius: 6, border: '1px solid rgba(34,211,238,0.3)', background: 'rgba(34,211,238,0.08)', color: '#bae6fd' }}>롯데로 저장</button>
                                </div>
                              )}
                              {!group.emailConfigured && group.productGroupCode !== 'unknown' && (
                                <div style={{ display: 'flex', gap: 6, marginTop: group.routingStatus === 'carrier_missing' ? 6 : 0, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <span style={{ color: '#fbbf24' }}>발주처 이메일 필요</span>
                                  <input
                                    data-testid="supplier-email-input"
                                    value={emailDraft}
                                    onChange={event => setSupplierEmailDrafts(prev => ({ ...prev, [draftKey]: event.target.value }))}
                                    placeholder="email"
                                    type="email"
                                    style={{ minWidth: 150, flex: '1 1 150px', background: 'rgba(15,23,42,0.88)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, color: '#e5e7eb', padding: '4px 6px', fontSize: 11 }}
                                  />
                                  <button
                                    data-testid="supplier-email-save-button"
                                    type="button"
                                    onClick={() => {
                                      onSupplierEmailSave?.(group, emailDraft);
                                      setSupplierEmailDrafts(prev => ({ ...prev, [draftKey]: '' }));
                                    }}
                                    style={{ fontSize: 10, padding: '4px 7px', borderRadius: 6, border: '1px solid rgba(34,197,94,0.32)', background: 'rgba(34,197,94,0.08)', color: '#bbf7d0' }}
                                  >
                                    이메일 저장
                                  </button>
                                </div>
                              )}
                              {group.emailConfigured && (
                                <div data-testid="supplier-email-masked" style={{ marginTop: 5, color: '#bbf7d0' }}>이메일 저장됨: {group.emailMasked}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <div className="sidecar-approval">
                  <ApprovalQueuePanel />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── flow: Order Flow Radar (Staged Panel Reveal - 후반) ── */}
          <AnimatePresence>
            {panelVisible.flow && (
              <motion.div
                className="order-focus-flow"
                key="panel-flow"
                variants={flowRevealVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
                style={{ position: 'relative', zIndex: 1 }}
              >
                <OrderFlowRadar variant="horizontal" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── log: Dialogue Log (Staged Panel Reveal - 마지막) ── */}
          <AnimatePresence>
            {panelVisible.log && (
              <motion.div
                className="order-focus-log"
                key="panel-log"
                variants={logRevealVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
                style={{ position: 'relative', zIndex: 1 }}
              >
          {/* 다이얼로그 로그 헤더 */}
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
            )}
          </AnimatePresence>

        </motion.div>
      </div>
    </>
  );
}
