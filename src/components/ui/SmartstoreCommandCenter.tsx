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
   실제 실행 금지, Preview only */

interface Props {
  visible: boolean;
}

export default function SmartstoreCommandCenter({ visible }: Props) {
  if (!visible) return null;

  return (
    <div className={`scc-root ${visible ? 'scc-visible' : ''}`}>
      {/* 상단 Mission Status Strip */}
      <MissionStatusStrip />

      {/* 메인 운영실 그리드 */}
      <div className="scc-grid">
        {/* 좌측 열: Daily Brief + CS Risk */}
        <div className="scc-col scc-col-left">
          <DailyBriefPanel />
          <CsRiskPanel />
        </div>

        {/* 중앙 열: Order Flow + Keyword Radar */}
        <div className="scc-col scc-col-center">
          <OrderFlowRadar />
          <KeywordRadarPreview />
        </div>

        {/* 우측 열: Growth Link + Approval Queue */}
        <div className="scc-col scc-col-right">
          <GrowthLinkPreview />
          <ApprovalQueuePanel />
        </div>
      </div>
    </div>
  );
}
