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

/* ─── System Map Nodes ─── */
const systemNodes = [
  // INPUT layer
  { id: 'voice', label: 'VOICE INPUT', layer: 'INPUT', tone: 'tone-cyan' },
  { id: 'text', label: 'TEXT INPUT', layer: 'INPUT', tone: 'tone-cyan' },
  { id: 'broadcast', label: 'BROADCAST CH', layer: 'INPUT', tone: 'tone-cyan' },
  // BRAIN layer
  { id: 'gpt', label: 'GPT BRAIN', layer: 'BRAIN', tone: 'tone-gold' },
  { id: 'router', label: 'CMD ROUTER', layer: 'BRAIN', tone: 'tone-gold' },
  { id: 'scene', label: 'SCENE ENGINE', layer: 'BRAIN', tone: 'tone-gold' },
  // OPERATION layer
  { id: 'smartstore', label: 'SMARTSTORE', layer: 'OPERATION', tone: 'tone-amber' },
  { id: 'outreach', label: 'OUTREACH', layer: 'OPERATION', tone: 'tone-amber' },
  { id: 'market', label: 'MARKET BRAIN', layer: 'OPERATION', tone: 'tone-amber' },
  { id: 'workspace', label: 'WORKSPACE', layer: 'OPERATION', tone: 'tone-amber' },
  // ACTION layer
  { id: 'gmail', label: 'GMAIL', layer: 'ACTION', tone: 'tone-green' },
  { id: 'sheets', label: 'SHEETS', layer: 'ACTION', tone: 'tone-green' },
  { id: 'telegram', label: 'TELEGRAM', layer: 'ACTION', tone: 'tone-green' },
  { id: 'deploy', label: 'DEPLOY', layer: 'ACTION', tone: 'tone-green' },
];

const layers = ['INPUT', 'BRAIN', 'OPERATION', 'ACTION'] as const;

function sceneLabel(scene?: string): string {
  switch (scene) {
    case 'mission-control': return 'MISSION CONTROL';
    case 'strategy-hq': return 'STRATEGY HQ';
    case 'files': return 'FILES';
    case 'outreach': return 'OUTREACH';
    case 'market': return 'MARKET';
    default: return 'STANDBY';
  }
}

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
      {/* ─── Cinematic Morning Boot Overlay ─── */}
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

      {/* ─── System Map Wall (유일한 메인 뷰) ─── */}
      <section
        className={`jarvis-system-map-wall ${openingActive ? 'is-opening' : ''} ${systemArmed ? 'is-armed' : ''}`}
      >
        <header className="system-map-header">
          <div>
            <span className="system-map-greeting">GOOD MORNING, SIR · JARVIS ONLINE</span>
            <strong className="system-map-title">SYSTEM AWAKENING</strong>
          </div>
          <em className="system-map-status">
            {sceneLabel(payload?.scene)} · {String(payload?.state || 'STANDBY').toUpperCase()}
          </em>
        </header>

        <div className="system-map-flow">
          {layers.map((layer, layerIdx) => (
            <div key={layer} className={`system-map-layer layer-${layer.toLowerCase()}`}>
              <div className="system-map-layer-label">{layer}</div>
              {systemNodes
                .filter((n) => n.layer === layer)
                .map((node, idx) => (
                  <div
                    key={node.id}
                    className={`system-flow-node ${node.tone} ${openingActive ? 'is-booting' : ''}`}
                    style={{ animationDelay: `${idx * 180 + layerIdx * 400}ms` }}
                  >
                    <span className="node-dot" />
                    <span className="node-label">{node.label}</span>
                  </div>
                ))}
              {/* 레이어 간 연결선 */}
              {layerIdx < layers.length - 1 && (
                <div className={`system-flow-line line-${layer.toLowerCase()}-${layers[layerIdx + 1].toLowerCase()}`} />
              )}
            </div>
          ))}
        </div>

        {/* 하단 요약 카드 */}
        <div className="data-wall-briefing-strip">
          <article className="briefing-card tone-amber">
            <span className="briefing-card-title">SMARTSTORE</span>
            <span className="briefing-card-value">
              {smartstoreSnapshot ? `${smartstoreSnapshot.preShipTotal} PRE-SHIP` : 'WAITING'}
            </span>
          </article>
          <article className="briefing-card tone-gold">
            <span className="briefing-card-title">MARKET BRAIN</span>
            <span className="briefing-card-value">옥수수 · 매실 · 블루베리 · 복숭아 시즌 감시 준비</span>
          </article>
          <article className="briefing-card tone-cyan">
            <span className="briefing-card-title">OUTREACH</span>
            <span className="briefing-card-value">
              {payload?.outreachCount ?? 0} CANDIDATES
            </span>
          </article>
          <article className="briefing-card tone-green">
            <span className="briefing-card-title">WORKSPACE</span>
            <span className="briefing-card-value">
              {payload?.workspaceCount ?? 0} FILES
            </span>
          </article>
        </div>
      </section>
    </div>
  );
};

export default DataWallView;
