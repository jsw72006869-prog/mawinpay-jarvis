import React, { useEffect, useState } from 'react';

/* ── UI-V3: Daily Brief Panel ──
   TODAY'S COMMAND BRIEF — 실제 주문 데이터 표시
   orderData prop이 있으면 실제 수치 표시, 없으면 조회 대기 */

interface OrderData {
  newOrders?: number;
  pendingShipping?: number;
  purchaseConfirmed?: number;
  fetchedAt?: string | null;
}

interface Props {
  orderData?: OrderData | null;
  variant?: 'vertical' | 'horizontal';
}

const statusColor: Record<string, string> = {
  standby: 'rgba(107,114,128,0.7)',
  ready: '#22d3ee',
  locked: '#ef4444',
  warning: '#f59e0b',
  active: '#00ff88',
};

const statusBg: Record<string, string> = {
  standby: 'rgba(255,255,255,0.03)',
  ready: 'rgba(34,211,238,0.05)',
  locked: 'rgba(239,68,68,0.07)',
  warning: 'rgba(245,158,11,0.05)',
  active: 'rgba(0,255,136,0.05)',
};

export default function DailyBriefPanel({ orderData, variant = 'vertical' }: Props) {
  const [scanLine, setScanLine] = useState(0);

  const hasData = orderData != null;

  const briefItems = [
    {
      label: '신규 주문',
      value: hasData ? `${orderData!.newOrders ?? 0}건` : '조회 대기',
      status: hasData ? 'active' : 'standby',
    },
    {
      label: '배송 준비',
      value: hasData ? `${orderData!.pendingShipping ?? 0}건` : '조회 대기',
      status: hasData ? ((orderData!.pendingShipping ?? 0) > 0 ? 'warning' : 'active') : 'standby',
    },
    {
      label: '구매 확정',
      value: hasData ? `${orderData!.purchaseConfirmed ?? 0}건` : '조회 대기',
      status: hasData ? 'ready' : 'standby',
    },
    { label: 'CS 위험', value: 'LOW', status: 'ready' },
    { label: 'Approval Queue', value: 'LOCKED', status: 'locked' },
    { label: 'Keyword Radar', value: 'READY', status: 'ready' },
    { label: 'Growth Link', value: 'READY', status: 'ready' },
  ];

  useEffect(() => {
    const id = setInterval(() => {
      setScanLine(l => (l + 1) % briefItems.length);
    }, 800);
    return () => clearInterval(id);
  }, [briefItems.length]);

  // fetchedAt 포맷
  const lastSync = hasData && orderData!.fetchedAt
    ? (() => {
        try {
          const d = new Date(orderData!.fetchedAt!);
          return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')} 기준`;
        } catch { return '방금 조회'; }
      })()
    : '조회 전 — "오늘 브리핑 해줘"';

  if (variant === 'horizontal') {
    return (
      <div className="compact-brief-strip">
        <div className="brief-strip-label">
          <span className="scc-panel-dot" style={{ background: '#22d3ee' }} />
          COMMAND BRIEF
        </div>
        <div className="brief-strip-items">
          {briefItems.map((item, i) => (
            <div key={i} className="brief-strip-item">
              <span className="item-label">{item.label}</span>
              <span className="item-value" style={{ color: statusColor[item.status] }}>
                {item.status === 'locked' && <span style={{ marginRight: 2 }}>🔒</span>}
                {item.value}
              </span>
            </div>
          ))}
        </div>
        <div className="brief-strip-sync">
          SYNC: {lastSync}
        </div>
      </div>
    );
  }

  return (
    <div className="scc-daily-brief">
      <div className="scc-panel-header">
        <span className="scc-panel-dot" style={{ background: '#22d3ee' }} />
        <span className="scc-panel-title">TODAY'S COMMAND BRIEF</span>
        <span className="scc-panel-badge scc-badge-ready">LIVE</span>
      </div>
      <div className="scc-brief-list">
        {briefItems.map((item, i) => (
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
        <span style={{ fontSize: 9, color: hasData ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.25)', letterSpacing: '0.8px', fontFamily: 'monospace' }}>
          LAST SYNC: {lastSync}
        </span>
      </div>
    </div>
  );
}
