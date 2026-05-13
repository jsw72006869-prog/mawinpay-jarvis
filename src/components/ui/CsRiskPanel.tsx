import React from 'react';

/* ── UI-V3: CS Risk Panel ──
   CS RISK BRIEF — 위험도 LOW 기본값
   랜덤 생성 금지, 실제 발송 금지 */

interface CsItem {
  label: string;
  status: 'ready' | 'locked' | 'standby';
}

const CS_ITEMS: CsItem[] = [
  { label: '문의 유형 분석', status: 'ready' },
  { label: '리뷰 답글 준비', status: 'ready' },
  { label: '응답 승인 필요', status: 'standby' },
  { label: '발송', status: 'locked' },
];

export default function CsRiskPanel() {
  return (
    <div className="scc-cs-risk">
      <div className="scc-panel-header">
        <span className="scc-panel-dot" style={{ background: '#f59e0b' }} />
        <span className="scc-panel-title">CS RISK BRIEF</span>
        <span className="scc-panel-badge scc-badge-low">LOW</span>
      </div>
      <div className="scc-cs-list">
        {CS_ITEMS.map((item, i) => (
          <div key={i} className={`scc-cs-row scc-cs-${item.status}`}>
            <span className="scc-cs-indicator" data-status={item.status} />
            <span className="scc-cs-label">{item.label}</span>
            <span className={`scc-cs-status scc-status-${item.status}`}>
              {item.status === 'locked' ? '🔒 LOCKED' : item.status === 'ready' ? '준비' : '대기'}
            </span>
          </div>
        ))}
      </div>
      <div className="scc-cs-footer">
        <span className="scc-cs-risk-level">위험도: <strong style={{ color: '#10b981' }}>LOW</strong></span>
      </div>
    </div>
  );
}
