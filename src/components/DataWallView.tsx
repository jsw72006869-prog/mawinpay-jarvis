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
  raw?: unknown;
};

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

  const platform = (item.platform || '').toLowerCase();
  let candidateType: RealIntelCandidate['type'] = 'unknown';
  if (platform.includes('youtube')) candidateType = 'youtube_channel';
  else if (platform.includes('blog') || platform.includes('naver')) candidateType = 'blog';
  else if (platform.includes('instagram') || platform.includes('tiktok')) candidateType = 'influencer';

  const hasEmail = !!(item.email || item.contactEmail || item.publicEmailMasked);
  const hasForm = item.publicContactStatus === 'form_available';
  let contactStatus: RealIntelCandidate['contactStatus'] = 'unknown';
  if (hasEmail || item.publicContactStatus === 'email_public') contactStatus = 'contactable';
  else if (hasForm) contactStatus = 'review';
  else if (item.publicContactStatus === 'none') contactStatus = 'none';

  const subscriberText =
    item.subscriberOrVisitor ||
    item.followers ||
    (item.subscriberCount ? `${item.subscriberCount.toLocaleString()}명` : undefined) ||
    (item.subscribers ? `${item.subscribers.toLocaleString()}명` : undefined) ||
    undefined;

  const viewsText =
    item.viewCount ||
    item.viewCountFormatted ||
    (item.avgViews ? `평균 ${item.avgViews.toLocaleString()}회` : undefined) ||
    undefined;

  return {
    contextId: String(item.candidateId || item.channelId || item.id || `candidate-${index + 1}`),
    type: candidateType,
    title,
    channelName,
    category: item.category || item.keyword || item.niche || item.topic || '분류 미확인',
    source: item.platform || item.source || undefined,
    recentVideoTitle: item.recentContentTitle || item.topVideoTitle || item.recentVideoTitle || undefined,
    thumbnailUrl: item.thumbnailUrl || item.thumbnail || item.videoThumbnail || undefined,
    channelAvatarUrl: item.channelAvatarUrl || item.avatarUrl || item.profileImageUrl || item.profileUrl || undefined,
    subscriberText,
    viewsText,
    contactStatus,
    fitScore: typeof item.productFitScore === 'number' ? item.productFitScore : (typeof item.fitScore === 'number' ? item.fitScore : undefined),
    reason: item.productFitReason || item.reason || item.fitReason || item.suggestedOfferAngle || undefined,
    keywords: Array.isArray(item.keywords) ? item.keywords : (item.keyword ? [item.keyword] : []),
    lastUpdated: item.collectedAt || item.lastUpdated || item.updatedAt || undefined,
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

/* ─── Season Radar Points ─── */
const seasonPoints = [
  { label: '옥수수', angle: 30, distance: 72 },
  { label: '매실', angle: 110, distance: 58 },
  { label: '블루베리', angle: 200, distance: 65 },
  { label: '복숭아', angle: 290, distance: 80 },
];

/* ─── Live Feed Lines ─── */
const liveFeedLines = [
  'SYSTEM ONLINE',
  'DATA SYNC ACTIVE',
  'MARKET BRAIN STANDBY',
  'OUTREACH ENGINE READY',
  'VOICE AI CONNECTED',
];

/* ═══════════════════════════════════════════════════════════
   DataWallView Component
   ═══════════════════════════════════════════════════════════ */
const DataWallView: React.FC = () => {
  const [payload, setPayload] = useState<WallPayload | null>(null);
  const [smartstoreSnapshot, setSmartstoreSnapshot] = useState<SmartstoreSnapshot | null>(null);
  const [openingActive, setOpeningActive] = useState(false);
  const [systemArmed, setSystemArmed] = useState(false);
  const [realCandidates, setRealCandidates] = useState<RealIntelCandidate[]>([]);
  const [heroIndex, setHeroIndex] = useState(0); // UI-P: Hero 승격용 인덱스
  const openingTimerRef = useRef<number | null>(null);

  /* ─── Read real candidates from localStorage ─── */
  const refreshCandidates = () => {
    // UI-P: 두 키 모두 확인하여 병합 (Outreach 우선)
    const outreachRaw = readJson<any[]>(OUTREACH_STORAGE_KEY) || [];
    const collectedRaw = readJson<any[]>(INFLUENCER_STORAGE_KEY) || [];
    
    // 중복 제거 (ID 기준)
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
      // Sort: contactable first, then by fitScore desc
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
        if (openingTimerRef.current) {
          window.clearTimeout(openingTimerRef.current);
        }
        openingTimerRef.current = window.setTimeout(() => {
          setOpeningActive(false);
        }, 6000);
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
        if (data.type === 'dual-armed') {
          setSystemArmed(true);
          setPayload(data);
          return;
        }
        if (data.type === 'dual-opening') {
          setSystemArmed(true);
          setOpeningActive(true);
          setPayload(data);
          if (openingTimerRef.current) {
            window.clearTimeout(openingTimerRef.current);
          }
          openingTimerRef.current = window.setTimeout(() => {
            setOpeningActive(false);
          }, 6000);
          return;
        }
        if (data.type === 'data-update') {
          refreshCandidates();
          return;
        }
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
      if (openingTimerRef.current) {
        window.clearTimeout(openingTimerRef.current);
      }
    };
  }, []);

  /* ─── Derived data (UI-P: Top 5 + Queue 정렬) ─── */
  const hasRealData = realCandidates.length > 0;
  // UI-P: heroIndex로 선택된 후보가 Hero, 나머지가 Queue
  const safeHeroIndex = hasRealData ? Math.min(heroIndex, realCandidates.length - 1) : 0;
  const heroCandidate = hasRealData ? realCandidates[safeHeroIndex] : null;
  const queueCandidates = hasRealData
    ? realCandidates.filter((_, idx) => idx !== safeHeroIndex).slice(0, 10)
    : [];

  /* ─── Category distribution for radar ─── */
  const categoryMap: Record<string, number> = {};
  realCandidates.forEach(c => {
    const cat = c.category || '미분류';
    categoryMap[cat] = (categoryMap[cat] || 0) + 1;
  });
  const topCategories = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <div className={`data-wall-shell dw-cinematic-unity ${systemArmed ? 'is-system-armed' : ''} ${openingActive ? 'is-cinematic-opening' : ''}`}>
      {/* ─── Cinematic Ambient Layer ─── */}
      <div className="dw-cinematic-ambient-layer" aria-hidden="true">
        <div className="dw-ambient-grid" />
        <div className="dw-ambient-glow" />
        <div className="dw-ambient-sweep" />
        <div className="dw-ambient-noise" />
        <div className="dw-ambient-film-grain" />
        <div className="dw-ambient-scanline" />
      </div>
      {/* ─── Background Layer ─── */}
      <div className="data-wall-bg" aria-hidden="true">
        <div className="bg-grid" />
        <div className="bg-vignette" />
      </div>
      {/* ─── Header ─── */}
      <header className="data-wall-header">
        <div className="dw-header-left">
          <span className="dw-header-greeting">GOOD MORNING, SIR</span>
          <h1 className="dw-header-title">STRATEGIC HOLOGRAM STAGE</h1>
        </div>
        <div className="dw-header-right">
          <span className={`dw-header-status ${systemArmed ? 'is-linked' : ''}`}>{systemArmed ? 'LINKED' : 'JARVIS ONLINE'}</span>
          <span className="dw-header-sub">{systemArmed ? 'DUAL SCREEN ACTIVE' : 'SYSTEM AWAKENING'}</span>
        </div>
      </header>
      {/* ─── Main Grid ─── */}
      <div className="data-wall-main-grid v3">
        {/* ─── Left Column ─── */}
        <aside className="dw-col dw-col-left">
          {/* Morning Brief */}
          <div className="dw-panel dw-morning-brief">
            <div className="dw-panel-label">MORNING BRIEF</div>
            <div className="dw-brief-grid">
              <div className="dw-brief-item">
                <span className="dw-brief-val">{smartstoreSnapshot?.preShipTotal || 0}</span>
                <span className="dw-brief-key">SMARTSTORE PRE-SHIP</span>
              </div>
              <div className="dw-brief-item">
                <span className="dw-brief-val">{payload?.outreachCount || 0}</span>
                <span className="dw-brief-key">OUTREACH ACTIVE</span>
              </div>
              <div className="dw-brief-item">
                <span className="dw-brief-val">{payload?.workspaceCount || 0}</span>
                <span className="dw-brief-key">WORKSPACE FILES</span>
              </div>
            </div>
          </div>
          {/* Category Radar */}
          <div className="dw-panel dw-category-radar">
            <div className="dw-panel-label">CATEGORY RADAR</div>
            <div className="dw-radar-container">
              <div className="dw-radar-rings">
                <div className="dw-radar-ring" />
                <div className="dw-radar-ring" />
                <div className="dw-radar-ring" />
                <div className="dw-radar-sweep" />
              </div>
              {hasRealData ? (
                topCategories.map(([cat, count], idx) => {
                  const angle = (idx * 90) + 45;
                  const dist = 50 + (count * 5);
                  return (
                    <div
                      key={cat}
                      className="dw-radar-point"
                      style={{ '--angle': `${angle}deg`, '--dist': `${dist}%` } as React.CSSProperties}
                    >
                      <span className="dw-radar-label">{cat}</span>
                    </div>
                  );
                })
              ) : (
                seasonPoints.map((p) => (
                  <div
                    key={p.label}
                    className="dw-radar-point"
                    style={{ '--angle': `${p.angle}deg`, '--dist': `${p.distance}%` } as React.CSSProperties}
                  >
                    <span className="dw-radar-label">{p.label}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
        {/* ─── Center Column (Hero Stage) ─── */}
        <main className="dw-col dw-col-center">
          <section className="dw-hero-stage">
            {/* Unity Core & Rings (Behind Hero Card) */}
            <div className="dw-unity-core-wrap">
              <div className="dw-unity-core" />
              <div className="dw-unity-ring ring-a" />
              <div className="dw-unity-ring ring-b" />
              <div className="dw-unity-ring ring-c" />
            </div>
            {heroCandidate ? (
              /* ─── Real Hero Intel Card ─── */
              <div className={`dw-hero-intel-card ${openingActive ? 'is-docking' : ''} v2-upgrade`}>
                <div className="dw-hero-thumb-wrap">
                  <div className="dw-hero-thumb">
                    {heroCandidate.thumbnailUrl ? (
                      <img src={heroCandidate.thumbnailUrl} alt="" className="dw-real-thumb-img" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="dw-cinematic-thumb-fallback" />
                    )}
                    <div className="dw-thumb-overlay" />
                    <div className="dw-thumb-scanline" />
                    <div className="dw-hero-play-btn">
                      <div className="dw-play-icon" />
                    </div>
                    <span className="dw-hero-thumb-caption">FIELD SIGNAL // {heroCandidate.source?.toUpperCase() || 'INTEL'}</span>
                  </div>
                </div>
                <div className="dw-hero-body">
                  <div className="dw-hero-header-row">
                    <div className="dw-hero-avatar">
                      {heroCandidate.channelAvatarUrl ? (
                        <img src={heroCandidate.channelAvatarUrl} alt="" className="dw-real-avatar-img" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <span className="dw-channel-orb">{(heroCandidate.channelName || '?')[0]}</span>
                      )}
                    </div>
                    <div className="dw-hero-channel-info">
                      <span className="dw-hero-channel-name">{heroCandidate.channelName || '채널명 미확인'}</span>
                      <span className="dw-hero-channel-meta">{heroCandidate.category} // {heroCandidate.type.replace('_', ' ').toUpperCase()}</span>
                    </div>
                    <div className="dw-hero-fit-badge">
                      <span className="dw-fit-label">FIT SCORE</span>
                      <span className="dw-fit-value">{heroCandidate.fitScore || '??'}</span>
                    </div>
                  </div>
                  <h2 className="dw-hero-title">{heroCandidate.title}</h2>
                  <div className="dw-hero-reason-box">
                    <span className="dw-reason-label">JARVIS ANALYSIS</span>
                    <p className="dw-hero-reason">{heroCandidate.reason || '전략적 가치 분석 중...'}</p>
                  </div>
                  <div className="dw-hero-stats-grid">
                    <div className="dw-hero-stat">
                      <span className="dw-stat-key">SUBSCRIBERS</span>
                      <span className="dw-stat-val">{heroCandidate.subscriberText || 'N/A'}</span>
                    </div>
                    <div className="dw-hero-stat">
                      <span className="dw-stat-key">AVG VIEWS</span>
                      <span className="dw-stat-val">{heroCandidate.viewsText || 'N/A'}</span>
                    </div>
                    <div className="dw-hero-stat">
                      <span className="dw-stat-key">CONTACT</span>
                      <span className={`dw-stat-val ${heroCandidate.contactStatus === 'contactable' ? 'st-active' : ''}`}>
                        {heroCandidate.contactStatus === 'contactable' ? 'AVAILABLE' : 'PENDING'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ─── Empty State: UI-P 정리 ─── */
              <div className="dw-hero-intel-card dw-empty-intel-state v2-upgrade">
                <div className="dw-hero-thumb-wrap">
                  <div className="dw-hero-thumb">
                    <div className="dw-cinematic-thumb-fallback" />
                    <span className="dw-hero-thumb-caption">AWAITING INTEL</span>
                  </div>
                </div>
                <div className="dw-hero-body">
                  <h2 className="dw-hero-title">INTEL STANDBY</h2>
                  <p className="dw-hero-reason">수집된 후보가 없습니다. 1번 화면에서 OUTREACH 수집을 실행하세요.</p>
                  <div className="dw-hero-stats-grid">
                    <div className="dw-hero-stat">
                      <span className="dw-stat-key">STATUS</span>
                      <span className="dw-stat-val">{systemArmed ? 'LINKED' : 'STANDBY'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
        {/* ─── Right Column (Intel Queue) ─── */}
        <aside className="dw-col dw-col-right">
          <div className="dw-panel dw-intel-queue-panel">
            <div className="dw-panel-label">INTEL QUEUE {hasRealData && <span className="dw-queue-count">{queueCandidates.length}</span>}</div>
            <div className="dw-intel-cards">
              {hasRealData ? (
                queueCandidates.map((card, idx) => (
                  <div
                    key={card.contextId}
                    className={`dw-intel-card ${openingActive ? 'is-docking' : ''} ${idx < 4 ? 'is-top5' : ''}`}
                    style={{ '--i': idx } as React.CSSProperties}
                    data-context-id={card.contextId}
                    onClick={() => {
                      // UI-P: 클릭 시 Hero 승격
                      const realIdx = realCandidates.findIndex(c => c.contextId === card.contextId);
                      if (realIdx >= 0) setHeroIndex(realIdx);
                    }}
                  >
                    <div className="dw-intel-thumb">
                      {card.channelAvatarUrl ? (
                        <img src={card.channelAvatarUrl} alt="" className="dw-real-avatar-img" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <span className="dw-channel-orb">{(card.channelName || '?')[0]}</span>
                      )}
                    </div>
                    <div className="dw-intel-body">
                      <div className="dw-intel-title">{card.title}</div>
                      <div className="dw-intel-channel">{card.channelName || '채널 미확인'}</div>
                      <div className="dw-intel-reason">{card.reason || '판단 대기'}</div>
                      <div className="dw-intel-footer">
                        <span className="dw-intel-category">{card.category}</span>
                        <span className={`dw-intel-status ${card.contactStatus === 'contactable' ? 'st-contactable' : 'st-unknown'}`}>
                          {card.contactStatus === 'contactable' ? '연락가능' : card.contactStatus === 'review' ? '검토' : '미확인'}
                        </span>
                        {card.fitScore !== undefined && <span className="dw-intel-score">적합 {card.fitScore}</span>}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="dw-empty-intel-state">
                  <p>AWAITING INTEL</p>
                  <p style={{ fontSize: '11px', opacity: 0.6 }}>1번 화면에서 수집 실행 시 표시됩니다.</p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
      {/* ─── Live Feed Strip ─── */}
      <footer className="dw-live-feed">
        {liveFeedLines.map((line, idx) => (
          <span key={idx} className="dw-feed-line" style={{ '--i': idx } as React.CSSProperties}>
            {line}
          </span>
        ))}
      </footer>
    </div>
  );
};
export default DataWallView;
