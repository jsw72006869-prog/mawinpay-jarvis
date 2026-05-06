/**
 * ActionCard.tsx — Phase UI-C
 * 
 * 상황별 액션 추천 카드 + 클릭 가능 버튼 + Approval Preview (disabled)
 * + Visual Workflow Timeline
 * 
 * 버튼 클릭 시 safe action만 실행 (observe/draft)
 * execute 작업은 Approval Preview로만 표시 (disabled)
 */

import { motion, AnimatePresence } from 'framer-motion';

// ── Types ──
export type ActionMode = 'observe' | 'draft' | 'execute';

export interface ActionButton {
  id: string;
  label: string;
  icon: string;
  mode: ActionMode;
  command: string; // 실제 실행할 명령 (음성 선택과 동일하게 처리)
  disabled?: boolean;
}

export interface ActionContext {
  type: 'smartstore' | 'creative' | 'growth_link' | 'briefing' | 'general';
  newOrders?: number;
  pendingShipping?: number;
  product?: string;
  contentType?: string;
}

export interface WorkflowStep {
  id: string;
  label: string;
  status: 'completed' | 'active' | 'pending';
  timestamp?: string;
}

interface ActionCardProps {
  context: ActionContext;
  onActionSelect: (command: string) => void;
  onDismiss: () => void;
  workflowSteps?: WorkflowStep[];
}

// ── Theme ──
const THEME = {
  bg: 'rgba(6,10,18,0.92)',
  border: 'rgba(0,245,255,0.18)',
  text: 'rgba(224,242,254,0.95)',
  textDim: 'rgba(148,163,184,0.7)',
  cyan: '#00F5FF',
  gold: '#C8A96E',
  green: '#22C55E',
  red: '#EF4444',
  purple: '#A855F7',
  btnBg: 'rgba(0,40,80,0.4)',
  btnBorder: 'rgba(0,245,255,0.25)',
  btnHover: 'rgba(0,245,255,0.12)',
  disabledBg: 'rgba(30,30,30,0.4)',
  disabledBorder: 'rgba(100,100,100,0.2)',
};

