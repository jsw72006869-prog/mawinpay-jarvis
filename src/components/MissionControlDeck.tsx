import React from 'react';

type MissionControlDeckProps = {
  state?: string;
  currentTime?: string;
  workspaceCount?: number;
  outreachCount?: number;
  actionType?: string;
};

const STATE_LABELS: Record<string, string> = {
  idle: 'STANDBY',
  listening: 'LISTENING',
  thinking: 'THINKING',
  speaking: 'SPEAKING',
  working: 'WORKING',
  success: 'MISSION COMPLETE',
  error: 'ATTENTION REQUIRED',
  approval_required: 'APPROVAL REQUIRED',
};

export default function MissionControlDeck({
  state = 'idle',
  currentTime = '--:--',
  workspaceCount = 0,
  outreachCount = 0,
  actionType,
}: MissionControlDeckProps) {
  const safeState = STATE_LABELS[state] ? state : 'idle';
  const stateLabel = STATE_LABELS[safeState] || 'STANDBY';
  const approvalLabel = actionType ? actionType.toUpperCase() : 'EXECUTE LOCKED';

  return (
    <div
      className={`ui-e-mission-deck ui-e-motion-v1 ui-e-state-${safeState}`}
      aria-hidden="true"
    >
      <div className="ui-e-camera-vignette" />
      <div className="ui-e-depth-wash" />

      <div className="ui-e-core-focus">
        <div className="ui-e-core-halo ui-e-core-halo-one" />
        <div className="ui-e-core-halo ui-e-core-halo-two" />
        <div className="ui-e-core-halo ui-e-core-halo-three" />
        <div className="ui-e-core-scan" />
      </div>

      <div className="ui-e-motion-orbit ui-e-motion-orbit-a" />
      <div className="ui-e-motion-orbit ui-e-motion-orbit-b" />
      <div className="ui-e-motion-orbit ui-e-motion-orbit-c" />

      <div className="ui-e-flow-line ui-e-flow-line-a" />
      <div className="ui-e-flow-line ui-e-flow-line-b" />
      <div className="ui-e-flow-line ui-e-flow-line-c" />
      <div className="ui-e-flow-line ui-e-flow-line-d" />

      <section className="ui-e-intel-dock">
        <div className="ui-e-intel-chip">
          <span>MARKET</span>
          <strong>KAMIS READY</strong>
        </div>
        <div className="ui-e-intel-chip">
          <span>WEATHER</span>
          <strong>NEXT SOURCE</strong>
        </div>
        <div className="ui-e-intel-chip">
          <span>GLOBAL</span>
          <strong>ROADMAP</strong>
        </div>
        <div className="ui-e-intel-chip">
          <span>OUTREACH</span>
          <strong>{outreachCount} CANDIDATES</strong>
        </div>
        <div className="ui-e-intel-chip">
          <span>FILES</span>
          <strong>{workspaceCount} SAVED</strong>
        </div>
      </section>

      <section className="ui-e-bottom-ribbon ui-e-motion-ribbon">
        <span className="ui-e-ribbon-pill">JARVIS STATE: {stateLabel}</span>
        <span className="ui-e-ribbon-pill">TIME: {currentTime}</span>
        <span className="ui-e-ribbon-pill">APPROVAL: {approvalLabel}</span>
        <span className="ui-e-ribbon-pill">UI-E MOTION V1</span>
      </section>

      <div className="ui-e-axis-line ui-e-motion-axis">
        X-AXIS // Y-AXIS // Z-AXIS // CAMERA SYNC
      </div>
    </div>
  );
}
