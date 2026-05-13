import React from 'react';

/* ── UI-V3: Mission Status Strip ──
   상단 미션 상태 바 — 현재 운영 상태 요약
   실제 수치 금지 */

interface StatusItem {
  label: string;
  value: string;
  color: string;
}

const STATUS_ITEMS: StatusItem[] = [
  { label: 'ROUTER', value: 'ACTIVE_READONLY', color: '#22d3ee' },
  { label: 'EXECUTE', value: 'LOCKED', color: '#ef4444' },
  { label: 'SCENE', value: 'SMARTSTORE', color: '#10b981' },
  { label: 'RISK', value: 'LOW', color: '#10b981' },
  { label: 'SYSTEMS', value: '7 ONLINE', color: '#22d3ee' },
];

export default function MissionStatusStrip() {
  return (
    <div className="scc-mission-strip">
      {STATUS_ITEMS.map((item, i) => (
        <div key={i} className="scc-strip-item">
          <span className="scc-strip-label">{item.label}</span>
          <span className="scc-strip-value" style={{ color: item.color }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
