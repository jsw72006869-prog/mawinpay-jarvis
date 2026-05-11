/**
 * ResultDeck.tsx — COPY-A v2
 *
 * Creative Director / 마케팅 콘텐츠 결과를 채팅창에서 분리하여
 * 1번 화면 좌측에 시네마틱 패널로 표시하는 컴포넌트.
 * COPY-A v2: 구조화 카드 (헤드카피/썸네일/첫3초/타깃/욕구/미래장면/본문/CTA/왜먹히는지/위험도/점수)
 */
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface CopyAScores {
  clickPower: number;
  purchaseDesire: number;
  storyStrength: number;
  trust: number;
}

export interface ResultItem {
  id: string;
  title: string;
  body: string;
  tone?: string;
  format?: string;
  scoreLabel?: string;
  // COPY-A v2 구조화 필드
  headline?: string;
  thumbnailText?: string;
  firstThreeSeconds?: string;
  reelsScript?: string;
  targetPersona?: string;
  desireTrigger?: string;
  futureScene?: string;
  storyBody?: string;
  cta?: string;
  whyItWorks?: string;
  riskLevel?: string;
  scores?: CopyAScores;
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
  // COPY-R
  isCopyR?: boolean;
  researchInsight?: string;
  videosFound?: number;
  topVideos?: Array<{ title: string; viewCount: string; url: string }>;
}

// 콘텐츠 타입 → 한글 라벨
function getTypeLabel(type: string): string {
  switch (type) {
    case 'headcopy': return '후킹 문구';
    case 'script': return '릴스 대본';
    case 'reels_script': return '릴스 스크립트';
    case 'storytelling': return '스토리텔링';
    case 'full_package': return '마케팅 패키지';
    case 'thread': return '스레드 글';
    case 'threads_post': return '스레드 글';
    case 'youtube_thumbnail': return '유튜브 썸네일 문구';
    case 'instagram_copy': return '인스타 카피';
    case 'kakao': return '카카오톡 공지';
    default: return '마케팅 콘텐츠';
  }
}

// 위험도 색상
function getRiskColor(risk?: string): string {
  if (!risk) return 'rgba(34,197,94,0.8)';
  if (risk.includes('주의')) return 'rgba(239,68,68,0.8)';
  if (risk.includes('보통')) return 'rgba(255,152,0,0.8)';
  return 'rgba(34,197,94,0.8)';
}

