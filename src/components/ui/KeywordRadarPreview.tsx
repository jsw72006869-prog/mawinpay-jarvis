import React from 'react';

/* ── UI-V3: Keyword Radar Preview ──
   KEYWORD RADAR — 준비 상태만 표시
   실제 순위 표시 금지 */

interface RadarItem {
  label: string;
  status: string;
}

const RADAR_ITEMS: RadarItem[] = [
  { label: '상품 링크 분석', status: '준비' },
  { label: '상품명 추출', status: '준비' },
  { label: '핵심 키워드 추출', status: '준비' },
  { label: '순위 추적', status: '대기' },
  { label: '전일 비교', status: '대기' },
  { label: 'SEO-K.1', status: '예정' },
];

export default function KeywordRadarPreview() {
  return (
    <div className="scc-keyword-radar">
      <div className="scc-panel-header">
        <span className="scc-panel-dot" style={{ background: '#a78bfa' }} />
        <span className="scc-panel-title">KEYWORD RADAR</span>
        <span className="scc-panel-badge scc-badge-ready">READY</span>
      </div>
      <div className="scc-radar-list">
        {RADAR_ITEMS.map((item, i) => (
          <div key={i} className="scc-radar-row">
            <span className="scc-radar-indicator" data-status={item.status} />
            <span className="scc-radar-label">{item.label}</span>
            <span className={`scc-radar-status scc-status-${item.status === '준비' ? 'ready' : item.status === '대기' ? 'standby' : 'planned'}`}>
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
