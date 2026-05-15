import React from 'react';
import DailyBriefPanel from './DailyBriefPanel';
import OrderFlowRadar from './OrderFlowRadar';
import KeywordRadarPreview from './KeywordRadarPreview';
import GrowthLinkPreview from './GrowthLinkPreview';
import CsRiskPanel from './CsRiskPanel';
import ApprovalQueuePanel from './ApprovalQueuePanel';
import MissionStatusStrip from './MissionStatusStrip';

/* ── UI-V3: Smartstore Command Center ──
   스마트스토어 운영실 메인 HUD
   smartstore_brief scene에서만 표시
   실제 실행 금지, Preview only
   3D perspective + 깊이감 레이아웃 */

interface Props {
  visible: boolean;
}

export default function SmartstoreCommandCenter({ visible }: Props) {
  if (!visible) return null;

  return (
    <div
      className={`scc-root ${visible ? 'scc-visible' : ''}`}
      style={{ perspective: '1800px', transformStyle: 'preserve-3d' }}
    >
      {/* 배경 그리드 오버레이 */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(rgba(34,211,238,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(34,211,238,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* 상단 Mission Status Strip */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <MissionStatusStrip />
      </div>

      {/* 운영실 타이틀 */}
      <div style={{
        textAlign: 'center',
        marginBottom: 10,
        position: 'relative',
        zIndex: 1,
      }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '3px',
          color: 'rgba(34,211,238,0.5)',
          textTransform: 'uppercase',
          fontFamily: 'monospace',
        }}>
          ── SMARTSTORE OPERATIONS CENTER ──
        </span>
      </div>

      {/* 메인 운영실 그리드 — 3열 */}
      <div
        className="scc-grid"
        style={{ position: 'relative', zIndex: 1 }}
      >
        {/* 좌측 열: Daily Brief + CS Risk */}
        <div className="scc-col scc-col-left">
          <DailyBriefPanel />
          <CsRiskPanel />
        </div>

        {/* 중앙 열: Order Flow + Keyword Radar — 살짝 앞으로 */}
        <div
          className="scc-col scc-col-center"
          style={{ transform: 'translateZ(8px)' }}
        >
          <OrderFlowRadar />
          <KeywordRadarPreview />
        </div>

        {/* 우측 열: Growth Link + Approval Queue */}
        <div className="scc-col scc-col-right">
          <GrowthLinkPreview />
          <ApprovalQueuePanel />
        </div>
      </div>

      {/* 하단 상태 라인 */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        marginTop: 10,
        textAlign: 'center',
        display: 'flex',
        justifyContent: 'center',
        gap: 24,
      }}>
        {['OBSERVE MODE', 'EXECUTE LOCKED', 'APPROVAL GATE ACTIVE'].map((label, i) => (
          <span key={i} style={{
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '1.5px',
            color: i === 1 ? '#ef4444' : 'rgba(255,255,255,0.2)',
            textTransform: 'uppercase',
            fontFamily: 'monospace',
          }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
