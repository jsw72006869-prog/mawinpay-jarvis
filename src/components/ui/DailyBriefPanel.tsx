import React, { useEffect, useState } from 'react';

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
  { label: 'Approval Queue', value: 'LOCKED', status: 'locked' },
  { label: 'Keyword Radar', value: 'READY', status: 'ready' },
  { label: 'Growth Link', value: 'READY', status: 'ready' },
];

const statusColor: Record<string, string> = {
  standby: 'rgba(107,114,128,0.7)',
  ready: '#22d3ee',
  locked: '#ef4444',
  warning: '#f59e0b',
};

const statusBg: Record<string, string> = {
  standby: 'rgba(255,255,255,0.03)',
  ready: 'rgba(34,211,238,0.05)',
  locked: 'rgba(239,68,68,0.07)',
  warning: 'rgba(245,158,11,0.05)',
};

export default function DailyBriefPanel() {
  const [scanLine, setScanLine] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setScanLine(l => (l + 1) % BRIEF_ITEMS.length);
    }, 800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="scc-daily-brief">
      <div className="scc-panel-header">
        <span className="scc-panel-dot" style={{ background: '#22d3ee' }} />
        <span className="scc-panel-title">TODAY'S COMMAND BRIEF</span>
        <span className="scc-panel-badge scc-badge-ready">LIVE</span>
      </div>
      <div className="scc-brief-list">
        {BRIEF_ITEMS.map((item, i) => (
          <div
            key={i}
            className="scc-brief-row"
            style={{
              background: i === scanLine ? statusBg[item.status] : 'transparent',
              borderLeft: i === scanLine ? `2px solid ${statusColor[item.status]}` : '2px solid transparent',
              transition: 'all 0.3s ease',
              paddingLeft: 8,
            }}
          >
            <span className="scc-brief-label">{item.label}</span>
            <span className="scc-brief-value" style={{ color: statusColor[item.status] }}>
              {item.status === 'locked' && (
                <span style={{ marginRight: 4, fontSize: 10 }}>🔒</span>
              )}
              {item.value}
            </span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.8px', fontFamily: 'monospace' }}>
          LAST SYNC: 조회 전 — "오늘 브리핑 해줘"
        </span>
      </div>
    </div>
  );
}
