import React from 'react';

/* ── UI-V3: Approval Queue Panel ──
   APPROVAL QUEUE — LOCKED 작업 대기열
   실제 실행 절대 금지
   [초안 보기] [Dry-run] [잠금 유지] 버튼 표시 */

interface QueueItem {
  label: string;
  type: 'danger' | 'warning' | 'info';
}

const QUEUE_ITEMS: QueueItem[] = [
  { label: '발주 확인', type: 'danger' },
  { label: '송장 입력', type: 'danger' },
  { label: '발송 처리', type: 'danger' },
  { label: 'CS 응답 발송', type: 'warning' },
  { label: '이메일 발송', type: 'warning' },
];

const typeColor: Record<string, string> = {
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#22d3ee',
};

const typeBg: Record<string, string> = {
  danger: 'rgba(239,68,68,0.07)',
  warning: 'rgba(245,158,11,0.05)',
  info: 'rgba(34,211,238,0.05)',
};

export default function ApprovalQueuePanel() {
  return (
    <div className="scc-approval-queue">
      <div className="scc-panel-header">
        <span className="scc-panel-dot" style={{ background: '#ef4444', animation: 'scc-dot-pulse 1s ease-in-out infinite' }} />
        <span className="scc-panel-title">APPROVAL QUEUE</span>
        <span className="scc-panel-badge scc-badge-locked">LOCKED</span>
      </div>

      <div className="scc-queue-list">
        {QUEUE_ITEMS.map((item, i) => (
          <div
            key={i}
            className={`scc-queue-row scc-queue-${item.type}`}
            style={{ background: typeBg[item.type] }}
          >
            <span style={{ fontSize: 10, marginRight: 4 }}>🔒</span>
            <span className="scc-queue-label">{item.label}</span>
            <span className="scc-queue-status" style={{ color: typeColor[item.type], fontSize: 9 }}>
              승인 대기
            </span>
          </div>
        ))}
      </div>

      {/* 버튼 영역 — 실행 없음 */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button
          className="scc-queue-btn scc-btn-draft"
          onClick={() => {/* draft only — no execute */}}
          style={{
            flex: 1, padding: '5px 0', fontSize: 9, fontWeight: 700,
            letterSpacing: '0.8px', borderRadius: 4, cursor: 'default',
            background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)',
            color: '#22d3ee', textTransform: 'uppercase',
          }}
        >
          초안 보기
        </button>
        <button
          className="scc-queue-btn scc-btn-dryrun"
          onClick={() => {/* dry-run only — no execute */}}
          style={{
            flex: 1, padding: '5px 0', fontSize: 9, fontWeight: 700,
            letterSpacing: '0.8px', borderRadius: 4, cursor: 'default',
            background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)',
            color: '#a78bfa', textTransform: 'uppercase',
          }}
        >
          Dry-run
        </button>
        <button
          className="scc-queue-btn scc-btn-locked"
          style={{
            flex: 1, padding: '5px 0', fontSize: 9, fontWeight: 700,
            letterSpacing: '0.8px', borderRadius: 4, cursor: 'not-allowed',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444', textTransform: 'uppercase',
          }}
        >
          잠금 유지
        </button>
      </div>

      <div className="scc-queue-footer">
        <span className="scc-queue-note">execute LOCKED — 대표님 승인 전 실행 불가</span>
      </div>
    </div>
  );
}
