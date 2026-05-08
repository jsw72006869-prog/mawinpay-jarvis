/**
 * ResultDeck.tsx — UI-O.1 Result Deck Multi-Item Parser Fix
 *
 * Creative Director / 마케팅 콘텐츠 결과를 채팅창에서 분리하여
 * 1번 화면 좌측에 시네마틱 패널로 표시하는 컴포넌트.
 * 다중 아이템(items) 지원 및 렌더링 보정.
 */
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ResultItem {
  id: string;
  title: string;
  body: string;
  tone?: string;
  format?: string;
  scoreLabel?: string;
}

export interface ResultDeckProps {
  visible: boolean;
  content: string;
  contentType: string;
  product: string;
  items?: ResultItem[];
  onDismiss: () => void;
  onCopy: () => void;
  onSaveToWorkspace: () => void;
}

// 콘텐츠 타입 → 한글 라벨
function getTypeLabel(type: string): string {
  switch (type) {
    case 'headcopy': return '후킹 문구';
    case 'script': return '릴스 대본';
    case 'storytelling': return '스토리텔링';
    case 'full_package': return '마케팅 패키지';
    case 'thread': return '스레드 글';
    case 'kakao': return '카카오톡 공지';
    default: return '마케팅 콘텐츠';
  }
}

// 콘텐츠를 섹션별로 파싱 (items가 없을 때 fallback)
function parseSections(content: string): { title: string; body: string }[] {
  const lines = content.split('\n');
  const sections: { title: string; body: string }[] = [];
  let currentTitle = '';
  let currentBody: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,3}\s+(.+)/) ||
      line.match(/^【(.+?)】/) ||
      line.match(/^──\s*(.+?)\s*──/) ||
      line.match(/^\*\*(.+?)\*\*$/);

    if (headerMatch) {
      if (currentTitle || currentBody.length > 0) {
        sections.push({ title: currentTitle, body: currentBody.join('\n').trim() });
      }
      currentTitle = headerMatch[1].replace(/\*\*/g, '').trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  if (currentTitle || currentBody.length > 0) {
    sections.push({ title: currentTitle, body: currentBody.join('\n').trim() });
  }

  return sections.filter(s => s.body.length > 0 || s.title.length > 0);
}

export default function ResultDeck({
  visible,
  content,
  contentType,
  product,
  items = [],
  onDismiss,
  onCopy,
  onSaveToWorkspace,
}: ResultDeckProps) {
  const [showContent, setShowContent] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setShowContent(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShowContent(false);
    }
  }, [visible]);

  const handleCopy = (text?: string) => {
    navigator.clipboard.writeText(text || content).catch(() => {});
    setCopied(true);
    onCopy();
    setTimeout(() => setCopied(false), 2000);
  };

  const typeLabel = getTypeLabel(contentType);
  const displayItems = items.length > 0 
    ? items 
    : parseSections(content).map((s, i) => ({
        id: `fallback-${i}`,
        title: s.title || `${i + 1}번 결과`,
        body: s.body,
        tone: i === 0 ? '추천안' : '변형안'
      }));

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="result-deck-overlay"
          initial={{ opacity: 0, x: -60, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -40, scale: 0.96 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Header */}
          <div className="result-deck-header">
            <div className="result-deck-header-left">
              <span className="result-deck-badge">{typeLabel}</span>
              {product && <span className="result-deck-product">{product}</span>}
            </div>
            <div className="result-deck-header-right">
              <button className="result-deck-btn" onClick={() => handleCopy()}>
                {copied ? '✓ 복사됨' : '전체 복사'}
              </button>
              <button className="result-deck-btn" onClick={onSaveToWorkspace}>
                저장
              </button>
              <button className="result-deck-btn result-deck-btn-close" onClick={onDismiss}>
                ✕
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="result-deck-body" ref={scrollRef}>
            <AnimatePresence>
              {showContent && displayItems.map((item, idx) => (
                <motion.div
                  key={item.id || idx}
                  className="result-deck-section"
                  initial={{ opacity: 0, y: 20, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: idx * 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="result-deck-section-header">
                    <div className="result-deck-section-title">
                      {item.title}
                      {item.tone && <span className="result-deck-tone-badge">{item.tone}</span>}
                    </div>
                    <button className="result-deck-item-copy" onClick={() => handleCopy(item.body)}>
                      복사
                    </button>
                  </div>
                  <div className="result-deck-section-body">
                    {item.body.split('\n').map((line, i) => (
                      <p key={i} className={line.startsWith('-') || line.startsWith('•') ? 'result-deck-bullet' : ''}>
                        {line}
                      </p>
                    ))}
                  </div>
                  {item.scoreLabel && (
                    <div className="result-deck-item-score">
                      <span className="score-label">{item.scoreLabel}</span>
                      <div className="score-bar"><div className="score-fill" style={{ width: '100%' }}></div></div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="result-deck-footer">
            <span className="result-deck-footer-hint">
              "이거 스레드에 올려줘" · "카카오톡 버전으로 바꿔줘" · "더 짧게"
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
