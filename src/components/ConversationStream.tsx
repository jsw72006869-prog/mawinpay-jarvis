
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface Message {
  id: string;
  role: 'user' | 'jarvis';
  text: string;
  timestamp: Date;
  isCompletion?: boolean; // 작업 완료 메시지 (스파클링 효과 적용)
}

interface ConversationStreamProps {
  messages: Message[];
  isTyping?: boolean;
}

// 작업 완료 메시지 전용 스파클링 텍스트 컴포넌트
function SparkleCompletionText({ text, isNew }: { text: string; isNew: boolean }) {
  const [displayed, setDisplayed] = useState(isNew ? '' : text);
  const [done, setDone] = useState(!isNew);
  const [sparkles, setSparkles] = useState<{ id: number; x: number; y: number; size: number; color: string }[]>([]);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isNew) { setDisplayed(text); setDone(true); return; }
    setDisplayed('');
    setDone(false);
    let i = 0;
    const speed = text.length > 80 ? 14 : text.length > 40 ? 18 : 22;
    let sparkleId = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      // 타이핑 중 랜덤하게 스파클 생성
      if (Math.random() > 0.6) {
        const newSparkle = {
          id: sparkleId++,
          x: Math.random() * 100,
          y: Math.random() * 100,
          size: 3 + Math.random() * 5,
          color: ['#00F5FF', '#FFD700', '#FF6B9D', '#7FFF00', '#FF8C00'][Math.floor(Math.random() * 5)],
        };
        setSparkles(prev => [...prev.slice(-12), newSparkle]);
        setTimeout(() => {
          setSparkles(prev => prev.filter(s => s.id !== newSparkle.id));
        }, 600);
      }
      if (i >= text.length) {
        clearInterval(timer);
        setDone(true);
        // 완료 시 폭발적 스파클
        for (let j = 0; j < 20; j++) {
          setTimeout(() => {
            const burst = {
              id: sparkleId++,
              x: Math.random() * 100,
              y: Math.random() * 100,
              size: 4 + Math.random() * 8,
              color: ['#00F5FF', '#FFD700', '#FF6B9D', '#7FFF00', '#FF8C00', '#FFFFFF'][Math.floor(Math.random() * 6)],
            };
            setSparkles(prev => [...prev.slice(-20), burst]);
            setTimeout(() => {
              setSparkles(prev => prev.filter(s => s.id !== burst.id));
            }, 800);
          }, j * 40);
        }
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, isNew]);

  return (
    <span ref={containerRef} style={{ position: 'relative', display: 'inline' }}>
      {/* 스파클 파티클들 */}
      {sparkles.map(s => (
        <motion.span
          key={s.id}
          initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
          animate={{ opacity: 0, scale: 1.5, x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 30 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            backgroundColor: s.color,
            pointerEvents: 'none',
            boxShadow: `0 0 ${s.size * 2}px ${s.color}`,
            zIndex: 10,
          }}
        />
      ))}
      {/* 텍스트 */}
      <span style={{
        background: done
          ? 'linear-gradient(90deg, #00F5FF, #FFD700, #FF6B9D, #7FFF00, #00F5FF)'
          : 'linear-gradient(90deg, #00F5FF, #7FFF00)',
        backgroundSize: '200% auto',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        animation: done ? 'shimmer 2s linear infinite' : 'none',
        fontWeight: 600,
      }}>
        {displayed}
      </span>
      {!done && (
        <motion.span
          animate={{ opacity: [1, 0, 1], scale: [1, 1.3, 1] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          style={{ color: '#FFD700', marginLeft: 2 }}
        >
          ✦
        </motion.span>
      )}
      {done && (
        <motion.span
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300 }}
          style={{ marginLeft: 4, fontSize: '0.9em' }}
        >
          ✅
        </motion.span>
      )}
    </span>
  );
}

