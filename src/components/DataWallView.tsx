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

/* ─── Strategic Video Intel Data ─── */
const videoIntelCards = [
  { id: 'v1', category: '농산물', title: '초당옥수수 수확 현장', type: 'ASMR/현장감', status: 'READY' },
  { id: 'v2', category: '캠핑', title: '우중 캠핑 삼겹살 먹방', type: '감성/힐링', status: 'ANALYZING' },
  { id: 'v3', category: '먹방', title: '매실청 담그기 1분 요약', type: '정보/숏폼', status: 'READY' },
  { id: 'v4', category: '살림', title: '블루베리 세척 꿀팁', type: '생활정보', status: 'READY' },
  { id: 'v5', category: '건강', title: '복숭아 다이어트 레시피', type: '건강/미용', status: 'READY' },
  { id: 'v6', category: '여행', title: '주말 농장 체험 브이로그', type: '브이로그', status: 'READY' },
];

const activitySignals = [
  'SMARTSTORE SYNC ACTIVE',
  'MARKET BRAIN SCANNING',
  'OUTREACH SIGNAL DETECTED',
  'WORKSPACE INDEXING',
  'NEURAL NET STABLE',
  'STRATEGIC WALL ONLINE',
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
    <div className={`jarvis-data-wall ${systemArmed ? 'is-system-armed' : ''} ${openingActive ? 'is-cinematic-opening' : ''}`}>
      {/* ─── Cinematic Morning Boot Overlay (UI-K 유지) ─── */}
      <div className="data-wall-cinematic-sky" aria-hidden="true">
        <div className="cinematic-sunrise-core" />
        <div className="cinematic-horizon-line" />
        <div className="cinematic-light-sweep sweep-a" />
        <div className="cinematic-light-sweep sweep-b" />
        <div className="cinematic-scan-grid" />
        <div className="cinematic-particle-field">
          {Array.from({ length: 28 }).map((_, index) => (
            <span key={index} style={{ '--i': index } as React.CSSProperties} />
          ))}
        </div>
      </div>

      {/* ─── Strategic Hologram Wall (UI-L 메인) ─── */}
      <section className={`strategic-hologram-wall ${openingActive ? 'is-opening' : ''}`}>
        <header className="strategic-header">
          <div className="header-left">
            <span className="morning-greeting">GOOD MORNING, SIR</span>
            <h1 className="wall-title">STRATEGIC HOLOGRAM WALL</h1>
          </div>
          <div className="header-right">
            <div className="system-status-badge">
              <span className="status-dot" />
              <span className="status-text">{openingActive ? 'AWAKENING' : 'ACTIVE'}</span>
            </div>
            <div className="time-display">{payload?.currentTime || '00:00:00'}</div>
          </div>
        </header>

        <div className="strategic-wall-grid">
          {/* Left Column: Market & Season Radar */}
          <aside className="strategic-side-panel left">
            <div className="strategic-morning-strip">
              <div className="strip-label">MORNING BRIEF</div>
              <div className="strip-content">
                <div className="brief-item">
                  <span className="label">SMARTSTORE</span>
                  <span className="value">{smartstoreSnapshot?.preShipTotal ?? 0} PRE-SHIP</span>
                </div>
                <div className="brief-item">
                  <span className="label">OUTREACH</span>
                  <span className="value">{payload?.outreachCount ?? 0} ACTIVE</span>
                </div>
              </div>
            </div>

            <div className="strategic-season-radar">
              <div className="panel-header">SEASON RADAR</div>
              <div className="radar-display">
                <div className="radar-circle">
                  <div className="radar-sweep" />
                  <div className="radar-point p1" data-label="옥수수" />
                  <div className="radar-point p2" data-label="매실" />
                  <div className="radar-point p3" data-label="블루베리" />
                  <div className="radar-point p4" data-label="복숭아" />
                </div>
              </div>
              <div className="radar-legend">
                <span>옥수수 · 매실 · 블루베리 · 복숭아 시즌 감시 중</span>
              </div>
            </div>
          </aside>

          {/* Center Column: Strategic Stage & Video Orbit */}
          <main className="strategic-stage">
            <div className="stage-core">
              <div className="core-glow" />
              <div className="core-rings">
                <div className="ring r1" />
                <div className="ring r2" />
                <div className="ring r3" />
              </div>
              <div className="stage-label">STRATEGIC STAGE</div>
            </div>

            <div className="strategic-video-orbit">
              {videoIntelCards.map((card, idx) => (
                <div 
                  key={card.id} 
                  className="video-intel-orbit-card"
                  style={{ '--i': idx, '--total': videoIntelCards.length } as React.CSSProperties}
                >
                  <div className="card-category">{card.category}</div>
                  <div className="card-title">{card.title}</div>
                  <div className="card-footer">
                    <span className="card-type">{card.type}</span>
                    <span className={`card-status ${card.status.toLowerCase()}`}>{card.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </main>

          {/* Right Column: Viral & Video Intel Wall */}
          <aside className="strategic-side-panel right">
            <div className="strategic-video-intel-wall">
              <div className="panel-header">VIDEO INTEL WALL</div>
              <div className="intel-list">
                {videoIntelCards.slice(0, 4).map((card) => (
                  <div key={`intel-${card.id}`} className="intel-item">
                    <div className="intel-thumb" />
                    <div className="intel-info">
                      <div className="intel-title">{card.title}</div>
                      <div className="intel-meta">{card.category} · {card.type}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="strategic-activity-stream">
              {activitySignals.map((signal, idx) => (
                <span key={idx} style={{ '--i': idx } as React.CSSProperties}>{signal}</span>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
};

export default DataWallView;
