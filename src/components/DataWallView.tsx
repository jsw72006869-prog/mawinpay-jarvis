import React, { useState, useEffect, useRef } from 'react';

const WALL_CHANNEL = 'jarvis-dual-command-wall';
const WALL_STORAGE_KEY = 'jarvis.dualWall.latest';
const DUAL_OPENING_STORAGE_KEY = 'jarvis.dualWall.opening';
const SMARTSTORE_SNAPSHOT_KEY = 'jarvis.smartstore.lastStatusSnapshot';

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

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ─── Hero Intel Card ─── */
const heroIntelCard = {
  id: 'hero-corn-field-asmr',
  title: '초당옥수수 수확 현장 ASMR',
  channelName: '옥수수농장TV',
  category: '농산물 · ASMR · 현장감',
  signal: '수확 시즌 진입 · 현장감 콘텐츠 적합',
  action: '첫 3초 사운드 후킹',
  reason: '산지 신뢰와 먹고 싶은 감각을 동시에 보여줄 수 있음',
  mood: 'corn',
};

/* ─── Video Intel Cards (후보 대기열) ─── */
const videoIntelCards = [
  {
    id: 'v2', category: '캠핑', title: '우중 캠핑 삼겹살 먹방',
    type: '감성/힐링', channel: '캠핑요리왕', avatar: 'C',
    reason: '비 오는 날 감성 + 먹방 조합 바이럴 가능', status: 'ANALYZING', mood: 'camping',
  },
  {
    id: 'v3', category: '먹방', title: '매실청 담그기 1분 숏폼',
    type: '정보/숏폼', channel: '살림의여왕', avatar: 'S',
    reason: '매실 시즌 도래 — 숏폼 레시피 수요 급증', status: 'READY', mood: 'plum',
  },
  {
    id: 'v4', category: '살림', title: '블루베리 세척 & 보관 꿀팁',
    type: '생활정보', channel: '깔끔살림', avatar: 'K',
    reason: '블루베리 출하 시작 — 보관법 검색량 증가', status: 'READY', mood: 'blueberry',
  },
  {
    id: 'v5', category: '건강', title: '복숭아 다이어트 레시피',
    type: '건강/미용', channel: '헬시라이프', avatar: 'H',
    reason: '여름 다이어트 시즌 — 과일 레시피 관심 상승', status: 'READY', mood: 'peach',
  },
  {
    id: 'v6', category: '여행', title: '주말 농장 체험 브이로그',
    type: '브이로그', channel: '시골여행자', avatar: 'T',
    reason: '체험형 콘텐츠 — 가족 단위 유입 기대', status: 'READY', mood: 'farm',
  },
];

const seasonPoints = [
  { label: '옥수수', angle: 35, distance: 68 },
  { label: '매실', angle: 120, distance: 55 },
  { label: '블루베리', angle: 210, distance: 72 },
  { label: '복숭아', angle: 300, distance: 60 },
];

const liveFeedLines = [
  '시즌 레이더 스캔 완료 — 옥수수 · 매실 · 블루베리 · 복숭아',
  '바이럴 소재 6건 분석 완료',
  '스마트스토어 동기화 대기 중',
  '아웃리치 후보 탐색 중',
];

