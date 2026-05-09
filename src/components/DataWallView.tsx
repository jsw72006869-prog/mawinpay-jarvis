import React, { useEffect, useState, useRef } from 'react';
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

/* ─── Real Intel Candidate Type ─── */
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
  contactStatus: 'contactable' | 'unknown' | 'none' | 'review';
  fitScore?: number;
  reason?: string;
  keywords?: string[];
  lastUpdated?: string;
  videoId?: string;
  videoUrl?: string;
  raw?: unknown;
};

/* ─── Platform Tabs ─── */
const PLATFORM_TABS = ['전체', 'YouTube', 'Instagram', 'Threads', 'Naver'] as const;
type PlatformTab = typeof PLATFORM_TABS[number];

/* ─── Normalize Function ─── */
function normalizeIntelCandidate(item: any, index: number): RealIntelCandidate {
  const title =
    item.title ||
    item.videoTitle ||
    item.recentContentTitle ||
    item.recentVideoTitle ||
    item.channelTitle ||
    item.channelName ||
    item.name ||
    item.topVideoTitle ||
    `후보 ${index + 1}`;

  const channelName =
    item.channelName ||
    item.channelTitle ||
    item.creatorName ||
    item.name ||
    item.author ||
    undefined;

  const platformRaw = (item.platform || item.source || '').toLowerCase();
  let candidateType: RealIntelCandidate['type'] = 'unknown';
  let platform = 'YouTube';
  if (platformRaw.includes('youtube')) { candidateType = 'youtube_channel'; platform = 'YouTube'; }
  else if (platformRaw.includes('blog') || platformRaw.includes('naver')) { candidateType = 'blog'; platform = 'Naver'; }
  else if (platformRaw.includes('instagram')) { candidateType = 'influencer'; platform = 'Instagram'; }
  else if (platformRaw.includes('tiktok') || platformRaw.includes('thread')) { candidateType = 'influencer'; platform = 'Threads'; }

  const hasEmail = !!(item.email || item.contactEmail || item.publicEmailMasked);
  const hasForm = item.publicContactStatus === 'form_available';
  let contactStatus: RealIntelCandidate['contactStatus'] = 'unknown';
  if (hasEmail || item.publicContactStatus === 'email_public') contactStatus = 'contactable';
  else if (hasForm) contactStatus = 'review';
  else if (item.publicContactStatus === 'none') contactStatus = 'none';

  const subscriberCount =
    item.subscriberCount ||
    item.subscribers ||
    item.followerCount ||
    item.followers ||
    item.channel?.subscriberCount ||
    undefined;

  const subscriberText =
    item.subscriberOrVisitor ||
    (subscriberCount ? `${subscriberCount.toLocaleString()}명` : undefined) ||
    undefined;

  const viewCount =
    item.viewCount ||
    item.views ||
    item.avgViews ||
    item.averageViews ||
    item.video?.viewCount ||
    item.statistics?.viewCount ||
    undefined;

  const viewsText =
    item.viewCountFormatted ||
    (viewCount ? (typeof viewCount === 'number' ? `${viewCount.toLocaleString()}회` : viewCount) : undefined) ||
    undefined;

  const likeCount =
    item.likeCount ||
    item.likes ||
    item.video?.likeCount ||
    item.statistics?.likeCount ||
    undefined;

  const likesText = likeCount ? `${likeCount.toLocaleString()}개` : undefined;

  // Extract videoId from various sources
  let videoId: string | undefined = item.videoId || undefined;
  if (!videoId && item.videoUrl) {
    const match = item.videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) videoId = match[1];
  }
  if (!videoId && item.url) {
    const match = item.url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) videoId = match[1];
  }

  // Enhanced Image Mapping
  const profileImage =
    item.profileImageUrl ||
    item.profileImage ||
    item.avatarUrl ||
    item.avatar ||
    item.channelAvatarUrl ||
    item.channelAvatar ||
    item.channelThumbnailUrl ||
    item.channelThumbnail ||
    item.profileUrl ||
    item.channel?.thumbnailUrl ||
    item.channel?.avatarUrl ||
    item.snippet?.thumbnails?.default?.url ||
    item.snippet?.thumbnails?.medium?.url ||
    item.thumbnails?.default?.url ||
    item.thumbnails?.medium?.url ||
    undefined;

  const youtubeThumbnailFromId = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined;

  const thumbnailUrl =
    item.thumbnailUrl ||
    item.thumbnail ||
    item.imageUrl ||
    item.videoThumbnailUrl ||
    item.videoThumbnail ||
    item.video?.thumbnailUrl ||
    item.video?.thumbnail ||
    item.snippet?.thumbnails?.maxres?.url ||
    item.snippet?.thumbnails?.high?.url ||
    item.snippet?.thumbnails?.medium?.url ||
    item.thumbnails?.maxres?.url ||
    item.thumbnails?.high?.url ||
    item.thumbnails?.medium?.url ||
    youtubeThumbnailFromId ||
    profileImage ||
    undefined;

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
    fitScore: typeof item.productFitScore === 'number' ? item.productFitScore : (typeof item.fitScore === 'number' ? item.fitScore : (typeof item.score === 'number' ? item.score : (typeof item.matchScore === 'number' ? item.matchScore : undefined))),
    reason: item.productFitReason || item.reason || item.fitReason || item.suggestedOfferAngle || undefined,
    keywords: Array.isArray(item.keywords) ? item.keywords : (item.keyword ? [item.keyword] : []),
    lastUpdated: item.collectedAt || item.lastUpdated || item.updatedAt || undefined,
    videoId,
    videoUrl: item.videoUrl || item.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined),
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

