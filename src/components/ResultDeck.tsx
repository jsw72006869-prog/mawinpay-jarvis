/**
 * ResultDeck.tsx — UI-V1.2-B Viral Command Center
 *
 * 수정 내역 (UI-V1.2-B):
 * A. Mission Feed: 실제 사용 엔진만 ANALYZED (사용 엔진: 라인 파싱)
 * B. 스켈레톤/완료 불일치 제거: items 없으면 "카피 카드 생성 중" 표시
 * C. 선명도 보정: Result Deck 내부 blur/filter/opacity 제거
 * D. 카드 잘림 개선: rd-body 높이 조정, NEXT ACTIONS 분리
 * E. Research Intel 엔진별 카드: 실제 사용 엔진 기준으로 분리 표시
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
  text?: string;
  platform?: string;
  outputType?: string;
  finalScore?: number;
  recommended?: boolean;
  desires?: string[];
  anxieties?: string[];
  triggers?: string[];
  sensory?: string[];
  hookType?: string;
  whyRecommended?: string;
  rewriteHint?: string;
  boringScore?: number;
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

function getItemText(item: ResultItem): string {
  return item.text || item.body || item.headline || '';
}

function compactValues(values?: string[]): string[] {
  return Array.isArray(values) ? values.filter(Boolean).slice(0, 3) : [];
}

function FieldChips({ label, values, color }: { label: string; values?: string[]; color: string }) {
  const shown = compactValues(values);
  if (shown.length === 0) return null;
  const extra = Math.max(0, (values?.length || 0) - shown.length);
  return (
    <div className="rd-hd-chip-row">
      <span className="rd-hd-chip-label">{label}</span>
      {shown.map((value, i) => (
        <span key={`${label}-${value}-${i}`} className="rd-hd-chip" style={{ borderColor: `${color}55`, color }}>
          {String(value).replace(/_/g, ' ')}
        </span>
      ))}
      {extra > 0 && <span className="rd-hd-chip muted">+{extra}</span>}
    </div>
  );
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
  onCardSelect?: (item: ResultItem, index: number) => void;
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
  if (researchInsight?.includes('시장/시즈 인사이트') || researchInsight?.includes('시장/시세 인사이트')) return { mode: 'COPY-R.2', label: 'MARKET INTEL', color: '#64FF96' };
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

// ─── 수정 A: 실제 사용 엔진 파싱 ───
// combinedInsight에서 "사용 엔진: youtube + market" 라인을 파싱하여 실제 사용 엔진 목록 추출
function parseUsedEnginesFromInsight(researchInsight: string): string[] {
  // "사용 엔진: youtube + market (2/2 성공)" 패턴 파싱
  const match = researchInsight.match(/사용 엔진:\s*([^\n(]+)/);
  if (!match) return [];
  const raw = match[1].trim();
  // "youtube + market" → ['youtube', 'market']
  return raw.split(/\s*\+\s*/).map(e => e.trim().toLowerCase()).filter(Boolean);
}

// ─── 수정 A: Mission Feed 엔진 목록 생성 (실제 사용 엔진 기준) ───
function getMissionFeedEngines(researchInsight: string, excludedEngines: string[]): Array<{ name: string; label: string; status: 'used' | 'available' }> {
  const allEngines = [
    { key: 'youtube', label: 'YouTube Pattern' },
    { key: 'market', label: 'Market Context' },
    { key: 'review', label: 'Review Objection' },
    { key: 'social', label: 'Social Pattern' },
  ];

  // 1순위: "사용 엔진:" 라인에서 실제 사용 엔진 파싱
  const usedEngines = parseUsedEnginesFromInsight(researchInsight);

  if (usedEngines.length > 0) {
    // 실제 사용 엔진 목록이 있으면 정확히 구분
    return allEngines.map(eng => ({
      name: eng.key,
      label: eng.label,
      status: usedEngines.includes(eng.key) ? 'used' : 'available',
    }));
  }

  // 2순위: excludedEngines 기반 (fallback)
  // excludedEngines에 있으면 available, 없으면 used
  // 단, 아무 엔진도 감지 안 되면 전체 숨김
  const result: Array<{ name: string; label: string; status: 'used' | 'available' }> = [];
  for (const eng of allEngines) {
    if (excludedEngines.includes(eng.key)) {
      result.push({ name: eng.key, label: eng.label, status: 'available' });
    } else {
      // 인사이트 섹션 헤더 기반으로 used 판단 (키워드 전체 매칭 금지)
      const sectionHeaders: Record<string, string[]> = {
        youtube: ['[YouTube 분석]'],
        market: ['[시장/시세 분석]'],
        review: ['[리뷰/고객 불안 분석]'],
        social: ['[소셜 패턴 분석]'],
      };
      const isUsed = sectionHeaders[eng.key]?.some(h => researchInsight.includes(h));
      if (isUsed) {
        result.push({ name: eng.key, label: eng.label, status: 'used' });
      }
      // used도 available도 아니면 숨김 (표시 안 함)
    }
  }
  return result;
}