const DataWallView: React.FC = () => {
  const [payload, setPayload] = useState<WallPayload | null>(null);
  const [smartstoreSnapshot, setSmartstoreSnapshot] = useState<SmartstoreSnapshot | null>(null);
  const [openingActive, setOpeningActive] = useState(false);
  const [systemArmed, setSystemArmed] = useState(false);
  const openingTimerRef = useRef<number | null>(null);

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
      }
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

        setPayload(data);

        const nextSmartstore = readJson<SmartstoreSnapshot>(SMARTSTORE_SNAPSHOT_KEY);
        if (nextSmartstore) setSmartstoreSnapshot(nextSmartstore);
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

  return (
    <div className={`data-wall-shell ${systemArmed ? 'is-system-armed' : ''} ${openingActive ? 'is-cinematic-opening' : ''}`}>

      {/* ─── Background Layer ─── */}
      <div className="data-wall-bg" aria-hidden="true">
        <div className="bg-grid" />
        <div className="bg-vignette" />
      </div>

      {/* ─── Header ─── */}
      <header className="data-wall-header">
        <div className="dw-header-left">
          <span className="dw-greeting">GOOD MORNING, SIR</span>
          <h1 className="dw-title">STRATEGIC HOLOGRAM STAGE</h1>
        </div>
        <div className="dw-header-right">
          <div className="dw-status-badge">
            <span className="dw-status-dot" />
            <span>{openingActive ? 'AWAKENING' : 'ONLINE'}</span>
          </div>
          <div className="dw-time">{payload?.currentTime || '00:00:00'}</div>
        </div>
      </header>

      {/* ─── Main Grid: Left / Center Hero / Right ─── */}
      <div className="data-wall-main-grid v3">

        {/* LEFT: Brief + Season Radar */}
        <aside className="dw-col dw-col-left">
          <div className="dw-panel dw-brief-panel">
            <div className="dw-panel-label">MORNING BRIEF</div>
            <div className="dw-brief-row">
              <span className="dw-brief-key">SMARTSTORE</span>
              <span className="dw-brief-val">{smartstoreSnapshot?.preShipTotal ?? 0} PRE-SHIP</span>
            </div>
            <div className="dw-brief-row">
              <span className="dw-brief-key">OUTREACH</span>
              <span className="dw-brief-val">{payload?.outreachCount ?? 0} ACTIVE</span>
            </div>
            <div className="dw-brief-row">
              <span className="dw-brief-key">WORKSPACE</span>
              <span className="dw-brief-val">{payload?.workspaceCount ?? 0} FILES</span>
            </div>
          </div>

          <div className="dw-panel dw-radar-panel">
            <div className="dw-panel-label">SEASON RADAR</div>
            <div className="dw-radar-container">
              <div className="dw-radar-ring r1" />
              <div className="dw-radar-ring r2" />
              <div className="dw-radar-ring r3" />
              <div className="dw-radar-sweep-arm" />
              {seasonPoints.map((pt) => (
                <div
                  key={pt.label}
                  className="dw-radar-point"
                  style={{
                    '--angle': `${pt.angle}deg`,
                    '--dist': `${pt.distance}%`,
                  } as React.CSSProperties}
                >
                  <span className="dw-radar-dot" />
                  <span className="dw-radar-label">{pt.label}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* CENTER: Hero Stage */}
        <main className="dw-col dw-col-center">
          <section className="dw-hero-stage">
            {/* Depth Rings (camera push-in feel) */}
            <div className="dw-camera-depth" aria-hidden="true">
              <span className="dw-depth-ring ring-1" />
              <span className="dw-depth-ring ring-2" />
              <span className="dw-depth-ring ring-3" />
              <span className="dw-horizon-beam" />
            </div>

            {/* Hero Intel Card */}
            <article className="dw-hero-intel-card" data-context-id={heroIntelCard.id}>
              <div className={`dw-hero-thumb thumb-${heroIntelCard.mood}`}>
                <div className="dw-thumb-scan" />
                <div className="dw-thumb-play" />
                <div className="dw-thumb-caption">FIELD SIGNAL</div>
              </div>

              <div className="dw-hero-meta">
                <div className="dw-channel-row">
                  <span className="dw-channel-avatar">U</span>
                  <div className="dw-channel-info">
                    <strong>{heroIntelCard.channelName}</strong>
                    <em>{heroIntelCard.category}</em>
                  </div>
                </div>

                <h2 className="dw-hero-title">{heroIntelCard.title}</h2>
                <p className="dw-hero-signal">{heroIntelCard.signal}</p>
                <p className="dw-hero-reason">{heroIntelCard.reason}</p>

                <div className="dw-hero-action-bar">
                  <span className="dw-hero-action-label">RECOMMENDED ACTION</span>
                  <span className="dw-hero-action-text">{heroIntelCard.action}</span>
                </div>
              </div>
            </article>
          </section>
        </main>

        {/* RIGHT: Video Intel Queue */}
        <aside className="dw-col dw-col-right">
          <div className="dw-panel dw-video-intel-panel">
            <div className="dw-panel-label">INTEL QUEUE</div>
            <div className="dw-intel-cards">
              {videoIntelCards.map((card, idx) => (
                <div
                  key={card.id}
                  className={`dw-intel-card ${openingActive ? 'is-docking' : ''}`}
                  style={{ '--i': idx } as React.CSSProperties}
                  data-context-id={card.id}
                >
                  <div className={`dw-intel-thumb thumb-${card.mood}`}>
                    <span className="dw-intel-thumb-avatar">{card.avatar}</span>
                    <div className="dw-intel-thumb-scan" />
                  </div>
                  <div className="dw-intel-body">
                    <div className="dw-intel-title">{card.title}</div>
                    <div className="dw-intel-channel">{card.channel}</div>
                    <div className="dw-intel-reason">{card.reason}</div>
                    <div className="dw-intel-footer">
                      <span className="dw-intel-category">{card.category}</span>
                      <span className={`dw-intel-status st-${card.status.toLowerCase()}`}>{card.status}</span>
                    </div>
                  </div>
                </div>
              ))}
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
