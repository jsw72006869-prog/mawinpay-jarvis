import React from 'react';

/* ── UI-V3: Order Flow Radar ──
   신규주문 → 배송준비 → 배송중 → 배송완료 → 구매확정
   레이더/운영 흐름/데이터 라인/pulse 느낌
   실제 수치 금지 */

interface FlowNode {
  label: string;
  status: 'standby' | 'active' | 'locked';
}

const FLOW_NODES: FlowNode[] = [
  { label: '신규 주문', status: 'standby' },
  { label: '배송 준비', status: 'standby' },
  { label: '배송 중', status: 'standby' },
  { label: '배송 완료', status: 'standby' },
  { label: '구매 확정', status: 'standby' },
];

export default function OrderFlowRadar() {
  return (
    <div className="scc-order-flow">
      <div className="scc-panel-header">
        <span className="scc-panel-dot" style={{ background: '#10b981' }} />
        <span className="scc-panel-title">ORDER FLOW RADAR</span>
        <span className="scc-panel-badge">STANDBY</span>
      </div>
      <div className="scc-flow-pipeline">
        {FLOW_NODES.map((node, i) => (
          <React.Fragment key={i}>
            <div className={`scc-flow-node scc-flow-${node.status}`}>
              <div className="scc-flow-dot" />
              <span className="scc-flow-label">{node.label}</span>
              <span className="scc-flow-value">조회 대기</span>
            </div>
            {i < FLOW_NODES.length - 1 && (
              <div className="scc-flow-connector">
                <div className="scc-flow-line" />
                <span className="scc-flow-arrow">›</span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="scc-flow-footer">
        <span className="scc-flow-hint">음성 또는 텍스트로 "주문 현황 보여줘"를 입력하면 실시간 조회됩니다</span>
      </div>
    </div>
  );
}
