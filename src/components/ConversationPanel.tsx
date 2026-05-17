/**
 * ConversationPanel.tsx — Phase Prod-B
 * 
 * 대화 패널: STT 인식 결과 표시, 자비스 답변 전문, 스마트스토어 결과 카드,
 * 업무 진행 제안 카드, Approval Preview (disabled)
 * 
 * 기존 ConversationStream의 "하단 자막" 역할을 대체하여
 * 풀 대화 이력 + 시각적 결과 카드를 제공한다.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ──
export interface Message {
  id: string;
  role: 'user' | 'jarvis';
  text: string;
  timestamp: Date;
  isCompletion?: boolean;
}

export type STTStatus = 'idle' | 'listening' | 'transcribing' | 'done';

interface ConversationPanelProps {
  messages: Message[];
  isTyping?: boolean;
  sttStatus: STTStatus;
  isExpanded: boolean;
  onToggleExpand: () => void;

  outreachOffset?: number;
}

// ── Theme Constants ──
const THEME = {
  bg: 'rgba(6,10,18,0.92)',
  border: 'rgba(0,245,255,0.18)',
  borderGold: 'rgba(200,169,110,0.35)',
  text: 'rgba(224,242,254,0.95)',
  textDim: 'rgba(148,163,184,0.7)',
  cyan: '#00F5FF',
  gold: '#C8A96E',
  cardBg: 'rgba(0,20,40,0.6)',
  userBubble: 'rgba(100,180,255,0.08)',
  jarvisBubble: 'rgba(0,102,255,0.06)',
  completionBubble: 'rgba(0,245,255,0.06)',
};

// ── Smartstore Result Card (Mission Control v1) ──
function SmartstoreCard({ text }: { text: string }) {
  const lines = text.replace('[PKG]', '').trim().split('\n').filter(l => l.trim());
  const title = lines[0]?.replace(/\*\*/g, '') || '스마트스토어';
  const dataLines = lines.slice(1).filter(l => l.includes(':') || l.includes('건') || l.includes('원'));

  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(0,20,50,0.9), rgba(0,10,30,0.85))',
      border: '1px solid rgba(0,245,255,0.2)',
      borderRadius: 14,
      padding: '16px 18px',
      marginTop: 8,
      boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(0,245,255,0.08)',
    }}>
      <div style={{
        fontFamily: 'Orbitron, monospace',
        fontSize: '0.55rem',
        color: THEME.cyan,
        letterSpacing: '0.18em',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingBottom: 8,
        borderBottom: '1px solid rgba(0,245,255,0.1)',
      }}>
        <span style={{ fontSize: '0.85rem', filter: 'drop-shadow(0 0 4px rgba(0,245,255,0.5))' }}>◈</span>
        {title}
        <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#00FF88', boxShadow: '0 0 6px #00FF88' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
        {dataLines.map((line, i) => {
          const parts = line.replace(/[-•]/g, '').trim().split(/[:：]/);
          const label = parts[0]?.replace(/\*\*/g, '').trim() || '';
          const value = parts.slice(1).join(':').replace(/\*\*/g, '').trim() || '';
          const isHighlight = value.includes('건') || value.includes('원');
          const isZero = /^0건$/.test(value.trim());
          return (
            <div key={i} style={{
              background: 'rgba(0,245,255,0.03)',
              border: '1px solid rgba(0,245,255,0.1)',
              borderRadius: 10,
              padding: '10px 10px',
              textAlign: 'center',
              transition: 'all 0.2s',
            }}>
              <div style={{ fontSize: '0.6rem', color: 'rgba(140,170,200,0.7)', marginBottom: 4, letterSpacing: '0.05em' }}>{label}</div>
              <div style={{
                fontSize: isHighlight ? '1.05rem' : '0.85rem',
                fontWeight: 700,
                color: isZero ? 'rgba(100,130,160,0.5)' : isHighlight ? THEME.cyan : THEME.text,
                fontFamily: isHighlight ? 'Orbitron, monospace' : 'Inter, sans-serif',
                textShadow: isHighlight && !isZero ? '0 0 10px rgba(0,245,255,0.4)' : 'none',
              }}>
                {value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Briefing Card (Mission Control v1) ──
const SECTION_ICONS: Record<string, { icon: string; color: string }> = {
  '주문': { icon: '📦', color: '#00F5FF' },
  '스마트스토어': { icon: '🛒', color: '#00F5FF' },
  '매출': { icon: '💰', color: '#00FF88' },
  '시장': { icon: '📊', color: '#FF9800' },
  '마케팅': { icon: '🎯', color: '#E040FB' },
  '할일': { icon: '✅', color: '#76FF03' },
  '일정': { icon: '📅', color: '#7BB3F0' },
  // v3.0 섹션들
  'Creative Studio': { icon: '✍️', color: '#E040FB' },
  '콘텐츠': { icon: '✍️', color: '#E040FB' },
  '아우트리치': { icon: '📧', color: '#00FF88' },
  '인플루언서': { icon: '📧', color: '#00FF88' },
  '농산물': { icon: '🌾', color: '#FF9800' },
  '시장 가격': { icon: '📊', color: '#FF9800' },
  'Workspace': { icon: '💾', color: '#7BB3F0' },
  '저장': { icon: '💾', color: '#7BB3F0' },
  '자비스 기능': { icon: '🤖', color: '#C8A96E' },
  '기능': { icon: '🤖', color: '#C8A96E' },
  '추천 액션': { icon: '🚀', color: '#76FF03' },
  '액션': { icon: '🚀', color: '#76FF03' },
  '시스템': { icon: '🛡️', color: '#00F5FF' },
};

function getSectionMeta(title: string) {
  for (const [key, meta] of Object.entries(SECTION_ICONS)) {
    if (title.includes(key)) return meta;
  }
  return { icon: '◈', color: '#C8A96E' };
}

function BriefingCard({ text }: { text: string }) {
  const sections = text.replace('[LIST]', '').trim().split(/\*\*\[/).filter(Boolean);
  
  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(6,12,24,0.95), rgba(0,8,20,0.9))',
      border: '1px solid rgba(200,169,110,0.2)',
      borderRadius: 14,
      padding: '18px 20px',
      marginTop: 8,
      boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(200,169,110,0.1)',
    }}>
      {/* Header */}
      <div style={{
        fontFamily: 'Orbitron, monospace',
        fontSize: '0.58rem',
        color: THEME.gold,
        letterSpacing: '0.2em',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingBottom: 10,
        borderBottom: '1px solid rgba(200,169,110,0.15)',
      }}>
        <span style={{ fontSize: '0.9rem', filter: 'drop-shadow(0 0 4px rgba(200,169,110,0.5))' }}>◈</span>
        MORNING BRIEFING
        <span style={{ marginLeft: 'auto', fontSize: '0.45rem', color: THEME.textDim, letterSpacing: '0.1em' }}>
          {new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
        </span>
      </div>

      {/* Sections */}
      {sections.map((section, i) => {
        const titleEnd = section.indexOf(']');
        const sectionTitle = titleEnd > 0 ? section.substring(0, titleEnd).replace(/\*\*/g, '') : '';
        const content = titleEnd > 0 ? section.substring(titleEnd + 1) : section;
        const items = content.split('\n').filter(l => l.trim().startsWith('-'));
        const meta = getSectionMeta(sectionTitle);
        
        return (
          <div key={i} style={{
            marginBottom: i < sections.length - 1 ? 14 : 0,
            padding: '10px 12px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 10,
            borderLeft: `3px solid ${meta.color}44`,
          }}>
            {sectionTitle && (
              <div style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                color: meta.color,
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span style={{ fontSize: '0.8rem' }}>{meta.icon}</span>
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
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '5px 0',
                  borderBottom: j < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(180,195,210,0.8)' }}>{label}</span>
                  <span style={{
                    fontSize: isNumber ? '0.85rem' : '0.75rem',
                    fontWeight: isNumber ? 700 : 400,
                    color: isZero ? 'rgba(100,120,140,0.6)' : isNumber ? meta.color : THEME.text,
                    fontFamily: isNumber ? 'Orbitron, monospace' : 'Inter, sans-serif',
                    textShadow: isNumber && !isZero ? `0 0 8px ${meta.color}44` : 'none',
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

// ── Task Suggestion Card ──
function TaskSuggestionCard({ suggestions }: { suggestions: string[] }) {
  if (suggestions.length === 0) return null;
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(20,40,20,0.4), rgba(10,30,15,0.3))',
      border: '1px solid rgba(34,197,94,0.2)',
      borderRadius: 10,
      padding: '12px 14px',
      marginTop: 8,
    }}>
      <div style={{
        fontFamily: 'Orbitron, monospace',
        fontSize: '0.55rem',
        color: '#22C55E',
        letterSpacing: '0.12em',
        marginBottom: 8,
      }}>
        ◈ SUGGESTED ACTIONS
      </div>
      {suggestions.map((s, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 0',
          borderBottom: i < suggestions.length - 1 ? '1px solid rgba(34,197,94,0.1)' : 'none',
        }}>
          <span style={{ color: '#22C55E', fontSize: '0.7rem' }}>▸</span>
          <span style={{ fontSize: '0.78rem', color: THEME.text }}>{s}</span>
        </div>
      ))}
    </div>
  );
}

// ── Approval Preview Card (disabled) ──
function ApprovalPreviewCard({ action, reason }: { action: string; reason: string }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(40,20,20,0.4), rgba(30,10,10,0.3))',
      border: '1px solid rgba(239,68,68,0.2)',
      borderRadius: 10,
      padding: '12px 14px',
      marginTop: 8,
      opacity: 0.7,
    }}>
      <div style={{
        fontFamily: 'Orbitron, monospace',
        fontSize: '0.55rem',
        color: '#EF4444',
        letterSpacing: '0.12em',
        marginBottom: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span>◈</span> APPROVAL REQUIRED
        <span style={{
          marginLeft: 'auto',
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 4,
          padding: '2px 6px',
          fontSize: '0.5rem',
        }}>
          EXECUTE DISABLED
        </span>
      </div>
      <div style={{ fontSize: '0.78rem', color: THEME.text, marginBottom: 4 }}>{action}</div>
      <div style={{ fontSize: '0.68rem', color: THEME.textDim }}>{reason}</div>
    </div>
  );
}

// ── Helper: detect message type ──
function getMessageType(text: string): 'smartstore' | 'briefing' | 'normal' {
  if (text.startsWith('[PKG]')) return 'smartstore';
  // [LIST] 태그 유무와 관계없이 브리핑 키워드로 감지
  const isBriefing = (
    text.includes('커맨드 리포트') ||
    text.includes('자비스 일일') ||
    text.includes('[1. 스마트스토어 현황]') ||
    text.includes('[스마트스토어]') ||
    (text.startsWith('[LIST]') && (text.includes('브리핑') || text.includes('리포트')))
  );
  if (isBriefing) return 'briefing';
  return 'normal';
}

// ── Helper: extract suggestions from text ──
function extractSuggestions(text: string): string[] {
  const suggestions: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.includes('권장') || line.includes('제안')) {
      const cleaned = line.replace(/^[-•▸]\s*/, '').replace(/\*\*/g, '').trim();
      if (cleaned.length > 5 && cleaned.length < 80) {
        suggestions.push(cleaned);
      }
    }
  }
  return suggestions;
}

// ── Helper: detect approval-needed messages ──
function detectApproval(text: string): { action: string; reason: string } | null {
  if (text.includes('발주확인') && text.includes('처리')) {
    return { action: '발주확인 처리', reason: 'execute_disabled 모드에서는 대표님 승인이 필요합니다.' };
  }
  if (text.includes('발송처리') || text.includes('송장입력')) {
    return { action: '발송 처리', reason: 'execute_disabled 모드에서는 대표님 승인이 필요합니다.' };
  }
  if (text.includes('이메일 발송') && !text.includes('시뮬레이션')) {
    return { action: '이메일 발송', reason: 'execute_disabled 모드에서는 대표님 승인이 필요합니다.' };
  }
  return null;
}

// ── Main Component ──
export default function ConversationPanel({
  messages,
  isTyping,
  sttStatus,
  isExpanded,
  onToggleExpand,
  outreachOffset = 0,
}: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll on new messages
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, autoScroll]);

  // Detect user scroll
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 60);
  };

  // Visible messages (expanded: all, collapsed: last 3)
  const visibleMessages = isExpanded ? messages : messages.slice(-3);

  // STT Status indicator
  const sttLabel = useMemo(() => {
    switch (sttStatus) {
      case 'listening': return '듣는 중...';
      case 'transcribing': return '인식 중...';
      case 'done': return '';
      default: return '';
    }
  }, [sttStatus]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        position: 'fixed',
        top: outreachOffset > 0 ? 60 : 80,
        left: outreachOffset > 0 ? 170 : '50%',
        transform: outreachOffset > 0 ? 'none' : 'translateX(-50%)',
        maxHeight: outreachOffset > 0 ? 'calc(100vh - 130px)' : 'calc(50vh - 80px)',
        width: outreachOffset > 0 ? 'calc(100vw - 620px)' : 'min(480px, 90vw)',
        minWidth: outreachOffset > 0 ? '340px' : undefined,
        maxWidth: outreachOffset > 0 ? '600px' : undefined,
        zIndex: 50,
        transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {/* STT Status Bar */}
      <AnimatePresence>
        {(sttStatus === 'listening' || sttStatus === 'transcribing') && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              marginBottom: 6,
              background: 'rgba(6,10,18,0.85)',
              border: '1px solid rgba(0,245,255,0.2)',
              borderRadius: 20,
              backdropFilter: 'blur(12px)',
              width: 'fit-content',
            }}
          >
            <motion.div
              style={{ width: 8, height: 8, borderRadius: '50%', background: THEME.cyan }}
              animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
            <span style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.6rem',
              color: THEME.cyan,
              letterSpacing: '0.1em',
            }}>
              {sttLabel}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Panel */}
      <div style={{
        background: THEME.bg,
        border: `1px solid ${THEME.border}`,
        borderRadius: 16,
        backdropFilter: 'blur(20px)',
        boxShadow: '0 -4px 30px rgba(0,0,0,0.4), 0 0 20px rgba(0,245,255,0.05)',
        overflow: 'hidden',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div
          onClick={onToggleExpand}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            borderBottom: `1px solid ${THEME.border}`,
            cursor: 'pointer',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          <div style={{
            fontFamily: 'Orbitron, monospace',
            fontSize: '0.55rem',
            color: THEME.cyan,
            letterSpacing: '0.15em',
          }}>
            ◈ JARVIS DIALOGUE
          </div>
          <div style={{
            fontFamily: 'Orbitron, monospace',
            fontSize: '0.5rem',
            color: THEME.textDim,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>{messages.length} msgs</span>
            <motion.span
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'inline-block' }}
            >
              ▲
            </motion.span>
          </div>
        </div>

        {/* Messages Area */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '10px 14px',
            scrollBehavior: 'smooth',
          }}
        >
          <AnimatePresence initial={false}>
            {visibleMessages.map((msg) => {
              const isJarvis = msg.role === 'jarvis';
              const msgType = isJarvis ? getMessageType(msg.text) : 'normal';
              const suggestions = isJarvis ? extractSuggestions(msg.text) : [];
              const approval = isJarvis ? detectApproval(msg.text) : null;

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    marginBottom: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isJarvis ? 'flex-start' : 'flex-end',
                  }}
                >
                  {/* Role Label */}
                  <div style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '0.48rem',
                    color: msg.isCompletion ? THEME.cyan : isJarvis ? 'rgba(0,245,255,0.5)' : 'rgba(100,180,255,0.5)',
                    letterSpacing: '0.18em',
                    marginBottom: 4,
                    marginLeft: isJarvis ? 0 : 'auto',
                  }}>
                    {msg.isCompletion ? '◈ TASK COMPLETE' : isJarvis ? '◈ JARVIS' : '◈ COMMANDER'}
                  </div>

                  {/* User message bubble */}
                  {!isJarvis && (
                    <div style={{
                      background: THEME.userBubble,
                      border: '1px solid rgba(100,180,255,0.2)',
                      borderRadius: '12px 4px 12px 12px',
                      padding: '10px 14px',
                      maxWidth: '85%',
                      backdropFilter: 'blur(8px)',
                    }}>
                      <p style={{
                        color: THEME.text,
                        fontSize: '0.88rem',
                        lineHeight: 1.6,
                        margin: 0,
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {msg.text}
                      </p>
                    </div>
                  )}

                  {/* Jarvis message */}
                  {isJarvis && (
                    <div style={{ maxWidth: '92%', width: '100%' }}>
                      {/* Smartstore Card */}
                      {msgType === 'smartstore' && <SmartstoreCard text={msg.text} />}
                      
                      {/* Briefing Card */}
                      {msgType === 'briefing' && <BriefingCard text={msg.text} />}
                      
                      {/* Normal text */}
                      {msgType === 'normal' && (
                        <div style={{
                          background: msg.isCompletion ? THEME.completionBubble : THEME.jarvisBubble,
                          border: `1px solid ${msg.isCompletion ? 'rgba(0,245,255,0.25)' : 'rgba(0,102,255,0.15)'}`,
                          borderRadius: '4px 12px 12px 12px',
                          padding: '10px 14px',
                          backdropFilter: 'blur(8px)',
                        }}>
                          <p style={{
                            color: THEME.text,
                            fontSize: '0.88rem',
                            lineHeight: 1.7,
                            margin: 0,
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-wrap',
                          }}>
                            {msg.text}
                            {msg.isCompletion && (
                              <span style={{ marginLeft: 6, color: THEME.cyan, fontSize: '0.85rem' }}>✓</span>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Task Suggestions */}
                      {suggestions.length > 0 && <TaskSuggestionCard suggestions={suggestions} />}

                      {/* Approval Preview */}
                      {approval && <ApprovalPreviewCard action={approval.action} reason={approval.reason} />}
                    </div>
                  )}

                  {/* Timestamp */}
                  <div style={{
                    fontFamily: 'Orbitron, monospace',
                    color: 'rgba(100,116,139,0.4)',
                    fontSize: '0.44rem',
                    marginTop: 3,
                    marginLeft: isJarvis ? 0 : 'auto',
                  }}>
                    {msg.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Typing Indicator */}
          <AnimatePresence>
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 0',
                }}
              >
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      style={{ width: 6, height: 6, borderRadius: '50%', background: THEME.cyan }}
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
                <span style={{
                  fontFamily: 'Orbitron, monospace',
                  fontSize: '0.52rem',
                  color: 'rgba(0,245,255,0.45)',
                  letterSpacing: '0.15em',
                }}>
                  PROCESSING
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
