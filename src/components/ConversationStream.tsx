

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface Message {
  id: string;
  role: 'user' | 'jarvis';
  text: string;
  timestamp: Date;
}

interface ConversationStreamProps {
  messages: Message[];
  isTyping?: boolean;
}

// 타이핑 효과 컴포넌트
function TypewriterText({ text, isNew }: { text: string; isNew: boolean }) {
  const [displayed, setDisplayed] = useState(isNew ? '' : text);
  const [done, setDone] = useState(!isNew);

  useEffect(() => {
    if (!isNew) { setDisplayed(text); setDone(true); return; }
    setDisplayed('');
    setDone(false);
    let i = 0;
    const speed = text.length > 80 ? 16 : text.length > 40 ? 20 : 26;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(timer); setDone(true); }
    }, speed);
    return () => clearInterval(timer);
  }, [text, isNew]);

  return (
    <span>
      {displayed}
      {!done && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.6, repeat: Infinity }}
          style={{ color: '#00F5FF', marginLeft: 1 }}
        >
          ▌
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
    <div className="w-full max-w-2xl mx-auto" style={{ minHeight: 60 }}>
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
                    background: 'linear-gradient(135deg, rgba(0,102,255,0.3), rgba(0,245,255,0.2))',
                    border: '1px solid rgba(0,245,255,0.45)',
                    color: '#00F5FF',
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '0.5rem',
                    letterSpacing: '0.05em',
                    boxShadow: '0 0 10px rgba(0,245,255,0.2)',
                  }}
                  animate={isLast ? { boxShadow: ['0 0 10px rgba(0,245,255,0.2)', '0 0 18px rgba(0,245,255,0.5)', '0 0 10px rgba(0,245,255,0.2)'] } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  AI
                </motion.div>
              )}

              {/* 말풍선 */}
              <div
                style={{
                  maxWidth: '78%',
                  padding: '10px 16px',
                  borderRadius: isJarvis ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                  background: isJarvis
                    ? 'linear-gradient(135deg, rgba(0,102,255,0.1), rgba(0,245,255,0.06))'
                    : 'linear-gradient(135deg, rgba(255,107,53,0.1), rgba(255,179,71,0.06))',
                  border: `1px solid ${isJarvis ? 'rgba(0,245,255,0.22)' : 'rgba(255,107,53,0.22)'}`,
                  backdropFilter: 'blur(12px)',
                  boxShadow: isJarvis
                    ? '0 4px 20px rgba(0,102,255,0.08), inset 0 1px 0 rgba(0,245,255,0.08)'
                    : '0 4px 20px rgba(255,107,53,0.08), inset 0 1px 0 rgba(255,107,53,0.08)',
                  position: 'relative',
                }}
              >
                {/* 레이블 */}
                <div style={{
                  fontFamily: 'Orbitron, monospace',
                  fontSize: '0.48rem',
                  color: isJarvis ? 'rgba(0,245,255,0.55)' : 'rgba(255,107,53,0.55)',
                  letterSpacing: '0.2em',
                  marginBottom: '5px',
                }}>
                  {isJarvis ? '◈ MAWINPAY' : '◈ COMMANDER'}
                </div>

                {/* 텍스트 */}
                <p style={{
                  color: isJarvis ? 'rgba(224,242,254,0.92)' : 'rgba(255,237,213,0.92)',
                  fontSize: '0.82rem',
                  lineHeight: 1.6,
                  letterSpacing: '0.01em',
                  fontFamily: 'Inter, sans-serif',
                }}>
                  {isNew && isLast
                    ? <TypewriterText text={msg.text} isNew={true} />
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