// ─── 수정 E: Research Intel 엔진별 파싱 ───
function parseInsightSections(insight: string, usedEngines: string[]): Array<{ engine: string; icon: string; color: string; lines: string[]; status: 'used' | 'available' }> {
  const engineDefs = [
    { key: 'youtube', name: 'YouTube', icon: '▶', color: '#FF6464', headers: ['[YouTube 분석]'] },
    { key: 'market', name: 'Market', icon: '◆', color: '#64FF96', headers: ['[시장/시세 분석]'] },
    { key: 'review', name: 'Review', icon: '◈', color: '#FF9664', headers: ['[리뷰/고객 불안 분석]'] },
    { key: 'social', name: 'Social', icon: '◉', color: '#B482FF', headers: ['[소셜 패턴 분석]'] },
  ];

  const sections: Array<{ engine: string; icon: string; color: string; lines: string[]; status: 'used' | 'available' }> = [];

  for (const def of engineDefs) {
    const isUsed = usedEngines.length > 0
      ? usedEngines.includes(def.key)
      : def.headers.some(h => insight.includes(h));

    if (!isUsed) continue; // 사용하지 않은 엔진은 Research Intel에서 숨김

    // 해당 엔진 섹션 내용 추출
    let lines: string[] = [];
    for (const header of def.headers) {
      const idx = insight.indexOf(header);
      if (idx !== -1) {
        const after = insight.slice(idx + header.length);
        // 다음 섹션 헤더 또는 [카피 적용 방향] 전까지
        const nextSectionMatch = after.match(/\n\[([^\]]+)\]/);
        const content = nextSectionMatch
          ? after.slice(0, nextSectionMatch.index)
          : after.slice(0, 400);
        lines = content.split('\n').filter(l => l.trim() && !l.startsWith('사용 엔진') && !l.startsWith('품목')).slice(0, 3);
        break;
      }
    }

    if (lines.length > 0) {
      sections.push({ engine: def.name, icon: def.icon, color: def.color, lines, status: 'used' });
    }
  }

  // 섹션이 없으면 전체를 하나로 (COPY-R.1/R.2/R.3/R.4 단일 엔진 케이스)
  if (sections.length === 0 && insight.trim()) {
    const cleanLines = insight.split('\n')
      .filter(l => l.trim() && !l.startsWith('📊') && !l.startsWith('사용 엔진') && !l.startsWith('품목') && !l.startsWith('[카피') && !l.startsWith('[피해'))
      .slice(0, 4);
    if (cleanLines.length > 0) {
      sections.push({ engine: 'Research', icon: '◆', color: '#00F5FF', lines: cleanLines, status: 'used' });
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
  onCardSelect,
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

  // ─── 수정 B: 카드 데이터 상태 판단 ───
  const hasItems = items.length > 0;
  const hasFallbackContent = content && content.trim().length > 20;
  const displayItems: ResultItem[] = hasItems
    ? items
    : hasFallbackContent
      ? parseSections(content).map((s, i) => ({
          id: `fallback-${i}`,
          title: s.title || `${i + 1}번 결과`,
          body: s.body,
          tone: i === 0 ? '추천안' : '변형안'
        }))
      : [];

  // COPY-A v2 구조화 카드 여부 판단
  const isCopyACard = (item: ResultItem) => item.format === 'copy_a';

  // ─── 수정 A: 실제 사용 엔진 파싱 ───
  const usedEngines = isCopyR ? parseUsedEnginesFromInsight(researchInsight) : [];

  // ─── 수정 E: Research Insight 섹션 파싱 (실제 사용 엔진 기준) ───
  const insightSections = isCopyR && researchInsight
    ? parseInsightSections(researchInsight.split('[COPY-A 주입 인사이트]')[0].trim(), usedEngines)
    : [];

  // ─── 수정 A: Mission Feed (실제 사용 엔진 기준) ───
  const missionFeed = isCopyR ? getMissionFeedEngines(researchInsight, excludedEngines) : [];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          data-testid="result-deck"
          className="result-deck-overlay rd-v12b"
          initial={{ opacity: 0, x: -40, scale: 0.97, filter: 'blur(6px)' }}
          animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, x: -30, scale: 0.98, filter: 'blur(4px)' }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
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

            {/* ─── 수정 A: Mission Feed (실제 사용 엔진만 표시) ─── */}
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

            {/* ─── 수정 E: Research Intel Panel (실제 사용 엔진별 카드) ─── */}
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
                    <div key={i} className="rd-research-card" style={{ borderColor: `${sec.color}44` }}>
                      <div className="rd-research-card-header">
                        <span className="rd-research-card-icon" style={{ color: sec.color }}>{sec.icon}</span>
                        <span className="rd-research-card-name" style={{ color: 'rgba(220,230,240,0.9)' }}>{sec.engine}</span>
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

            {/* ─── 수정 B: 카드 상태 표시 ─── */}
            {showContent && displayItems.length === 0 && (
              <div className="rd-loading-state">
                <div className="rd-loading-icon">⬡</div>
                <div className="rd-loading-text">JARVIS IS COMPOSING COPY CARDS</div>
                <div className="rd-loading-sub">리서치가 완료되었습니다. 카피 카드를 생성 중입니다.</div>
              </div>
            )}

            {/* ─── Copy Cards ─── */}
            <AnimatePresence>
              {showContent && displayItems.map((item, idx) => (
                <motion.div
                  data-testid="copy-card"
                  key={item.id || idx}
                  className="rd-copy-card" onClick={() => onCardSelect?.(item, idx)}
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
                      {item.platform && <span className="rd-tone-chip">{item.platform}</span>}
                      {item.outputType && <span className="rd-tone-chip">{item.outputType}</span>}
                      {item.finalScore !== undefined && <span className="rd-tone-chip">{item.finalScore}점</span>}
                      {item.recommended !== undefined && (
                        <span className="rd-tone-chip">{item.recommended ? '추천' : '검토'}</span>
                      )}
                      {item.riskLevel && (
                        <span className="rd-risk-chip" style={{ borderColor: getRiskColor(item.riskLevel), color: getRiskColor(item.riskLevel) }}>
                          {item.riskLevel}
                        </span>
                      )}
                    </div>
                    <button className="rd-copy-card-copy-btn" onClick={(e) => { e.stopPropagation(); handleCopy(item.body); }}>⎘</button>
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
                      {getItemText(item).split('\n').map((line, i) => (
                        <p key={i} className={line.startsWith('-') || line.startsWith('•') ? 'rd-bullet' : ''}>
                          {line}
                        </p>
                      ))}
                    </div>
                  )}

                  {(item.desires?.length || item.anxieties?.length || item.triggers?.length || item.sensory?.length || item.whyRecommended || item.rewriteHint) && (
                    <div className="rd-hd-fields" data-testid="copy-card-human-desire-fields">
                      <FieldChips label="욕구" values={item.desires} color="#ff8bd8" />
                      <FieldChips label="불안" values={item.anxieties} color="#ffbf4d" />
                      <FieldChips label="트리거" values={item.triggers} color="#40d7ff" />
                      <FieldChips label="감각" values={item.sensory} color="#ff9b62" />
                      {item.whyRecommended && (
                        <div className="rd-hd-note"><strong>추천 이유</strong> {item.whyRecommended}</div>
                      )}
                      {item.rewriteHint && (
                        <div className="rd-hd-note warn"><strong>다시쓰기 힌트</strong> {item.rewriteHint}</div>
                      )}
                    </div>
                  )}

                  {item.scoreLabel && !isCopyACard(item) && (
                    <div className="rd-legacy-score" data-testid="copy-card-score">
                      <span>{item.scoreLabel}</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* ─── Excluded Engines (추가 조사 가능) ─── */}
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
          </div>

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
