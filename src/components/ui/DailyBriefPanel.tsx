import React from 'react';

/* ── UI-V3: Daily Brief Panel ──
   TODAY'S COMMAND BRIEF — 조회 대기 상태만 표시
   실제 수치 금지, 가짜 데이터 금지 */

interface BriefItem {
  label: string;
  value: string;
  status: 'standby' | 'ready' | 'locked' | 'warning';
}

const BRIEF_ITEMS: BriefItem[] = [
  { label: '신규 주문', value: '조회 대기', status: 'standby' },
  { label: '배송 준비', value: '조회 대기', status: 'standby' },
  { label: '구매 확정', value: '조회 대기', status: 'standby' },
  { label: 'CS 위험', value: 'LOW', status: 'ready' },
  { label: 'Approval Queue', value: '2 LOCKED', status: 'locked' },
  { label: 'Keyword Radar', value: 'READY', status: 'ready' },
  { label: 'Growth Link', value: 'READY', status: 'ready' },
];

const statusColor: Record<string, string> = {
  standby: '#6b7280',
  ready: '#22d3ee',
  locked: '#ef4444',
  warning: '#f59e0b',
};

export default function DailyBriefPanel() {
  return (
    <div className="scc-daily-brief">
      <div className="scc-panel-header">
        <span className="scc-panel-dot" style={{ background: '#22d3ee' }} />
        <span className="scc-panel-title">TODAY'S COMMAND BRIEF</span>
      </div>
      <div className="scc-brief-list">
        {BRIEF_ITEMS.map((item, i) => (
          <div key={i} className="scc-brief-row">
            <span className="scc-brief-label">{item.label}</span>
            <span className="scc-brief-value" style={{ color: statusColor[item.status] }}>
              {item.status === 'locked' && <span className="scc-lock-icon">🔒</span>}
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