/* ═══════════════════════════════════════════════════════════
   DataWallView Component — UI-Q.1 Cinematic Intel Wall
   ═══════════════════════════════════════════════════════════ */
const DataWallView: React.FC = () => {
  const [payload, setPayload] = useState<WallPayload | null>(null);
  const [smartstoreSnapshot, setSmartstoreSnapshot] = useState<SmartstoreSnapshot | null>(null);
  const [openingActive, setOpeningActive] = useState(false);
  const [systemArmed, setSystemArmed] = useState(false);
  const [realCandidates, setRealCandidates] = useState<RealIntelCandidate[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<PlatformTab>('전체');
  const openingTimerRef = useRef<number | null>(null);

  /* ─── Read real candidates from localStorage ─── */
  const refreshCandidates = () => {
    const outreachRaw = readJson<any[]>(OUTREACH_STORAGE_KEY) || [];
    const collectedRaw = readJson<any[]>(INFLUENCER_STORAGE_KEY) || [];
    const combined = [...outreachRaw];
    const existingIds = new Set(outreachRaw.map(item => String(item.candidateId || item.channelId || item.id)));
    collectedRaw.forEach(item => {
      const id = String(item.candidateId || item.channelId || item.id || item.name);
      if (!existingIds.has(id)) {
        combined.push(item);
        existingIds.add(id);
      }
    });
    if (combined.length > 0) {
      const normalized = combined.map((item, idx) => normalizeIntelCandidate(item, idx));
      normalized.sort((a, b) => {
        const contactOrder = { contactable: 0, review: 1, unknown: 2, none: 3 };
        const diff = (contactOrder[a.contactStatus] || 3) - (contactOrder[b.contactStatus] || 3);
        if (diff !== 0) return diff;
        return (b.fitScore || 0) - (a.fitScore || 0);
      });
      setRealCandidates(normalized);
    } else {
      setRealCandidates([]);
    }
  };

  useEffect(() => {
    const refreshFromStorage = () => {
      const p = readJson<WallPayload>(WALL_STORAGE_KEY);
      if (p) setPayload(p);
      const s = readJson<SmartstoreSnapshot>(SMARTSTORE_SNAPSHOT_KEY);
      if (s) setSmartstoreSnapshot(s);
      const openingPayload = readJson<any>(DUAL_OPENING_STORAGE_KEY);
      if (openingPayload?.type === 'dual-armed') {
        setSystemArmed(true);
      }
      if (openingPayload?.type === 'dual-opening') {
        setSystemArmed(true);
        setOpeningActive(true);
        if (openingTimerRef.current) window.clearTimeout(openingTimerRef.current);
        openingTimerRef.current = window.setTimeout(() => setOpeningActive(false), 6000);
      }
      refreshCandidates();
    };
    refreshFromStorage();
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
    return () => {
      if (channel) channel.close();
      clearInterval(interval);
      if (openingTimerRef.current) window.clearTimeout(openingTimerRef.current);
    };
  }, []);

  /* ─── Derived data ─── */
  // Platform filter
  const filteredCandidates = activeTab === '전체'
    ? realCandidates
    : realCandidates.filter(c => c.platform === activeTab);

  const hasRealData = filteredCandidates.length > 0;
  const safeHeroIndex = hasRealData ? Math.min(heroIndex, filteredCandidates.length - 1) : 0;
  const heroCandidate = hasRealData ? filteredCandidates[safeHeroIndex] : null;
  const queueCandidates = hasRealData
    ? filteredCandidates.filter((_, idx) => idx !== safeHeroIndex).slice(0, 8)
    : [];
  const top5Candidates = filteredCandidates.slice(0, 5);

  /* ─── Category distribution for radar ─── */
  const categoryMap: Record<string, number> = {};
  realCandidates.forEach(c => {
    const cat = c.category || '미분류';
    categoryMap[cat] = (categoryMap[cat] || 0) + 1;
  });
  const topCategories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  /* ─── Platform distribution ─── */
  const platformCounts: Record<string, number> = {};
  realCandidates.forEach(c => {
    const p = c.platform || 'YouTube';
    platformCounts[p] = (platformCounts[p] || 0) + 1;
  });

  return (
    <div className={`data-wall-shell dw-cinematic-unity ${systemArmed ? 'is-system-armed' : ''} ${openingActive ? 'is-cinematic-opening' : ''}`}>
      {/* ─── Cinematic Ambient Layer ─── */}
      <div className="dw-cinematic-ambient-layer" aria-hidden="true">
        <div className="dw-ambient-grid" />
        <div className="dw-ambient-glow" />
        <div className="dw-ambient-sweep" />
        <div className="dw-ambient-noise" />
        <div className="dw-ambient-scanline" />
      </div>
      {/* ─── Background Layer ─── */}
      <div className="data-wall-bg" aria-hidden="true">
        <div className="bg-grid" />
        <div className="bg-vignette" />
      </div>

      {/* ═══ A. Header Bar ═══ */}
      <header className="data-wall-header dw-q1-header">
        <div className="dw-header-left">
          <h1 className="dw-header-title">OUTREACH INTEL WALL</h1>
          <span className="dw-header-subtitle">STRATEGIC HOLOGRAM STAGE</span>
        </div>
        <div className="dw-header-center">
          {/* Platform Tabs */}
          <div className="dw-platform-tabs">
            {PLATFORM_TABS.map(tab => (
              <button
                key={tab}
                className={`dw-platform-tab ${activeTab === tab ? 'is-active' : ''}`}
                onClick={() => { setActiveTab(tab); setHeroIndex(0); }}
              >
                {tab}
                {tab !== '전체' && platformCounts[tab] ? <span className="dw-tab-count">{platformCounts[tab]}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="dw-header-right">
          <span className={`dw-header-status ${systemArmed ? 'is-linked' : ''}`}>{systemArmed ? 'LINKED' : 'ONLINE'}</span>
          <span className="dw-header-sub">{systemArmed ? 'DUAL SCREEN ACTIVE' : 'SYSTEM AWAKENING'}</span>
          <span className="dw-header-intel-count">INTEL: {realCandidates.length}</span>
        </div>
      </header>

      {/* ═══ Main 5-Zone Grid ═══ */}
      <div className="data-wall-main-grid dw-q1-grid">

        {/* ═══ E. Left Radar / Status Panel ═══ */}
        <aside className="dw-col dw-col-left">
          <div className="dw-panel dw-morning-brief">
            <div className="dw-panel-label">MORNING BRIEF</div>
            <div className="dw-brief-grid">
              <div className="dw-brief-item">
                <span className="dw-brief-val">{smartstoreSnapshot?.preShipTotal || 0}</span>
                <span className="dw-brief-key">PRE-SHIP</span>
              </div>
              <div className="dw-brief-item">
                <span className="dw-brief-val">{payload?.outreachCount || realCandidates.length}</span>
                <span className="dw-brief-key">OUTREACH</span>
              </div>
              <div className="dw-brief-item">
                <span className="dw-brief-val">{payload?.workspaceCount || 0}</span>
                <span className="dw-brief-key">WORKSPACE</span>
              </div>
            </div>
          </div>
          <div className="dw-panel dw-category-radar">
            <div className="dw-panel-label">CATEGORY RADAR</div>
            <div className="dw-radar-container">
              <div className="dw-radar-rings">
                <div className="dw-radar-ring" />
                <div className="dw-radar-ring" />
                <div className="dw-radar-ring" />
                <div className="dw-radar-sweep" />
              </div>
              {topCategories.length > 0 ? (
                topCategories.map(([cat, count], idx) => {
                  const angle = (idx * 72) + 18;
                  const dist = 40 + Math.min(count * 8, 40);
                  return (
                    <div key={cat} className="dw-radar-point" style={{ '--angle': `${angle}deg`, '--dist': `${dist}%` } as React.CSSProperties}>
                      <span className="dw-radar-label">{cat} <span className="dw-radar-count">{count}</span></span>
                    </div>
                  );
                })
              ) : (
                ['대기중', '수집 준비', '분석 대기'].map((label, idx) => (
                  <div key={label} className="dw-radar-point dw-radar-standby" style={{ '--angle': `${idx * 120 + 30}deg`, '--dist': '50%' } as React.CSSProperties}>
                    <span className="dw-radar-label">{label}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          {/* Platform Source Summary */}
          <div className="dw-panel dw-source-summary">
            <div className="dw-panel-label">SOURCE</div>
            <div className="dw-source-list">
              {Object.entries(platformCounts).length > 0 ? (
                Object.entries(platformCounts).map(([p, count]) => (
                  <div key={p} className="dw-source-row">
                    <span className={`dw-source-badge dw-src-${p.toLowerCase()}`}>{p}</span>
                    <span className="dw-source-count">{count}</span>
                  </div>
                ))
              ) : (
                <div className="dw-source-row dw-source-standby">
                  <span className="dw-source-badge">STANDBY</span>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ═══ B. Center Hero Intel Panel ═══ */}
        <main className="dw-col dw-col-center">
          <section className="dw-hero-stage">
            {/* Unity Core & Rings */}
            <div className="dw-unity-core-wrap">
              <div className="dw-unity-core" />
              <div className="dw-unity-ring ring-a" />
              <div className="dw-unity-ring ring-b" />
              <div className="dw-unity-ring ring-c" />
            </div>

            {heroCandidate ? (
              /* ─── Real Hero Intel Card ─── */
              <div className={`dw-hero-intel-card ${openingActive ? 'is-docking' : ''} dw-q1-hero`}>
                {/* Hero Media Area */}
                  <div className="dw-hero-media">
                  <div className="dw-hero-thumb-wrap">
                    {heroCandidate.thumbnailUrl ? (
                      <img 
                        src={heroCandidate.thumbnailUrl} 
                        alt="" 
                        className="dw-hero-thumb-img" 
                        referrerPolicy="no-referrer"
                        onError={(e) => { 
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.parentElement?.classList.add('is-image-failed');
                        }} 
                      />
                    ) : (
                      <div className="dw-hero-thumb-fallback">
                        <div className="dw-fallback-visual">
                          <span className="dw-fallback-letter">{(heroCandidate.channelName || heroCandidate.title || '?')[0]}</span>
                          <span className="dw-fallback-label">미디어 정보 확인 중</span>
                          <span className="dw-fallback-sub">대표 영상 또는 프로필 이미지를 불러올 수 없습니다.</span>
                        </div>
                      </div>
                    )}
                    <div className="dw-hero-thumb-overlay" />
                    <div className="dw-hero-scanline" />
                    {/* Play Button */}
                    {heroCandidate.videoUrl && (
                      <a href={heroCandidate.videoUrl} target="_blank" rel="noopener noreferrer" className="dw-hero-play-btn">
                        <div className="dw-play-icon" />
                      </a>
                    )}
                    {/* Platform Badge */}
                    <span className={`dw-platform-badge dw-plat-${(heroCandidate.platform || 'youtube').toLowerCase()}`}>
                      {heroCandidate.platform || 'YouTube'}
                    </span>
                    <span className="dw-hero-thumb-caption">현장 신호 // {heroCandidate.platform?.toUpperCase() || '인텔'}</span>
                  </div>
                </div>
                {/* Hero Body */}
                <div className="dw-hero-body">
                  <div className="dw-hero-header-row">
                    <div className="dw-hero-avatar">
                      {heroCandidate.channelAvatarUrl ? (
                        <img 
                          src={heroCandidate.channelAvatarUrl} 
                          alt={heroCandidate.channelName} 
                          className="dw-hero-avatar-img" 
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          onError={(e) => { 
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            target.parentElement?.classList.add('is-image-failed');
                          }} 
                        />
                      ) : null}
                      <span className="dw-channel-orb">{(heroCandidate.channelName || '?')[0]}</span>
                    </div>
                    <div className="dw-hero-channel-info">
                      <span className="dw-hero-channel-name">{heroCandidate.channelName || '채널명 미확인'}</span>
                      <span className="dw-hero-channel-meta">{heroCandidate.category} // {heroCandidate.type.replace('_', ' ').toUpperCase()}</span>
                    </div>
                    <div className="dw-hero-fit-badge">
                      <span className="dw-fit-label">적합도</span>
                      <span className="dw-fit-value">{heroCandidate.fitScore ?? '??'}</span>
                    </div>
                  </div>
                  <h2 className="dw-hero-title">{heroCandidate.title}</h2>
                  {/* JARVIS Analysis */}
                  <div className="dw-hero-analysis">
                    <span className="dw-analysis-label">자비스 전략 분석</span>
                    <p className="dw-analysis-text">{heroCandidate.reason || '전략적 가치 분석 중...'}</p>
                  </div>
                  {/* Metrics Strip */}
                  <div className="dw-metrics-strip">
                    <div className="dw-metric">
                      <span className="dw-metric-key">구독자</span>
                      <span className="dw-metric-val">{heroCandidate.subscriberText || '확인 필요'}</span>
                    </div>
                    <div className="dw-metric">
                      <span className="dw-metric-key">평균 조회수</span>
                      <span className="dw-metric-val">{heroCandidate.viewsText || '확인 필요'}</span>
                    </div>
                    {heroCandidate.likesText && (
                      <div className="dw-metric">
                        <span className="dw-metric-key">좋아요</span>
                        <span className="dw-metric-val">{heroCandidate.likesText}</span>
                      </div>
                    )}
                    <div className="dw-metric">
                      <span className="dw-metric-key">연락 가능</span>
                      <span className={`dw-metric-val ${heroCandidate.contactStatus === 'contactable' ? 'dw-val-active' : ''}`}>
                        {heroCandidate.contactStatus === 'contactable' ? '문의 가능' : heroCandidate.contactStatus === 'review' ? '검토 필요' : '대기 중'}
                      </span>
                    </div>
                    {heroCandidate.videoUrl && (
                      <a href={heroCandidate.videoUrl} target="_blank" rel="noopener noreferrer" className="dw-metric dw-metric-link">
                        <span className="dw-metric-key">링크</span>
                        <span className="dw-metric-val dw-val-active">이동</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* ─── Empty State: Hero ─── */
              <div className="dw-hero-intel-card dw-q1-hero dw-empty-hero">
                <div className="dw-hero-media">
                  <div className="dw-hero-thumb-wrap">
                    <div className="dw-hero-thumb-fallback" />
                    <div className="dw-hero-scanline" />
                    <span className="dw-hero-thumb-caption">AWAITING INTEL</span>
                  </div>
                </div>
                <div className="dw-hero-body">
                  <h2 className="dw-hero-title">INTEL STANDBY</h2>
                  <div className="dw-hero-analysis">
                    <span className="dw-analysis-label">STATUS</span>
                    <p className="dw-analysis-text">OUTREACH 후보를 수집하면 이곳에 실제 채널/영상 후보가 표시됩니다.</p>
                  </div>
                  <div className="dw-empty-modules">
                    <span className="dw-empty-modules-label">READY MODULES</span>
                    <div className="dw-empty-module-grid">
                      <span className="dw-module-chip">Candidate Feed</span>
                      <span className="dw-module-chip">Contact Check</span>
                      <span className="dw-module-chip">Category Radar</span>
                      <span className="dw-module-chip">Hero Selection</span>
                      <span className="dw-module-chip">YouTube Visual Preview</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ═══ D. Bottom Filmstrip / Top 5 ═══ */}
          <section className="dw-filmstrip-section">
            <div className="dw-panel-label">TOP 5 INTEL TARGETS</div>
            <div className="dw-filmstrip">
              {hasRealData ? (
                top5Candidates.map((card, idx) => (
                  <div
                    key={card.contextId}
                    className={`dw-filmstrip-card ${filteredCandidates.indexOf(card) === safeHeroIndex ? 'is-selected' : ''}`}
                    onClick={() => {
                      const realIdx = filteredCandidates.indexOf(card);
                      if (realIdx >= 0) setHeroIndex(realIdx);
                    }}
                  >
                    <div className="dw-film-thumb">
                      {card.thumbnailUrl || card.channelAvatarUrl ? (
                        <img 
                          src={card.thumbnailUrl || card.channelAvatarUrl} 
                          alt="" 
                          className="dw-film-img" 
                          referrerPolicy="no-referrer"
                          onError={(e) => { 
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            target.parentElement?.classList.add('is-image-failed');
                          }} 
                        />
                      ) : null}
                      <span className="dw-channel-orb dw-film-orb">{(card.channelName || card.title || '?')[0]}</span>
                      <span className={`dw-film-platform dw-plat-${(card.platform || 'youtube').toLowerCase()}`}>{card.platform?.charAt(0) || 'Y'}</span>
                    </div>
                    <div className="dw-film-info">
                      <span className="dw-film-name">{card.channelName || card.title}</span>
                      <span className="dw-film-score">{card.fitScore !== undefined ? `FIT ${card.fitScore}` : ''}</span>
                    </div>
                  </div>
                ))
              ) : (
                Array.from({ length: 5 }).map((_, idx) => (
                  <div key={idx} className="dw-filmstrip-card dw-standby-frame">
                    <div className="dw-film-thumb">
                      <div className="dw-film-empty-frame" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </main>

        {/* ═══ C. Right Intel Queue ═══ */}
        <aside className="dw-col dw-col-right">
          <div className="dw-panel dw-intel-queue-panel">
            <div className="dw-panel-label">INTEL QUEUE {hasRealData && <span className="dw-queue-count">{queueCandidates.length}</span>}</div>
            <div className="dw-intel-cards">
              {hasRealData ? (
                queueCandidates.map((card, idx) => {
                  const isSelected = filteredCandidates.indexOf(card) === safeHeroIndex;
                  return (
                    <div
                      key={card.contextId}
                      className={`dw-intel-card ${openingActive ? 'is-docking' : ''} ${idx < 4 ? 'is-top5' : ''} ${isSelected ? 'is-selected' : ''}`}
                      style={{ '--i': idx } as React.CSSProperties}
                      onClick={() => {
                        const realIdx = filteredCandidates.indexOf(card);
                        if (realIdx >= 0) setHeroIndex(realIdx);
                      }}
                    >
                        <div className="dw-intel-thumb">
                        {card.channelAvatarUrl ? (
                          <img 
                            src={card.channelAvatarUrl} 
                            alt="" 
                            className="dw-intel-avatar-img" 
                            referrerPolicy="no-referrer"
                            onError={(e) => { 
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              target.parentElement?.classList.add('is-image-failed');
                            }} 
                          />
                        ) : null}
                        <span className="dw-channel-orb">{(card.channelName || card.title || '?')[0]}</span>
                      </div>
                      <div className="dw-intel-body">
                        <div className="dw-intel-title">{card.channelName || card.title}</div>
                        <div className="dw-intel-reason">{card.reason || '판단 대기'}</div>
                        <div className="dw-intel-footer">
                          <span className={`dw-intel-badge dw-plat-${(card.platform || 'youtube').toLowerCase()}`}>{card.platform || 'YT'}</span>
                          {card.fitScore !== undefined && <span className="dw-intel-badge dw-badge-score">FIT {card.fitScore}</span>}
                          <span className={`dw-intel-badge ${card.contactStatus === 'contactable' ? 'dw-badge-contact' : 'dw-badge-pending'}`}>
                            {card.contactStatus === 'contactable' ? '문의 가능' : card.contactStatus === 'review' ? '검토 필요' : '대기 중'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="dw-empty-queue">
                  <p className="dw-empty-queue-title">AWAITING INTEL</p>
                  <p className="dw-empty-queue-sub">1번 화면에서 후보 수집 실행 시 이곳에 우선순위 후보가 정렬됩니다.</p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ─── Live Feed Strip ─── */}
      <footer className="dw-live-feed">
        <span className="dw-feed-line">SYSTEM ONLINE</span>
        <span className="dw-feed-line">DATA SYNC ACTIVE</span>
        <span className="dw-feed-line">OUTREACH ENGINE READY</span>
        <span className="dw-feed-line">VOICE AI CONNECTED</span>
        <span className="dw-feed-line">INTEL: {realCandidates.length} CANDIDATES</span>
      </footer>
    </div>
  );
};
export default DataWallView;
