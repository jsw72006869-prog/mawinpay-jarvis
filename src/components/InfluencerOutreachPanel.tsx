import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface InfluencerCandidate {
  candidateId: string;
  collectedAt: string;
  platform: string;
  keyword: string;
  name: string;
  channelOrBlogUrl: string;
  recentContentTitle: string;
  recentContentUrl: string;
  subscriberOrVisitor: string;
  viewCount: string;
  publicContactStatus: string;
  publicEmailMasked: string;
  productFitScore: number;
  productFitReason: string;
  suggestedProduct: string;
  suggestedOfferAngle: string;
  outreachStatus: string;
  firstEmailDraft: string;
  followUpDraft: string;
  responseStatus: string;
  notes: string;
}

interface Props {
  visible: boolean;
  candidates: InfluencerCandidate[];
  loading?: boolean;
  onClose: () => void;
  onSave: (candidates: InfluencerCandidate[]) => void;
  onViewEmail?: (candidate: InfluencerCandidate) => void;
  onViewFollowUp?: (candidate: InfluencerCandidate) => void;
  onCandidateSelect?: (candidate: InfluencerCandidate) => void;
}

export default function InfluencerOutreachPanel({ visible, candidates, loading, onClose, onSave, onViewEmail, onViewFollowUp, onCandidateSelect }: Props) {
  const [filter, setFilter] = useState<'all' | 'high' | 'youtube' | 'naver'>('all');
  const [selectedCandidate, setSelectedCandidate] = useState<InfluencerCandidate | null>(null);
  const [emailView, setEmailView] = useState<'first' | 'followup' | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) {
      setSelectedCandidate(null);
      setEmailView(null);
    }
  }, [visible]);

  if (!visible) return null;

  const filtered = candidates.filter(c => {
    if (filter === 'high') return c.productFitScore >= 60;
    if (filter === 'youtube') return c.platform.toLowerCase().includes('youtube');
    if (filter === 'naver') return c.platform.toLowerCase().includes('naver');
    return true;
  });

  const stats = {
    total: candidates.length,
    contactable: candidates.filter(c => c.publicContactStatus === 'email_public' || c.publicContactStatus === 'form_available').length,
    highFit: candidates.filter(c => c.productFitScore >= 60).length,
    emailDraft: candidates.filter(c => c.firstEmailDraft).length,
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return '#00ff88';
    if (score >= 50) return '#ffaa00';
    return '#ff4444';
  };

  const getPlatformIcon = (platform: string) => {
    if (platform.toLowerCase().includes('youtube')) return '▶';
    if (platform.toLowerCase().includes('naver')) return 'N';
    return '●';
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 60, filter: 'blur(8px)' }}
        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, x: 60, filter: 'blur(8px)' }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '420px', maxWidth: '90vw',
          background: 'linear-gradient(180deg, rgba(10,15,30,0.98) 0%, rgba(5,10,20,0.99) 100%)',
          borderLeft: '1px solid rgba(0,180,255,0.3)',
          zIndex: 9000, display: 'flex', flexDirection: 'column',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          boxShadow: '-10px 0 40px rgba(0,100,255,0.15)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid rgba(0,180,255,0.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ color: '#00b4ff', fontSize: '11px', letterSpacing: '3px', marginBottom: '4px' }}>
              INFLUENCER OUTREACH
            </div>
            <div style={{ color: '#ffffff', fontSize: '14px', fontWeight: 600 }}>
              공동구매 후보
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,50,50,0.15)', border: '1px solid rgba(255,50,50,0.4)',
            color: '#ff6666', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer',
            fontSize: '11px',
          }}>CLOSE</button>
        </div>

        {/* Stats Bar */}
        <div style={{
          padding: '12px 20px', borderBottom: '1px solid rgba(0,180,255,0.1)',
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px',
        }}>
          {[
            { label: '수집', value: stats.total, color: '#00b4ff' },
            { label: '연락가능', value: stats.contactable, color: '#00ff88' },
            { label: '적합도↑', value: stats.highFit, color: '#ffaa00' },
            { label: '초안', value: stats.emailDraft, color: '#aa88ff' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ color: s.color, fontSize: '18px', fontWeight: 700 }}>{s.value}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '9px', letterSpacing: '1px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter Tabs */}
        <div style={{ padding: '8px 20px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: '전체' },
            { key: 'high', label: '적합도↑' },
            { key: 'youtube', label: 'YouTube' },
            { key: 'naver', label: 'Naver' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key as any)} style={{
              background: filter === f.key ? 'rgba(0,180,255,0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${filter === f.key ? 'rgba(0,180,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
              color: filter === f.key ? '#00b4ff' : 'rgba(255,255,255,0.6)',
              padding: '4px 10px', borderRadius: '12px', fontSize: '10px', cursor: 'pointer',
            }}>{f.label}</button>
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              style={{ width: '40px', height: '40px', margin: '0 auto 16px',
                border: '2px solid rgba(0,180,255,0.3)', borderTop: '2px solid #00b4ff',
                borderRadius: '50%' }}
            />
            <div style={{ color: '#00b4ff', fontSize: '12px' }}>후보 수집 중...</div>
          </div>
        )}

        {/* Candidate Cards */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <AnimatePresence>
            {filtered.map((c, idx) => (
              <motion.div
                key={c.candidateId}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: idx * 0.08, type: 'spring', damping: 20 }}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(0,180,255,0.15)',
                  borderRadius: '8px', padding: '12px', marginBottom: '10px',
                  cursor: 'pointer',
                  position: 'relative', overflow: 'hidden',
                }}
                onClick={() => { setSelectedCandidate(c); onCandidateSelect?.(c); }}
              >
                {/* Score Badge */}
                <div style={{
                  position: 'absolute', top: '8px', right: '8px',
                  background: `${getScoreColor(c.productFitScore)}22`,
                  border: `1px solid ${getScoreColor(c.productFitScore)}`,
                  borderRadius: '4px', padding: '2px 6px',
                  color: getScoreColor(c.productFitScore), fontSize: '11px', fontWeight: 700,
                }}>{c.productFitScore}점</div>

                {/* Platform + Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{
                    background: c.platform.includes('YouTube') ? 'rgba(255,0,0,0.2)' : 'rgba(0,200,0,0.2)',
                    color: c.platform.includes('YouTube') ? '#ff4444' : '#00cc66',
                    padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 600,
                  }}>{getPlatformIcon(c.platform)} {c.platform}</span>
                  <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: 600, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </span>
                </div>

                {/* Recent Content */}
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  최근: {c.recentContentTitle || '-'}
                </div>

                {/* Stats Row */}
                <div style={{ display: 'flex', gap: '12px', fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}>
                  {c.subscriberOrVisitor !== '-' && <span>구독 {c.subscriberOrVisitor}</span>}
                  {c.viewCount !== '-' && <span>조회 {c.viewCount}</span>}
                  <span style={{ color: c.publicContactStatus === 'email_public' ? '#00ff88' : 'rgba(255,255,255,0.3)' }}>
                    {c.publicContactStatus === 'email_public' ? '✉ 연락가능' : c.publicContactStatus === 'form_available' ? '📋 폼' : '⚪ 미확인'}
                  </span>
                </div>

                {/* Fit Reason */}
                <div style={{ marginTop: '6px', color: 'rgba(0,180,255,0.8)', fontSize: '9px', lineHeight: '1.4' }}>
                  {c.productFitReason.substring(0, 80)}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
              아직 수집된 후보가 없습니다.<br/>
              "캠핑 유튜버 5명 수집해줘" 명령을 시도해보세요.
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        {candidates.length > 0 && (
          <div style={{
            padding: '12px 16px', borderTop: '1px solid rgba(0,180,255,0.2)',
            display: 'flex', gap: '8px', flexWrap: 'wrap',
          }}>
            <button onClick={() => onSave(candidates)} style={{
              flex: 1, background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.4)',
              color: '#00ff88', padding: '8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer',
            }}>📥 Google Sheets 저장</button>
            <button onClick={() => { setSelectedCandidate(filtered[0] || null); setEmailView('first'); }} style={{
              flex: 1, background: 'rgba(170,136,255,0.1)', border: '1px solid rgba(170,136,255,0.4)',
              color: '#aa88ff', padding: '8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer',
            }}>✉ 메일 초안 보기</button>
          </div>
        )}

        {/* Detail Modal */}
        <AnimatePresence>
          {selectedCandidate && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(5,10,20,0.97)', zIndex: 10,
                display: 'flex', flexDirection: 'column', overflowY: 'auto',
              }}
            >
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,180,255,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#ffffff', fontSize: '13px', fontWeight: 600 }}>{selectedCandidate.name}</div>
                <button onClick={() => { setSelectedCandidate(null); setEmailView(null); }} style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
                  color: '#ffffff', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer',
                }}>← 목록</button>
              </div>

              <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
                {/* Candidate Info */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span style={{ background: 'rgba(0,180,255,0.15)', color: '#00b4ff', padding: '3px 8px', borderRadius: '4px', fontSize: '10px' }}>{selectedCandidate.platform}</span>
                    <span style={{ background: `${getScoreColor(selectedCandidate.productFitScore)}22`, color: getScoreColor(selectedCandidate.productFitScore), padding: '3px 8px', borderRadius: '4px', fontSize: '10px' }}>적합도 {selectedCandidate.productFitScore}점</span>
                    {selectedCandidate.publicEmailMasked && <span style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88', padding: '3px 8px', borderRadius: '4px', fontSize: '10px' }}>✉ {selectedCandidate.publicEmailMasked}</span>}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', lineHeight: '1.6', marginBottom: '8px' }}>
                    <strong style={{ color: '#00b4ff' }}>자비스 판단:</strong> {selectedCandidate.productFitReason}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', lineHeight: '1.5' }}>
                    <strong>제안 각도:</strong> {selectedCandidate.suggestedOfferAngle}
                  </div>
                </div>

                {/* Email View Tabs */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                  <button onClick={() => setEmailView('first')} style={{
                    background: emailView === 'first' ? 'rgba(170,136,255,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${emailView === 'first' ? 'rgba(170,136,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    color: emailView === 'first' ? '#aa88ff' : 'rgba(255,255,255,0.5)',
                    padding: '5px 10px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer',
                  }}>1차 메일 초안</button>
                  <button onClick={() => setEmailView('followup')} style={{
                    background: emailView === 'followup' ? 'rgba(255,170,0,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${emailView === 'followup' ? 'rgba(255,170,0,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    color: emailView === 'followup' ? '#ffaa00' : 'rgba(255,255,255,0.5)',
                    padding: '5px 10px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer',
                  }}>Follow-up 초안</button>
                </div>

                {/* Email Content */}
                {emailView === 'first' && (
                  <div style={{
                    background: 'rgba(170,136,255,0.05)', border: '1px solid rgba(170,136,255,0.2)',
                    borderRadius: '6px', padding: '12px', fontSize: '11px', color: 'rgba(255,255,255,0.8)',
                    lineHeight: '1.7', whiteSpace: 'pre-wrap',
                  }}>
                    {selectedCandidate.firstEmailDraft || '이 후보는 공개 연락처가 확인되지 않아 메일 초안이 생성되지 않았습니다.'}
                  </div>
                )}
                {emailView === 'followup' && (
                  <div style={{
                    background: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.2)',
                    borderRadius: '6px', padding: '12px', fontSize: '11px', color: 'rgba(255,255,255,0.8)',
                    lineHeight: '1.7', whiteSpace: 'pre-wrap',
                  }}>
                    {selectedCandidate.followUpDraft || '이 후보는 공개 연락처가 확인되지 않아 follow-up 초안이 생성되지 않았습니다.'}
                  </div>
                )}

                {/* Locked Send Button */}
                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                  <button disabled style={{
                    background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)',
                    color: 'rgba(255,50,50,0.5)', padding: '8px 20px', borderRadius: '4px',
                    fontSize: '10px', cursor: 'not-allowed', letterSpacing: '1px',
                  }}>🔒 실제 발송 LOCKED (대표님 승인 필요)</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
