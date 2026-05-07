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

const DataWallView: React.FC = () => {
  const [payload, setPayload] = useState<WallPayload | null>(null);
  const [smartstoreSnapshot, setSmartstoreSnapshot] = useState<SmartstoreSnapshot | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'waiting'>('waiting');
  const [openingActive, setOpeningActive] = useState(false);
  const [systemArmed, setSystemArmed] = useState(false);
  const openingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // 1. 초기 로드 (localStorage)
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

    // 2. 실시간 수신 (BroadcastChannel)
    let channel: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(WALL_CHANNEL);
      channel.onmessage = (event) => {
        const data = event?.data;
        if (!data) return;

        setConnectionStatus('connected');

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
          }, 4200);
          return;
        }

        setPayload(data);

        const nextSmartstore = readJson<SmartstoreSnapshot>(SMARTSTORE_SNAPSHOT_KEY);
        if (nextSmartstore) setSmartstoreSnapshot(nextSmartstore);
      };
    }

    // 3. 주기적 localStorage 갱신
    const interval = setInterval(refreshFromStorage, 3000);

    return () => {
      if (channel) channel.close();
      clearInterval(interval);
      if (openingTimerRef.current) {
        window.clearTimeout(openingTimerRef.current);
      }
    };
  }, []);

  const getSceneLabel = (scene: string) => {
    const labels: Record<string, string> = {
      'standby': 'SYSTEM STANDBY',
      'briefing': 'DAILY BRIEFING',
      'orders': 'SMARTSTORE ORDERS',
      'market': 'MARKET INTELLIGENCE',
      'outreach': 'OUTREACH PROTOCOL',
      'files': 'FILE WORKSPACE'
    };
    return labels[scene] || scene.toUpperCase();
  };

  return (
    <div className="jarvis-data-wall">
      {/* Control Bar */}
      <section className="data-wall-control-bar">
        <div>
          <strong>JARVIS DATA WALL</strong>
          <span>이 창을 2번 모니터로 옮기고 FULLSCREEN을 누른 뒤, 1번 화면에서 DUAL ARM → 박수 또는 ACTIVATE로 시스템을 여세요.</span>
        </div>
        <div className="data-wall-control-actions">
          <button
            type="button"
            onClick={() => window.location.assign(window.location.pathname)}
          >
            MAIN CONTROL
          </button>
          <button
            type="button"
            onClick={() => {
              if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
              }
            }}
          >
            FULLSCREEN
          </button>
        </div>
      </section>

      {/* System Map */}
      <section className={`data-wall-system-map ${systemArmed ? 'is-armed' : ''} ${openingActive ? 'is-opening' : ''}`}>
        <div className="system-map-core">
          <span>JARVIS CORE</span>
          <strong>{openingActive ? 'ONLINE' : systemArmed ? 'ARMED' : 'STANDBY'}</strong>
        </div>

        <div className="system-map-node node-smartstore">
          <span>SMARTSTORE</span>
          <strong>{smartstoreSnapshot ? 'SYNCED' : 'WAITING'}</strong>
        </div>

        <div className="system-map-node node-market">
          <span>MARKET</span>
          <strong>READY</strong>
        </div>

        <div className="system-map-node node-outreach">
          <span>OUTREACH</span>
          <strong>{Number(payload?.outreachCount || 0)}</strong>
        </div>

        <div className="system-map-node node-files">
          <span>FILES</span>
          <strong>{Number(payload?.workspaceCount || 0)}</strong>
        </div>

        <div className="system-map-line line-a" />
        <div className="system-map-line line-b" />
        <div className="system-map-line line-c" />
        <div className="system-map-line line-d" />
      </section>

      {/* Hero */}
      <div className="data-wall-hero">
        <div>
          <p className="data-wall-kicker">COMMAND CENTER // DUAL SCREEN</p>
          <h1>MISSION CONTROL</h1>
          <p className="data-wall-subtitle">REAL-TIME DATA BROADCAST WALL v1.0</p>
        </div>
        <div className="data-wall-status">
          <span>CONNECTION STATUS</span>
          <strong>{connectionStatus === 'connected' ? 'LIVE SYNC' : 'WAITING FOR SIGNAL'}</strong>
          <em>{payload?.currentTime || '--:--:--'}</em>
        </div>
      </div>

      {/* Grid */}
      <div className="data-wall-grid">
        {/* 1. 메인 시스템 상태 */}
        <div className="data-wall-card data-wall-card-large">
          <div className="data-wall-card-head">
            <span>SYSTEM CORE</span>
            <strong>ACTIVE SCENE</strong>
          </div>
          <div className="data-wall-big-number">
            {payload ? getSceneLabel(payload.scene) : 'INITIALIZING...'}
          </div>
          <div className="data-wall-signal-line"></div>
          <div className="data-wall-note">
            현재 자비스 메인 화면의 활성 시나리오를 실시간으로 모니터링 중입니다.
            상태: {payload?.state?.toUpperCase() || 'UNKNOWN'}
          </div>
        </div>

        {/* 2. 스마트스토어 현황 */}
        <div className="data-wall-card">
          <div className="data-wall-card-head">
            <span>SMARTSTORE</span>
            <strong>ORDER SNAPSHOT</strong>
          </div>
          <div className="data-wall-metrics">
            <div>
              <span>NEW ORDERS</span>
              <strong>{smartstoreSnapshot?.newOrders ?? '--'}</strong>
            </div>
            <div>
              <span>PENDING</span>
              <strong>{smartstoreSnapshot?.pendingShipping ?? '--'}</strong>
            </div>
          </div>
          <p>
            {smartstoreSnapshot ? `최종 업데이트: ${new Date(smartstoreSnapshot.savedAt).toLocaleTimeString()}` : '데이터 수신 대기 중...'}
          </p>
        </div>

        {/* 3. 작업 현황 */}
        <div className="data-wall-card">
          <div className="data-wall-card-head">
            <span>WORKSPACE</span>
            <strong>ASSET COUNTER</strong>
          </div>
          <div className="data-wall-metrics">
            <div>
              <span>FILES</span>
              <strong>{payload?.workspaceCount ?? '--'}</strong>
            </div>
            <div>
              <span>CANDIDATES</span>
              <strong>{payload?.outreachCount ?? '--'}</strong>
            </div>
          </div>
          <p>
            현재 워크스페이스에 로드된 파일 및 인플루언서 후보 수입니다.
          </p>
        </div>

        {/* 4. 액션 로그 */}
        <div className="data-wall-card">
          <div className="data-wall-card-head">
            <span>ACTION LOG</span>
            <strong>LAST COMMAND</strong>
          </div>
          <div className="data-wall-big-number" style={{ fontSize: '32px', marginTop: '40px' }}>
            {payload?.actionType || 'NO ACTIVE TASK'}
          </div>
          <p>
            마지막으로 실행된 시스템 액션 타입입니다.
          </p>
        </div>

        {/* 5. 시스템 리소스 */}
        <div className="data-wall-card">
          <div className="data-wall-card-head">
            <span>RESOURCES</span>
            <strong>SYNC LATENCY</strong>
          </div>
          <div className="data-wall-big-number" style={{ fontSize: '48px', color: '#00F5FF' }}>
            {payload ? `${Math.max(0, Date.now() - payload.updatedAt)}ms` : '---'}
          </div>
          <p>
            메인 화면과 보조 화면 간의 데이터 동기화 지연 시간입니다.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DataWallView;
