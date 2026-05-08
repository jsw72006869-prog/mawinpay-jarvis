/**
 * ResultDeck.tsx — UI-O Result Deck Separation v1
 *
 * Creative Director / 마케팅 콘텐츠 결과를 채팅창에서 분리하여
 * 1번 화면 좌측에 시네마틱 패널로 표시하는 컴포넌트.
 *
 * Props:
 *  - visible: boolean
 *  - content: string (마크다운/텍스트 결과)
 *  - contentType: string (headcopy | script | storytelling | full_package | etc.)
 *  - product: string
 *  - onDismiss: () => void
 *  - onCopy: () => void
 *  - onSaveToWorkspace: () => void
 */
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ResultDeckProps {
  visible: boolean;
  content: string;
  contentType: string;
  product: string;
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

// 콘텐츠를 섹션별로 파싱
function parseSections(content: string): { title: string; body: string }[] {
  const lines = content.split('\n');
  const sections: { title: string; body: string }[] = [];
  let currentTitle = '';
  let currentBody: string[] = [];

  for (const line of lines) {
    // 마크다운 헤더 또는 【】 또는 ── 형식 감지
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

  const handleCopy = () => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    onCopy();
    setTimeout(() => setCopied(false), 2000);
  };

  const sections = parseSections(content);
  const typeLabel = getTypeLabel(contentType);

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
              <button className="result-deck-btn" onClick={handleCopy}>
                {copied ? '✓ 복사됨' : '복사'}
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
              {showContent && sections.map((section, idx) => (
                <motion.div
                  key={idx}
                  className="result-deck-section"
                  initial={{ opacity: 0, y: 20, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: idx * 0.12, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  {section.title && (
                    <div className="result-deck-section-title">{section.title}</div>
                  )}
                  <div className="result-deck-section-body">
                    {section.body.split('\n').map((line, i) => (
                      <p key={i} className={line.startsWith('-') || line.startsWith('•') ? 'result-deck-bullet' : ''}>
                        {line}
                      </p>
                    ))}
                  </div>
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
