/**
 * CreativeStudio.tsx — 카피 카드형 UI + 상세 모달
 * 
 * 기능:
 * 1. 카피를 카드 형태로 10~20개 그리드 표시
 * 2. AI 추천 순위(viralScore)로 정렬
 * 3. 각 카드에 태그/점수/레퍼런스 표시
 * 4. 클릭 시 풀스크린 모달로 상세 내용 표시
 * 5. 채널별 변환 미리보기 (스레드/릴스/카카오톡)
 * 6. [이걸로 결정] 버튼으로 선택 피드백
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ═══ 타입 정의 ═══
export interface CopyCard {
  id: string;
  headline: string;
  body: string;
  hookType: string;
  emotionTrigger: string;
  referenceNote: string;
  tags: string[];
  viralScore: number;
  sensoryLevel: 'high' | 'medium' | 'low';
  platformVersions?: {
    threads?: string;
    reels?: string;
    kakao?: string;
  };
}

interface CreativeStudioProps {
  visible: boolean;
  product: string;
  contentType: string;
  copies: CopyCard[];
  loading?: boolean;
  trendPatternsUsed?: number;
  videosReferenced?: number;
  onClose: () => void;
  onSelect: (copy: CopyCard) => void;
  onRegenerate?: (style?: string) => void;
  onJarvisContextEvent?: (event: { intent: string; payload?: unknown }) => void;
}

// ═══ 점수 색상 ═══
function getScoreColor(score: number): string {
  if (score >= 80) return '#00FF88';
  if (score >= 60) return '#00F5FF';
  if (score >= 40) return '#FFB800';
  return '#FF6B6B';
}

// ═══ 후킹 타입 라벨 ═══
function getHookLabel(hookType: string): string {
  const labels: Record<string, string> = {
    sensory_hook: '감각자극',
    conflict_hook: '갈등유발',
    confession_hook: '고백형',
    seasonal_hook: '계절감',
    contrarian_hook: '반전형',
    local_trust_hook: '산지신뢰',
    memory_hook: '추억형',
    limited_timing_hook: '한정형',
    identity_hook: '정체성',
    question_hook: '질문형',
    surprise_hook: '놀라움',
  };
  return labels[hookType] || hookType;
}

// ═══ 감각 레벨 아이콘 ═══
function getSensoryIcon(level: string): string {
  if (level === 'high') return '🔥';
  if (level === 'medium') return '✨';
  return '○';
}

// ═══ 콘텐츠 타입 라벨 ═══
function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    headcopy: '후킹 문구',
    threads_post: '스레드 글',
    reels_script: '릴스 스크립트',
    youtube_thumbnail: '썸네일 문구',
    instagram_copy: '인스타 캡션',
    full_package: '마케팅 패키지',
  };
  return labels[type] || '마케팅 콘텐츠';
}

// ═══ 상세 모달 컴포넌트 ═══
function CopyDetailModal({
  copy,
  product,
  rank,
  onClose,
  onSelect,
}: {
  copy: CopyCard;
  product: string;
  rank: number;
  onClose: () => void;
  onSelect: (copy: CopyCard) => void;
}) {
  const [activeTab, setActiveTab] = useState<'full' | 'threads' | 'reels' | 'kakao'>('full');

  return (
    <motion.div
      className="cs-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <motion.div
        className="cs-modal-content"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '680px', maxHeight: '90vh',
          background: 'linear-gradient(160deg, rgba(8,14,32,0.99) 0%, rgba(4,8,20,0.99) 100%)',
          border: '1px solid rgba(0,180,255,0.25)',
          borderRadius: '16px',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,100,255,0.2), 0 0 40px rgba(0,245,255,0.08)',
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(0,180,255,0.15)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(0,180,255,0.03)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: `linear-gradient(135deg, ${getScoreColor(copy.viralScore)}22, ${getScoreColor(copy.viralScore)}44)`,
              border: `1px solid ${getScoreColor(copy.viralScore)}66`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 700, color: getScoreColor(copy.viralScore),
            }}>
              {rank}
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>{product} 카피</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginTop: '2px' }}>
                {getHookLabel(copy.hookType)} · {copy.emotionTrigger}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              padding: '4px 10px', borderRadius: '12px',
              background: `${getScoreColor(copy.viralScore)}18`,
              border: `1px solid ${getScoreColor(copy.viralScore)}44`,
              color: getScoreColor(copy.viralScore),
              fontSize: '12px', fontWeight: 700,
            }}>
              {copy.viralScore}점
            </div>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#aaa', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
              fontSize: '12px',
            }}>✕</button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* Headline */}
          <div style={{
            padding: '16px 20px', borderRadius: '12px',
            background: 'rgba(0,245,255,0.04)',
            border: '1px solid rgba(0,245,255,0.15)',
            marginBottom: '20px',
          }}>
            <div style={{ color: 'rgba(0,245,255,0.7)', fontSize: '9px', letterSpacing: '2px', marginBottom: '8px' }}>HEADLINE</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: 700, lineHeight: 1.5 }}>
              {copy.headline}
            </div>
          </div>

          {/* Full Body */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '9px', letterSpacing: '2px', marginBottom: '8px' }}>FULL SCRIPT</div>
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {copy.body}
            </div>
          </div>

          {/* Platform Tabs */}
          {copy.platformVersions && (copy.platformVersions.threads || copy.platformVersions.reels || copy.platformVersions.kakao) && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '9px', letterSpacing: '2px', marginBottom: '12px' }}>PLATFORM VERSIONS</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {['full', 'threads', 'reels', 'kakao'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    style={{
                      padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
                      background: activeTab === tab ? 'rgba(0,245,255,0.15)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${activeTab === tab ? 'rgba(0,245,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      color: activeTab === tab ? '#00F5FF' : 'rgba(255,255,255,0.5)',
                      fontSize: '11px', fontWeight: 500,
                    }}
                  >
                    {tab === 'full' ? '원본' : tab === 'threads' ? '스레드' : tab === 'reels' ? '릴스' : '카카오톡'}
                  </button>
                ))}
              </div>
              <div style={{
                padding: '14px 16px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.8)', fontSize: '13px', lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
              }}>
                {activeTab === 'full' && copy.body}
                {activeTab === 'threads' && (copy.platformVersions?.threads || '(스레드 버전 미생성)')}
                {activeTab === 'reels' && (copy.platformVersions?.reels || '(릴스 버전 미생성)')}
                {activeTab === 'kakao' && (copy.platformVersions?.kakao || '(카카오톡 버전 미생성)')}
              </div>
            </div>
          )}

          {/* Reference Note */}
          {copy.referenceNote && (
            <div style={{
              padding: '12px 16px', borderRadius: '8px',
              background: 'rgba(255,184,0,0.06)',
              border: '1px solid rgba(255,184,0,0.2)',
              marginBottom: '16px',
            }}>
              <div style={{ color: 'rgba(255,184,0,0.7)', fontSize: '9px', letterSpacing: '1px', marginBottom: '4px' }}>REFERENCE</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>{copy.referenceNote}</div>
            </div>
          )}

          {/* Tags */}
          {copy.tags && copy.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
              {copy.tags.map((tag, i) => (
                <span key={i} style={{
                  padding: '4px 10px', borderRadius: '12px',
                  background: 'rgba(0,245,255,0.08)',
                  border: '1px solid rgba(0,245,255,0.2)',
                  color: 'rgba(0,245,255,0.8)', fontSize: '11px',
                }}>{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(0,180,255,0.15)',
          display: 'flex', gap: '10px', justifyContent: 'flex-end',
          background: 'rgba(0,0,0,0.3)',
        }}>
          <button
            onClick={() => navigator.clipboard.writeText(copy.body)}
            style={{
              padding: '10px 18px', borderRadius: '8px', cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: 500,
            }}
          >
            복사
          </button>
          <button
            onClick={() => { onClose(); saveStyleFeedback(copy.headline, 'rejected', product); }}
            style={{
              padding: '10px 18px', borderRadius: '8px', cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: 500,
            }}
          >
            패스
          </button>
          <button
            onClick={() => onSelect(copy)}
            style={{
              padding: '10px 24px', borderRadius: '8px', cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(0,245,255,0.2), rgba(0,180,255,0.3))',
              border: '1px solid rgba(0,245,255,0.5)',
              color: '#00F5FF', fontSize: '12px', fontWeight: 700,
              boxShadow: '0 4px 20px rgba(0,245,255,0.15)',
            }}
          >
            이걸로 결정
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══ 스타일 학습 피드백 저장 ═══
async function saveStyleFeedback(headline: string, action: 'approved' | 'rejected', product: string) {
  try {
    // 1. localStorage에 즉시 저장 (로컬 캐시)
    const existing = JSON.parse(localStorage.getItem('jarvis.styleMemory') || '[]');
    existing.push({
      headline,
      action,
      product,
      timestamp: new Date().toISOString(),
    });
    // 최대 50건만 유지
    if (existing.length > 50) existing.splice(0, existing.length - 50);
    localStorage.setItem('jarvis.styleMemory', JSON.stringify(existing));

    // 2. Google Sheets에 저장 (API 호출)
    fetch('/api/trend-collector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_feedback',
        headline,
        feedbackType: action,
        product,
      }),
    }).catch(() => {}); // 실패해도 무시
  } catch {}
}

