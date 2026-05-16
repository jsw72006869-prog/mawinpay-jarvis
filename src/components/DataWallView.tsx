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

/* ─── Agent Workstation: DATAWALL-AGENT-B.1 ─── */
const AGENT_NODES = [
  { id: 'smartstore', label: 'Smartstore', icon: '🛒', desc: '주문/배송 모니터링' },
  { id: 'outreach', label: 'Outreach', icon: '📡', desc: '후보 수집 · 이메일 준비' },
  { id: 'hotcontent', label: 'Hot Content', icon: '🔥', desc: 'YouTube · Threads · Blog' },
  { id: 'telegram', label: 'Telegram', icon: '📨', desc: '브리핑 알림 발송' },
  { id: 'sheets', label: 'Google Sheets', icon: '📊', desc: '데이터 저장 · CRM' },
];

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
  const [candidatePage, setCandidatePage] = useState(0);
  const [selectedCandidate, setSelectedCandidate] = useState<RealIntelCandidate | null>(null);
  const openingTimerRef = useRef<number | null>(null);
  const CANDIDATES_PER_PAGE = 10;

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
      if (data.success && data.brief) {
        setBriefData(data.brief);
      } else if (data.data) {
        setBriefData(data.data);
      } else {
        setBriefError(data.error || 'brief 데이터 없음');
      }
    } catch (e: any) {
      setBriefError(e.message || 'API 호출 실패');
    } finally {
      setBriefLoading(false);
    }
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
  const visibleStart = candidatePage * CANDIDATES_PER_PAGE;
  const visibleCandidates = filteredCandidates.slice(visibleStart, visibleStart + CANDIDATES_PER_PAGE);
  const totalPages = Math.ceil(filteredCount / CANDIDATES_PER_PAGE);

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
  const outreachDraft = briefData?.outreach_draft_ready ?? 0;
  const outreachSent = briefData?.outreach_email_sent ?? 0;
  const outreachPositive = briefData?.outreach_positive_replies ?? 0;
  const outreachAccepted = briefData?.outreach_accepted ?? 0;
  const outreachFollowup = briefData?.outreach_followup_needed ?? 0;

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

  return (
    <div className={`aw-shell ${systemArmed ? 'is-armed' : ''} ${openingActive ? 'is-opening' : ''}`}>
      {/* ─── Background ─── */}
      <div className="aw-bg" aria-hidden="true">
        <div className="aw-bg-grid" />
        <div className="aw-bg-glow" />
        <div className="aw-bg-vignette" />
      </div>

      {/* ═══ HEADER ═══ */}
      <header className="aw-header">
        <div className="aw-header-left">
          <h1 className="aw-header-title">AGENT WORKSTATION</h1>
          <span className="aw-header-sub">JARVIS 작업 관제실 · DATAWALL-AGENT-B.1</span>
        </div>
        <div className="aw-header-center">
          <div className="aw-platform-tabs">
            {PLATFORM_TABS.map(tab => (
              <button
                key={tab}
                className={`aw-tab ${activeTab === tab ? 'is-active' : ''}`}
                onClick={() => { setActiveTab(tab); setCandidatePage(0); setSelectedCandidate(null); }}
              >
                {tab}
                {tab !== '전체' && platformCounts[tab] ? <span className="aw-tab-count">{platformCounts[tab]}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="aw-header-right">
          <span className={`aw-status-badge ${systemArmed ? 'is-linked' : ''}`}>{systemArmed ? 'LINKED' : 'ONLINE'}</span>
          <span className="aw-header-time">{now}</span>
          <button className="aw-refresh-btn" onClick={fetchBrief} disabled={briefLoading} title="브리핑 새로고침">
            {briefLoading ? '⟳' : '↻'}
          </button>
        </div>
      </header>

      {/* ═══ MAIN GRID ═══ */}
      <div className="aw-main-grid">

        {/* ═══ LEFT: Agent Queue + KPI ═══ */}
        <aside className="aw-col aw-col-left">

          {/* ─── Smartstore KPI ─── */}
          <section className="aw-panel aw-kpi-panel">
            <div className="aw-panel-label">🛒 스마트스토어 현황</div>
            <div className="aw-kpi-grid">
              <div className="aw-kpi-tile aw-kpi-alert">
                <span className="aw-kpi-val">{ssNewOrders !== null ? ssNewOrders : '—'}</span>
                <span className="aw-kpi-key">신규주문</span>
              </div>
              <div className="aw-kpi-tile aw-kpi-warn">
                <span className="aw-kpi-val">{ssPendingShip !== null ? ssPendingShip : '—'}</span>
                <span className="aw-kpi-key">배송준비</span>
              </div>
              <div className="aw-kpi-tile">
                <span className="aw-kpi-val">{ssPreShip !== null ? ssPreShip : '—'}</span>
                <span className="aw-kpi-key">배송전 합계</span>
              </div>
              <div className="aw-kpi-tile">
                <span className="aw-kpi-val">{ssDelivering !== null ? ssDelivering : '—'}</span>
                <span className="aw-kpi-key">배송중</span>
              </div>
              <div className="aw-kpi-tile">
                <span className="aw-kpi-val">{ssDelivered !== null ? ssDelivered : '—'}</span>
                <span className="aw-kpi-key">배송완료</span>
              </div>
              <div className="aw-kpi-tile">
                <span className="aw-kpi-val">{ssConfirmed !== null ? ssConfirmed : '—'}</span>
                <span className="aw-kpi-key">구매확정</span>
              </div>
            </div>
            {ssConfirmNeeded !== null && (
              <div className="aw-kpi-note">발주확인 필요: <strong>{ssConfirmNeeded}건</strong></div>
            )}
            {smartstoreSnapshot?.fetchedAt && (
              <div className="aw-kpi-source">
                출처: {smartstoreSnapshot.source || 'API'} · {new Date(smartstoreSnapshot.fetchedAt).toLocaleTimeString('ko-KR')}
              </div>
            )}
          </section>

          {/* ─── Outreach KPI ─── */}
          <section className="aw-panel aw-kpi-panel">
            <div className="aw-panel-label">📡 아웃리치 현황</div>
            <div className="aw-kpi-grid">
              <div className="aw-kpi-tile">
                <span className="aw-kpi-val">{outreachDiscovered}</span>
                <span className="aw-kpi-key">수집 후보</span>
              </div>
              <div className="aw-kpi-tile aw-kpi-ok">
                <span className="aw-kpi-val">{outreachPublicEmail}</span>
                <span className="aw-kpi-key">공개 이메일</span>
              </div>
              <div className="aw-kpi-tile">
                <span className="aw-kpi-val">{outreachDraft}</span>
                <span className="aw-kpi-key">초안 완료</span>
              </div>
              <div className="aw-kpi-tile">
                <span className="aw-kpi-val">{outreachSent}</span>
                <span className="aw-kpi-key">발송</span>
              </div>
              <div className="aw-kpi-tile">
                <span className="aw-kpi-val">{outreachPositive}</span>
                <span className="aw-kpi-key">긍정 답변</span>
              </div>
              <div className="aw-kpi-tile">
                <span className="aw-kpi-val">{outreachAccepted}</span>
                <span className="aw-kpi-key">제안 수락</span>
              </div>
            </div>
            {outreachFollowup > 0 && (
              <div className="aw-kpi-note">팔로업 필요: <strong>{outreachFollowup}건</strong></div>
            )}
            <div className="aw-kpi-note aw-kpi-info">이메일 원문은 Google Sheets에서 확인</div>
          </section>

          {/* ─── Agent Nodes ─── */}
          <section className="aw-panel aw-agent-queue">
            <div className="aw-panel-label">⚙️ Agent 작업 노드</div>
            <div className="aw-agent-list">
              {AGENT_NODES.map(node => {
                let status: 'active' | 'idle' | 'missing' = 'idle';
                let statusText = 'STANDBY';
                if (node.id === 'smartstore' && (ssNewOrders !== null || smartstoreSnapshot)) { status = 'active'; statusText = 'ACTIVE'; }
                if (node.id === 'outreach' && totalCandidates > 0) { status = 'active'; statusText = `${totalCandidates}명 수집`; }
                if (node.id === 'hotcontent') {
                  const anyHot = hotYoutube !== undefined || hotThreads !== undefined;
                  status = anyHot ? 'active' : 'missing';
                  statusText = anyHot ? 'ACTIVE' : 'not_connected';
                }
                if (node.id === 'telegram') {
                  if (telegramError?.includes('env_missing') || telegramError?.includes('skipped')) { status = 'missing'; statusText = 'skipped_env_missing'; }
                  else if (telegramSent) { status = 'active'; statusText = 'SENT'; }
                  else { status = 'idle'; statusText = 'STANDBY'; }
                }
                if (node.id === 'sheets') {
                  status = briefData ? 'active' : 'idle';
                  statusText = briefData ? 'CONNECTED' : 'STANDBY';
                }
                return (
                  <div key={node.id} className={`aw-agent-node aw-node-${status}`}>
                    <span className="aw-node-icon">{node.icon}</span>
                    <div className="aw-node-body">
                      <span className="aw-node-label">{node.label}</span>
                      <span className="aw-node-desc">{node.desc}</span>
                    </div>
                    <span className={`aw-node-status aw-ns-${status}`}>{statusText}</span>
                  </div>
                );
              })}
            </div>
          </section>

        </aside>

        {/* ═══ CENTER: Workflow Map + Brief ═══ */}
        <main className="aw-col aw-col-center">

          {/* ─── Daily Brief Summary ─── */}
          <section className="aw-panel aw-brief-panel">
            <div className="aw-panel-label">
              📋 최근 24시간 운영 브리핑
              {periodStart && periodEnd && (
                <span className="aw-brief-period"> · {periodStart} ~ {periodEnd}</span>
              )}
            </div>
            {briefLoading && <div className="aw-brief-loading">브리핑 로딩 중...</div>}
            {briefError && <div className="aw-brief-error">브리핑 조회 실패: {briefError}</div>}
            {!briefLoading && !briefError && !briefData && (
              <div className="aw-brief-empty">브리핑 데이터 없음 — "오늘 업무 브리핑 해줘" 명령으로 생성</div>
            )}
            {briefData && (
              <div className="aw-brief-content">
                <div className="aw-brief-section">
                  <span className="aw-brief-section-title">스마트스토어</span>
                  <div className="aw-brief-row-grid">
                    <span>신규주문 <strong>{briefData.smartstore_new_orders ?? '—'}</strong></span>
                    <span>배송준비 <strong>{briefData.smartstore_ready_orders ?? '—'}</strong></span>
                    <span>배송중 <strong>{briefData.smartstore_delivering ?? '—'}</strong></span>
                    <span>배송완료 <strong>{briefData.smartstore_delivered ?? '—'}</strong></span>
                    <span>구매확정 <strong>{briefData.smartstore_purchase_decided ?? '—'}</strong></span>
                    {briefData.smartstore_confirm_needed !== undefined && (
                      <span>발주확인 필요 <strong>{briefData.smartstore_confirm_needed}</strong></span>
                    )}
                  </div>
                </div>
                <div className="aw-brief-section">
                  <span className="aw-brief-section-title">아웃리치</span>
                  <div className="aw-brief-row-grid">
                    <span>신규 수집 <strong>{briefData.outreach_discovered ?? '—'}</strong></span>
                    <span>공개 이메일 <strong>{briefData.outreach_public_email_found ?? '—'}</strong></span>
                    <span>초안 완료 <strong>{briefData.outreach_draft_ready ?? '—'}</strong></span>
                    <span>승인 대기 <strong>{briefData.outreach_approval_waiting ?? '—'}</strong></span>
                    <span>이메일 발송 <strong>{briefData.outreach_email_sent ?? '—'}</strong></span>
                    <span>긍정 답변 <strong>{briefData.outreach_positive_replies ?? '—'}</strong></span>
                    <span>제안 수락 <strong>{briefData.outreach_accepted ?? '—'}</strong></span>
                    <span>팔로업 필요 <strong>{briefData.outreach_followup_needed ?? '—'}</strong></span>
                    <span>팔로업 발송 <strong>{briefData.outreach_followup_sent ?? '—'}</strong></span>
                  </div>
                </div>
                <div className="aw-brief-section">
                  <span className="aw-brief-section-title">Hot Content</span>
                  <div className="aw-brief-row-grid">
                    <span>YouTube <strong>{hotYoutube !== undefined ? hotYoutube : <em className="aw-not-connected">not_connected</em>}</strong></span>
                    <span>Threads <strong>{hotThreads !== undefined ? hotThreads : <em className="aw-not-connected">not_connected</em>}</strong></span>
                    <span>Instagram <strong>{hotInstagram !== undefined ? hotInstagram : <em className="aw-not-connected">not_connected</em>}</strong></span>
                    <span>TikTok <strong>{hotTiktok !== undefined ? hotTiktok : <em className="aw-not-connected">not_connected</em>}</strong></span>
                    <span>Naver Blog <strong>{hotNaverBlog !== undefined ? hotNaverBlog : <em className="aw-not-connected">not_connected</em>}</strong></span>
                  </div>
                  {(hotYoutube === undefined && hotThreads === undefined) && (
                    <div className="aw-brief-note">Hot Content collector not connected yet</div>
                  )}
                </div>
                <div className="aw-brief-section">
                  <span className="aw-brief-section-title">Telegram</span>
                  <div className="aw-brief-row-grid">
                    <span>발송 여부 <strong>{telegramSent ? 'SENT' : 'skipped'}</strong></span>
                    {telegramError && <span>사유 <strong className="aw-not-connected">{telegramError}</strong></span>}
                  </div>
                  {(telegramError?.includes('env_missing') || !telegramSent) && (
                    <div className="aw-brief-note">Telegram env missing — notification skipped</div>
                  )}
                </div>
                <div className="aw-brief-footer">
                  <span>이메일 원문 · 고객 정보는 Google Sheets에서 확인하세요</span>
                </div>
              </div>
            )}
          </section>

          {/* ─── Workflow Map ─── */}
          <section className="aw-panel aw-workflow-panel">
            <div className="aw-panel-label">🗺️ Workflow Map</div>
            <div className="aw-workflow-map">
              {[
                { step: '수집', icon: '📡', val: outreachDiscovered, active: outreachDiscovered > 0 },
                { step: '이메일 확인', icon: '✉️', val: outreachPublicEmail, active: outreachPublicEmail > 0 },
                { step: '초안 생성', icon: '✍️', val: outreachDraft, active: outreachDraft > 0 },
                { step: '발송', icon: '📤', val: outreachSent, active: outreachSent > 0 },
                { step: '긍정 답변', icon: '✅', val: outreachPositive, active: outreachPositive > 0 },
                { step: '수락', icon: '🤝', val: outreachAccepted, active: outreachAccepted > 0 },
              ].map((s, i, arr) => (
                <React.Fragment key={s.step}>
                  <div className={`aw-wf-node ${s.active ? 'is-active' : ''}`}>
                    <span className="aw-wf-icon">{s.icon}</span>
                    <span className="aw-wf-val">{s.val}</span>
                    <span className="aw-wf-step">{s.step}</span>
                  </div>
                  {i < arr.length - 1 && <div className={`aw-wf-arrow ${s.active ? 'is-active' : ''}`}>→</div>}
                </React.Fragment>
              ))}
            </div>
          </section>

          {/* ─── Tier Summary ─── */}
          <section className="aw-panel aw-tier-panel">
            <div className="aw-panel-label">🏷️ 후보 품질 분류</div>
            <div className="aw-tier-grid">
              <div className="aw-tier-tile aw-tier-추천">
                <span className="aw-tier-val">{tierCounts.추천}</span>
                <span className="aw-tier-key">추천</span>
              </div>
              <div className="aw-tier-tile aw-tier-검토">
                <span className="aw-tier-val">{tierCounts.검토}</span>
                <span className="aw-tier-key">검토</span>
              </div>
              <div className="aw-tier-tile aw-tier-보류">
                <span className="aw-tier-val">{tierCounts.보류}</span>
                <span className="aw-tier-key">보류</span>
              </div>
              <div className="aw-tier-tile aw-tier-제외">
                <span className="aw-tier-val">{tierCounts.제외}</span>
                <span className="aw-tier-key">제외</span>
              </div>
            </div>
          </section>

        </main>

        {/* ═══ RIGHT: Candidate Queue ═══ */}
        <aside className="aw-col aw-col-right">
          <section className="aw-panel aw-candidate-panel">
            <div className="aw-panel-label">
              👥 후보 큐
              <span className="aw-candidate-count">
                Showing {Math.min(visibleStart + CANDIDATES_PER_PAGE, filteredCount)} / {filteredCount}
                {activeTab !== '전체' && ` (전체 ${totalCandidates}명)`}
              </span>
            </div>

            {/* Selected Candidate Detail */}
            {selectedCandidate && (
              <div className="aw-candidate-detail">
                <div className="aw-cd-header">
                  <span className={`aw-cd-tier aw-tier-${selectedCandidate.recommendationTier}`}>{selectedCandidate.recommendationTier}</span>
                  <button className="aw-cd-close" onClick={() => setSelectedCandidate(null)}>✕</button>
                </div>
                <div className="aw-cd-title">{selectedCandidate.channelName || selectedCandidate.title}</div>
                <div className="aw-cd-platform">{selectedCandidate.platform || '—'} · {selectedCandidate.category || '—'}</div>
                <div className="aw-cd-reason">{selectedCandidate.jarvisReason || '분석 대기'}</div>
                <div className="aw-cd-scores">
                  <span>카테고리 {selectedCandidate.categoryFitScore ?? '—'}</span>
                  <span>안전도 {selectedCandidate.brandSafetyScore ?? '—'}</span>
                  <span>연락 {selectedCandidate.contactScore ?? '—'}</span>
                  <span>미디어 {selectedCandidate.mediaScore ?? '—'}</span>
                  <span>종합 {selectedCandidate.finalScore ?? '—'}점</span>
                </div>
                <div className="aw-cd-contact">
                  연락 가능:&nbsp;
                  {selectedCandidate.contactStatus === 'contactable' ? (
                    <span className="aw-cd-contactable">공개 이메일 확인됨 (Google Sheets 참조)</span>
                  ) : selectedCandidate.contactStatus === 'review' ? (
                    <span className="aw-cd-review">문의 링크 있음</span>
                  ) : (
                    <span className="aw-cd-none">확인 필요</span>
                  )}
                </div>
                {selectedCandidate.videoUrl && (
                  <a href={selectedCandidate.videoUrl} target="_blank" rel="noopener noreferrer" className="aw-cd-link">채널/영상 보기 →</a>
                )}
              </div>
            )}

            {/* Candidate List */}
            <div className="aw-candidate-list">
              {filteredCount === 0 ? (
                <div className="aw-candidate-empty">
                  <p>AWAITING INTEL</p>
                  <p className="aw-candidate-empty-sub">1번 화면에서 후보 수집 실행 시 이곳에 표시됩니다.</p>
                </div>
              ) : (
                visibleCandidates.map((card, idx) => {
                  const isSelected = selectedCandidate?.contextId === card.contextId;
                  return (
                    <div
                      key={card.contextId}
                      className={`aw-candidate-card ${isSelected ? 'is-selected' : ''} aw-tier-border-${card.recommendationTier || '보류'}`}
                      onClick={() => setSelectedCandidate(isSelected ? null : card)}
                    >
                      <div className="aw-cc-avatar">
                        {card.channelAvatarUrl ? (
                          <img src={card.channelAvatarUrl} alt="" className="aw-cc-avatar-img" referrerPolicy="no-referrer"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : null}
                        <span className="aw-cc-avatar-fallback">{(card.channelName || card.title || '?')[0]}</span>
                      </div>
                      <div className="aw-cc-body">
                        <div className="aw-cc-title">{card.channelName || card.title}</div>
                        <div className="aw-cc-meta">
                          <span className={`aw-cc-tier aw-tier-${card.recommendationTier}`}>{card.recommendationTier || '—'}</span>
                          <span className="aw-cc-platform">{card.platform || '—'}</span>
                          {card.finalScore !== undefined && <span className="aw-cc-score">{card.finalScore}점</span>}
                          <span className={`aw-cc-contact ${card.contactStatus === 'contactable' ? 'is-contactable' : ''}`}>
                            {card.contactStatus === 'contactable' ? '문의 가능' : card.contactStatus === 'review' ? '검토 필요' : '대기'}
                          </span>
                        </div>
                      </div>
                      <span className="aw-cc-idx">{visibleStart + idx + 1}</span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="aw-pagination">
                <button className="aw-page-btn" onClick={() => setCandidatePage(p => Math.max(0, p - 1))} disabled={candidatePage === 0}>‹</button>
                <span className="aw-page-info">{candidatePage + 1} / {totalPages}</span>
                <button className="aw-page-btn" onClick={() => setCandidatePage(p => Math.min(totalPages - 1, p + 1))} disabled={candidatePage >= totalPages - 1}>›</button>
              </div>
            )}
          </section>
        </aside>

      </div>

      {/* ═══ FOOTER ═══ */}
      <footer className="aw-footer">
        <span>TOTAL: {totalCandidates}명</span>
        <span>FILTERED: {filteredCount}명</span>
        <span>추천 {tierCounts.추천} / 검토 {tierCounts.검토} / 보류 {tierCounts.보류} / 제외 {tierCounts.제외}</span>
        <span>공개 이메일 확인: {contactableCount}명 (원문은 Google Sheets)</span>
        <span>EXECUTE LOCKED · active_readonly</span>
      </footer>
    </div>
  );
};

export default DataWallView;
