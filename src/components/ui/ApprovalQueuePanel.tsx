import React from 'react';

/* ── UI-V3: Approval Queue Panel ──
   APPROVAL QUEUE — LOCKED 작업 대기열
   실제 실행 절대 금지 */

interface QueueItem {
  label: string;
  type: 'danger' | 'warning' | 'info';
  locked: boolean;
}

const QUEUE_ITEMS: QueueItem[] = [
  { label: '발주 확인', type: 'danger', locked: true },
  { label: '송장 입력', type: 'danger', locked: true },
  { label: '발송 처리', type: 'danger', locked: true },
  { label: 'CS 응답 발송', type: 'warning', locked: true },
  { label: '이메일 발송', type: 'warning', locked: true },
];

const typeColor: Record<string, string> = {
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#22d3ee',
};

export default function ApprovalQueuePanel() {
  return (
    <div className="scc-approval-queue">
      <div className="scc-panel-header">
        <span className="scc-panel-dot" style={{ background: '#ef4444' }} />
        <span className="scc-panel-title">APPROVAL QUEUE</span>
        <span className="scc-panel-badge scc-badge-locked">LOCKED</span>
      </div>
      <div className="scc-queue-list">
        {QUEUE_ITEMS.map((item, i) => (
          <div key={i} className={`scc-queue-row scc-queue-${item.type}`}>
            <span className="scc-queue-lock">🔒</span>
            <span className="scc-queue-label">{item.label}</span>
            <span className="scc-queue-status" style={{ color: typeColor[item.type] }}>
              승인 대기
            </span>
          </div>
        ))}
      </div>
      <div className="scc-queue-footer">
        <span className="scc-queue-note">execute LOCKED — 대표님 승인 전 실행 불가</span>
      </div>
    </div>
  );
}
