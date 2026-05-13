import React from 'react';

/* ── UI-V3: Growth Link Preview ──
   ADAPTIVE LINK COMMANDER — 링크 지휘 시스템
   실제 링크 생성 금지 */

interface LinkLayer {
  label: string;
  description: string;
  status: 'ready' | 'standby';
}

const LINK_LAYERS: LinkLayer[] = [
  { label: 'Chrome Optimize', description: '크롬 인앱 브라우저 최적화', status: 'ready' },
  { label: 'Fallback Route', description: '비지원 환경 대체 경로', status: 'ready' },
  { label: 'returnTo', description: '돌아오기 경로 설정', status: 'ready' },
  { label: 'UTM Layer', description: 'UTM 파라미터 자동 생성', status: 'ready' },
  { label: 'In-App Escape', description: '인앱 브라우저 탈출 로직', status: 'standby' },
];

export default function GrowthLinkPreview() {
  return (
    <div className="scc-growth-link">
      <div className="scc-panel-header">
        <span className="scc-panel-dot" style={{ background: '#06b6d4' }} />
        <span className="scc-panel-title">ADAPTIVE LINK COMMANDER</span>
        <span className="scc-panel-badge scc-badge-ready">READY</span>
      </div>
      <div className="scc-link-layers">
        {LINK_LAYERS.map((layer, i) => (
          <div key={i} className={`scc-link-row scc-link-${layer.status}`}>
            <div className="scc-link-icon">
              <div className={`scc-link-pulse scc-pulse-${layer.status}`} />
            </div>
            <div className="scc-link-info">
              <span className="scc-link-label">{layer.label}</span>
              <span className="scc-link-desc">{layer.description}</span>
            </div>
            <span className={`scc-link-status scc-status-${layer.status}`}>
              {layer.status === 'ready' ? 'READY' : 'STANDBY'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