// ═══ 메인 컴포넌트 ═══
export default function CreativeStudio({
  visible,
  product,
  contentType,
  copies,
  loading,
  trendPatternsUsed,
  videosReferenced,
  onClose,
  onSelect,
  onRegenerate,
  onJarvisContextEvent,
}: CreativeStudioProps) {
  const [selectedCopy, setSelectedCopy] = useState<CopyCard | null>(null);
  const [selectedRank, setSelectedRank] = useState(0);

  if (!visible) return null;

  // 점수 순 정렬
  const sortedCopies = [...copies].sort((a, b) => b.viralScore - a.viralScore);

  const handleCardClick = (copy: CopyCard, rank: number) => {
    setSelectedCopy(copy);
    setSelectedRank(rank);
    onJarvisContextEvent?.({ intent: 'copy_card_detail', payload: { copy, rank } });
  };

  const handleSelect = (copy: CopyCard) => {
    onSelect(copy);
    setSelectedCopy(null);
    onJarvisContextEvent?.({ intent: 'copy_selected', payload: { copy } });
    // 스타일 학습: approved 피드백 저장
    saveStyleFeedback(copy.headline, 'approved', product);
  };

  const handlePass = (copy: CopyCard) => {
    setSelectedCopy(null);
    onJarvisContextEvent?.({ intent: 'copy_passed', payload: { copy } });
    // 스타일 학습: rejected 피드백 저장
    saveStyleFeedback(copy.headline, 'rejected', product);
  };

  return (
    <>
      <motion.div
        className="creative-studio-panel"
        initial={{ opacity: 0, x: -40, filter: 'blur(8px)' }}
        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, x: -30, filter: 'blur(4px)' }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: 'min(480px, 95vw)',
          background: 'linear-gradient(180deg, rgba(6,10,18,0.98) 0%, rgba(3,6,12,0.99) 100%)',
          borderRight: '1px solid rgba(0,180,255,0.2)',
          zIndex: 9100,
          display: 'flex', flexDirection: 'column',
          fontFamily: "'Inter', -apple-system, sans-serif",
          boxShadow: '16px 0 60px rgba(0,100,255,0.12)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 20px',
          borderBottom: '1px solid rgba(0,180,255,0.15)',
          background: 'rgba(0,180,255,0.03)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: '#00F5FF', fontSize: '9px', letterSpacing: '3px', marginBottom: '4px' }}>CREATIVE STUDIO</div>
              <div style={{ color: '#fff', fontSize: '15px', fontWeight: 600 }}>
                {product} · {getTypeLabel(contentType)}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)',
              color: '#ff6666', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
              fontSize: '10px', letterSpacing: '1px',
            }}>CLOSE</button>
          </div>

          {/* Stats Bar */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <div style={{
              padding: '4px 10px', borderRadius: '10px',
              background: 'rgba(0,255,136,0.08)',
              border: '1px solid rgba(0,255,136,0.2)',
              color: '#00FF88', fontSize: '10px',
            }}>
              {sortedCopies.length} cards
            </div>
            {trendPatternsUsed !== undefined && trendPatternsUsed > 0 && (
              <div style={{
                padding: '4px 10px', borderRadius: '10px',
                background: 'rgba(255,184,0,0.08)',
                border: '1px solid rgba(255,184,0,0.2)',
                color: '#FFB800', fontSize: '10px',
              }}>
                {trendPatternsUsed} trends
              </div>
            )}
            {videosReferenced !== undefined && videosReferenced > 0 && (
              <div style={{
                padding: '4px 10px', borderRadius: '10px',
                background: 'rgba(255,100,100,0.08)',
                border: '1px solid rgba(255,100,100,0.2)',
                color: '#FF6464', fontSize: '10px',
              }}>
                {videosReferenced} refs
              </div>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '16px',
          }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              style={{
                width: '40px', height: '40px', borderRadius: '50%',
                border: '2px solid rgba(0,245,255,0.2)',
                borderTop: '2px solid #00F5FF',
              }}
            />
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>
              트렌드 분석 중... 카피 생성 중...
            </div>
          </div>
        )}

        {/* Card Grid */}
        {!loading && (
          <div style={{
            flex: 1, overflowY: 'auto', padding: '16px',
            display: 'flex', flexDirection: 'column', gap: '10px',
          }}>
            <AnimatePresence>
              {sortedCopies.map((copy, idx) => (
                <motion.div
                  key={copy.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06, duration: 0.4 }}
                  onClick={() => handleCardClick(copy, idx + 1)}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    background: idx === 0
                      ? 'linear-gradient(135deg, rgba(0,245,255,0.06), rgba(0,180,255,0.04))'
                      : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${idx === 0 ? 'rgba(0,245,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  whileHover={{ scale: 1.01, borderColor: 'rgba(0,245,255,0.4)' }}
                  whileTap={{ scale: 0.99 }}
                >
                  {/* Card Top Row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '6px',
                      background: idx < 3
                        ? `linear-gradient(135deg, ${getScoreColor(copy.viralScore)}22, ${getScoreColor(copy.viralScore)}44)`
                        : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${idx < 3 ? getScoreColor(copy.viralScore) + '66' : 'rgba(255,255,255,0.1)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', fontWeight: 700,
                      color: idx < 3 ? getScoreColor(copy.viralScore) : 'rgba(255,255,255,0.4)',
                    }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        color: '#fff', fontSize: '13px', fontWeight: 600,
                        lineHeight: 1.4,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {copy.headline}
                      </div>
                    </div>
                    <div style={{
                      padding: '3px 8px', borderRadius: '8px',
                      background: `${getScoreColor(copy.viralScore)}15`,
                      border: `1px solid ${getScoreColor(copy.viralScore)}44`,
                      color: getScoreColor(copy.viralScore),
                      fontSize: '10px', fontWeight: 700, flexShrink: 0,
                    }}>
                      {copy.viralScore}
                    </div>
                  </div>

                  {/* Card Tags */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '8px',
                      background: 'rgba(0,245,255,0.08)',
                      border: '1px solid rgba(0,245,255,0.15)',
                      color: 'rgba(0,245,255,0.7)', fontSize: '9px',
                    }}>
                      {getHookLabel(copy.hookType)}
                    </span>
                    <span style={{
                      padding: '2px 8px', borderRadius: '8px',
                      background: 'rgba(255,184,0,0.08)',
                      border: '1px solid rgba(255,184,0,0.15)',
                      color: 'rgba(255,184,0,0.7)', fontSize: '9px',
                    }}>
                      {copy.emotionTrigger}
                    </span>
                    <span style={{
                      padding: '2px 6px', borderRadius: '8px',
                      color: 'rgba(255,255,255,0.4)', fontSize: '9px',
                    }}>
                      {getSensoryIcon(copy.sensoryLevel)} {copy.sensoryLevel}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Footer Actions */}
        {!loading && sortedCopies.length > 0 && (
          <div style={{
            padding: '14px 16px',
            borderTop: '1px solid rgba(0,180,255,0.15)',
            display: 'flex', gap: '8px', flexWrap: 'wrap',
            background: 'rgba(0,0,0,0.3)',
            flexShrink: 0,
          }}>
            <button onClick={() => onRegenerate?.()} style={{
              padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.6)', fontSize: '11px',
            }}>↻ 다시 생성</button>
            <button onClick={() => onRegenerate?.('더 자극적으로')} style={{
              padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
              background: 'rgba(255,100,100,0.06)',
              border: '1px solid rgba(255,100,100,0.2)',
              color: 'rgba(255,100,100,0.7)', fontSize: '11px',
            }}>⚡ 자극적</button>
            <button onClick={() => onRegenerate?.('더 감성적으로')} style={{
              padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
              background: 'rgba(180,130,255,0.06)',
              border: '1px solid rgba(180,130,255,0.2)',
              color: 'rgba(180,130,255,0.7)', fontSize: '11px',
            }}>✦ 감성</button>
            <button onClick={() => onRegenerate?.('짧고 임팩트 있게')} style={{
              padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
              background: 'rgba(0,255,136,0.06)',
              border: '1px solid rgba(0,255,136,0.2)',
              color: 'rgba(0,255,136,0.7)', fontSize: '11px',
            }}>⊘ 짧게</button>
          </div>
        )}
      </motion.div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedCopy && (
          <CopyDetailModal
            copy={selectedCopy}
            product={product}
            rank={selectedRank}
            onClose={() => setSelectedCopy(null)}
            onSelect={handleSelect}
          />
        )}
      </AnimatePresence>
    </>
  );
}
