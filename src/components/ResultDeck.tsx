/**
 * ResultDeck.tsx — UI-V1 Viral Command Center
 *
 * Creative Director / 마케팅 콘텐츠 결과를 채팅창에서 분리하여
 * 1번 화면 좌측에 시네마틱 패널로 표시하는 컴포넌트.
 * UI-V1: 영상 촬영용 고급 디자인 (Mission Feed, Research Intel, Copy Cards, NEXT ACTIONS)
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
  excludedEngines?: string[];
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

// COPY-R 모드 감지
function detectCopyMode(isCopyR: boolean, researchInsight: string): { mode: string; label: string; color: string } {
  if (!isCopyR) return { mode: 'COPY-A', label: 'CREATIVE', color: '#00F5FF' };
  if (researchInsight?.includes('통합 리서치 인사이트')) return { mode: 'COPY-R.5', label: 'ORCHESTRATOR', color: '#FFD700' };
  if (researchInsight?.includes('리뷰/고객 불안 인사이트')) return { mode: 'COPY-R.4', label: 'REVIEW INTEL', color: '#FF9664' };
  if (researchInsight?.includes('소셜 패턴 인사이트')) return { mode: 'COPY-R.3', label: 'SOCIAL INTEL', color: '#B482FF' };
  if (researchInsight?.includes('시장/시즈 인사이트')) return { mode: 'COPY-R.2', label: 'MARKET INTEL', color: '#64FF96' };
  return { mode: 'COPY-R.1', label: 'YOUTUBE INTEL', color: '#FF6464' };
}

// 위험도 색상
function getRiskColor(risk?: string): string {
  if (!risk) return '#22c55e';
  if (risk.includes('주의')) return '#ef4444';
  if (risk.includes('보통')) return '#f59e0b';
  return '#22c55e';
}

// 점수 바 컴포넌트
function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? '#00FF88' : value >= 60 ? '#00F5FF' : '#FF9800';
  return (
    <div className="rd-score-bar-row">
      <span className="rd-score-bar-label">{label}</span>
      <div className="rd-score-bar-track">
        <div className="rd-score-bar-fill" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
      <span className="rd-score-bar-value" style={{ color }}>{value}</span>
    </div>
  );
}

// 구조화 카드 섹션 렌더링
function CopyACardSection({ label, value, icon }: { label: string; value: string; icon: string }) {
  if (!value) return null;
  return (
    <div className="rd-card-section">
      <div className="rd-card-section-label">{icon} {label}</div>
      <div className="rd-card-section-value">{value}</div>
    </div>
  );
}

// Research Insight 엔진별 파싱
function parseInsightSections(insight: string): Array<{ engine: string; icon: string; color: string; lines: string[] }> {
  const sections: Array<{ engine: string; icon: string; color: string; lines: string[] }> = [];
  const engineMap: Record<string, { icon: string; color: string }> = {
    'YouTube': { icon: '▶', color: '#FF6464' },
    'Market': { icon: '◆', color: '#64FF96' },
    'Review': { icon: '◈', color: '#FF9664' },
    'Social': { icon: '◉', color: '#B482FF' },
  };

  // 인사이트 텍스트에서 [YouTube 인사이트], [Market 인사이트] 등 섹션 파싱
  const parts = insight.split(/\[([^\]]+)\s*인사이트\]/);
  for (let i = 1; i < parts.length; i += 2) {
    const engineKey = parts[i].trim();
    const content = (parts[i + 1] || '').trim();
    const lines = content.split('\n').filter(l => l.trim()).slice(0, 3);
    const meta = engineMap[engineKey] || { icon: '●', color: '#00F5FF' };
    sections.push({ engine: engineKey, icon: meta.icon, color: meta.color, lines });
  }

  // 섹션이 없으면 전체를 하나로
  if (sections.length === 0 && insight.trim()) {
    const lines = insight.split('\n').filter(l => l.trim() && !l.startsWith('📊') && !l.startsWith('사용 엔진')).slice(0, 4);
    if (lines.length > 0) {
      sections.push({ engine: 'Research', icon: '◆', color: '#00F5FF', lines });
    }
  }

  return sections;
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

// Mission Feed 엔진 목록 생성
function getMissionFeedEngines(researchInsight: string, excludedEngines: string[]): Array<{ name: string; label: string; status: 'used' | 'available' }> {
  const allEngines = [
    { key: 'youtube', label: 'YouTube Pattern' },
    { key: 'market', label: 'Market Context' },
    { key: 'review', label: 'Review Objection' },
    { key: 'social', label: 'Social Pattern' },
  ];

  const result: Array<{ name: string; label: string; status: 'used' | 'available' }> = [];
  for (const eng of allEngines) {
    if (excludedEngines.includes(eng.key)) {
      result.push({ name: eng.key, label: eng.label, status: 'available' });
    } else {
      // 인사이트에 해당 엔진 관련 내용이 있으면 used
      const keywords: Record<string, string[]> = {
        youtube: ['YouTube', '유튜브', 'youtube'],
        market: ['Market', 'KAMIS', '시장', '시세'],
        review: ['Review', '리뷰', '후기', '불안'],
        social: ['Social', '소셜', '스레드', '패턴'],
      };
      const isUsed = keywords[eng.key]?.some(kw => researchInsight.includes(kw));
      if (isUsed) {
        result.push({ name: eng.key, label: eng.label, status: 'used' });
      }
    }
  }
  return result;
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
  excludedEngines = [],
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
  const { mode, label: modeLabel, color: modeColor } = detectCopyMode(isCopyR, researchInsight);
  const displayItems: ResultItem[] = items.length > 0
    ? items
    : parseSections(content).map((s, i) => ({
        id: `fallback-${i}`,
        title: s.title || `${i + 1}번 결과`,
        body: s.body,
        tone: i === 0 ? '추천안' : '변형안'
      }));

  // COPY-A v2 구조화 카드 여부 판단
  const isCopyACard = (item: ResultItem) => item.format === 'copy_a';

  // Research Insight 섹션 파싱
  const insightSections = isCopyR && researchInsight
    ? parseInsightSections(researchInsight.split('[COPY-A 주입 인사이트]')[0].trim())
    : [];

  // Mission Feed
  const missionFeed = isCopyR ? getMissionFeedEngines(researchInsight, excludedEngines) : [];

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
          {/* ═══ Header ═══ */}
          <div className="rd-header">
            <div className="rd-header-top">
              <div className="rd-mode-badge" style={{ borderColor: `${modeColor}66`, background: `${modeColor}12` }}>
                <span className="rd-mode-dot" style={{ background: modeColor }} />
                <span className="rd-mode-text" style={{ color: modeColor }}>{mode}</span>
              </div>
              <span className="rd-mode-label">{modeLabel}</span>
              <div className="rd-header-actions">
                <button className="rd-btn" onClick={() => handleCopy()}>
                  {copied ? '✓' : '⎘'}
                </button>
                <button className="rd-btn" onClick={onSaveToWorkspace}>⬇</button>
                <button className="rd-btn rd-btn-close" onClick={onDismiss}>✕</button>
              </div>
            </div>
            <div className="rd-header-meta">
              <span className="rd-type-badge">{typeLabel}</span>
              {product && <span className="rd-product">{product}</span>}
              {displayItems.length > 0 && (
                <span className="rd-card-count">{displayItems.length} cards</span>
              )}
            </div>
          </div>

          {/* ═══ Body ═══ */}
          <div className="rd-body" ref={scrollRef}>

            {/* Mission Feed (COPY-R only) */}
            {isCopyR && missionFeed.length > 0 && showContent && (
              <motion.div
                className="rd-mission-feed"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="rd-mission-feed-title">MISSION FEED</div>
                <div className="rd-mission-feed-list">
                  {missionFeed.map(eng => (
                    <div key={eng.name} className={`rd-mission-item ${eng.status}`}>
                      <span className="rd-mission-icon">{eng.status === 'used' ? '✓' : '○'}</span>
                      <span className="rd-mission-label">{eng.label}</span>
                      <span className={`rd-mission-status ${eng.status}`}>
                        {eng.status === 'used' ? 'ANALYZED' : 'AVAILABLE'}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Research Intel Panel (COPY-R only) */}
            {isCopyR && insightSections.length > 0 && showContent && (
              <motion.div
                className="rd-research-panel"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <div className="rd-research-panel-title">RESEARCH INTEL</div>
                <div className="rd-research-grid">
                  {insightSections.map((sec, i) => (
                    <div key={i} className="rd-research-card" style={{ borderColor: `${sec.color}33` }}>
                      <div className="rd-research-card-header">
                        <span className="rd-research-card-icon" style={{ color: sec.color }}>{sec.icon}</span>
                        <span className="rd-research-card-name">{sec.engine}</span>
                        <span className="rd-research-card-status" style={{ color: sec.color }}>USED</span>
                      </div>
                      <div className="rd-research-card-body">
                        {sec.lines.map((line, j) => (
                          <div key={j} className="rd-research-card-line">{line.replace(/^[-•]\s*/, '').slice(0, 80)}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Copy Cards */}
            <AnimatePresence>
              {showContent && displayItems.map((item, idx) => (
                <motion.div
                  key={item.id || idx}
                  className="rd-copy-card"
                  initial={{ opacity: 0, y: 20, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.15 + idx * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  {/* Card Header */}
                  <div className="rd-copy-card-header">
                    <div className="rd-copy-card-number">{String(idx + 1).padStart(2, '0')}</div>
                    <div className="rd-copy-card-title">{item.title}</div>
                    <div className="rd-copy-card-badges">
                      {item.tone && <span className="rd-tone-chip">{item.tone}</span>}
                      {item.riskLevel && (
                        <span className="rd-risk-chip" style={{ borderColor: getRiskColor(item.riskLevel), color: getRiskColor(item.riskLevel) }}>
                          {item.riskLevel}
                        </span>
                      )}
                    </div>
                    <button className="rd-copy-card-copy-btn" onClick={() => handleCopy(item.body)}>⎘</button>
                  </div>

                  {/* COPY-A v2 구조화 카드 렌더링 */}
                  {isCopyACard(item) ? (
                    <div className="rd-copy-card-body">
                      {(item.headline || item.storyBody || item.thumbnailText) ? (
                        <>
                          {item.headline && (
                            <div className="rd-headline-block">
                              <div className="rd-headline-text">{item.headline}</div>
                            </div>
                          )}
                          <CopyACardSection label="썸네일 문구" value={item.thumbnailText || ''} icon="📸" />
                          <CopyACardSection label="첫 3초" value={item.firstThreeSeconds || ''} icon="⚡" />
                          {item.reelsScript && <CopyACardSection label="릴스 대본" value={item.reelsScript} icon="🎬" />}
                          <CopyACardSection label="타깃" value={item.targetPersona || ''} icon="👤" />
                          <CopyACardSection label="욕구 자극" value={item.desireTrigger || ''} icon="💡" />
                          <CopyACardSection label="미래 장면" value={item.futureScene || ''} icon="🌅" />
                          <CopyACardSection label="본문" value={item.storyBody || ''} icon="📖" />
                          {item.cta && (
                            <div className="rd-cta-block">
                              <span className="rd-cta-chip">{item.cta}</span>
                            </div>
                          )}
                          <CopyACardSection label="왜 먹히는지" value={item.whyItWorks || ''} icon="🔍" />
                        </>
                      ) : (
                        <div className="rd-copy-card-text">
                          {(item.body || '').split('\n').map((line, i) => (
                            <p key={i} className={line.startsWith('-') || line.startsWith('•') ? 'rd-bullet' : ''}>
                              {line}
                            </p>
                          ))}
                        </div>
                      )}
                      {/* COPY SCORE */}
                      {item.scores && (
                        <div className="rd-score-block">
                          <div className="rd-score-title">COPY SCORE</div>
                          <ScoreBar label="클릭파워" value={item.scores.clickPower} />
                          <ScoreBar label="구매욕구" value={item.scores.purchaseDesire} />
                          <ScoreBar label="스토리" value={item.scores.storyStrength} />
                          <ScoreBar label="신뢰도" value={item.scores.trust} />
                        </div>
                      )}
                    </div>
                  ) : (
                    /* 기존 일반 카드 렌더링 */
                    <div className="rd-copy-card-text">
                      {item.body.split('\n').map((line, i) => (
                        <p key={i} className={line.startsWith('-') || line.startsWith('•') ? 'rd-bullet' : ''}>
                          {line}
                        </p>
                      ))}
                    </div>
                  )}

                  {item.scoreLabel && !isCopyACard(item) && (
                    <div className="rd-legacy-score">
                      <span>{item.scoreLabel}</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* ═══ Excluded Engines (추가 조사 가능) ═══ */}
          {isCopyR && excludedEngines && excludedEngines.length > 0 && (() => {
            const engineLabelMap: Record<string, string> = {
              youtube: 'YouTube 반응 분석',
              market: 'KAMIS 시세 조회',
              review: '리뷰/고객 불안 분석',
              social: '소셜 패턴 분석',
            };
            return (
              <div className="rd-excluded-panel">
                <div className="rd-excluded-title">⚡ 추가 조사 가능</div>
                {excludedEngines.map(e => (
                  <div key={e} className="rd-excluded-item">
                    <span className="rd-excluded-dot">○</span>
                    <span>{engineLabelMap[e] || e}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ═══ NEXT ACTIONS Footer ═══ */}
          <div className="rd-footer">
            <div className="rd-footer-actions">
              <button className="rd-action-chip" onClick={() => {}}>↻ 다시</button>
              <button className="rd-action-chip" onClick={() => {}}>⚡ 자극적</button>
              <button className="rd-action-chip" onClick={() => {}}>✦ 고급</button>
              <button className="rd-action-chip" onClick={() => {}}>⊘ 짧게</button>
              <button className="rd-action-chip" onClick={() => {}}>◎ Threads</button>
              <button className="rd-action-chip" onClick={() => {}}>▶ YouTube</button>
              <button className="rd-action-chip" onClick={() => {}}>◈ Reels</button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
