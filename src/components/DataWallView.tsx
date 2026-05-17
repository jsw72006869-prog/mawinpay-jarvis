import React, { useEffect, useState, useRef, useCallback } from 'react';

const WALL_CHANNEL = 'jarvis-dual-command-wall';
const WALL_STORAGE_KEY = 'jarvis.dualWall.latest';
const DUAL_OPENING_STORAGE_KEY = 'jarvis.dualWall.opening';
const SMARTSTORE_SNAPSHOT_KEY = 'jarvis.smartstore.lastStatusSnapshot';
const INFLUENCER_STORAGE_KEY = 'jarvis-collected-influencers';
const OUTREACH_STORAGE_KEY = 'jarvis-outreach-candidates';

/* ─── Types ─── */
interface WallPayload {
  type?: string;
  source?: string;
  scene: string;
  state: string;
  currentTime: string;
  workspaceCount: number;
  outreachCount: number;
  actionType?: string;
  updatedAt: number;
}
interface SmartstoreSnapshot {
  newOrders: number;
  pendingShipping: number;
  preShipTotal: number;
  shipping: number;
  delivered: number;
  purchaseConfirmed: number;
  source: string;
  fetchedAt: number;
  savedAt: number;
}

/* ─── Daily Brief Type ─── */
interface DailyBriefData {
  smartstore_new_orders?: number;
  smartstore_ready_orders?: number;
  smartstore_delivering?: number;
  smartstore_delivered?: number;
  smartstore_purchase_decided?: number;
  smartstore_confirm_needed?: number;
  outreach_discovered?: number;
  outreach_public_email_found?: number;
  outreach_contact_url_found?: number;
  outreach_draft_ready?: number;
  outreach_approval_waiting?: number;
  outreach_email_sent?: number;
  outreach_positive_replies?: number;
  outreach_accepted?: number;
  outreach_followup_needed?: number;
  outreach_followup_drafted?: number;
  outreach_followup_sent?: number;
  hot_youtube_count?: number;
  hot_threads_count?: number;
  hot_instagram_count?: number;
  hot_tiktok_count?: number;
  hot_naver_blog_count?: number;
  telegram_sent?: boolean;
  telegram_error_code?: string;
  period_start_kst?: string;
  period_end_kst?: string;
  date_kst?: string;
  notes?: string;
}

/* ─── Real Intel Candidate Type ─── */
type RecommendationTier = '추천' | '검토' | '보류' | '제외';
type RealIntelCandidate = {
  contextId: string;
  type: 'youtube_channel' | 'youtube_video' | 'blog' | 'influencer' | 'unknown';
  title: string;
  channelName?: string;
  category?: string;
  source?: string;
  platform?: string;
  recentVideoTitle?: string;
  thumbnailUrl?: string;
  channelAvatarUrl?: string;
  subscriberText?: string;
  viewsText?: string;
  likesText?: string;
  contactStatus: 'contactable' | 'unknown' | 'none' | 'review';
  fitScore?: number;
  reason?: string;
  keywords?: string[];
  lastUpdated?: string;
  videoId?: string;
  videoUrl?: string;
  raw?: unknown;
  /* OUTREACH-Q.5 Candidate Quality Fields */
  recommendationTier?: RecommendationTier;
  finalScore?: number;
  categoryFitScore?: number;
  brandSafetyScore?: number;
  contactScore?: number;
  mediaScore?: number;
  riskFlags?: string[];
  positiveSignals?: string[];
  jarvisReason?: string;
};

/* ─── OUTREACH-Q.5: Candidate Quality Evaluation ─── */
const BOOST_CATEGORIES = ['먹방','요리','캠핑','살림','주부','가족','건강식','다이어트','여행','지역','농장체험','리뷰','라이프스타일','농산물','식품','공동구매','제철','수확'];
const DIRECT_FIT_CATEGORIES = ['먹방','요리','살림','주부','가족','건강식','다이어트','농장체험','농산물','식품','공동구매','제철','수확'];
const INDIRECT_FIT_CATEGORIES = ['캠핑','여행','지역','리뷰','라이프스타일'];
const PENALTY_CATEGORIES = ['뷰티','패션','연예','가십','게임','금융','정치','성인','자극'];
const STRONG_EXCLUDE = ['성인','선정성','혐오','폭력','정치 선동','사기','불법','도박','주류','니코틴'];

/* ─── Email Masking ─── */
const maskEmail = (text: string): string =>
  text ? text.replace(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi, '문의 가능') : text;

/* ─── Email Partial Masking (preview용: ma***@domain.com) ─── */
const maskEmailPartial = (email: string): string => {
  if (!email) return '';
  const match = email.match(/^([A-Z0-9._%+\-]{1,3})[A-Z0-9._%+\-]*@([A-Z0-9.\-]+\.[A-Z]{2,})$/i);
  if (match) return `${match[1]}***@${match[2]}`;
  return '***@***.***';
};

function evaluateCandidate(c: RealIntelCandidate): RealIntelCandidate {
  const catLower = (c.category || '').toLowerCase();
  const reasonLower = (c.reason || '').toLowerCase();
  const titleLower = (c.title || '').toLowerCase();
  const combined = `${catLower} ${reasonLower} ${titleLower}`;
  const riskFlags: string[] = [];
  const positiveSignals: string[] = [];

  let categoryFitScore = 40;
  const boostHits = BOOST_CATEGORIES.filter(k => combined.includes(k));
  const penaltyHits = PENALTY_CATEGORIES.filter(k => combined.includes(k));
  const directHits = DIRECT_FIT_CATEGORIES.filter(k => combined.includes(k));
  const indirectHits = INDIRECT_FIT_CATEGORIES.filter(k => combined.includes(k));
  categoryFitScore += directHits.length * 15;
  categoryFitScore += indirectHits.length * 5;
  if (indirectHits.length > 0 && directHits.length === 0) riskFlags.push('카테고리 간접 연결');
  categoryFitScore -= penaltyHits.length * 15;
  if (directHits.length > 0) positiveSignals.push(`카테고리 적합: ${directHits.join(', ')}`);
  else if (indirectHits.length > 0) positiveSignals.push(`간접 연결: ${indirectHits.join(', ')}`);
  if (penaltyHits.length > 0 && boostHits.length === 0) riskFlags.push(`카테고리 부적합: ${penaltyHits.join(', ')}`);
  if (c.fitScore !== undefined) categoryFitScore = Math.round(categoryFitScore * 0.4 + c.fitScore * 0.6);
  categoryFitScore = Math.max(0, Math.min(100, categoryFitScore));

  let brandSafetyScore = 75;
  const strongExcludeHits = STRONG_EXCLUDE.filter(k => combined.includes(k));
  if (strongExcludeHits.length > 0) { brandSafetyScore = 10; riskFlags.push(`브랜드 충돌: ${strongExcludeHits.join(', ')}`); }
  if (combined.includes('자극')) { brandSafetyScore -= 25; riskFlags.push('자극적 썸네일'); }
  if (combined.includes('논란')) { brandSafetyScore -= 25; riskFlags.push('이슈/논란 가능성'); }
  if (combined.includes('노출')) { brandSafetyScore -= 20; riskFlags.push('과도한 노출'); }
  if (combined.includes('선정')) { brandSafetyScore -= 30; riskFlags.push('선정적 콘텐츠'); }
  if ((combined.includes('뷰티') || combined.includes('패션')) && directHits.length === 0) { brandSafetyScore -= 10; riskFlags.push('식품 브랜드 부적합'); }
  if (directHits.length > 0) brandSafetyScore += 5;
  brandSafetyScore = Math.max(0, Math.min(100, brandSafetyScore));

  let contactScore = 25;
  if (c.contactStatus === 'contactable') { contactScore = 90; positiveSignals.push('공개 문의 채널 확인'); }
  else if (c.contactStatus === 'review') { contactScore = 55; positiveSignals.push('문의 채널 있음'); }
  else if (c.contactStatus === 'none') { contactScore = 10; riskFlags.push('연락 불명확'); }
  if (combined.includes('공동구매') || combined.includes('협찬') || combined.includes('광고')) { contactScore += 10; positiveSignals.push('협업 이력 흔적'); }
  contactScore = Math.max(0, Math.min(100, contactScore));

  let mediaScore = 25;
  if (c.thumbnailUrl) mediaScore += 20;
  if (c.channelAvatarUrl) { mediaScore += 15; positiveSignals.push('프로필 이미지 있음'); }
  if (c.videoId || c.videoUrl) { mediaScore += 15; positiveSignals.push('대표 영상 있음'); }
  if (c.subscriberText) mediaScore += 10;
  if (c.viewsText) mediaScore += 10;
  if (!c.thumbnailUrl && !c.channelAvatarUrl) riskFlags.push('이미지 없음');
  if (!c.videoId && !c.videoUrl) riskFlags.push('대표 영상 없음');
  mediaScore = Math.max(0, Math.min(100, mediaScore));

  const finalScore = Math.round(categoryFitScore * 0.35 + brandSafetyScore * 0.30 + contactScore * 0.20 + mediaScore * 0.15);

  let recommendationTier: RecommendationTier;
  const hasStrongRisk = riskFlags.some(f => ['브랜드 충돌','자극적 썸네일','선정적 콘텐츠','이슈/논란 가능성','과도한 노출'].includes(f));
  const isIndirectOnly = indirectHits.length > 0 && directHits.length === 0;
  const isBrandUnsafe = brandSafetyScore < 45;

  if (brandSafetyScore < 45 || strongExcludeHits.length > 0) {
    recommendationTier = '제외';
  } else if (finalScore >= 82 && brandSafetyScore >= 75 && categoryFitScore >= 70 && contactScore >= 60 && !hasStrongRisk && !isIndirectOnly) {
    recommendationTier = '추천';
  } else if (finalScore >= 62 && brandSafetyScore >= 60 && !isBrandUnsafe) {
    recommendationTier = '검토';
  } else {
    recommendationTier = '보류';
  }

  let jarvisReason = '';
  if (recommendationTier === '추천') {
    jarvisReason = `농산물 공동구매와 콘텐츠 맥락이 명확하고${c.contactStatus === 'contactable' ? ', 공개 문의 채널이 있어' : ''} 우선 제안 후보로 적합합니다.`;
  } else if (recommendationTier === '검토') {
    const mainRisk = riskFlags.find(f => !['이미지 없음','대표 영상 없음'].includes(f));
    jarvisReason = mainRisk ? `콘텐츠 맥락은 일부 맞지만, ${mainRisk} 등으로 추가 확인이 필요합니다.` : '콘텐츠 맥락은 일부 맞지만, 브랜드 톤과 전환 가능성은 추가 확인이 필요합니다.';
  } else if (recommendationTier === '보류') {
    jarvisReason = '현재 데이터만으로는 농산물/식품 공동구매 적합도가 낮아 우선순위를 낮춥니다.';
  } else {
    const mainRisk = riskFlags[0] || '브랜드 안전도 미달';
    jarvisReason = `${mainRisk} 사유로 이번 캠페인에서는 제외합니다.`;
  }

  return {
    ...c,
    title: maskEmail(c.title),
    recommendationTier,
    finalScore,
    categoryFitScore,
    brandSafetyScore,
    contactScore,
    mediaScore,
    riskFlags,
    positiveSignals,
    jarvisReason: maskEmail(jarvisReason),
  };
}

