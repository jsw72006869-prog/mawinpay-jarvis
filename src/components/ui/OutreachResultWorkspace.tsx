import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { InfluencerCandidate } from '../InfluencerOutreachPanel';

// ── 후보 상세 Drawer ──
function CandidateDetailDrawer({
  candidate,
  onClose,
  onJarvisContextEvent,
}: {
  candidate: InfluencerCandidate;
  onClose: () => void;
  onJarvisContextEvent?: (event: { intent: string; payload?: unknown }) => void;
}) {
  const getScoreColor = (score: number) => {
    if (score >= 70) return '#00ff88';
    if (score >= 50) return '#ffaa00';
    return '#ff4444';
  };

  return (
    <motion.div
      className="outreach-detail-drawer"
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 60 }}
      transition={{ type: 'spring', damping: 28, stiffness: 200 }}
      style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: 'min(520px, 92vw)',
        background: 'linear-gradient(160deg, rgba(8,14,32,0.99) 0%, rgba(4,8,20,0.99) 100%)',
        borderLeft: '1px solid rgba(0,180,255,0.35)',
        zIndex: 9200,
        display: 'flex', flexDirection: 'column',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        boxShadow: '-16px 0 60px rgba(0,100,255,0.18)',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '18px 22px',
        borderBottom: '1px solid rgba(0,180,255,0.2)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        background: 'rgba(0,180,255,0.04)',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ color: '#00b4ff', fontSize: '9px', letterSpacing: '2px', marginBottom: '4px' }}>CANDIDATE DETAIL</div>
          <div style={{ color: '#ffffff', fontSize: '16px', fontWeight: 700, maxWidth: '360px' }}>{candidate.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginTop: '2px' }}>{candidate.platform}</div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,50,50,0.12)', border: '1px solid rgba(255,50,50,0.35)',
            color: '#ff6666', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer',
            fontSize: '10px', letterSpacing: '1px', flexShrink: 0,
          }}
        >CLOSE</button>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 22px', flex: 1 }}>
        {/* Badges */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
          <span style={{
            background: candidate.platform.toLowerCase().includes('youtube') ? 'rgba(255,0,0,0.18)' : 'rgba(0,200,0,0.18)',
            color: candidate.platform.toLowerCase().includes('youtube') ? '#ff4444' : '#00cc66',
            padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
          }}>{candidate.platform}</span>
          <span style={{
            background: `${getScoreColor(candidate.productFitScore)}18`,
            border: `1px solid ${getScoreColor(candidate.productFitScore)}`,
            color: getScoreColor(candidate.productFitScore),
            padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
          }}>적합도 {candidate.productFitScore}점</span>
          {(candidate.publicContactStatus === 'email_public' || candidate.publicEmailMasked) && (
            <span style={{
              background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.4)',
              color: '#00ff88', padding: '4px 10px', borderRadius: '4px', fontSize: '11px',
            }}>✉ 공개 이메일 확인됨</span>
          )}
          <span style={{
            background: 'rgba(255,165,0,0.12)', border: '1px solid rgba(255,165,0,0.35)',
            color: '#ffaa00', padding: '4px 10px', borderRadius: '4px', fontSize: '10px',
          }}>{candidate.outreachStatus || 'collected'}</span>
        </div>

        {/* Info Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
          {[
            { label: '구독/방문', value: candidate.subscriberOrVisitor || '-' },
            { label: '조회수', value: candidate.viewCount || '-' },
            { label: '키워드', value: candidate.keyword || '-' },
            { label: '제안 상품', value: candidate.suggestedProduct || '-' },
          ].map(item => (
            <div key={item.label} style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '6px', padding: '10px 12px',
            }}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', letterSpacing: '1px', marginBottom: '4px' }}>{item.label}</div>
              <div style={{ color: '#ffffff', fontSize: '12px', fontWeight: 600 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* 최근 콘텐츠 */}
        {candidate.recentContentTitle && (
          <div style={{
            background: 'rgba(0,180,255,0.05)', border: '1px solid rgba(0,180,255,0.15)',
            borderRadius: '8px', padding: '14px 16px', marginBottom: '14px',
          }}>
            <div style={{ color: '#00b4ff', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '6px' }}>최근 콘텐츠</div>
            <div style={{ color: '#ffffff', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>{candidate.recentContentTitle}</div>
          </div>
        )}

        {/* 자비스 판단 */}
        {candidate.productFitReason && (
          <div style={{
            background: 'rgba(170,136,255,0.05)', border: '1px solid rgba(170,136,255,0.2)',
            borderRadius: '8px', padding: '14px 16px', marginBottom: '14px',
          }}>
            <div style={{ color: '#aa88ff', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '6px' }}>자비스 판단</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', lineHeight: '1.7' }}>{candidate.productFitReason}</div>
          </div>
        )}

        {/* 제안 각도 */}
        {candidate.suggestedOfferAngle && (
          <div style={{
            background: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.2)',
            borderRadius: '8px', padding: '14px 16px', marginBottom: '14px',
          }}>
            <div style={{ color: '#ffaa00', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '6px' }}>추천 제안 각도</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', lineHeight: '1.7' }}>{candidate.suggestedOfferAngle}</div>
          </div>
        )}

        {/* 이메일 원문 비노출 안내 */}
        {(candidate.publicContactStatus === 'email_public' || candidate.publicEmailMasked) && (
          <div style={{
            background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.2)',
            borderRadius: '8px', padding: '12px 16px', marginBottom: '14px',
          }}>
            <div style={{ color: '#00ff88', fontSize: '10px', lineHeight: '1.6' }}>
              ✉ 공개 이메일 확인됨 — 보안 정책상 이메일 원문은 화면에 표시하지 않습니다.<br />
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Google Sheets에서 확인하세요.</span>
            </div>
          </div>
        )}

        {/* 채널/콘텐츠 URL 버튼 */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {candidate.channelOrBlogUrl && (
            <a
              href={candidate.channelOrBlogUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'rgba(0,180,255,0.12)', border: '1px solid rgba(0,180,255,0.35)',
                color: '#00b4ff', padding: '7px 14px', borderRadius: '4px',
                fontSize: '10px', textDecoration: 'none', letterSpacing: '0.5px',
              }}
            >↗ 프로필 열기</a>
          )}
          {candidate.recentContentUrl && (
            <a
              href={candidate.recentContentUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'rgba(170,136,255,0.12)', border: '1px solid rgba(170,136,255,0.35)',
                color: '#aa88ff', padding: '7px 14px', borderRadius: '4px',
                fontSize: '10px', textDecoration: 'none', letterSpacing: '0.5px',
              }}
            >↗ 콘텐츠 열기</a>
          )}
        </div>

        {/* Next Actions */}
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px', padding: '14px 16px',
        }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '10px' }}>NEXT ACTIONS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={() => onJarvisContextEvent?.({ intent: 'draft_proposal', payload: { candidate } })}
              style={{
                background: 'rgba(170,136,255,0.12)', border: '1px solid rgba(170,136,255,0.35)',
                color: '#aa88ff', padding: '8px 14px', borderRadius: '4px',
                fontSize: '10px', cursor: 'pointer', textAlign: 'left', letterSpacing: '0.5px',
              }}
            >✏ 제안서 초안 만들기 (Draft Only)</button>
            <button
              onClick={() => {
                const url = 'https://docs.google.com/spreadsheets';
                window.open(url, '_blank');
              }}
              style={{
                background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)',
                color: '#00ff88', padding: '8px 14px', borderRadius: '4px',
                fontSize: '10px', cursor: 'pointer', textAlign: 'left', letterSpacing: '0.5px',
              }}
            >📊 Google Sheets 열기</button>
            <button
              disabled
              style={{
                background: 'rgba(255,50,50,0.06)', border: '1px solid rgba(255,50,50,0.2)',
                color: 'rgba(255,80,80,0.5)', padding: '8px 14px', borderRadius: '4px',
                fontSize: '10px', cursor: 'not-allowed', textAlign: 'left', letterSpacing: '0.5px',
              }}
            >🔒 실제 발송 — EXECUTE LOCKED (대표님 승인 필요)</button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── 메인 OutreachResultWorkspace ──