// ── Action Recommendations by Context ──
function getRecommendedActions(context: ActionContext): ActionButton[] {
  const { type, newOrders = 0, pendingShipping = 0 } = context;

  if (type === 'smartstore') {
    // A. 신규주문 0건 + 배송준비 있음
    if (newOrders === 0 && pendingShipping > 0) {
      return [
        { id: 'view_pending', label: '배송준비 목록 보기', icon: '📋', mode: 'observe', command: '배송준비 목록 보여줘' },
        { id: 'prep_invoice', label: '송장 입력 준비', icon: '🏷️', mode: 'execute', command: '송장 입력 준비', disabled: true },
        { id: 'draft_po', label: '발주서 초안 만들기', icon: '📝', mode: 'draft', command: '발주서 초안 만들어줘' },
        { id: 'later', label: '나중에 하기', icon: '⏸️', mode: 'observe', command: '' },
      ];
    }
    // B. 신규주문 있음
    if (newOrders > 0) {
      return [
        { id: 'view_new', label: '신규주문 목록 보기', icon: '📦', mode: 'observe', command: '신규주문 목록 보여줘' },
        { id: 'draft_po', label: '발주서 초안 만들기', icon: '📝', mode: 'draft', command: '발주서 초안 만들어줘' },
        { id: 'confirm_preview', label: '발주확인 Preview', icon: '✅', mode: 'execute', command: '발주확인 미리보기', disabled: true },
        { id: 'later', label: '나중에 하기', icon: '⏸️', mode: 'observe', command: '' },
      ];
    }
    // 기본 (모두 0건)
    return [
      { id: 'briefing', label: '오늘 브리핑', icon: '📊', mode: 'observe', command: '오늘 브리핑 해줘' },
      { id: 'creative', label: '마케팅 문구 만들기', icon: '✨', mode: 'draft', command: '마케팅 문구 만들어줘' },
      { id: 'later', label: '나중에 하기', icon: '⏸️', mode: 'observe', command: '' },
    ];
  }

  if (type === 'creative') {
    return [
      { id: 'to_insta', label: '인스타 문구로 변환', icon: '📸', mode: 'draft', command: `${context.product || ''} 인스타 문구로 변환해줘` },
      { id: 'to_thread', label: '스레드 글로 변환', icon: '🧵', mode: 'draft', command: `${context.product || ''} 스레드 글로 변환해줘` },
      { id: 'to_kakao', label: '카카오톡 공지로 변환', icon: '💬', mode: 'draft', command: `${context.product || ''} 카카오톡 공지문 만들어줘` },
      { id: 'growth_link', label: 'Growth Link 만들기', icon: '🔗', mode: 'draft', command: `${context.product || ''} Growth Link 만들어줘` },
      { id: 'save', label: '저장하기', icon: '💾', mode: 'observe', command: '콘텐츠 저장해줘' },
    ];
  }

  if (type === 'growth_link') {
    return [
      { id: 'copy_link', label: '링크 복사', icon: '📋', mode: 'observe', command: '링크 복사' },
      { id: 'kakao_text', label: '카카오용 문구 만들기', icon: '💬', mode: 'draft', command: '카카오톡 공유 문구 만들어줘' },
      { id: 'insta_text', label: '인스타용 문구 만들기', icon: '📸', mode: 'draft', command: '인스타 공유 문구 만들어줘' },
      { id: 'save_campaign', label: '캠페인 저장', icon: '💾', mode: 'observe', command: '캠페인 저장해줘' },
      { id: 'later', label: '나중에 하기', icon: '⏸️', mode: 'observe', command: '' },
    ];
  }

  if (type === 'briefing') {
    return [
      { id: 'view_pending', label: '배송준비 목록 보기', icon: '📋', mode: 'observe', command: '배송준비 목록 보여줘' },
      { id: 'draft_po', label: '발주서 초안 만들기', icon: '📝', mode: 'draft', command: '발주서 초안 만들어줘' },
      { id: 'creative', label: '마케팅 문구 만들기', icon: '✨', mode: 'draft', command: '마케팅 문구 만들어줘' },
      { id: 'later', label: '나중에 하기', icon: '⏸️', mode: 'observe', command: '' },
    ];
  }

  // general
  return [
    { id: 'briefing', label: '오늘 브리핑', icon: '📊', mode: 'observe', command: '오늘 브리핑 해줘' },
    { id: 'orders', label: '주문 현황 보기', icon: '📦', mode: 'observe', command: '현재 신규주문 몇 개야?' },
    { id: 'creative', label: '마케팅 문구 만들기', icon: '✨', mode: 'draft', command: '마케팅 문구 만들어줘' },
    { id: 'later', label: '나중에 하기', icon: '⏸️', mode: 'observe', command: '' },
  ];
}

// ── Mode Badge ──
function ModeBadge({ mode }: { mode: ActionMode }) {
  const colors = {
    observe: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', text: '#22C55E', label: 'OBSERVE' },
    draft: { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', text: '#A855F7', label: 'DRAFT' },
    execute: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', text: '#EF4444', label: 'EXECUTE' },
  };
  const c = colors[mode];
  return (
    <span style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 3,
      padding: '1px 5px',
      fontSize: '0.42rem',
      fontFamily: 'Orbitron, monospace',
      color: c.text,
      letterSpacing: '0.08em',
    }}>
      {c.label}
    </span>
  );
}