/* ─── Platform Tabs ─── */
const PLATFORM_TABS = ['전체', 'YouTube', 'Instagram', 'Threads', 'Naver'] as const;
type PlatformTab = typeof PLATFORM_TABS[number];

/* ─── Normalize Function ─── */
function normalizeIntelCandidate(item: any, index: number): RealIntelCandidate {
  const title =
    item.title || item.videoTitle || item.recentContentTitle || item.recentVideoTitle ||
    item.channelTitle || item.channelName || item.name || item.topVideoTitle || `후보 ${index + 1}`;
  const channelName = item.channelName || item.channelTitle || item.name || item.handle || undefined;
  const candidateType: RealIntelCandidate['type'] =
    item.type === 'youtube_channel' ? 'youtube_channel' :
    item.type === 'youtube_video' ? 'youtube_video' :
    item.type === 'blog' ? 'blog' :
    item.type === 'influencer' ? 'influencer' :
    (item.platform?.toLowerCase().includes('youtube') ? 'youtube_channel' :
    item.platform?.toLowerCase().includes('blog') ? 'blog' : 'unknown');
  const platform =
    item.platform ||
    (item.type === 'youtube_channel' || item.type === 'youtube_video' ? 'YouTube' :
    item.type === 'blog' ? 'Naver' : undefined);
  const contactStatus: RealIntelCandidate['contactStatus'] =
    item.contactStatus === 'contactable' ? 'contactable' :
    item.contactStatus === 'review' ? 'review' :
    item.contactStatus === 'none' ? 'none' :
    (item.publicContact || item.contactEmail || item.email || item.publicEmail ? 'contactable' :
    item.contactUrl ? 'review' : 'unknown');
  const subscriberCount = item.subscriberCount || item.subscribers || item.followerCount || item.followers;
  const subscriberText = subscriberCount ? `${Number(subscriberCount).toLocaleString()}명` : (item.subscriberText || item.subscriberOrVisitor || undefined);
  const viewCount = item.viewCount || item.views || item.avgViews || item.averageViews;
  const viewsText = viewCount ? `${Number(viewCount).toLocaleString()}회` : (item.viewsText || undefined);
  const likeCount = item.likeCount || item.likes;
  const likesText = likeCount ? `${Number(likeCount).toLocaleString()}개` : undefined;
  let videoId: string | undefined = item.videoId || item.representativeVideoId || undefined;
  if (!videoId && item.topVideoUrl) { const m = item.topVideoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/); if (m) videoId = m[1]; }
  if (!videoId && item.videoUrl) { const m = item.videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/); if (m) videoId = m[1]; }
  if (!videoId && item.url) { const m = item.url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/); if (m) videoId = m[1]; }
  const isImageUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    return url.startsWith('http') && (url.includes('ggpht') || url.includes('googleusercontent') || url.includes('ytimg') || url.includes('.jpg') || url.includes('.png') || url.includes('.webp') || url.includes('instagram') || url.includes('fbcdn') || url.includes('pstatic'));
  };
  const profileImage = item.profileImageUrl || item.profileImage || item.avatarUrl || item.avatar || item.channelAvatarUrl || item.channelAvatar || item.channelThumbnailUrl || item.channelThumbnail || (isImageUrl(item.profileUrl) ? item.profileUrl : undefined) || item.channel?.thumbnailUrl || item.snippet?.thumbnails?.default?.url || undefined;
  const youtubeThumbnailFromId = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined;
  const thumbnailUrl = item.thumbnailUrl || item.thumbnail || item.imageUrl || item.videoThumbnailUrl || item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || youtubeThumbnailFromId || profileImage || undefined;
  return {
    contextId: String(item.candidateId || item.channelId || item.id || `candidate-${index + 1}`),
    type: candidateType,
    title,
    channelName,
    category: item.category || item.keyword || item.niche || item.topic || '분류 미확인',
    source: item.platform || item.source || undefined,
    platform,
    recentVideoTitle: item.recentContentTitle || item.topVideoTitle || item.recentVideoTitle || undefined,
    thumbnailUrl,
    channelAvatarUrl: profileImage || thumbnailUrl,
    subscriberText,
    viewsText,
    likesText,
    contactStatus,
    fitScore: typeof item.productFitScore === 'number' ? item.productFitScore : (typeof item.fitScore === 'number' ? item.fitScore : (typeof item.score === 'number' ? item.score : undefined)),
    reason: item.productFitReason || item.reason || item.fitReason || undefined,
    keywords: Array.isArray(item.keywords) ? item.keywords : (item.keyword ? [item.keyword] : []),
    lastUpdated: item.collectedAt || item.lastUpdated || item.updatedAt || undefined,
    videoId,
    videoUrl: item.videoUrl || item.topVideoUrl || item.url || item.channelOrBlogUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined),
    raw: item,
  };
}

/* ─── Helper ─── */
function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   DATAWALL-NODE-CANVAS-A.1: Agent Graph Types & Builder
   ═══════════════════════════════════════════════════════════════ */

type AgentNodeStatus =
  | 'done'
  | 'active'
  | 'standby'
  | 'skipped'
  | 'locked'
  | 'not_connected'
  | 'error';

type AgentGraphNode = {
  id: string;
  label: string;
  subtitle: string;
  icon: string;
  status: AgentNodeStatus;
  metric?: string;
  detail?: string;
};

type AgentGraphEdge = {
  from: string;
  to: string;
  active: boolean;
  completed: boolean;
};

type AgentSignal = {
  id: string;
  label: string;
  value: string;
  tone?: 'cyan' | 'green' | 'amber' | 'red' | 'muted';
};

