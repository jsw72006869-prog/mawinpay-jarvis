import React, { useState, useEffect } from 'react';

interface WallPayload {
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

const DataWallView: React.FC = () => {
  const [payload, setPayload] = useState<WallPayload | null>(null);
  const [snapshot, setSnapshot] = useState<SmartstoreSnapshot | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'waiting'>('waiting');

  useEffect(() => {
    // 1. 초기 로드 (localStorage)
    const loadInitial = () => {
      try {
        const p = localStorage.getItem('jarvis.dualWall.latest');
        if (p) setPayload(JSON.parse(p));
        
        const s = localStorage.getItem('jarvis.smartstore.lastStatusSnapshot');
        if (s) setSnapshot(JSON.parse(s));
      } catch (e) {
        console.error('DataWall 초기 로드 실패:', e);
      }
    };
    loadInitial();

    // 2. 실시간 수신 (BroadcastChannel)
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('jarvis-dual-command-wall');
      channel.onmessage = (event) => {
        setPayload(event.data);
        setConnectionStatus('connected');
        
        // 스마트스토어 스냅샷도 갱신 시도
        const s = localStorage.getItem('jarvis.smartstore.lastStatusSnapshot');
        if (s) setSnapshot(JSON.parse(s));
      };
      return () => channel.close();
    }
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
              <strong>{snapshot?.newOrders ?? '--'}</strong>
            </div>
            <div>
              <span>PENDING</span>
              <strong>{snapshot?.pendingShipping ?? '--'}</strong>
            </div>
          </div>
          <p>
            {snapshot ? `최종 업데이트: ${new Date(snapshot.savedAt).toLocaleTimeString()}` : '데이터 수신 대기 중...'}
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