// ── Workflow Timeline ──
function WorkflowTimeline({ steps }: { steps: WorkflowStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div style={{
      borderTop: '1px solid rgba(0,245,255,0.08)',
      padding: '10px 0 4px',
      marginTop: 10,
    }}>
      <div style={{
        fontFamily: 'Orbitron, monospace',
        fontSize: '0.45rem',
        color: THEME.textDim,
        letterSpacing: '0.12em',
        marginBottom: 8,
      }}>
        ◈ WORKFLOW
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const statusColor = step.status === 'completed' ? THEME.green
            : step.status === 'active' ? THEME.cyan
            : THEME.textDim;
          const statusIcon = step.status === 'completed' ? '✓'
            : step.status === 'active' ? '●'
            : '○';
          return (
            <div key={step.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              {/* Timeline line + dot */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14 }}>
                <span style={{
                  fontSize: step.status === 'active' ? '0.6rem' : '0.5rem',
                  color: statusColor,
                  lineHeight: 1,
                }}>
                  {statusIcon}
                </span>
                {!isLast && (
                  <div style={{
                    width: 1,
                    height: 12,
                    background: `linear-gradient(to bottom, ${statusColor}, rgba(100,100,100,0.2))`,
                    marginTop: 2,
                  }} />
                )}
              </div>
              {/* Label */}
              <div style={{ flex: 1 }}>
                <span style={{
                  fontSize: '0.68rem',
                  color: step.status === 'active' ? THEME.text : THEME.textDim,
                  fontWeight: step.status === 'active' ? 600 : 400,
                }}>
                  {step.label}
                </span>
                {step.timestamp && (
                  <span style={{
                    fontSize: '0.45rem',
                    color: 'rgba(100,116,139,0.4)',
                    marginLeft: 8,
                    fontFamily: 'Orbitron, monospace',
                  }}>
                    {step.timestamp}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ActionCard Component ──
export default function ActionCard({ context, onActionSelect, onDismiss, workflowSteps = [] }: ActionCardProps) {
  const actions = getRecommendedActions(context);

  // Context description
  const contextDescription = (() => {
    const { type, newOrders = 0, pendingShipping = 0 } = context;
    if (type === 'smartstore') {
      if (newOrders === 0 && pendingShipping > 0) {
        return `현재 신규주문은 없고 배송준비 ${pendingShipping}건이 있습니다. 오늘은 송장/출고 상태 확인이 우선입니다.`;
      }
      if (newOrders > 0) {
        return `발주확인 대상 신규주문 ${newOrders}건이 있습니다. 확인 후 발주서 초안을 만들 수 있습니다.`;
      }
      return '현재 처리 대상 주문이 없습니다.';
    }
    if (type === 'creative') return '콘텐츠가 생성되었습니다. 다른 플랫폼으로 변환하거나 저장할 수 있습니다.';
    if (type === 'growth_link') return 'Growth Link가 생성되었습니다. 공유 문구를 만들거나 캠페인을 저장할 수 있습니다.';
    if (type === 'briefing') return '브리핑이 완료되었습니다. 다음 업무를 선택해 주세요.';
    return '다음 작업을 선택해 주세요.';
  })();

  const handleClick = (action: ActionButton) => {
    if (action.disabled) return;
    if (action.id === 'later') {
      onDismiss();
      return;
    }
    onActionSelect(action.command);
  };

  return (
    <AnimatePresence>
      {
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          style={{
            background: 'linear-gradient(135deg, rgba(6,15,30,0.9), rgba(0,10,25,0.85))',
            border: `1px solid ${THEME.border}`,
            borderRadius: 14,
            padding: '14px 16px',
            marginTop: 10,
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <div style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.5rem',
              color: THEME.green,
              letterSpacing: '0.12em',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span style={{ fontSize: '0.7rem' }}>◈</span>
              NEXT ACTIONS
            </div>
            <button
              onClick={() => onDismiss()}
              style={{
                background: 'none',
                border: 'none',
                color: THEME.textDim,
                fontSize: '0.7rem',
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: 4,
              }}
            >
              ✕
            </button>
          </div>

          {/* Context Description */}
          <p style={{
            fontSize: '0.75rem',
            color: THEME.textDim,
            margin: '0 0 12px 0',
            lineHeight: 1.5,
          }}>
            {contextDescription}
          </p>

          {/* Action Buttons Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
          }}>
            {actions.map((action) => (
              <motion.button
                key={action.id}
                whileHover={action.disabled ? {} : { scale: 1.02 }}
                whileTap={action.disabled ? {} : { scale: 0.97 }}
                onClick={() => handleClick(action)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 4,
                  padding: '10px 12px',
                  background: action.disabled ? THEME.disabledBg : THEME.btnBg,
                  border: `1px solid ${action.disabled ? THEME.disabledBorder : THEME.btnBorder}`,
                  borderRadius: 10,
                  cursor: action.disabled ? 'not-allowed' : 'pointer',
                  opacity: action.disabled ? 0.5 : 1,
                  textAlign: 'left',
                  transition: 'background 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                  <span style={{ fontSize: '0.9rem' }}>{action.icon}</span>
                  <span style={{
                    fontSize: '0.72rem',
                    color: action.disabled ? THEME.textDim : THEME.text,
                    fontWeight: 500,
                    flex: 1,
                  }}>
                    {action.label}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ModeBadge mode={action.mode} />
                  {action.disabled && (
                    <span style={{
                      fontSize: '0.4rem',
                      color: THEME.red,
                      fontFamily: 'Orbitron, monospace',
                    }}>
                      LOCKED
                    </span>
                  )}
                </div>
              </motion.button>
            ))}
          </div>

          {/* Workflow Timeline */}
          {workflowSteps.length > 0 && <WorkflowTimeline steps={workflowSteps} />}

          {/* Voice Hint */}
          <div style={{
            marginTop: 10,
            padding: '6px 10px',
            background: 'rgba(0,245,255,0.03)',
            borderRadius: 6,
            border: '1px solid rgba(0,245,255,0.06)',
          }}>
            <span style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.42rem',
              color: THEME.textDim,
              letterSpacing: '0.08em',
            }}>
              💡 음성으로도 선택 가능: "{actions.find(a => !a.disabled && a.id !== 'later')?.label || '명령'}"
            </span>
          </div>
        </motion.div>
      }
    </AnimatePresence>
  );
}

// ── Export utility for voice matching ──
export function matchVoiceToAction(voiceText: string, context: ActionContext): string | null {
  const actions = getRecommendedActions(context);
  const normalized = voiceText.toLowerCase().trim();
  
  for (const action of actions) {
    if (action.disabled) continue;
    if (action.id === 'later' && (normalized.includes('나중에') || normalized.includes('다음에') || normalized.includes('됐어'))) {
      return '';
    }
    // Label match
    if (normalized.includes(action.label.replace(/\s/g, '').toLowerCase())) return action.command;
    // Partial keyword match
    const keywords = action.label.split(/\s+/);
    const matchCount = keywords.filter(k => normalized.includes(k.toLowerCase())).length;
    if (matchCount >= 2 || (keywords.length <= 2 && matchCount >= 1 && normalized.length < 20)) {
      return action.command;
    }
  }
  return null;
}

// ── Export helper to build workflow steps ──
export function buildWorkflowSteps(context: ActionContext, currentStep?: string): WorkflowStep[] {
  const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  
  if (context.type === 'smartstore') {
    return [
      { id: 'query', label: '주문 현황 조회 완료', status: 'completed', timestamp: now },
      { id: 'analyze', label: `배송준비 ${context.pendingShipping || 0}건 확인`, status: 'completed', timestamp: now },
      { id: 'recommend', label: '추천 액션 생성 완료', status: 'completed', timestamp: now },
      { id: 'waiting', label: '대표님 선택 대기 중', status: 'active' },
    ];
  }
  if (context.type === 'creative') {
    return [
      { id: 'generate', label: '콘텐츠 생성 완료', status: 'completed', timestamp: now },
      { id: 'review', label: '결과 표시 완료', status: 'completed', timestamp: now },
      { id: 'waiting', label: '다음 작업 선택 대기 중', status: 'active' },
    ];
  }
  if (context.type === 'briefing') {
    return [
      { id: 'collect', label: '데이터 수집 완료', status: 'completed', timestamp: now },
      { id: 'briefing', label: '브리핑 보고 완료', status: 'completed', timestamp: now },
      { id: 'recommend', label: '업무 추천 생성 완료', status: 'completed', timestamp: now },
      { id: 'waiting', label: '대표님 선택 대기 중', status: 'active' },
    ];
  }
  return [
    { id: 'complete', label: '작업 완료', status: 'completed', timestamp: now },
    { id: 'waiting', label: '다음 명령 대기 중', status: 'active' },
  ];
}