/* ─── buildAgentGraph: 기존 실제 데이터 변수 매핑 (fake 금지) ─── */
function buildAgentGraph(data: {
  smartstoreConfirmNeeded: number | null;
  ssNewOrders: number | null;
  ssPendingShip: number | null;
  totalCandidates: number;
  publicEmails: number;
  hotYoutube: number | undefined;
  hotThreads: number | undefined;
  hotInstagram: number | undefined;
  hotTiktok: number | undefined;
  hotNaverBlog: number | undefined;
  copyBrainStatus: {
    status: string;
    generatedCopies: number;
    recommendedCopies: number;
    rewriteRequired: number;
    riskWarnings: number;
    dnaSource: string;
    topHookTypes: string[];
  };
  telegramSent: boolean | undefined;
  telegramError: string | undefined;
  briefData: DailyBriefData | null;
  briefLoading: boolean;
}) {
  const smartConfirmNeeded = Number(data.smartstoreConfirmNeeded ?? 0);
  const ssNew = Number(data.ssNewOrders ?? 0);
  const ssPending = Number(data.ssPendingShip ?? 0);
  const totalCandidates = Number(data.totalCandidates ?? 0);
  const publicEmails = Number(data.publicEmails ?? 0);
  const hotContentTotal =
    (data.hotYoutube ?? 0) +
    (data.hotThreads ?? 0) +
    (data.hotInstagram ?? 0) +
    (data.hotTiktok ?? 0) +
    (data.hotNaverBlog ?? 0);
  const hotConnected = data.hotYoutube !== undefined || data.hotThreads !== undefined;
  const generatedCopies = Number(data.copyBrainStatus?.generatedCopies ?? 0);
  const recommendedCopies = Number(data.copyBrainStatus?.recommendedCopies ?? 0);
  const dnaSource = String(data.copyBrainStatus?.dnaSource ?? '').toLowerCase();
  const telegramConfigured = !data.telegramError?.includes('env_missing') && !data.telegramError?.includes('skipped');
  const outreachSent = Number(data.briefData?.outreach_email_sent ?? 0);
  const outreachPositive = Number(data.briefData?.outreach_positive_replies ?? 0);
  const outreachAccepted = Number(data.briefData?.outreach_accepted ?? 0);

  const nodes: AgentGraphNode[] = [
    {
      id: 'smartstore',
      label: 'Smartstore',
      subtitle: '주문/발주 트리거',
      icon: '🛒',
      status: data.briefLoading ? 'standby' : (ssNew > 0 || ssPending > 0 || smartConfirmNeeded > 0) ? 'active' : 'done',
      metric: ssNew !== null && ssNew >= 0 ? `신규 ${ssNew} · 배송준비 ${ssPending}` : '조회 중...',
      detail: smartConfirmNeeded > 0 ? `발주확인 ${smartConfirmNeeded}건 필요` : 'real-time observe',
    },
    {
      id: 'outreach',
      label: 'Outreach',
      subtitle: '후보 수집 / 이메일 확인',
      icon: '📡',
      status: totalCandidates > 0 ? 'done' : 'standby',
      metric: `${totalCandidates} 후보`,
      detail: `${publicEmails} 공개 이메일`,
    },
    {
      id: 'hot-content',
      label: 'Hot Content',
      subtitle: '바이럴 콘텐츠 수집',
      icon: '🔥',
      status: hotConnected ? (hotContentTotal > 0 ? 'done' : 'standby') : 'not_connected',
      metric: hotConnected ? `${hotContentTotal} 콘텐츠` : 'not connected',
      detail: hotConnected ? 'public source verified' : '수집기 미연결',
    },
    {
      id: 'copy-brain',
      label: 'Copy Brain',
      subtitle: 'Viral DNA 분석 / 카피 생성',
      icon: '🧠',
      status: data.copyBrainStatus.status === 'sheets_scope_error' ? 'error'
        : generatedCopies > 0 ? 'active'
        : data.copyBrainStatus.status === 'no_generation_yet' ? 'standby'
        : 'standby',
      metric: generatedCopies > 0 ? `${generatedCopies} 생성` : '생성 전',
      detail: generatedCopies > 0
        ? `${recommendedCopies} 추천 · ${dnaSource === 'viral_content_swipe' ? 'DNA:Hot' : dnaSource === 'rules_only' ? 'DNA:Rules' : 'DNA:none'}`
        : data.copyBrainStatus.status === 'sheets_scope_error' ? 'SHEETS_SCOPE_ERROR' : '대기 중',
    },
    {
      id: 'draft',
      label: 'Draft',
      subtitle: '메일/카피 초안',
      icon: '📝',
      status: recommendedCopies > 0 ? 'done' : 'standby',
      metric: recommendedCopies > 0 ? `${recommendedCopies} 추천` : '초안 없음',
      detail: 'review required',
    },
    {
      id: 'approval',
      label: 'Approval Gate',
      subtitle: '대표 승인 대기',
      icon: '🔐',
      status: 'locked',
      metric: 'LOCKED',
      detail: 'manual approval only',
    },
    {
      id: 'send',
      label: 'Send',
      subtitle: 'Gmail / DM 발송',
      icon: '📤',
      status: 'locked',
      metric: 'EXECUTE LOCKED',
      detail: 'no auto-send',
    },
    {
      id: 'reply',
      label: 'Reply Tracker',
      subtitle: '답장 / 수락 추적',
      icon: '✅',
      status: outreachAccepted > 0 ? 'done' : outreachPositive > 0 ? 'active' : 'standby',
      metric: `${outreachPositive} 긍정 · ${outreachAccepted} 수락`,
      detail: outreachSent > 0 ? `${outreachSent}건 발송됨` : 'waiting',
    },
  ];

  // activeNodeId: 가장 최근에 실제로 작동 중인 노드 (fake 금지)
  const activeNodeId =
    generatedCopies > 0 ? 'copy-brain'
    : hotContentTotal > 0 ? 'hot-content'
    : totalCandidates > 0 ? 'outreach'
    : (ssNew > 0 || ssPending > 0 || smartConfirmNeeded > 0) ? 'smartstore'
    : 'smartstore';

  const edges: AgentGraphEdge[] = [
    { from: 'smartstore', to: 'outreach', active: activeNodeId === 'outreach', completed: totalCandidates > 0 },
    { from: 'outreach', to: 'hot-content', active: activeNodeId === 'hot-content', completed: hotContentTotal > 0 },
    { from: 'hot-content', to: 'copy-brain', active: activeNodeId === 'copy-brain', completed: generatedCopies > 0 },
    { from: 'copy-brain', to: 'draft', active: false, completed: recommendedCopies > 0 },
    { from: 'draft', to: 'approval', active: false, completed: false },
    { from: 'approval', to: 'send', active: false, completed: false },
    { from: 'send', to: 'reply', active: false, completed: false },
  ];

  const selectedNode = nodes.find((node) => node.id === activeNodeId) ?? nodes[0];

  const recentSignals: AgentSignal[] = [];
  if (ssNew > 0) recentSignals.push({ id: 'ss-new', label: '신규주문', value: `${ssNew}건`, tone: 'amber' });
  if (ssPending > 0) recentSignals.push({ id: 'ss-pending', label: '배송준비', value: `${ssPending}건`, tone: 'amber' });
  if (smartConfirmNeeded > 0) recentSignals.push({ id: 'ss-confirm', label: '발주확인 필요', value: `${smartConfirmNeeded}건`, tone: 'red' });
  if (generatedCopies > 0) recentSignals.push({ id: 'copy-generated', label: 'Copy Brain 생성', value: `${generatedCopies}건`, tone: 'cyan' });
  if (recommendedCopies > 0) recentSignals.push({ id: 'copy-recommended', label: '추천 카피', value: `${recommendedCopies}건`, tone: 'green' });
  if (hotContentTotal > 0) recentSignals.push({ id: 'hot-content', label: 'Hot Content DNA', value: `${hotContentTotal}건`, tone: 'amber' });
  if (publicEmails > 0) recentSignals.push({ id: 'public-email', label: '공개 이메일 확인', value: `${publicEmails}건`, tone: 'cyan' });
  if (totalCandidates > 0) recentSignals.push({ id: 'candidates', label: '수집 후보', value: `${totalCandidates}명`, tone: 'muted' });
  if (!telegramConfigured) recentSignals.push({ id: 'telegram-skipped', label: 'Telegram skipped', value: 'env missing', tone: 'muted' });
  if (data.telegramSent) recentSignals.push({ id: 'telegram-sent', label: 'Telegram 브리핑', value: 'SENT', tone: 'green' });

  return {
    nodes,
    edges,
    activeNodeId,
    selectedNode,
    recentSignals,
  };
}

/* ═══════════════════════════════════════════════════════════════
   DATAWALL-NODE-CANVAS-A.1: Sub-components
   ═══════════════════════════════════════════════════════════════ */