// 점수 바 컴포넌트
function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? '#00FF88' : value >= 60 ? '#00F5FF' : '#FF9800';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <span style={{ fontSize: '0.55rem', color: 'rgba(148,163,184,0.7)', width: 52, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.8s ease' }} />
      </div>
      <span style={{ fontSize: '0.55rem', color, width: 24, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// 구조화 카드 섹션 렌더링
function CopyACardSection({ label, value, icon }: { label: string; value: string; icon: string }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: '0.5rem', color: 'rgba(0,245,255,0.6)', fontFamily: 'Orbitron, monospace', letterSpacing: '0.08em', marginBottom: 2 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '0.72rem', color: 'rgba(224,242,254,0.92)', lineHeight: 1.55, paddingLeft: 4, borderLeft: '2px solid rgba(0,245,255,0.2)' }}>
        {value}
      </div>
    </div>
  );
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
  isCopyR = false,
  researchInsight = '',
  videosFound = 0,
  topVideos = [],
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
  const displayItems: ResultItem[] = items.length > 0
    ? items
    : parseSections(content).map((s, i) => ({
        id: `fallback-${i}`,
        title: s.title || `${i + 1}번 결과`,
        body: s.body,
        tone: i === 0 ? '추천안' : '변형안'
      }));

  // COPY-A v2 구조화 카드 여부 판단 (format=copy_a이면 항상 구조화 렌더링)
  const isCopyACard = (item: ResultItem) => item.format === 'copy_a';

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
              <span style={{ fontSize: '0.45rem', color: 'rgba(0,245,255,0.5)', fontFamily: 'Orbitron, monospace', letterSpacing: '0.1em' }}>
                {isCopyR ? (researchInsight?.includes('통합 리서치 인사이트') ? 'COPY-R.5' : researchInsight?.includes('리뷰/고객 불안 인사이트') ? 'COPY-R.4' : researchInsight?.includes('소셜 패턴 인사이트') ? 'COPY-R.3' : researchInsight?.includes('시장/시즈 인사이트') ? 'COPY-R.2' : 'COPY-R') : 'COPY-A'}
              </span>
              {isCopyR && videosFound > 0 && (
                <span style={{ fontSize: '0.4rem', color: 'rgba(255,200,0,0.9)', fontFamily: 'Orbitron, monospace', background: 'rgba(255,200,0,0.1)', border: '1px solid rgba(255,200,0,0.3)', borderRadius: 4, padding: '1px 5px' }}>
                  🔍 YouTube {videosFound}건 분석반영
                </span>
              )}
              {isCopyR && researchInsight?.includes('시장/시즈 인사이트') && (
                <span style={{ fontSize: '0.4rem', color: 'rgba(100,255,150,0.9)', fontFamily: 'Orbitron, monospace', background: 'rgba(100,255,150,0.1)', border: '1px solid rgba(100,255,150,0.3)', borderRadius: 4, padding: '1px 5px' }}>
                  📊 KAMIS 시장 맥락 반영
                </span>
              )}
              {isCopyR && researchInsight?.includes('소셜 패턴 인사이트') && (
                <span style={{ fontSize: '0.4rem', color: 'rgba(180,130,255,0.9)', fontFamily: 'Orbitron, monospace', background: 'rgba(180,130,255,0.1)', border: '1px solid rgba(180,130,255,0.3)', borderRadius: 4, padding: '1px 5px' }}>
                  🌐 소셜 패턴 분석 반영
                </span>
              )}
              {isCopyR && researchInsight?.includes('리뷰/고객 불안 인사이트') && (
                <span style={{ fontSize: '0.4rem', color: 'rgba(255,150,100,0.9)', fontFamily: 'Orbitron, monospace', background: 'rgba(255,150,100,0.1)', border: '1px solid rgba(255,150,100,0.3)', borderRadius: 4, padding: '1px 5px' }}>
                  📋 리뷰 불안 분석 반영
                </span>
              )}
              {isCopyR && researchInsight?.includes('통합 리서치 인사이트') && (
                <span style={{ fontSize: '0.4rem', color: 'rgba(255,215,0,0.9)', fontFamily: 'Orbitron, monospace', background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: 4, padding: '1px 5px' }}>
                  🎯 통합 리서치 반영
                </span>
              )}
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
            {/* COPY-R 인사이트 배너 (COPY-R.1.1: 카피 적용 방향 중심) */}
            {isCopyR && researchInsight && showContent && (() => {
              // [COPY-A 주입 인사이트] 이후는 내부 주입용이므로 UI에서 숨김
              const displayInsight = researchInsight.split('[COPY-A 주입 인사이트]')[0].trim();
              return (
                <div style={{ background: 'rgba(255,200,0,0.07)', border: '1px solid rgba(255,200,0,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.55rem', color: 'rgba(255,220,80,0.9)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                  {displayInsight}
                </div>
              );
            })()}
            <AnimatePresence>
              {showContent && displayItems.map((item, idx) => (
                <motion.div
                  key={item.id || idx}
                  className="result-deck-section"
                  initial={{ opacity: 0, y: 20, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: idx * 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  {/* 카드 헤더 */}
                  <div className="result-deck-section-header">
                    <div className="result-deck-section-title">
                      {item.title}
                      {item.tone && <span className="result-deck-tone-badge">{item.tone}</span>}
                      {item.riskLevel && (
                        <span style={{
                          fontSize: '0.42rem',
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: 'rgba(0,0,0,0.3)',
                          border: `1px solid ${getRiskColor(item.riskLevel)}`,
                          color: getRiskColor(item.riskLevel),
                          fontFamily: 'Orbitron, monospace',
                          letterSpacing: '0.06em',
                          marginLeft: 4,
                        }}>
                          {item.riskLevel}
                        </span>
                      )}
                    </div>
                    <button className="result-deck-item-copy" onClick={() => handleCopy(item.body)}>
                      복사
                    </button>
                  </div>

                  {/* COPY-A v2 구조화 카드 렌더링 */}
                  {isCopyACard(item) ? (
                    <div style={{ padding: '8px 0' }}>
                      {/* 구조화 필드가 있으면 세션별 표시, 없으면 body 텍스트 전체 표시 */}
                      {(item.headline || item.storyBody || item.thumbnailText) ? (
                        <>
                          <CopyACardSection label="헤드카피" value={item.headline || ''} icon="🎯" />
                          <CopyACardSection label="썸네일 문구" value={item.thumbnailText || ''} icon="📸" />
                          <CopyACardSection label="첫 3초 스크립트" value={item.firstThreeSeconds || ''} icon="⚡" />
                          {item.reelsScript && <CopyACardSection label="릴스 대본" value={item.reelsScript} icon="🎬" />}
                          <CopyACardSection label="타깃 고객" value={item.targetPersona || ''} icon="👤" />
                          <CopyACardSection label="자극한 욕구" value={item.desireTrigger || ''} icon="💡" />
                          <CopyACardSection label="미래 장면" value={item.futureScene || ''} icon="🌅" />
                          <CopyACardSection label="스토리 본문" value={item.storyBody || ''} icon="📖" />
                          <CopyACardSection label="CTA" value={item.cta || ''} icon="📣" />
                          <CopyACardSection label="왜 먹히는지" value={item.whyItWorks || ''} icon="🔍" />
                          {/* 이하 점수 바 렌더링 유지 */}
                        </>
                      ) : (
                        /* 구조화 필드 없으면 body 텍스트 전체 표시 */
                        <div className="result-deck-section-body">
                          {(item.body || '').split('\n').map((line, i) => (
                            <p key={i} className={line.startsWith('-') || line.startsWith('•') ? 'result-deck-bullet' : ''}>
                              {line}
                            </p>
                          ))}
                        </div>
                      )}
                      {/* 점수 바 */}
                      {item.scores && (
                        <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(0,245,255,0.04)', borderRadius: 6, border: '1px solid rgba(0,245,255,0.1)' }}>
                          <div style={{ fontSize: '0.45rem', color: 'rgba(0,245,255,0.5)', fontFamily: 'Orbitron, monospace', letterSpacing: '0.1em', marginBottom: 6 }}>
                            COPY SCORE
                          </div>
                          <ScoreBar label="클릭파워" value={item.scores.clickPower} />
                          <ScoreBar label="구매욕구" value={item.scores.purchaseDesire} />
                          <ScoreBar label="스토리강도" value={item.scores.storyStrength} />
                          <ScoreBar label="신뢰도" value={item.scores.trust} />
                        </div>
                      )}
                    </div>
                  ) : (
                    /* 기존 일반 카드 렌더링 */
                    <div className="result-deck-section-body">
                      {item.body.split('\n').map((line, i) => (
                        <p key={i} className={line.startsWith('-') || line.startsWith('•') ? 'result-deck-bullet' : ''}>
                          {line}
                        </p>
                      ))}
                    </div>
                  )}

                  {item.scoreLabel && !isCopyACard(item) && (
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
              "다시 써줘" · "더 자극적으로" · "더 짧게" · "스레드 스타일로"
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