export default function ConversationStream({ messages, isTyping }: ConversationStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // 최근 3개 메시지만 표시
  const visibleMessages = messages.slice(-3);

  return (
    <div className="w-full max-w-2xl mx-auto" style={{ minHeight: 60, position: 'relative', zIndex: 999 }}>
      {/* shimmer 애니메이션 CSS */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
      <AnimatePresence mode="popLayout">
        {visibleMessages.map((msg, idx) => {
          const isJarvis = msg.role === 'jarvis';
          const isLast = idx === visibleMessages.length - 1;
          const isNew = msg.id === lastMessageId;
          const opacity = idx === 0 && visibleMessages.length === 3 ? 0.3
            : idx === 1 && visibleMessages.length >= 2 ? 0.6
            : 1;

          return (
            <motion.div
              key={msg.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="flex items-start gap-3 mb-2.5"
              style={{ justifyContent: isJarvis ? 'flex-start' : 'flex-end' }}
            >
              {/* JARVIS 아이콘 */}
              {isJarvis && (
                <motion.div
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold"
                  style={{
                    background: msg.isCompletion
                      ? 'linear-gradient(135deg, rgba(255,215,0,0.4), rgba(0,245,255,0.3))'
                      : 'linear-gradient(135deg, rgba(0,102,255,0.3), rgba(0,245,255,0.2))',
                    border: `1px solid ${msg.isCompletion ? 'rgba(255,215,0,0.6)' : 'rgba(0,245,255,0.45)'}`,
                    color: msg.isCompletion ? '#FFD700' : '#00F5FF',
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '0.5rem',
                    letterSpacing: '0.05em',
                    boxShadow: msg.isCompletion ? '0 0 14px rgba(255,215,0,0.4)' : '0 0 10px rgba(0,245,255,0.2)',
                  }}
                  animate={isLast ? {
                    boxShadow: msg.isCompletion
                      ? ['0 0 14px rgba(255,215,0,0.4)', '0 0 24px rgba(255,215,0,0.8)', '0 0 14px rgba(255,215,0,0.4)']
                      : ['0 0 10px rgba(0,245,255,0.2)', '0 0 18px rgba(0,245,255,0.5)', '0 0 10px rgba(0,245,255,0.2)']
                  } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {msg.isCompletion ? '✦' : 'AI'}
                </motion.div>
              )}

              {/* 말풍선 */}
              <div
                style={{
                  maxWidth: '78%',
                  padding: '10px 16px',
                  borderRadius: isJarvis ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                  background: msg.isCompletion
                    ? 'linear-gradient(135deg, rgba(255,215,0,0.08), rgba(0,245,255,0.06))'
                    : isJarvis
                      ? 'linear-gradient(135deg, rgba(0,102,255,0.1), rgba(0,245,255,0.06))'
                      : 'linear-gradient(135deg, rgba(255,107,53,0.1), rgba(255,179,71,0.06))',
                  border: `1px solid ${msg.isCompletion ? 'rgba(255,215,0,0.35)' : isJarvis ? 'rgba(0,245,255,0.22)' : 'rgba(255,107,53,0.22)'}`,
                  backdropFilter: 'blur(12px)',
                  boxShadow: msg.isCompletion
                    ? '0 4px 20px rgba(255,215,0,0.12), inset 0 1px 0 rgba(255,215,0,0.1)'
                    : isJarvis
                      ? '0 4px 20px rgba(0,102,255,0.08), inset 0 1px 0 rgba(0,245,255,0.08)'
                      : '0 4px 20px rgba(255,107,53,0.08), inset 0 1px 0 rgba(255,107,53,0.08)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* 완료 메시지 배경 글로우 */}
                {msg.isCompletion && (
                  <motion.div
                    style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(135deg, rgba(255,215,0,0.04), rgba(0,245,255,0.04))',
                      pointerEvents: 'none',
                    }}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}

                {/* 레이블 */}
                <div style={{
                  fontFamily: 'Orbitron, monospace',
                  fontSize: '0.48rem',
                  color: msg.isCompletion ? 'rgba(255,215,0,0.7)' : isJarvis ? 'rgba(0,245,255,0.55)' : 'rgba(255,107,53,0.55)',
                  letterSpacing: '0.2em',
                  marginBottom: '5px',
                }}>
                  {msg.isCompletion ? '◈ TASK COMPLETE' : isJarvis ? '◈ MAWINPAY' : '◈ COMMANDER'}
                </div>

                {/* 텍스트 */}
                <p style={{
                  color: isJarvis ? 'rgba(224,242,254,0.92)' : 'rgba(255,237,213,0.92)',
                  fontSize: '0.82rem',
                  lineHeight: 1.6,
                  letterSpacing: '0.01em',
                  fontFamily: 'Inter, sans-serif',
                  position: 'relative',
                }}>
                  {msg.isCompletion
                    ? <SparkleCompletionText text={msg.text} isNew={isNew && isLast} />
                    : msg.text
                  }
                </p>

                {/* 타임스탬프 */}
                <div style={{
                  fontFamily: 'Orbitron, monospace',
                  color: 'rgba(100,116,139,0.4)',
                  fontSize: '0.46rem',
                  marginTop: '4px',
                  textAlign: 'right',
                }}>
                  {msg.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </div>
              </div>

              {/* USER 아이콘 */}
              {!isJarvis && (
                <div
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,107,53,0.3), rgba(255,179,71,0.2))',
                    border: '1px solid rgba(255,107,53,0.4)',
                    color: '#FF6B35',
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '0.5rem',
                    boxShadow: '0 0 10px rgba(255,107,53,0.2)',
                  }}
                >
                  YOU
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* 타이핑 인디케이터 */}
      <AnimatePresence>
        {isTyping && (
          <motion.div
            key="typing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="flex items-center gap-3 mb-2.5"
          >
            <div
              className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold"
              style={{
                background: 'linear-gradient(135deg, rgba(0,102,255,0.3), rgba(0,245,255,0.2))',
                border: '1px solid rgba(0,245,255,0.45)',
                color: '#00F5FF',
                fontFamily: 'Orbitron, monospace',
                fontSize: '0.5rem',
                boxShadow: '0 0 10px rgba(0,245,255,0.3)',
              }}
            >
              AI
            </div>
            <div style={{
              padding: '10px 18px',
              borderRadius: '4px 16px 16px 16px',
              background: 'linear-gradient(135deg, rgba(0,102,255,0.1), rgba(0,245,255,0.06))',
              border: '1px solid rgba(0,245,255,0.22)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}>
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: '#00F5FF' }}
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.3, 0.8] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18 }}
                  />
                ))}
              </div>
              <span style={{
                fontFamily: 'Orbitron, monospace',
                color: 'rgba(0,245,255,0.45)',
                fontSize: '0.48rem',
                letterSpacing: '0.2em',
              }}>
                PROCESSING
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={bottomRef} />
    </div>
  );
}
