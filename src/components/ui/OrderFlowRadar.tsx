import React, { useEffect, useState } from 'react';

/* ── UI-V3: Order Flow Radar ──
   신규주문 → 배송준비 → 배송중 → 배송완료 → 구매확정
   레이더/운영 흐름/데이터 라인/pulse 느낌
   실제 수치 금지 */

interface FlowNode {
  label: string;
  sub: string;
  color: string;
}

const FLOW_NODES: FlowNode[] = [
  { label: '신규 주문', sub: '조회 대기', color: '#22d3ee' },
  { label: '배송 준비', sub: '조회 대기', color: '#a78bfa' },
  { label: '배송 중', sub: '조회 대기', color: '#10b981' },
  { label: '배송 완료', sub: '조회 대기', color: '#6ee7b7' },
  { label: '구매 확정', sub: '조회 대기', color: '#f59e0b' },
];

interface Props {
  variant?: 'vertical' | 'horizontal';
}

export default function OrderFlowRadar({ variant = 'vertical' }: Props) {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPulse(p => (p + 1) % FLOW_NODES.length);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  if (variant === 'horizontal') {
    return (
      <div className="order-flow-strip">
        <div className="flow-strip-header">
          <span className="scc-panel-dot" style={{ background: '#10b981', animation: 'scc-dot-pulse 1.2s ease-in-out infinite' }} />
          ORDER FLOW RADAR
        </div>
        <div className="flow-strip-pipeline">
          {FLOW_NODES.map((node, i) => (
            <React.Fragment key={i}>
              <div className={`flow-strip-node ${i === pulse ? 'active' : ''}`}>
                <div className="node-dot" style={{ background: i === pulse ? node.color : 'rgba(255,255,255,0.15)' }} />
                <div className="node-text">
                  <span className="node-label" style={{ color: i === pulse ? node.color : 'rgba(255,255,255,0.5)' }}>{node.label}</span>
                  <span className="node-sub">{node.sub}</span>
                </div>
              </div>
              {i < FLOW_NODES.length - 1 && (
                <div className="flow-strip-connector">
                  <div className="connector-line" style={{
                    background: i < pulse
                      ? `linear-gradient(90deg, ${FLOW_NODES[i].color}, ${FLOW_NODES[i+1].color})`
                      : 'rgba(255,255,255,0.1)'
                  }} />
                  <span className="connector-arrow" style={{ color: i < pulse ? '#22d3ee' : 'rgba(255,255,255,0.2)' }}>›</span>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="scc-order-flow">
      <div className="scc-panel-header">
        <span className="scc-panel-dot" style={{ background: '#10b981', animation: 'scc-dot-pulse 1.2s ease-in-out infinite' }} />
        <span className="scc-panel-title">ORDER FLOW RADAR</span>
        <span className="scc-panel-badge" style={{ color: '#10b981', borderColor: 'rgba(16,185,129,0.4)' }}>STANDBY</span>
      </div>

      {/* 레이더 파이프라인 */}
      <div className="scc-flow-pipeline">
        {FLOW_NODES.map((node, i) => (
          <React.Fragment key={i}>
            <div
              className={`scc-flow-node ${i === pulse ? 'scc-flow-active' : 'scc-flow-standby'}`}
              style={{ '--node-color': node.color } as React.CSSProperties}
            >
              <div className="scc-flow-dot" style={{ background: i === pulse ? node.color : 'rgba(255,255,255,0.15)' }} />
              <span className="scc-flow-label" style={{ color: i === pulse ? node.color : 'rgba(255,255,255,0.5)' }}>
                {node.label}
              </span>
              <span className="scc-flow-value">{node.sub}</span>
            </div>
            {i < FLOW_NODES.length - 1 && (
              <div className="scc-flow-connector">
                <div className="scc-flow-line" style={{
                  background: i < pulse
                    ? `linear-gradient(90deg, ${FLOW_NODES[i].color}, ${FLOW_NODES[i+1].color})`
                    : 'rgba(255,255,255,0.1)'
                }} />
                <span className="scc-flow-arrow" style={{ color: i < pulse ? '#22d3ee' : 'rgba(255,255,255,0.2)' }}>›</span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* 레이더 스캔 라인 */}
      <div className="scc-radar-scan">
        <div className="scc-radar-scan-line" />
      </div>

      <div className="scc-flow-footer">
        <span className="scc-flow-hint">
          "주문 현황 보여줘" — 실시간 조회 대기 중
        </span>
      </div>
    </div>
  );
}
