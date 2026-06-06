import { useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { InfluencerCandidate } from '../InfluencerOutreachPanel';

type CandidateFilter =
  | 'all'
  | 'proposal_ready'
  | 'needs_enrichment'
  | 'excluded'
  | 'email'
  | 'views'
  | 'fit';

type CandidateViewModel = {
  id: string;
  channelName: string;
  platform: string;
  channelUrl: string;
  thumbnailUrl: string;
  subscriberCountText: string;
  recentAverageViewsText: string;
  topVideoTitle: string;
  topVideoViewCountText: string;
  matchedKeyword: string;
  matchedCategory: string;
  fitScore: number;
  viralFitScore: number;
  contactable: boolean;
  emailStatus: string;
  maskedEmail: string;
  reasonShort: string;
  status: 'proposal_ready' | 'needs_enrichment' | 'excluded' | 'review';
  evidenceTerms: string[];
  excludeReason: string;
  raw: InfluencerCandidate;
};

interface OutreachResultWorkspaceProps {
  visible: boolean;
  candidates: InfluencerCandidate[];
  collectionSummary?: any;
  loading?: boolean;
  onClose: () => void;
  onSave?: (candidates: InfluencerCandidate[]) => void;
  onJarvisContextEvent?: (event: { intent: string; payload?: unknown }) => void;
  sheetsUrl?: string;
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCount(value: unknown): string {
  const n = asNumber(value);
  if (n <= 0) return '확인 필요';
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString('ko-KR')}만`;
  return n.toLocaleString('ko-KR');
}

function compactText(value: unknown, fallback: string): string {
  const text = String(value || '').trim();
  return text || fallback;
}

function getScoreColor(score: number): string {
  if (score >= 75) return '#00ff88';
  if (score >= 55) return '#ffaa00';
  return '#ff6666';
}

function getEvidenceTerms(candidate: any): string[] {
  const raw = candidate.target_evidence_terms || candidate.evidenceTerms || candidate.matchedKeywords || [];
  if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean).slice(0, 6);
  return String(raw || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function buildCandidateViewModel(candidate: InfluencerCandidate): CandidateViewModel {
  const c = candidate as any;
  const fitScore = asNumber(c.fitScore ?? c.productFitScore ?? c.target_match_score ?? 0);
  const viralFitScore = asNumber(c.viralFitScore ?? c.priority_score ?? c.response_likelihood_score ?? 0);
  const contactable = Boolean(
    c.contactable ||
    c.contact_email_exists ||
    c.emailExists ||
    c.publicEmailMasked ||
    c.maskedEmail ||
    c.publicContactStatus === 'email_public' ||
    c.publicContactStatus === 'form_available',
  );
  const targetStatus = String(c.target_match_status || '').toLowerCase();
  const outreachStatus = String(c.outreachStatus || '').toLowerCase();
  const status: CandidateViewModel['status'] =
    targetStatus === 'excluded' || outreachStatus === 'excluded'
      ? 'excluded'
      : outreachStatus === 'proposal_ready' || (fitScore >= 70 && contactable)
        ? 'proposal_ready'
        : targetStatus === 'review'
          ? 'review'
          : 'needs_enrichment';

  const channelName = compactText(c.channelName || c.name || c.title, '채널명 확인 필요');
  const topVideoTitle = compactText(c.topVideoTitle || c.recentContentTitle, '최근 대표 영상 정보가 아직 없습니다. 보강 분석으로 확인할 수 있습니다.');
  const reasonShort = compactText(
    c.reasonShort || c.productFitReason,
    fitScore > 0
      ? '기본 수집 정보 기준으로 적합도를 계산했습니다. 최근 영상 보강 분석을 권장합니다.'
      : '적합도 근거가 부족합니다. 채널 상세 보강 분석이 필요합니다.',
  );

  return {
    id: String(c.candidateId || c.id || c.channelId || c.channelOrBlogUrl || channelName),
    channelName,
    platform: compactText(c.platform, 'YouTube'),
    channelUrl: compactText(c.channelUrl || c.channelOrBlogUrl || c.profile_url, ''),
    thumbnailUrl: compactText(c.thumbnailUrl, ''),
    subscriberCountText: c.subscriberCount ? formatCount(c.subscriberCount) : compactText(c.subscriberOrVisitor, '구독자 확인 필요'),
    recentAverageViewsText: formatCount(c.recentAverageViews || c.averageViewCount),
    topVideoTitle,
    topVideoViewCountText: formatCount(c.topVideoViewCount || c.topVideoViews),
    matchedKeyword: compactText(c.matchedKeyword || c.keyword || c.source_keyword, '매칭 키워드 확인 필요'),
    matchedCategory: compactText(c.matchedCategory || c.requested_vertical || c.category, '카테고리 확인 필요'),
    fitScore,
    viralFitScore,
    contactable,
    emailStatus: compactText(c.emailStatus || c.publicContactStatus, contactable ? 'contactable' : 'email_not_found'),
    maskedEmail: compactText(c.maskedEmail || c.publicEmailMasked || c.emailMasked, ''),
    reasonShort,
    status,
    evidenceTerms: getEvidenceTerms(c),
    excludeReason: compactText(c.target_exclude_reason || c.excludedReason || c.excludeReason, ''),
    raw: candidate,
  };
}

function MetricBox({ label, value, color = '#00b4ff' }: { label: string; value: unknown; color?: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.035)',
      border: `1px solid ${color}22`,
      borderRadius: 8,
      padding: '10px 12px',
      minHeight: 58,
    }}>
      <div style={{ color: 'rgba(255,255,255,0.48)', fontSize: 10, marginBottom: 5 }}>{label}</div>
      <div style={{ color, fontSize: 16, fontWeight: 800 }}>{String(value ?? '확인 필요')}</div>
    </div>
  );
}

function CandidateDetailDrawer({
  model,
  onClose,
  onJarvisContextEvent,
}: {
  model: CandidateViewModel;
  onClose: () => void;
  onJarvisContextEvent?: (event: { intent: string; payload?: unknown }) => void;
}) {
  const actionPayload = { candidate: model.raw, viewModel: model };
  return (
    <motion.div
      className="outreach-detail-drawer"
      data-testid="outreach-candidate-detail"
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 60 }}
      transition={{ type: 'spring', damping: 28, stiffness: 200 }}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(560px, 94vw)',
        background: 'linear-gradient(160deg, rgba(7,12,27,0.99), rgba(3,7,18,0.99))',
        borderLeft: '1px solid rgba(0,180,255,0.35)',
        zIndex: 9200,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        boxShadow: '-18px 0 70px rgba(0,100,255,0.2)',
        overflowY: 'auto',
      }}
    >
      <div style={{
        padding: '18px 22px',
        borderBottom: '1px solid rgba(0,180,255,0.2)',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        background: 'rgba(0,180,255,0.04)',
      }}>
        <div>
          <div style={{ color: '#00b4ff', fontSize: 10, letterSpacing: 2, marginBottom: 5 }}>CANDIDATE DETAIL</div>
          <div style={{ color: '#fff', fontSize: 18, fontWeight: 800 }}>{model.channelName}</div>
          <div style={{ color: 'rgba(255,255,255,0.52)', fontSize: 11, marginTop: 4 }}>{model.platform} / {model.matchedCategory}</div>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,70,70,0.12)',
          border: '1px solid rgba(255,70,70,0.35)',
          color: '#ff7777',
          padding: '7px 12px',
          borderRadius: 5,
          cursor: 'pointer',
          height: 34,
        }}>닫기</button>
      </div>

      <div style={{ padding: 22, display: 'grid', gap: 14 }}>
        <section style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 14, alignItems: 'center' }}>
          <div style={{
            width: 96,
            height: 96,
            borderRadius: 10,
            background: model.thumbnailUrl ? `url(${model.thumbnailUrl}) center/cover` : 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
          }} />
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ color: '#00b4ff', border: '1px solid rgba(0,180,255,0.35)', padding: '4px 8px', borderRadius: 5, fontSize: 10 }}>{model.platform}</span>
              <span style={{ color: getScoreColor(model.fitScore), border: `1px solid ${getScoreColor(model.fitScore)}66`, padding: '4px 8px', borderRadius: 5, fontSize: 10 }}>적합도 {model.fitScore || '확인 필요'}</span>
              <span style={{ color: getScoreColor(model.viralFitScore), border: `1px solid ${getScoreColor(model.viralFitScore)}55`, padding: '4px 8px', borderRadius: 5, fontSize: 10 }}>바이럴 {model.viralFitScore || '확인 필요'}</span>
              <span style={{ color: model.contactable ? '#00ff88' : '#ffaa00', border: `1px solid ${model.contactable ? 'rgba(0,255,136,0.35)' : 'rgba(255,170,0,0.35)'}`, padding: '4px 8px', borderRadius: 5, fontSize: 10 }}>
                {model.contactable ? '연락 가능' : '연락처 보강 필요'}
              </span>
            </div>
            {model.channelUrl ? (
              <a href={model.channelUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#8fdcff', fontSize: 12 }}>채널 열기</a>
            ) : (
              <div style={{ color: '#ffaa00', fontSize: 12 }}>채널 URL이 응답에 없어 원본 확인이 필요합니다.</div>
            )}
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <MetricBox label="구독자" value={model.subscriberCountText} />
          <MetricBox label="최근 평균 조회수" value={model.recentAverageViewsText} color="#ffaa00" />
          <MetricBox label="상위 영상 조회수" value={model.topVideoViewCountText} color="#aa88ff" />
          <MetricBox label="이메일 상태" value={model.maskedEmail || model.emailStatus} color={model.contactable ? '#00ff88' : '#ffaa00'} />
        </section>

        <section style={{ background: 'rgba(0,180,255,0.05)', border: '1px solid rgba(0,180,255,0.17)', borderRadius: 10, padding: 14 }}>
          <div style={{ color: '#00b4ff', fontSize: 10, letterSpacing: 1.4, marginBottom: 8 }}>매칭 근거</div>
          <div style={{ color: '#fff', fontSize: 12, lineHeight: 1.7 }}>{model.reasonShort}</div>
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: '#dbeafe', background: 'rgba(255,255,255,0.06)', padding: '4px 8px', borderRadius: 5, fontSize: 10 }}>키워드: {model.matchedKeyword}</span>
            {model.evidenceTerms.length > 0
              ? model.evidenceTerms.map(term => <span key={term} style={{ color: '#00ff88', background: 'rgba(0,255,136,0.08)', padding: '4px 8px', borderRadius: 5, fontSize: 10 }}>{term}</span>)
              : <span style={{ color: '#ffaa00', fontSize: 10 }}>근거 term이 부족합니다. 보강 분석으로 최근 영상 제목을 확인하세요.</span>}
          </div>
        </section>

        <section style={{ background: 'rgba(170,136,255,0.05)', border: '1px solid rgba(170,136,255,0.2)', borderRadius: 10, padding: 14 }}>
          <div style={{ color: '#aa88ff', fontSize: 10, letterSpacing: 1.4, marginBottom: 8 }}>최근 대표 영상</div>
          <div style={{ color: '#fff', fontSize: 12, lineHeight: 1.7 }}>{model.topVideoTitle}</div>
        </section>

        <section style={{ background: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.18)', borderRadius: 10, padding: 14 }}>
          <div style={{ color: '#ffaa00', fontSize: 10, letterSpacing: 1.4, marginBottom: 8 }}>작업 판단</div>
          <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, lineHeight: 1.7 }}>
            {model.status === 'proposal_ready'
              ? '바로 제안 초안을 검토할 수 있습니다. 실제 발송은 계속 승인 잠금 상태입니다.'
              : model.status === 'excluded'
                ? `제외 후보입니다. ${model.excludeReason || '요청 분야와의 근거가 부족합니다.'}`
                : '보강 필요 후보입니다. 최근 영상과 반응도를 더 확인한 뒤 제안 여부를 판단하는 편이 안전합니다.'}
          </div>
        </section>

        <section style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 14 }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, letterSpacing: 1.4, marginBottom: 10 }}>NEXT ACTIONS</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {[
              { label: '보강 분석', intent: 'candidate_enrich_preview', tone: '#00b4ff' },
              { label: '후보 제외', intent: 'candidate_exclude', tone: '#ff7777' },
              { label: '비슷한 후보 찾기', intent: 'find_similar_candidate', tone: '#ffaa00' },
              { label: '제안 메일 초안 만들기', intent: 'draft_proposal', tone: '#aa88ff' },
            ].map(action => (
              <button
                key={action.intent}
                onClick={() => onJarvisContextEvent?.({ intent: action.intent, payload: actionPayload })}
                style={{
                  background: `${action.tone}14`,
                  border: `1px solid ${action.tone}55`,
                  color: action.tone,
                  padding: '9px 12px',
                  borderRadius: 6,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >{action.label}</button>
            ))}
            <button disabled style={{
              background: 'rgba(255,70,70,0.06)',
              border: '1px solid rgba(255,70,70,0.22)',
              color: 'rgba(255,90,90,0.58)',
              padding: '9px 12px',
              borderRadius: 6,
              textAlign: 'left',
              cursor: 'not-allowed',
              fontSize: 11,
            }}>실제 발송은 EXECUTE LOCKED, 대표님 승인 전 불가</button>
          </div>
        </section>
      </div>
    </motion.div>
  );
}

export default function OutreachResultWorkspace({
  visible,
  candidates,
  collectionSummary,
  loading,
  onClose,
  onSave,
  onJarvisContextEvent,
  sheetsUrl,
}: OutreachResultWorkspaceProps) {
  const [filter, setFilter] = useState<CandidateFilter>('all');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  const models = useMemo(() => candidates.map(buildCandidateViewModel), [candidates]);
  const filtered = useMemo(() => {
    const next = models.filter(model => {
      if (filter === 'proposal_ready') return model.status === 'proposal_ready';
      if (filter === 'needs_enrichment') return model.status === 'needs_enrichment' || model.status === 'review';
      if (filter === 'excluded') return model.status === 'excluded';
      if (filter === 'email') return model.contactable;
      return true;
    });
    if (filter === 'views') return [...next].sort((a, b) => asNumber((b.raw as any).recentAverageViews || (b.raw as any).topVideoViewCount) - asNumber((a.raw as any).recentAverageViews || (a.raw as any).topVideoViewCount));
    if (filter === 'fit') return [...next].sort((a, b) => b.fitScore - a.fitScore);
    return next;
  }, [filter, models]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selectedModel = models.find(model => model.id === selectedCandidateId) || null;
  const countSummary = collectionSummary || {};
  const apiStatus = countSummary.youtubeApiStatus || countSummary.diagnostics?.youtubeApiStatus || '';
  const apiWarnings = Array.isArray(countSummary.apiWarnings) ? countSummary.apiWarnings : [];
  const isPreviewMode =
    countSummary.dryRun === true ||
    countSummary.countOnly === true ||
    countSummary.autoSave?.reason === 'dryRun' ||
    apiWarnings.includes('sheet_save_skipped:dryRun');

  const stats = {
    total: models.length,
    proposalReady: models.filter(model => model.status === 'proposal_ready').length,
    needsEnrichment: models.filter(model => model.status === 'needs_enrichment' || model.status === 'review').length,
    excluded: models.filter(model => model.status === 'excluded').length,
    contactable: models.filter(model => model.contactable).length,
  };

  const handleCandidateSelect = useCallback((model: CandidateViewModel) => {
    setSelectedCandidateId(model.id);
    setDetailOpen(true);
    onJarvisContextEvent?.({ intent: 'candidate_selected', payload: { candidate: model.raw, viewModel: model } });
  }, [onJarvisContextEvent]);

  const handleManualSave = useCallback(() => {
    if (isPreviewMode) return;
    onSave?.(candidates);
  }, [candidates, isPreviewMode, onSave]);

  if (!visible) return null;

  return (
    <>
      <motion.div
        className="outreach-result-workspace"
        data-testid="outreach-workspace"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', damping: 28, stiffness: 180 }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(4,8,20,0.97)',
          zIndex: 9100,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid rgba(0,180,255,0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(0,180,255,0.04)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ color: '#00b4ff', fontSize: 10, letterSpacing: 2, marginBottom: 4 }}>INFLUENCER OUTREACH</div>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>수집 후보 분석 워크스페이스</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {sheetsUrl && <a href={sheetsUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#00ff88', fontSize: 11 }}>Google Sheets</a>}
            <button
              onClick={handleManualSave}
              disabled={isPreviewMode || !onSave}
              title={isPreviewMode ? '미리보기 모드에서는 저장할 수 없습니다.' : undefined}
              style={{
                background: isPreviewMode ? 'rgba(255,170,0,0.06)' : 'rgba(0,180,255,0.12)',
                border: `1px solid ${isPreviewMode ? 'rgba(255,170,0,0.25)' : 'rgba(0,180,255,0.35)'}`,
                color: isPreviewMode ? 'rgba(255,170,0,0.72)' : '#00b4ff',
                padding: '7px 12px',
                borderRadius: 5,
                cursor: isPreviewMode || !onSave ? 'not-allowed' : 'pointer',
                fontSize: 11,
              }}
            >{isPreviewMode ? '저장 불가' : 'Sheets 저장'}</button>
            {isPreviewMode && <span style={{ color: '#ffaa00', fontSize: 10, border: '1px solid rgba(255,170,0,0.25)', padding: '6px 8px', borderRadius: 5 }}>미리보기 모드, 저장 안 함</span>}
            <button onClick={onClose} style={{
              background: 'rgba(255,70,70,0.12)',
              border: '1px solid rgba(255,70,70,0.35)',
              color: '#ff7777',
              padding: '7px 12px',
              borderRadius: 5,
              cursor: 'pointer',
              fontSize: 11,
            }}>닫기</button>
          </div>
        </div>

        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid rgba(0,180,255,0.1)',
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gap: 12,
          flexShrink: 0,
        }}>
          <MetricBox label="전체 후보" value={`${stats.total}명`} />
          <MetricBox label="바로 제안 가능" value={`${stats.proposalReady}명`} color="#00ff88" />
          <MetricBox label="보강 필요" value={`${stats.needsEnrichment}명`} color="#ffaa00" />
          <MetricBox label="제외 후보" value={`${stats.excluded}명`} color="#ff7777" />
          <MetricBox label="공개 이메일" value={`${stats.contactable}명`} color="#aa88ff" />
        </div>

        {collectionSummary && (
          <div style={{
            padding: '10px 24px',
            borderBottom: '1px solid rgba(0,180,255,0.08)',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            {[
              ['전체 검색', countSummary.rawSearchResultCount],
              ['중복 제거 후보', countSummary.dedupedChannelCount],
              ['화면 표시 후보', countSummary.displayedCandidateCount],
              ['공개 이메일', countSummary.publicEmailCount],
              ['연락 가능', countSummary.contactableCount],
              ['적합 후보', countSummary.qualifiedCount],
              ['검토 필요', countSummary.reviewCount],
              ['제외', countSummary.excludedCount],
            ].filter(([, value]) => value !== undefined && value !== null).map(([label, value]) => (
              <span key={String(label)} style={{ color: 'rgba(230,247,255,0.84)', background: 'rgba(0,180,255,0.06)', border: '1px solid rgba(0,180,255,0.18)', borderRadius: 5, padding: '5px 8px', fontSize: 10 }}>
                {String(label)} {String(value)}
              </span>
            ))}
            {apiStatus && <span style={{ color: apiStatus === 'ok' ? '#00ff88' : '#ffaa00', background: apiStatus === 'ok' ? 'rgba(0,255,136,0.08)' : 'rgba(255,170,0,0.08)', border: `1px solid ${apiStatus === 'ok' ? 'rgba(0,255,136,0.25)' : 'rgba(255,170,0,0.3)'}`, borderRadius: 5, padding: '5px 8px', fontSize: 10 }}>API 상태 {apiStatus}</span>}
          </div>
        )}

        <div style={{
          padding: '10px 24px',
          borderBottom: '1px solid rgba(0,180,255,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              ['all', '전체'],
              ['proposal_ready', '바로 제안 가능'],
              ['needs_enrichment', '보강 필요'],
              ['excluded', '제외 후보'],
              ['email', '공개 이메일 있음'],
              ['views', '조회수 높은 순'],
              ['fit', '적합도 높은 순'],
            ].map(([key, label]) => (
              <button key={key} onClick={() => { setFilter(key as CandidateFilter); setPage(0); }} style={{
                background: filter === key ? 'rgba(0,180,255,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${filter === key ? 'rgba(0,180,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: filter === key ? '#00b4ff' : 'rgba(255,255,255,0.62)',
                padding: '5px 12px',
                borderRadius: 14,
                fontSize: 10,
                cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
            {filtered.length}명 중 {filtered.length ? page * PAGE_SIZE + 1 : 0}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)}명 표시
          </div>
        </div>

        <div className="outreach-scroll-area" style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {loading ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#00b4ff' }}>후보 수집 및 분석 중입니다.</div>
          ) : paged.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>표시할 후보가 없습니다. 필터를 바꾸거나 보강 수집을 실행해 주세요.</div>
          ) : (
            <div className="outreach-candidate-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
              <AnimatePresence>
                {paged.map((model, idx) => (
                  <motion.div
                    key={model.id}
                    className={`outreach-candidate-card${selectedCandidateId === model.id ? ' is-selected' : ''}`}
                    data-testid="outreach-candidate-card"
                    initial={{ opacity: 0, y: 16, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.025, type: 'spring', damping: 22 }}
                    onClick={() => handleCandidateSelect(model)}
                    style={{
                      background: selectedCandidateId === model.id ? 'rgba(0,180,255,0.08)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selectedCandidateId === model.id ? 'rgba(0,180,255,0.5)' : 'rgba(0,180,255,0.13)'}`,
                      borderRadius: 10,
                      padding: 14,
                      cursor: 'pointer',
                      position: 'relative',
                      minHeight: 238,
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '74px 1fr', gap: 12 }}>
                      <div style={{
                        width: 74,
                        height: 74,
                        borderRadius: 9,
                        background: model.thumbnailUrl ? `url(${model.thumbnailUrl}) center/cover` : 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingRight: 54 }}>
                          <span style={{ color: model.platform.toLowerCase().includes('youtube') ? '#ff7777' : '#00ff88', border: '1px solid rgba(255,255,255,0.14)', padding: '2px 7px', borderRadius: 4, fontSize: 9 }}>{model.platform}</span>
                          <span style={{ color: model.contactable ? '#00ff88' : '#ffaa00', border: `1px solid ${model.contactable ? 'rgba(0,255,136,0.3)' : 'rgba(255,170,0,0.3)'}`, padding: '2px 7px', borderRadius: 4, fontSize: 9 }}>
                            {model.contactable ? '연락 가능' : '연락처 보강'}
                          </span>
                        </div>
                        <div style={{ color: '#fff', fontSize: 14, fontWeight: 800, marginTop: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{model.channelName}</div>
                        <div style={{ color: 'rgba(255,255,255,0.52)', fontSize: 10, marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{model.matchedKeyword} / {model.matchedCategory}</div>
                      </div>
                    </div>

                    <div style={{ position: 'absolute', top: 12, right: 12, display: 'grid', gap: 5, textAlign: 'right' }}>
                      <span style={{ color: getScoreColor(model.fitScore), border: `1px solid ${getScoreColor(model.fitScore)}66`, padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 800 }}>{model.fitScore || '-'} fit</span>
                      <span style={{ color: getScoreColor(model.viralFitScore), border: `1px solid ${getScoreColor(model.viralFitScore)}44`, padding: '2px 7px', borderRadius: 4, fontSize: 10 }}>{model.viralFitScore || '-'} viral</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
                      <MetricBox label="구독자" value={model.subscriberCountText} />
                      <MetricBox label="평균 조회" value={model.recentAverageViewsText} color="#ffaa00" />
                      <MetricBox label="상위 조회" value={model.topVideoViewCountText} color="#aa88ff" />
                    </div>

                    <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, lineHeight: 1.55, marginTop: 12, minHeight: 34 }}>
                      {model.reasonShort}
                    </div>

                    <div style={{ color: 'rgba(255,255,255,0.52)', fontSize: 10, marginTop: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      대표 영상: {model.topVideoTitle}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8 }}>
                      <span style={{ color: model.status === 'proposal_ready' ? '#00ff88' : model.status === 'excluded' ? '#ff7777' : '#ffaa00', fontSize: 10 }}>
                        {model.status === 'proposal_ready' ? '바로 제안 가능' : model.status === 'excluded' ? '제외 후보' : '보강 필요'}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); handleCandidateSelect(model); }} style={{
                        background: 'rgba(0,180,255,0.1)',
                        border: '1px solid rgba(0,180,255,0.3)',
                        color: '#00b4ff',
                        padding: '5px 10px',
                        borderRadius: 5,
                        fontSize: 10,
                        cursor: 'pointer',
                      }}>상세 보기</button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(0,180,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ background: 'rgba(0,180,255,0.1)', border: '1px solid rgba(0,180,255,0.2)', color: page === 0 ? 'rgba(255,255,255,0.25)' : '#00b4ff', padding: '6px 12px', borderRadius: 5, cursor: page === 0 ? 'not-allowed' : 'pointer' }}>이전</button>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, padding: '6px 8px' }}>{page + 1} / {Math.max(1, totalPages)}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ background: 'rgba(0,180,255,0.1)', border: '1px solid rgba(0,180,255,0.2)', color: page >= totalPages - 1 ? 'rgba(255,255,255,0.25)' : '#00b4ff', padding: '6px 12px', borderRadius: 5, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>다음</button>
          </div>
          <div className="outreach-execute-lock" data-testid="execute-locked" style={{ background: 'rgba(255,70,70,0.08)', border: '1px solid rgba(255,70,70,0.25)', borderRadius: 6, padding: '6px 14px', color: 'rgba(255,90,90,0.72)', fontSize: 10, letterSpacing: 1 }}>
            EXECUTE LOCKED - 승인 전 발송 불가
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {detailOpen && selectedModel && (
          <CandidateDetailDrawer
            model={selectedModel}
            onClose={() => setDetailOpen(false)}
            onJarvisContextEvent={onJarvisContextEvent}
          />
        )}
      </AnimatePresence>
    </>
  );
}
