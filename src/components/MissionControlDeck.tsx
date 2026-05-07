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
  working: 'EXECUTING',
  speaking: 'RESPONDING',
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
      className={`ui-e-mission-deck ui-e-cinema-v2 ui-e-state-${safeState}`}
      aria-hidden="true"
    >
      <div className="ui-e-film-bars">
        <div className="ui-e-film-bar ui-e-film-bar-top" />
        <div className="ui-e-film-bar ui-e-film-bar-bottom" />
      </div>

      <div className="ui-e-cinema-camera">
        <div className="ui-e-cinema-vignette" />
        <div className="ui-e-cinema-depth-wash" />
        <div className="ui-e-cinema-lens-flare" />

        <div className="ui-e-cinema-tunnel">
          <span className="ui-e-tunnel-ring ring-1" />
          <span className="ui-e-tunnel-ring ring-2" />
          <span className="ui-e-tunnel-ring ring-3" />
          <span className="ui-e-tunnel-ring ring-4" />
          <span className="ui-e-tunnel-ring ring-5" />
        </div>

        <div className="ui-e-cinema-core">
          <span className="ui-e-cinema-core-glow" />
          <span className="ui-e-cinema-core-ring ring-a" />
          <span className="ui-e-cinema-core-ring ring-b" />
          <span className="ui-e-cinema-core-ring ring-c" />
          <span className="ui-e-cinema-scan-beam" />
        </div>

        <div className="ui-e-cinema-rail rail-a" />
        <div className="ui-e-cinema-rail rail-b" />
        <div className="ui-e-cinema-rail rail-c" />
        <div className="ui-e-cinema-rail rail-d" />

        <div className="ui-e-cinema-marker marker-orders">
          <span>ORDERS</span>
          <strong>LIVE</strong>
        </div>
        <div className="ui-e-cinema-marker marker-outreach">
          <span>OUTREACH</span>
          <strong>{outreachCount}</strong>
        </div>
        <div className="ui-e-cinema-marker marker-files">
          <span>FILES</span>
          <strong>{workspaceCount}</strong>
        </div>
      </div>

      <div className="ui-e-cinema-scene-label">
        <span>{stateLabel}</span>
        <strong>{approvalLabel}</strong>
      </div>

      <section className="ui-e-bottom-ribbon ui-e-cinema-ribbon">
        <span className="ui-e-ribbon-pill">JARVIS STATE: {stateLabel}</span>
        <span className="ui-e-ribbon-pill">TIME: {currentTime}</span>
        <span className="ui-e-ribbon-pill">CAMERA: CINEMATIC V2</span>
      </section>

      <div className="ui-e-axis-line ui-e-cinema-axis">
        X-AXIS // Y-AXIS // Z-AXIS // CAMERA DEPTH LOCKED
      </div>
    </div>
  );
}