interface OutreachResultWorkspaceProps {
  visible: boolean;
  candidates: InfluencerCandidate[];
  loading?: boolean;
  onClose: () => void;
  onSave?: (candidates: InfluencerCandidate[]) => void;
  onJarvisContextEvent?: (event: { intent: string; payload?: unknown }) => void;
  sheetsUrl?: string;
}

export default function OutreachResultWorkspace({
  visible,
  candidates,
  loading,
  onClose,
  onSave,
  onJarvisContextEvent,
  sheetsUrl,
}: OutreachResultWorkspaceProps) {
  const [filter, setFilter] = useState<'all' | 'high' | 'youtube' | 'naver' | 'email' | 'qualified' | 'review'>('all');
  const [selectedCandidate, setSelectedCandidate] = useState<InfluencerCandidate | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  const filtered = candidates.filter(c => {
    if (filter === 'high') return c.productFitScore >= 60;
    if (filter === 'youtube') return c.platform.toLowerCase().includes('youtube');
    if (filter === 'naver') return c.platform.toLowerCase().includes('naver');
    if (filter === 'email') return c.publicContactStatus === 'email_public' || !!c.publicEmailMasked;
    if (filter === 'qualified') return (c as any).target_match_status === 'qualified';
    if (filter === 'review') return (c as any).target_match_status === 'review';
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = {
    total: candidates.length,
    contactable: candidates.filter(c => c.publicContactStatus === 'email_public' || c.publicContactStatus === 'form_available').length,
    highFit: candidates.filter(c => c.productFitScore >= 60).length,
    emailDraft: candidates.filter(c => c.firstEmailDraft).length,
    qualified: candidates.filter(c => (c as any).target_match_status === 'qualified').length,
    review: candidates.filter(c => (c as any).target_match_status === 'review').length,
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return '#00ff88';
    if (score >= 50) return '#ffaa00';
    return '#ff4444';
  };

  const handleCandidateSelect = useCallback((c: InfluencerCandidate) => {
    setSelectedCandidate(c);
    setDetailOpen(true);
    onJarvisContextEvent?.({ intent: 'candidate_selected', payload: { candidate: c } });
  }, [onJarvisContextEvent]);

  if (!visible) return null;

  return (
    <>
      <motion.div
        className="outreach-result-workspace"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', damping: 28, stiffness: 180 }}
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(4,8,20,0.97)',
          zIndex: 9100,
          display: 'flex', flexDirection: 'column',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* ── 헤더 ── */}
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid rgba(0,180,255,0.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(0,180,255,0.04)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div>
              <div style={{ color: '#00b4ff', fontSize: '9px', letterSpacing: '2px', marginBottom: '3px' }}>INFLUENCER OUTREACH</div>
              <div style={{ color: '#ffffff', fontSize: '15px', fontWeight: 700 }}>공동구매 후보 Result Workspace</div>
            </div>
            <div style={{
              background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.35)',
              color: '#00ff88', padding: '4px 10px', borderRadius: '12px', fontSize: '10px',
            }}>{candidates.length}명 수집됨</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {sheetsUrl && (
              <a
                href={sheetsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)',
                  color: '#00ff88', padding: '6px 12px', borderRadius: '4px',
                  fontSize: '10px', textDecoration: 'none', letterSpacing: '0.5px',
                }}
              >📊 Google Sheets</a>
            )}
            <button
              onClick={() => onSave(candidates)}
              style={{
                background: 'rgba(0,180,255,0.12)', border: '1px solid rgba(0,180,255,0.35)',
                color: '#00b4ff', padding: '6px 12px', borderRadius: '4px',
                fontSize: '10px', cursor: 'pointer', letterSpacing: '0.5px',
              }}
            >💾 Sheets 저장</button>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,50,50,0.12)', border: '1px solid rgba(255,50,50,0.35)',
                color: '#ff6666', padding: '6px 12px', borderRadius: '4px',
                cursor: 'pointer', fontSize: '10px', letterSpacing: '1px',
              }}
            >CLOSE</button>
          </div>
        </div>

        {/* ── 요약 스트립 ── */}
        <div className="outreach-summary-strip" style={{
          padding: '12px 24px',
          borderBottom: '1px solid rgba(0,180,255,0.1)',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px',
          flexShrink: 0,
        }}>
          {[
            { label: '총 수집', value: stats.total, unit: '명', color: '#00b4ff' },
            { label: '공개 이메일', value: stats.contactable, unit: '명', color: '#00ff88' },
            { label: '적합도 60↑', value: stats.highFit, unit: '명', color: '#ffaa00' },
            { label: '초안 생성', value: stats.emailDraft, unit: '건', color: '#aa88ff' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${s.color}22`,
              borderRadius: '8px', padding: '12px 16px',
              textAlign: 'center',
            }}>
              <div style={{ color: s.color, fontSize: '22px', fontWeight: 700 }}>{s.value}<span style={{ fontSize: '12px' }}>{s.unit}</span></div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '9px', letterSpacing: '1px', marginTop: '4px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── 필터 + 페이지네이션 ── */}
        <div style={{
          padding: '10px 24px',
          borderBottom: '1px solid rgba(0,180,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: '전체' },
              { key: 'qualified', label: `✅ 적합 (${stats.qualified})` },
              { key: 'review', label: `⚠️ 검토 (${stats.review})` },
              { key: 'high', label: '적합도↑' },
              { key: 'youtube', label: 'YouTube' },
              { key: 'naver', label: 'Naver' },
              { key: 'email', label: '이메일 확인' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key as any); setPage(0); }}
                style={{
                  background: filter === f.key ? 'rgba(0,180,255,0.2)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${filter === f.key ? 'rgba(0,180,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  color: filter === f.key ? '#00b4ff' : 'rgba(255,255,255,0.55)',
                  padding: '4px 12px', borderRadius: '12px', fontSize: '10px', cursor: 'pointer',
                }}
              >{f.label}</button>
            ))}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>
            {filtered.length}명 중 {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)}명 표시
          </div>
        </div>

        {/* ── 후보 리스트 ── */}
        <div className="outreach-scroll-area" style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {loading ? (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                style={{
                  width: '44px', height: '44px', margin: '0 auto 16px',
                  border: '2px solid rgba(0,180,255,0.3)', borderTop: '2px solid #00b4ff',
                  borderRadius: '50%',
                }}
              />
              <div style={{ color: '#00b4ff', fontSize: '12px' }}>후보 수집 중...</div>
            </div>
          ) : paged.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>
              수집된 후보가 없습니다. "공동구매 후보 수집해줘" 명령을 실행하세요.
            </div>
          ) : (
            <div className="outreach-candidate-list" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '12px',
            }}>
              <AnimatePresence>
                {paged.map((c, idx) => (
                  <motion.div
                    key={c.candidateId}
                    className={`outreach-candidate-card${selectedCandidate?.candidateId === c.candidateId ? ' is-selected' : ''}`}
                    initial={{ opacity: 0, y: 16, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.04, type: 'spring', damping: 22 }}
                    onClick={() => handleCandidateSelect(c)}
                    style={{
                      background: selectedCandidate?.candidateId === c.candidateId
                        ? 'rgba(0,180,255,0.08)'
                        : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selectedCandidate?.candidateId === c.candidateId ? 'rgba(0,180,255,0.5)' : 'rgba(0,180,255,0.12)'}`,
                      borderRadius: '10px', padding: '14px 16px',
                      cursor: 'pointer', position: 'relative',
                      boxShadow: selectedCandidate?.candidateId === c.candidateId
                        ? '0 0 18px rgba(0,180,255,0.15)'
                        : 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                  >
                    {/* 점수 배지 */}
                    <div style={{
                      position: 'absolute', top: '10px', right: '10px',
                      background: `${getScoreColor(c.productFitScore)}18`,
                      border: `1px solid ${getScoreColor(c.productFitScore)}`,
                      borderRadius: '4px', padding: '2px 7px',
                      color: getScoreColor(c.productFitScore), fontSize: '11px', fontWeight: 700,
                    }}>{c.productFitScore}점</div>

                    {/* 플랫폼 + 이름 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', paddingRight: '50px' }}>
                      <span style={{
                        background: c.platform.toLowerCase().includes('youtube') ? 'rgba(255,0,0,0.18)' : 'rgba(0,200,0,0.18)',
                        color: c.platform.toLowerCase().includes('youtube') ? '#ff4444' : '#00cc66',
                        padding: '2px 7px', borderRadius: '3px', fontSize: '9px', fontWeight: 600,
                      }}>{c.platform.toLowerCase().includes('youtube') ? '▶' : 'N'} {c.platform}</span>
                    </div>
                    <div style={{ color: '#ffffff', fontSize: '13px', fontWeight: 700, marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </div>

                    {/* 최근 콘텐츠 */}
                    {c.recentContentTitle && (
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.recentContentTitle}
                      </div>
                    )}

                    {/* 상태 배지 */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {/* OUTREACH-TARGET-FIT-A.1: target match status 배지 */}
                      {(c as any).target_match_status === 'qualified' && (
                        <span className="outreach-status-badge" style={{
                          background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.5)',
                          color: '#00ff88', padding: '2px 7px', borderRadius: '3px', fontSize: '9px', fontWeight: 700,
                        }}>✅ 적합</span>
                      )}
                      {(c as any).target_match_status === 'review' && (
                        <span className="outreach-status-badge" style={{
                          background: 'rgba(255,170,0,0.15)', border: '1px solid rgba(255,170,0,0.5)',
                          color: '#ffaa00', padding: '2px 7px', borderRadius: '3px', fontSize: '9px', fontWeight: 700,
                        }}>⚠️ 검토</span>
                      )}
                      {(c.publicContactStatus === 'email_public' || c.publicEmailMasked) && (
                        <span className="outreach-status-badge" style={{
                          background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.35)',
                          color: '#00ff88', padding: '2px 7px', borderRadius: '3px', fontSize: '9px',
                        }}>✉ 이메일</span>
                      )}
                      {c.productFitScore >= 70 && (
                        <span className="outreach-status-badge" style={{
                          background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)',
                          color: '#00ff88', padding: '2px 7px', borderRadius: '3px', fontSize: '9px',
                        }}>HIGH FIT</span>
                      )}
                      {/* requested_vertical 표시 */}
                      {(c as any).requested_vertical && (c as any).requested_vertical !== 'unknown' && (
                        <span style={{
                          background: 'rgba(170,136,255,0.12)', border: '1px solid rgba(170,136,255,0.35)',
                          color: '#aa88ff', padding: '2px 7px', borderRadius: '3px', fontSize: '9px',
                        }}>{(c as any).requested_vertical}</span>
                      )}
                    </div>

                    {/* 크게 보기 버튼 */}
                    <div style={{ marginTop: '10px', textAlign: 'right' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCandidateSelect(c); }}
                        style={{
                          background: 'rgba(0,180,255,0.1)', border: '1px solid rgba(0,180,255,0.3)',
                          color: '#00b4ff', padding: '4px 10px', borderRadius: '4px',
                          fontSize: '9px', cursor: 'pointer', letterSpacing: '0.5px',
                        }}
                      >크게 보기 →</button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* ── 페이지네이션 + 하단 바 ── */}
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid rgba(0,180,255,0.1)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.3)',
        }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                background: page === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,180,255,0.1)',
                border: '1px solid rgba(0,180,255,0.2)',
                color: page === 0 ? 'rgba(255,255,255,0.2)' : '#00b4ff',
                padding: '5px 12px', borderRadius: '4px', fontSize: '10px',
                cursor: page === 0 ? 'not-allowed' : 'pointer',
              }}
            >← 이전</button>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', padding: '5px 8px' }}>
              {page + 1} / {Math.max(1, totalPages)}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                background: page >= totalPages - 1 ? 'rgba(255,255,255,0.03)' : 'rgba(0,180,255,0.1)',
                border: '1px solid rgba(0,180,255,0.2)',
                color: page >= totalPages - 1 ? 'rgba(255,255,255,0.2)' : '#00b4ff',
                padding: '5px 12px', borderRadius: '4px', fontSize: '10px',
                cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
              }}
            >다음 →</button>
          </div>

          <div className="outreach-execute-lock" style={{
            background: 'rgba(255,50,50,0.08)', border: '1px solid rgba(255,50,50,0.25)',
            borderRadius: '6px', padding: '6px 14px',
            color: 'rgba(255,80,80,0.7)', fontSize: '9px', letterSpacing: '1px',
          }}>
            🔒 EXECUTE LOCKED — 대표님 승인 전 실행 불가
          </div>
        </div>
      </motion.div>

      {/* ── 후보 상세 Drawer ── */}
      <AnimatePresence>
        {detailOpen && selectedCandidate && (
          <CandidateDetailDrawer
            candidate={selectedCandidate}
            onClose={() => setDetailOpen(false)}
            onJarvisContextEvent={onJarvisContextEvent}
          />
        )}
      </AnimatePresence>
    </>
  );
}