/* ─── AgentFlowNode ─── */
function AgentFlowNode({
  node,
  active,
  index,
  onClick,
}: {
  node: AgentGraphNode;
  active: boolean;
  index: number;
  onClick?: () => void;
}) {
  const statusLabel: Record<AgentNodeStatus, string> = {
    done: 'DONE',
    active: 'ACTIVE',
    standby: 'STANDBY',
    skipped: 'SKIPPED',
    locked: 'LOCKED',
    not_connected: 'NOT CONNECTED',
    error: 'ERROR',
  };
  return (
    <article
      className={[
        'agent-flow-node',
        `is-${node.status}`,
        active ? 'is-current' : '',
      ].join(' ')}
      style={{ '--delay': `${index * 80}ms` } as React.CSSProperties}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="agent-node-topline">
        <div className={[
          'agent-node-orb',
          `orb-${node.status}`,
          active ? 'orb-current' : '',
        ].join(' ')}>
          <span className="agent-node-icon">{node.icon}</span>
          {active && <span className="agent-orb-satellite" />}
        </div>
        <span className={`agent-node-status-badge is-${node.status}`}>{statusLabel[node.status]}</span>
      </div>
      <div className="agent-node-label">{node.label}</div>
      <div className="agent-node-subtitle">{node.subtitle}</div>
      <div className="agent-node-bottom">
        <strong className="agent-node-metric">{node.metric}</strong>
        <span className="agent-node-detail">{node.detail}</span>
      </div>
      {active && (
        <div className="agent-node-processing" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      {active && <div className="agent-node-micro-rail" />}
      {active && <div className="agent-node-current-badge">CURRENT</div>}
    </article>
  );
}

/* ─── AgentNodeCanvas ─── */
function AgentNodeCanvas({
  nodes,
  edges,
  activeNodeId,
  onNodeClick,
}: {
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  activeNodeId: string;
  onNodeClick?: (nodeId: string) => void;
}) {
  const activeNode = nodes.find((n) => n.id === activeNodeId);
  return (
    <section className="agent-node-canvas datawall-enter datawall-delay-2">
      <div className="agent-canvas-bg" />

      {/* Current Mission Strip */}
      <div className="agent-current-mission-strip">
        <span className="agent-live-dot" />
        <span className="mission-kicker">CURRENT MISSION</span>
        <strong className="mission-label">{activeNode?.label ?? 'Agent'}</strong>
        <span className="mission-subtitle">{activeNode?.subtitle ?? '대기 중'}</span>
        <span className="mission-metric">{activeNode?.metric}</span>
      </div>

      {/* Flow Grid: 4 + 4 two-row layout */}
      <div className="agent-flow-grid">
        {nodes.map((node, index) => {
          const edge = edges[index];
          const isLast = index === nodes.length - 1;
          return (
            <div className="agent-flow-unit" key={node.id}>
              <AgentFlowNode
                node={node}
                active={node.id === activeNodeId}
                index={index}
                onClick={onNodeClick ? () => onNodeClick(node.id) : undefined}
              />
              {!isLast && (
                <div
                  className={[
                    'agent-flow-connector',
                    edge?.active ? 'is-active' : '',
                    edge?.completed ? 'is-completed' : '',
                  ].join(' ')}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─── AgentActivityInspector ─── */
function AgentActivityInspector({
  selectedNode,
  recentSignals,
  briefData,
  briefLoading,
  briefError,
  onRefresh,
  ssNewOrders,
  ssPendingShip,
  ssConfirmNeeded,
  totalCandidates,
  tierCounts,
  copyBrainStatus,
  hotYoutube,
  hotThreads,
  hotInstagram,
  hotTiktok,
  hotNaverBlog,
  periodStart,
  periodEnd,
}: {
  selectedNode: AgentGraphNode;
  recentSignals: AgentSignal[];
  briefData: DailyBriefData | null;
  briefLoading: boolean;
  briefError: string | null;
  onRefresh: () => void;
  ssNewOrders: number | null;
  ssPendingShip: number | null;
  ssConfirmNeeded: number | null;
  totalCandidates: number;
  tierCounts: { 추천: number; 검토: number; 보류: number; 제외: number };
  copyBrainStatus: {
    status: string;
    generatedCopies: number;
    recommendedCopies: number;
    rewriteRequired: number;
    riskWarnings: number;
    avgFinalScore: number;
    dnaSource: string;
    topHookTypes: string[];
  };
  hotYoutube: number | undefined;
  hotThreads: number | undefined;
  hotInstagram: number | undefined;
  hotTiktok: number | undefined;
  hotNaverBlog: number | undefined;
  periodStart: string | undefined;
  periodEnd: string | undefined;
}) {
  const statusLabel: Record<AgentNodeStatus, string> = {
    done: 'DONE',
    active: 'ACTIVE',
    standby: 'STANDBY',
    skipped: 'SKIPPED',
    locked: 'LOCKED',
    not_connected: 'NOT CONNECTED',
    error: 'ERROR',
  };

  return (
    <aside className="agent-activity-inspector datawall-enter datawall-delay-5">
      {/* Selected Node */}
      <section className="inspector-section inspector-current">
        <div className="inspector-kicker">SELECTED NODE</div>
        <div className="inspector-node-header">
          <span className="inspector-node-orb">{selectedNode.icon}</span>
          <div>
            <h3 className="inspector-node-name">{selectedNode.label}</h3>
            <p className="inspector-node-sub">{selectedNode.subtitle}</p>
          </div>
        </div>
        <div className={`inspector-status-badge is-${selectedNode.status}`}>
          {statusLabel[selectedNode.status as AgentNodeStatus] ?? selectedNode.status}
        </div>
        {selectedNode.metric && (
          <div className="inspector-metric">{selectedNode.metric}</div>
        )}
        {selectedNode.detail && (
          <div className="inspector-detail">{selectedNode.detail}</div>
        )}
      </section>

      {/* Recent Signals */}
      <section className="inspector-section inspector-signals">
        <div className="inspector-kicker">
          LIVE SIGNALS
          <button className="inspector-refresh-btn" onClick={onRefresh} disabled={briefLoading} title="새로고침">
            {briefLoading ? '⟳' : '↻'}
          </button>
        </div>
        {briefLoading && <div className="inspector-loading">데이터 로딩 중...</div>}
        {briefError && <div className="inspector-error">조회 실패: {briefError}</div>}
        {recentSignals.length > 0 ? (
          recentSignals.map((signal) => (
            <div className={`signal-row is-${signal.tone ?? 'cyan'}`} key={signal.id}>
              <span className="signal-dot" />
              <span className="signal-label">{signal.label}</span>
              <strong className="signal-value">{signal.value}</strong>
            </div>
          ))
        ) : (
          !briefLoading && <div className="empty-signal">아직 표시할 작업 신호가 없습니다.</div>
        )}
      </section>

      {/* Smartstore KPI Compact */}
      <section className="inspector-section inspector-kpi">
        <div className="inspector-kicker">SMARTSTORE</div>
        <div className="inspector-kpi-row">
          <span className="inspector-kpi-item is-alert">신규 <strong>{ssNewOrders !== null ? ssNewOrders : '—'}</strong></span>
          <span className="inspector-kpi-item is-warn">배송준비 <strong>{ssPendingShip !== null ? ssPendingShip : '—'}</strong></span>
          {ssConfirmNeeded !== null && ssConfirmNeeded > 0 && (
            <span className="inspector-kpi-item is-red">발주확인 <strong>{ssConfirmNeeded}건</strong></span>
          )}
        </div>
      </section>

      {/* Copy Brain Compact */}
      <section className="inspector-section inspector-copy">
        <div className="inspector-kicker">COPY BRAIN</div>
        <div className="inspector-kpi-row">
          <span className="inspector-kpi-item">생성 <strong>{copyBrainStatus.generatedCopies}</strong></span>
          <span className="inspector-kpi-item is-green">추천 <strong>{copyBrainStatus.recommendedCopies}</strong></span>
          <span className="inspector-kpi-item">DNA <strong>{copyBrainStatus.dnaSource === 'viral_content_swipe' ? 'Hot' : copyBrainStatus.dnaSource === 'rules_only' ? 'Rules' : 'none'}</strong></span>
        </div>
        {copyBrainStatus.topHookTypes.length > 0 && (
          <div className="inspector-hook-types">
            Top Hook: {copyBrainStatus.topHookTypes.slice(0, 2).join(' · ')}
          </div>
        )}
      </section>

      {/* Candidate Tier Compact */}
      <section className="inspector-section inspector-tier">
        <div className="inspector-kicker">후보 품질 ({totalCandidates}명)</div>
        <div className="inspector-tier-row">
          <span className="inspector-tier-item is-추천">추천 <strong>{tierCounts.추천}</strong></span>
          <span className="inspector-tier-item is-검토">검토 <strong>{tierCounts.검토}</strong></span>
          <span className="inspector-tier-item is-보류">보류 <strong>{tierCounts.보류}</strong></span>
          <span className="inspector-tier-item is-제외">제외 <strong>{tierCounts.제외}</strong></span>
        </div>
      </section>

      {/* Hot Content Compact */}
      <section className="inspector-section inspector-hot">
        <div className="inspector-kicker">HOT CONTENT</div>
        <div className="inspector-kpi-row">
          {hotYoutube !== undefined ? <span className="inspector-kpi-item">YT <strong>{hotYoutube}</strong></span> : <span className="inspector-kpi-item is-muted">YT <em>—</em></span>}
          {hotThreads !== undefined ? <span className="inspector-kpi-item">TH <strong>{hotThreads}</strong></span> : <span className="inspector-kpi-item is-muted">TH <em>—</em></span>}
          {hotInstagram !== undefined ? <span className="inspector-kpi-item">IG <strong>{hotInstagram}</strong></span> : null}
          {hotTiktok !== undefined ? <span className="inspector-kpi-item">TK <strong>{hotTiktok}</strong></span> : null}
          {hotNaverBlog !== undefined ? <span className="inspector-kpi-item">NB <strong>{hotNaverBlog}</strong></span> : null}
        </div>
        {hotYoutube === undefined && hotThreads === undefined && (
          <div className="inspector-not-connected">collector not connected</div>
        )}
      </section>

      {/* Brief Period */}
      {(periodStart || periodEnd) && (
        <section className="inspector-section inspector-period">
          <div className="inspector-kicker">BRIEF PERIOD</div>
          <div className="inspector-period-text">{periodStart} ~ {periodEnd}</div>
        </section>
      )}

      {/* Next Action (disabled) */}
      <section className="inspector-section inspector-next">
        <div className="inspector-kicker">NEXT ACTION</div>
        <button className="next-action-chip" disabled>추천 카피 검토</button>
        <button className="next-action-chip" disabled>승인 전 실행 잠금</button>
        <div className="inspector-lock-note">이메일 원문은 Google Sheets에서 확인</div>
      </section>
    </aside>
  );
}

/* ─── Agent Module Dock (Left Panel) ─── */
function AgentModuleDock({
  nodes,
  activeNodeId,
  activeTab,
  setActiveTab,
  platformCounts,
  briefData,
  systemArmed,
  now,
  onRefresh,
  briefLoading,
}: {
  nodes: AgentGraphNode[];
  activeNodeId: string;
  activeTab: PlatformTab;
  setActiveTab: (tab: PlatformTab) => void;
  platformCounts: Record<string, number>;
  briefData: DailyBriefData | null;
  systemArmed: boolean;
  now: string;
  onRefresh: () => void;
  briefLoading: boolean;
}) {
  const statusColor: Record<AgentNodeStatus, string> = {
    done: '#4ade80',
    active: '#2affd2',
    standby: '#4a6080',
    skipped: '#f59e0b',
    locked: '#f87171',
    not_connected: '#6b7280',
    error: '#ef4444',
  };

  return (
    <aside className="datawall-agent-dock datawall-enter datawall-delay-1">
      {/* System Status */}
      <div className="dock-system-status">
        <span className={`dock-armed-dot ${systemArmed ? 'is-armed' : ''}`} />
        <span className="dock-system-label">{systemArmed ? 'SYSTEM ARMED' : 'SYSTEM ONLINE'}</span>
        <span className="dock-time">{now.split(' ')[1] || now}</span>
      </div>

      {/* Agent Module List */}
      <div className="dock-section-label">AGENT MODULES</div>
      <div className="dock-module-list">
        {nodes.map((node) => (
          <div
            key={node.id}
            className={`dock-module-item ${node.id === activeNodeId ? 'is-active-node' : ''}`}
          >
            <span className="dock-module-orb">{node.icon}</span>
            <div className="dock-module-body">
              <span className="dock-module-name">{node.label}</span>
              <span className="dock-module-metric">{node.metric}</span>
            </div>
            <span
              className="dock-module-dot"
              style={{ background: statusColor[node.status] ?? '#4a6080' }}
            />
          </div>
        ))}
      </div>

      {/* Platform Filter Tabs */}
      <div className="dock-section-label">PLATFORM FILTER</div>
      <div className="dock-platform-tabs">
        {PLATFORM_TABS.map(tab => (
          <button
            key={tab}
            className={`dock-tab ${activeTab === tab ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
            {tab !== '전체' && platformCounts[tab] ? (
              <span className="dock-tab-count">{platformCounts[tab]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Brief Summary Compact */}
      {briefData && (
        <div className="dock-section-label">24H BRIEF</div>
      )}
      {briefData && (
        <div className="dock-brief-compact">
          {briefData.outreach_discovered !== undefined && (
            <div className="dock-brief-row">
              <span>수집 후보</span>
              <strong>{briefData.outreach_discovered}</strong>
            </div>
          )}
          {briefData.outreach_public_email_found !== undefined && (
            <div className="dock-brief-row">
              <span>공개 이메일</span>
              <strong>{briefData.outreach_public_email_found}</strong>
            </div>
          )}
          {briefData.outreach_email_sent !== undefined && (
            <div className="dock-brief-row">
              <span>발송</span>
              <strong>{briefData.outreach_email_sent}</strong>
            </div>
          )}
          {briefData.outreach_positive_replies !== undefined && (
            <div className="dock-brief-row">
              <span>긍정 답변</span>
              <strong>{briefData.outreach_positive_replies}</strong>
            </div>
          )}
          {briefData.outreach_accepted !== undefined && (
            <div className="dock-brief-row">
              <span>제안 수락</span>
              <strong>{briefData.outreach_accepted}</strong>
            </div>
          )}
          <div className="dock-brief-note">이메일 원문은 Google Sheets</div>
        </div>
      )}
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main DataWallView Component
   ═══════════════════════════════════════════════════════════════ */
const DataWallView: React.FC = () => {
  const [payload, setPayload] = useState<WallPayload | null>(null);
  const [smartstoreSnapshot, setSmartstoreSnapshot] = useState<SmartstoreSnapshot | null>(null);
  const [openingActive, setOpeningActive] = useState(false);
  const [systemArmed, setSystemArmed] = useState(false);
  const [realCandidates, setRealCandidates] = useState<RealIntelCandidate[]>([]);
  const [activeTab, setActiveTab] = useState<PlatformTab>('전체');
  const [briefData, setBriefData] = useState<DailyBriefData | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  // COPY-BRAIN-A.1B: Copy Brain 실제 데이터 + DNA Source 기반 상태
  const [copyBrainStatus, setCopyBrainStatus] = useState<{
    status: 'active' | 'no_generation_yet' | 'sheets_scope_error' | 'loading';
    generatedCopies: number;
    recommendedCopies: number;
    rewriteRequired: number;
    riskWarnings: number;
    boringFiltered: number;
    avgFinalScore: number;
    topHookTypes: string[];
    topBuyerDesires: string[];
    dnaSource: string;
    lastGeneratedAt: string;
  }>({
    status: 'loading', generatedCopies: 0, recommendedCopies: 0, rewriteRequired: 0,
    riskWarnings: 0, boringFiltered: 0, avgFinalScore: 0, topHookTypes: [], topBuyerDesires: [],
    dnaSource: 'none', lastGeneratedAt: '',
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [candidatePage, setCandidatePage] = useState(0);
  const openingTimerRef = useRef<number | null>(null);
  // Creative Studio 데이터 (localStorage에서 읽음)
  const [csData, setCsData] = useState<{
    copies: any[];
    product: string;
    contentType: string;
    trends: number;
    refs: number;
    updatedAt: number;
  } | null>(null);
  const [csSelectedCopy, setCsSelectedCopy] = useState<any | null>(null);
  const [csSelectedRank, setCsSelectedRank] = useState(0);
  // 인플루언서 상세 모달
  const [selectedInfluencer, setSelectedInfluencer] = useState<RealIntelCandidate | null>(null);

  /* ─── Read real candidates from localStorage ─── */
  const refreshCandidates = useCallback(() => {
    const outreachRaw = readJson<any[]>(OUTREACH_STORAGE_KEY) || [];
    const collectedRaw = readJson<any[]>(INFLUENCER_STORAGE_KEY) || [];
    const combined = [...outreachRaw];
    const existingIds = new Set(outreachRaw.map(item => String(item.candidateId || item.channelId || item.id)));
    collectedRaw.forEach(item => {
      const id = String(item.candidateId || item.channelId || item.id || item.name);
      if (!existingIds.has(id)) { combined.push(item); existingIds.add(id); }
    });
    if (combined.length > 0) {
      const normalized = combined.map((item, idx) => normalizeIntelCandidate(item, idx));
      const evaluated = normalized.map(c => evaluateCandidate(c));
      const tierOrder: Record<string, number> = { '추천': 0, '검토': 1, '보류': 2, '제외': 3 };
      evaluated.sort((a, b) => {
        const tierDiff = (tierOrder[a.recommendationTier || '보류'] ?? 2) - (tierOrder[b.recommendationTier || '보류'] ?? 2);
        if (tierDiff !== 0) return tierDiff;
        return (b.finalScore || 0) - (a.finalScore || 0);
      });
      setRealCandidates(evaluated);
    } else {
      setRealCandidates([]);
    }
  }, []);

  /* ─── Fetch Daily Brief from API ─── */
  const fetchBrief = useCallback(async () => {
    setBriefLoading(true);
    setBriefError(null);
    try {
      const res = await fetch('/api/cloud-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType: 'daily-brief-24h', dryRun: true, sendTelegram: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        // API 응답이 {smartstore:{...}, outreach:{...}} 구조인 경우 flat으로 변환
        if (data.smartstore || data.outreach) {
          const ss = data.smartstore || {};
          const ou = data.outreach || {};
          const hcRaw = data.hotContent;
          // Hot Content collector가 실제 연결되지 않은 경우를 구분:
          // API가 hotContent 필드 자체를 반환하지 않거나, 모든 값이 0/undefined이면 not_connected
          const hcConnected = hcRaw && (hcRaw.youtube > 0 || hcRaw.threads > 0 || hcRaw.instagram > 0 || hcRaw.tiktok > 0 || hcRaw.naverBlog > 0);
          const mapped: DailyBriefData = {
            smartstore_new_orders: ss.newOrders,
            smartstore_ready_orders: ss.pendingShipping,
            smartstore_delivering: ss.shipping,
            smartstore_delivered: ss.delivered,
            smartstore_purchase_decided: ss.purchaseConfirmed,
            smartstore_confirm_needed: ss.confirmNeeded,
            outreach_discovered: ou.discovered,
            outreach_public_email_found: ou.publicEmailFound,
            outreach_contact_url_found: ou.contactUrlFound,
            outreach_draft_ready: ou.draftReady,
            outreach_approval_waiting: ou.approvalWaiting,
            outreach_email_sent: ou.emailSent,
            outreach_positive_replies: ou.positiveReplies,
            outreach_accepted: ou.accepted,
            outreach_followup_needed: ou.followupNeeded,
            outreach_followup_drafted: ou.followupDrafted,
            outreach_followup_sent: ou.followupSent,
            // Hot Content: 실제 수집 데이터가 있을 때만 숫자 표시, 없으면 undefined → not_connected
            hot_youtube_count: hcConnected ? hcRaw.youtube : undefined,
            hot_threads_count: hcConnected ? hcRaw.threads : undefined,
            hot_instagram_count: hcConnected ? hcRaw.instagram : undefined,
            hot_tiktok_count: hcConnected ? hcRaw.tiktok : undefined,
            hot_naver_blog_count: hcConnected ? hcRaw.naverBlog : undefined,
            telegram_sent: data.telegramSent,
            telegram_error_code: data.telegramErrorCode,
            period_start_kst: data.periodStartKst,
            period_end_kst: data.periodEndKst,
            date_kst: data.dateKst,
            notes: data.notes,
          };
          setBriefData(mapped);
        } else if (data.brief) {
          setBriefData(data.brief);
        } else if (data.data) {
          setBriefData(data.data);
        } else {
          setBriefError('brief 데이터 없음');
        }
      } else {
        setBriefError(data.error || 'API 오류');
      }
    } catch (e: any) {
      setBriefError(e.message || 'API 호출 실패');
    } finally {
      setBriefLoading(false);
    }

    // COPY-BRAIN-A.1B: Copy Brain 상태 조회
    try {
      const cbRes = await fetch('/api/cloud-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType: 'copy_brain_list', limit: 50 }),
      });
      if (cbRes.ok) {
        const cbData = await cbRes.json();
        if (cbData.success && cbData.items) {
          const items = cbData.items || [];
          const summary = cbData.summary || {};
          const lastItem = items.length > 0 ? items[0] : null; // 최신순 정렬되어 있음
          setCopyBrainStatus({
            status: items.length > 0 ? 'active' : 'no_generation_yet',
            generatedCopies: cbData.total || 0,
            recommendedCopies: summary.recommended || 0,
            rewriteRequired: summary.rewrite_required || 0,
            riskWarnings: summary.risk_warnings || 0,
            boringFiltered: summary.boring_filtered || 0,
            avgFinalScore: summary.avg_final_score || 0,
            topHookTypes: summary.top_hook_types || [],
            topBuyerDesires: summary.top_buyer_desires || [],
            dnaSource: lastItem?.dna_source || 'none',
            lastGeneratedAt: lastItem?.created_at || '',
          });
        } else if (cbData.errorCode) {
          setCopyBrainStatus(prev => ({ ...prev, status: 'sheets_scope_error' }));
        } else {
          setCopyBrainStatus(prev => ({ ...prev, status: 'no_generation_yet' }));
        }
      }
    } catch { setCopyBrainStatus(prev => ({ ...prev, status: 'no_generation_yet' })); }
  }, []);

  useEffect(() => {
    const refreshFromStorage = () => {
      const p = readJson<WallPayload>(WALL_STORAGE_KEY);
      if (p) setPayload(p);
      const s = readJson<SmartstoreSnapshot>(SMARTSTORE_SNAPSHOT_KEY);
      if (s) setSmartstoreSnapshot(s);
      const openingPayload = readJson<any>(DUAL_OPENING_STORAGE_KEY);
      if (openingPayload?.type === 'dual-armed') setSystemArmed(true);
      if (openingPayload?.type === 'dual-opening') {
        setSystemArmed(true);
        setOpeningActive(true);
        if (openingTimerRef.current) window.clearTimeout(openingTimerRef.current);
        openingTimerRef.current = window.setTimeout(() => setOpeningActive(false), 6000);
      }
      // Creative Studio 데이터 읽기
      const csRaw = readJson<any>('jarvis.creativeStudio.latest');
      if (csRaw && csRaw.copies?.length > 0) setCsData(csRaw);
      refreshCandidates();
    };
    refreshFromStorage();
    fetchBrief();
    let channel: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(WALL_CHANNEL);
      channel.onmessage = (event) => {
        const data = event?.data;
        if (!data) return;
        if (data.type === 'dual-armed') { setSystemArmed(true); setPayload(data); return; }
        if (data.type === 'dual-opening') {
          setSystemArmed(true); setOpeningActive(true); setPayload(data);
          if (openingTimerRef.current) window.clearTimeout(openingTimerRef.current);
          openingTimerRef.current = window.setTimeout(() => setOpeningActive(false), 6000);
          return;
        }
        if (data.type === 'data-update') { refreshCandidates(); return; }
        setPayload(data);
        const nextSmartstore = readJson<SmartstoreSnapshot>(SMARTSTORE_SNAPSHOT_KEY);
        if (nextSmartstore) setSmartstoreSnapshot(nextSmartstore);
        refreshCandidates();
      };
    }
    const interval = setInterval(refreshFromStorage, 3000);
    const briefInterval = setInterval(fetchBrief, 5 * 60 * 1000); // 5분마다 갱신
    return () => {
      if (channel) channel.close();
      clearInterval(interval);
      clearInterval(briefInterval);
      if (openingTimerRef.current) window.clearTimeout(openingTimerRef.current);
    };
  }, [refreshCandidates, fetchBrief]);

  /* ─── Derived data ─── */
  const filteredCandidates = activeTab === '전체'
    ? realCandidates
    : realCandidates.filter(c => c.platform === activeTab);

  const totalCandidates = realCandidates.length;
  const filteredCount = filteredCandidates.length;

  const platformCounts: Record<string, number> = {};
  realCandidates.forEach(c => {
    const p = c.platform || 'YouTube';
    platformCounts[p] = (platformCounts[p] || 0) + 1;
  });

  const tierCounts = {
    추천: realCandidates.filter(c => c.recommendationTier === '추천').length,
    검토: realCandidates.filter(c => c.recommendationTier === '검토').length,
    보류: realCandidates.filter(c => c.recommendationTier === '보류').length,
    제외: realCandidates.filter(c => c.recommendationTier === '제외').length,
  };

  const contactableCount = realCandidates.filter(c => c.contactStatus === 'contactable').length;

  /* ─── Smartstore KPI ─── */
  const ssNewOrders = briefData?.smartstore_new_orders ?? smartstoreSnapshot?.newOrders ?? null;
  const ssPendingShip = briefData?.smartstore_ready_orders ?? smartstoreSnapshot?.pendingShipping ?? null;
  const ssPreShip = smartstoreSnapshot?.preShipTotal ?? (ssNewOrders !== null && ssPendingShip !== null ? ssNewOrders + ssPendingShip : null);
  const ssDelivering = briefData?.smartstore_delivering ?? smartstoreSnapshot?.shipping ?? null;
  const ssDelivered = briefData?.smartstore_delivered ?? smartstoreSnapshot?.delivered ?? null;
  const ssConfirmed = briefData?.smartstore_purchase_decided ?? smartstoreSnapshot?.purchaseConfirmed ?? null;
  const ssConfirmNeeded = briefData?.smartstore_confirm_needed ?? null;

  /* ─── Outreach KPI ─── */
  const outreachDiscovered = briefData?.outreach_discovered ?? totalCandidates;
  const outreachPublicEmail = briefData?.outreach_public_email_found ?? contactableCount;
  const outreachSent = briefData?.outreach_email_sent ?? 0;
  const outreachPositive = briefData?.outreach_positive_replies ?? 0;
  const outreachAccepted = briefData?.outreach_accepted ?? 0;

  /* ─── Hot Content ─── */
  const hotYoutube = briefData?.hot_youtube_count;
  const hotThreads = briefData?.hot_threads_count;
  const hotInstagram = briefData?.hot_instagram_count;
  const hotTiktok = briefData?.hot_tiktok_count;
  const hotNaverBlog = briefData?.hot_naver_blog_count;

  /* ─── Telegram ─── */
  const telegramSent = briefData?.telegram_sent;
  const telegramError = briefData?.telegram_error_code;

  /* ─── Brief Period ─── */
  const periodStart = briefData?.period_start_kst;
  const periodEnd = briefData?.period_end_kst;

  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });

  /* ─── Build Agent Graph (기존 실제 변수 매핑) ─── */
  const agentGraph = buildAgentGraph({
    smartstoreConfirmNeeded: ssConfirmNeeded,
    ssNewOrders,
    ssPendingShip,
    totalCandidates,
    publicEmails: outreachPublicEmail,
    hotYoutube,
    hotThreads,
    hotInstagram,
    hotTiktok,
    hotNaverBlog,
    copyBrainStatus,
    telegramSent,
    telegramError,
    briefData,
    briefLoading,
  });

  // 선택된 노드 (클릭 또는 기본 activeNode)
  const displayNodeId = selectedNodeId ?? agentGraph.activeNodeId;
  const displayNode = agentGraph.nodes.find(n => n.id === displayNodeId) ?? agentGraph.selectedNode;

  return (
    <main className={`datawall-node-page ${systemArmed ? 'is-armed' : ''} ${openingActive ? 'is-opening' : ''}`}>
      {/* ─── Background ─── */}
      <div className="datawall-bg" aria-hidden="true">
        <div className="datawall-bg-grid" />
        <div className="datawall-bg-glow" />
        <div className="datawall-bg-vignette" />
      </div>

      {/* ═══ HEADER ═══ */}
      <header className="datawall-node-header datawall-enter datawall-delay-1">
        <div className="datawall-header-left">
          <h1 className="datawall-header-title">AGENT WORKSTATION</h1>
          <span className="datawall-header-sub">JARVIS 워크플로우 캔버스 · DATAWALL-NODE-CANVAS-A.1</span>
        </div>
        <div className="datawall-header-center">
          <div className="datawall-flow-breadcrumb">
            {agentGraph.nodes.map((node, i) => (
              <React.Fragment key={node.id}>
                <button
                  className={`datawall-breadcrumb-node is-${node.status} ${node.id === displayNodeId ? 'is-selected' : ''}`}
                  onClick={() => setSelectedNodeId(node.id === displayNodeId ? null : node.id)}
                  title={`${node.label}: ${node.metric}`}
                >
                  <span>{node.icon}</span>
                  <span className="breadcrumb-label">{node.label}</span>
                </button>
                {i < agentGraph.nodes.length - 1 && (
                  <span className={`datawall-breadcrumb-arrow ${agentGraph.edges[i]?.completed ? 'is-done' : agentGraph.edges[i]?.active ? 'is-active' : ''}`}>›</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="datawall-header-right">
          <span className={`datawall-status-badge ${systemArmed ? 'is-linked' : ''}`}>{systemArmed ? 'LINKED' : 'ONLINE'}</span>
          <span className="datawall-header-time">{now}</span>
          <button className="datawall-refresh-btn" onClick={fetchBrief} disabled={briefLoading} title="브리핑 새로고침">
            {briefLoading ? '⟳' : '↻'}
          </button>
        </div>
      </header>

      {/* ═══ MAIN LAYOUT ═══ */}
      <section className="datawall-node-layout">

        {/* LEFT: Agent Module Dock */}
        <AgentModuleDock
          nodes={agentGraph.nodes}
          activeNodeId={agentGraph.activeNodeId}
          activeTab={activeTab}
          setActiveTab={(tab) => { setActiveTab(tab); setCandidatePage(0); }}
          platformCounts={platformCounts}
          briefData={briefData}
          systemArmed={systemArmed}
          now={now}
          onRefresh={fetchBrief}
          briefLoading={briefLoading}
        />

        {/* CENTER: Agent Node Canvas */}
        <AgentNodeCanvas
          nodes={agentGraph.nodes}
          edges={agentGraph.edges}
          activeNodeId={agentGraph.activeNodeId}
          onNodeClick={(nodeId) => setSelectedNodeId(nodeId === displayNodeId ? null : nodeId)}
        />

        {/* RIGHT: Live Activity Inspector */}
        <AgentActivityInspector
          selectedNode={displayNode}
          recentSignals={agentGraph.recentSignals}
          briefData={briefData}
          briefLoading={briefLoading}
          briefError={briefError}
          onRefresh={fetchBrief}
          ssNewOrders={ssNewOrders}
          ssPendingShip={ssPendingShip}
          ssConfirmNeeded={ssConfirmNeeded}
          totalCandidates={totalCandidates}
          tierCounts={tierCounts}
          copyBrainStatus={copyBrainStatus}
          hotYoutube={hotYoutube}
          hotThreads={hotThreads}
          hotInstagram={hotInstagram}
          hotTiktok={hotTiktok}
          hotNaverBlog={hotNaverBlog}
          periodStart={periodStart}
          periodEnd={periodEnd}
        />

      </section>

      {/* ═══ CREATIVE STUDIO FULL VIEW (2번 화면 전용) ═══ */}
      {csData && csData.copies.length > 0 && (
        <section className="datawall-creative-studio datawall-enter datawall-delay-3" style={{
          margin: '0 20px', padding: '16px 20px',
          background: 'rgba(0,180,255,0.03)', borderRadius: '12px',
          border: '1px solid rgba(0,180,255,0.15)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <span style={{ color: '#00F5FF', fontSize: '9px', letterSpacing: '3px' }}>CREATIVE STUDIO</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginLeft: '12px' }}>
                {csData.product} · {csData.copies.length}개 카피 · {csData.trends} 트렌드 · {csData.refs} refs
              </span>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '9px' }}>
              {new Date(csData.updatedAt).toLocaleTimeString('ko-KR')}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', maxHeight: '320px', overflowY: 'auto' }}>
            {[...csData.copies].sort((a: any, b: any) => (b.viralScore || 0) - (a.viralScore || 0)).map((copy: any, idx: number) => (
              <div
                key={copy.id || idx}
                onClick={() => { setCsSelectedCopy(copy); setCsSelectedRank(idx + 1); }}
                style={{
                  padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                  background: idx === 0 ? 'rgba(0,245,255,0.06)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${idx < 3 ? 'rgba(0,245,255,0.25)' : 'rgba(255,255,255,0.08)'}`,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,245,255,0.5)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = idx < 3 ? 'rgba(0,245,255,0.25)' : 'rgba(255,255,255,0.08)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{
                    width: '20px', height: '20px', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '9px', fontWeight: 700,
                    background: idx < 3 ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.05)',
                    color: idx < 3 ? '#00FF88' : 'rgba(255,255,255,0.4)',
                    border: `1px solid ${idx < 3 ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.1)'}`,
                  }}>{idx + 1}</span>
                  <span style={{ flex: 1, color: '#fff', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {copy.headline}
                  </span>
                  <span style={{
                    padding: '2px 6px', borderRadius: '6px', fontSize: '9px', fontWeight: 700,
                    background: (copy.viralScore || 0) >= 80 ? 'rgba(0,255,136,0.12)' : 'rgba(0,245,255,0.08)',
                    color: (copy.viralScore || 0) >= 80 ? '#00FF88' : '#00F5FF',
                    border: `1px solid ${(copy.viralScore || 0) >= 80 ? 'rgba(0,255,136,0.3)' : 'rgba(0,245,255,0.2)'}`,
                  }}>{copy.viralScore || 0}</span>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {copy.hookType && <span style={{ padding: '1px 6px', borderRadius: '6px', background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.12)', color: 'rgba(0,245,255,0.6)', fontSize: '8px' }}>{copy.hookType}</span>}
                  {copy.emotionTrigger && <span style={{ padding: '1px 6px', borderRadius: '6px', background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.12)', color: 'rgba(255,184,0,0.6)', fontSize: '8px' }}>{copy.emotionTrigger}</span>}
                  {copy.sensoryLevel === 'high' && <span style={{ padding: '1px 6px', borderRadius: '6px', background: 'rgba(255,100,100,0.06)', border: '1px solid rgba(255,100,100,0.12)', color: 'rgba(255,100,100,0.6)', fontSize: '8px' }}>🔥 high</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ INFLUENCER DETAIL GRID (2번 화면 전용) ═══ */}
      {realCandidates.length > 0 && (
        <section className="datawall-influencer-grid datawall-enter datawall-delay-4" style={{
          margin: '12px 20px 0', padding: '16px 20px',
          background: 'rgba(0,255,136,0.02)', borderRadius: '12px',
          border: '1px solid rgba(0,255,136,0.12)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <span style={{ color: '#00FF88', fontSize: '9px', letterSpacing: '3px' }}>INFLUENCER INTEL</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginLeft: '12px' }}>
                {totalCandidates}명 · 추천 {tierCounts.추천} · 검토 {tierCounts.검토}
              </span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
            {realCandidates.slice(0, 12).map((c, idx) => (
              <div
                key={c.contextId}
                onClick={() => setSelectedInfluencer(c)}
                style={{
                  padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                  background: c.recommendationTier === '추천' ? 'rgba(0,255,136,0.04)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${c.recommendationTier === '추천' ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.08)'}`,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,255,136,0.5)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = c.recommendationTier === '추천' ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.08)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', color: '#00FF88', fontWeight: 700,
                  }}>{c.platform === 'YouTube' ? 'YT' : c.platform === 'Instagram' ? 'IG' : c.platform === 'TikTok' ? 'TK' : 'CH'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', marginTop: '2px' }}>
                      {c.subscribers ? `${(c.subscribers / 1000).toFixed(1)}K` : ''} · {c.recommendationTier || '검토'}
                    </div>
                  </div>
                  <div style={{
                    padding: '3px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 700,
                    background: (c.finalScore || 0) >= 70 ? 'rgba(0,255,136,0.12)' : 'rgba(0,245,255,0.08)',
                    color: (c.finalScore || 0) >= 70 ? '#00FF88' : '#00F5FF',
                    border: `1px solid ${(c.finalScore || 0) >= 70 ? 'rgba(0,255,136,0.3)' : 'rgba(0,245,255,0.2)'}`,
                  }}>{c.finalScore || 0}점</div>
                </div>
                {c.fitReason && (
                  <div style={{ marginTop: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '10px', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.fitReason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ COPY DETAIL MODAL (2번 화면) ═══ */}
      {csSelectedCopy && (
        <div
          onClick={() => setCsSelectedCopy(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9500,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', maxWidth: '680px', maxHeight: '90vh',
            background: 'linear-gradient(160deg, rgba(8,14,32,0.99) 0%, rgba(4,8,20,0.99) 100%)',
            border: '1px solid rgba(0,180,255,0.25)', borderRadius: '16px',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 80px rgba(0,100,255,0.2)',
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(0,180,255,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,180,255,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#00FF88' }}>{csSelectedRank}</div>
                <div>
                  <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>{csData?.product} 카피</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginTop: '2px' }}>{csSelectedCopy.hookType} · {csSelectedCopy.emotionTrigger}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ padding: '4px 10px', borderRadius: '12px', background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.3)', color: '#00FF88', fontSize: '12px', fontWeight: 700 }}>{csSelectedCopy.viralScore}점</span>
                <button onClick={() => setCsSelectedCopy(null)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#aaa', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
              </div>
            </div>
            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.15)', marginBottom: '20px' }}>
                <div style={{ color: 'rgba(0,245,255,0.7)', fontSize: '9px', letterSpacing: '2px', marginBottom: '8px' }}>HEADLINE</div>
                <div style={{ color: '#fff', fontSize: '18px', fontWeight: 700, lineHeight: 1.5 }}>{csSelectedCopy.headline}</div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '9px', letterSpacing: '2px', marginBottom: '8px' }}>FULL SCRIPT</div>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{csSelectedCopy.body}</div>
              </div>
              {csSelectedCopy.platformVersions && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '9px', letterSpacing: '2px', marginBottom: '8px' }}>PLATFORM VERSIONS</div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {csSelectedCopy.platformVersions.threads && <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}><span style={{ color: '#00F5FF', fontSize: '9px' }}>스레드</span><div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', marginTop: '4px' }}>{csSelectedCopy.platformVersions.threads}</div></div>}
                    {csSelectedCopy.platformVersions.reels && <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}><span style={{ color: '#FF6464', fontSize: '9px' }}>릴스</span><div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', marginTop: '4px' }}>{csSelectedCopy.platformVersions.reels}</div></div>}
                    {csSelectedCopy.platformVersions.kakao && <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}><span style={{ color: '#FFB800', fontSize: '9px' }}>카카오톡</span><div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', marginTop: '4px' }}>{csSelectedCopy.platformVersions.kakao}</div></div>}
                  </div>
                </div>
              )}
              {csSelectedCopy.referenceNote && (
                <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.2)', marginBottom: '16px' }}>
                  <div style={{ color: 'rgba(255,184,0,0.7)', fontSize: '9px', letterSpacing: '1px', marginBottom: '4px' }}>REFERENCE</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>{csSelectedCopy.referenceNote}</div>
                </div>
              )}
              {csSelectedCopy.tags && csSelectedCopy.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {csSelectedCopy.tags.map((tag: string, i: number) => (
                    <span key={i} style={{ padding: '4px 10px', borderRadius: '12px', background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)', color: 'rgba(0,245,255,0.8)', fontSize: '11px' }}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(0,180,255,0.15)', display: 'flex', gap: '10px', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.3)' }}>
              <button onClick={() => { if (csSelectedCopy.body) navigator.clipboard.writeText(csSelectedCopy.body); }} style={{ padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>복사</button>
              <button onClick={() => setCsSelectedCopy(null)} style={{ padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ INFLUENCER DETAIL MODAL (2번 화면) ═══ */}
      {selectedInfluencer && (
        <div
          onClick={() => setSelectedInfluencer(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9500,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', maxWidth: '720px', maxHeight: '90vh',
            background: 'linear-gradient(160deg, rgba(8,14,32,0.99) 0%, rgba(4,8,20,0.99) 100%)',
            border: '1px solid rgba(0,255,136,0.25)', borderRadius: '16px',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 80px rgba(0,255,136,0.15)',
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(0,255,136,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,255,136,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(0,255,136,0.1)', border: '2px solid rgba(0,255,136,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: '#00FF88', fontWeight: 700 }}>
                  {selectedInfluencer.platform === 'YouTube' ? 'YT' : selectedInfluencer.platform === 'Instagram' ? 'IG' : 'CH'}
                </div>
                <div>
                  <div style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>{selectedInfluencer.name}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginTop: '3px' }}>
                    {selectedInfluencer.platform} · {selectedInfluencer.subscribers ? `${(selectedInfluencer.subscribers / 1000).toFixed(1)}K 구독` : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{
                  padding: '6px 14px', borderRadius: '12px', fontSize: '13px', fontWeight: 700,
                  background: selectedInfluencer.recommendationTier === '추천' ? 'rgba(0,255,136,0.15)' : 'rgba(0,245,255,0.1)',
                  border: `1px solid ${selectedInfluencer.recommendationTier === '추천' ? 'rgba(0,255,136,0.4)' : 'rgba(0,245,255,0.3)'}`,
                  color: selectedInfluencer.recommendationTier === '추천' ? '#00FF88' : '#00F5FF',
                }}>{selectedInfluencer.recommendationTier || '검토'}</span>
                <button onClick={() => setSelectedInfluencer(null)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#aaa', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
              </div>
            </div>
            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {/* Fit Score */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.15)', textAlign: 'center' }}>
                  <div style={{ color: 'rgba(0,255,136,0.6)', fontSize: '9px', letterSpacing: '1px', marginBottom: '6px' }}>FIT SCORE</div>
                  <div style={{ color: '#00FF88', fontSize: '24px', fontWeight: 700 }}>{selectedInfluencer.finalScore || 0}</div>
                </div>
                <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.15)', textAlign: 'center' }}>
                  <div style={{ color: 'rgba(0,245,255,0.6)', fontSize: '9px', letterSpacing: '1px', marginBottom: '6px' }}>ENGAGEMENT</div>
                  <div style={{ color: '#00F5FF', fontSize: '24px', fontWeight: 700 }}>{selectedInfluencer.engagementRate ? `${selectedInfluencer.engagementRate.toFixed(1)}%` : '—'}</div>
                </div>
                <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(255,184,0,0.05)', border: '1px solid rgba(255,184,0,0.15)', textAlign: 'center' }}>
                  <div style={{ color: 'rgba(255,184,0,0.6)', fontSize: '9px', letterSpacing: '1px', marginBottom: '6px' }}>CONTACT</div>
                  <div style={{ color: '#FFB800', fontSize: '14px', fontWeight: 600 }}>{selectedInfluencer.contactStatus === 'contactable' ? '공개 이메일' : selectedInfluencer.contactStatus === 'url_only' ? 'URL만' : '미확인'}</div>
                </div>
              </div>
              {/* Fit Reason */}
              {selectedInfluencer.fitReason && (
                <div style={{ padding: '14px 18px', borderRadius: '10px', background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.12)', marginBottom: '16px' }}>
                  <div style={{ color: 'rgba(0,255,136,0.6)', fontSize: '9px', letterSpacing: '1px', marginBottom: '6px' }}>추천 이유</div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', lineHeight: 1.6 }}>{selectedInfluencer.fitReason}</div>
                </div>
              )}
              {/* Quality Scores */}
              {(selectedInfluencer.contentQuality || selectedInfluencer.audienceFit || selectedInfluencer.brandSafety) && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '9px', letterSpacing: '2px', marginBottom: '10px' }}>QUALITY BREAKDOWN</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    {selectedInfluencer.contentQuality !== undefined && (
                      <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', marginBottom: '4px' }}>콘텐츠 품질</div>
                        <div style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>{selectedInfluencer.contentQuality}</div>
                      </div>
                    )}
                    {selectedInfluencer.audienceFit !== undefined && (
                      <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', marginBottom: '4px' }}>타겟 적합도</div>
                        <div style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>{selectedInfluencer.audienceFit}</div>
                      </div>
                    )}
                    {selectedInfluencer.brandSafety !== undefined && (
                      <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', marginBottom: '4px' }}>브랜드 안전</div>
                        <div style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>{selectedInfluencer.brandSafety}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Risk Flags */}
              {selectedInfluencer.riskFlags && selectedInfluencer.riskFlags.length > 0 && (
                <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(255,50,50,0.05)', border: '1px solid rgba(255,50,50,0.15)', marginBottom: '16px' }}>
                  <div style={{ color: 'rgba(255,50,50,0.7)', fontSize: '9px', letterSpacing: '1px', marginBottom: '6px' }}>RISK FLAGS</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>{selectedInfluencer.riskFlags.join(' · ')}</div>
                </div>
              )}
              {/* Channel URL */}
              {selectedInfluencer.channelUrl && (
                <div style={{ marginTop: '12px' }}>
                  <a href={selectedInfluencer.channelUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#00F5FF', fontSize: '12px', textDecoration: 'none', borderBottom: '1px solid rgba(0,245,255,0.3)' }}>
                    채널 바로가기 →
                  </a>
                </div>
              )}
            </div>
            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(0,255,136,0.15)', display: 'flex', gap: '10px', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.3)' }}>
              <button onClick={() => setSelectedInfluencer(null)} style={{ padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EXECUTION LOCK STRIP ═══ */}
      <footer className="datawall-execution-strip datawall-enter datawall-delay-5">
        <span className="exec-lock-badge">🔐 EXECUTE LOCKED</span>
        <span className="exec-sep">·</span>
        <span>ACTIVE READONLY</span>
        <span className="exec-sep">·</span>
        <span>APPROVAL REQUIRED</span>
        <span className="exec-sep">·</span>
        <span>TOTAL {totalCandidates}명</span>
        <span className="exec-sep">·</span>
        <span>추천 {tierCounts.추천} / 검토 {tierCounts.검토} / 보류 {tierCounts.보류} / 제외 {tierCounts.제외}</span>
        <span className="exec-sep">·</span>
        <span>공개 이메일 {contactableCount}명 (원문 Google Sheets)</span>
        {smartstoreSnapshot?.fetchedAt && (
          <>
            <span className="exec-sep">·</span>
            <span>SS 출처: {smartstoreSnapshot.source || 'API'} · {new Date(smartstoreSnapshot.fetchedAt).toLocaleTimeString('ko-KR')}</span>
          </>
        )}
      </footer>
    </main>
  );
};

export default DataWallView;
