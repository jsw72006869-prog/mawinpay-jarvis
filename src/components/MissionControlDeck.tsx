import React from 'react';

type JarvisScene =
  | 'home'
  | 'standby'
  | 'briefing'
  | 'orders'
  | 'market'
  | 'outreach'
  | 'files'
  | 'approval'
  | 'voice'
  | 'error'
  | 'copy_research'
  | 'smartstore_brief'
  | 'keyword_radar'
  | 'growth_link'
  | 'cs_copilot'
  | 'approval_gate';

type MissionControlDeckProps = {
  state?: string;
  scene?: JarvisScene;
  currentTime?: string;
  workspaceCount?: number;
  outreachCount?: number;
  actionType?: string;
  isResearching?: boolean;
  researchEngines?: string[];
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

const SCENE_LABELS: Record<JarvisScene, string> = {
  home: 'MISSION CONTROL',
  standby: 'MISSION CONTROL',
  briefing: 'DAILY BRIEFING',
  orders: 'SMARTSTORE ORDERS',
  market: 'MARKET INTEL',
  outreach: 'OUTREACH RADAR',
  files: 'WORKSPACE FILES',
  approval: 'APPROVAL GATE',
  voice: 'VOICE LINK',
  error: 'SYSTEM ALERT',
  copy_research: 'COPY RESEARCH LAB',
  smartstore_brief: 'SMARTSTORE BRIEF',
  keyword_radar: 'KEYWORD RADAR',
  growth_link: 'GROWTH LINK',
  cs_copilot: 'CS COPILOT',
  approval_gate: 'APPROVAL GATE',
};

const ENGINE_LABELS: Record<string, string> = {
  youtube: 'YT',
  market: 'MKT',
  review: 'REV',
  social: 'SOC',
};

export default function MissionControlDeck({
  state = 'idle',
  scene = 'standby',
  currentTime = '--:--',
  workspaceCount = 0,
  outreachCount = 0,
  actionType,
  isResearching = false,
  researchEngines = [],
}: MissionControlDeckProps) {
  const safeState = STATE_LABELS[state] ? state : 'idle';
  const stateLabel = STATE_LABELS[safeState] || 'STANDBY';
  const sceneLabel = SCENE_LABELS[scene] || 'MISSION CONTROL';
  const approvalLabel = actionType ? actionType.toUpperCase() : 'EXECUTE LOCKED';

  // Scene별 Reveal 카드 렌더링 함수
  const renderRevealScene = () => {
    if (scene === 'standby' || scene === 'home') return null;

    const cards: Record<JarvisScene, { main: string; left: string; right: string }> = {
      briefing: {
        main: 'MORNING PROTOCOL',
        left: 'SMARTSTORE SYNC',
        right: 'GMAIL/DRIVE SCAN',
      },
      orders: {
        main: 'ORDER STATUS',
        left: 'PRODUCT ORDER ID',
        right: 'NEXT ACTION',
      },
      market: {
        main: 'KAMIS MARKET',
        left: 'PRICE TREND',
        right: 'DISTRIBUTION',
      },
      outreach: {
        main: 'OUTREACH RADAR',
        left: 'INFLUENCER SCAN',
        right: 'EMAIL VALIDATE',
      },
      files: {
        main: 'WORKSPACE FILES',
        left: 'DOCS / SHEETS',
        right: 'RECENT ASSETS',
      },
      approval: {
        main: 'APPROVAL GATE',
        left: 'SECURITY CHECK',
        right: 'EXECUTE PERMIT',
      },
      voice: {
        main: 'VOICE LINK',
        left: 'NEURAL NET',
        right: 'AUDIO SYNC',
      },
      error: {
        main: 'SYSTEM ALERT',
        left: 'DIAGNOSTICS',
        right: 'RECOVERY',
      },
      home: { main: '', left: '', right: '' },
      standby: { main: '', left: '', right: '' },
      copy_research: {
        main: 'COPY RESEARCH LAB',
        left: 'VIRAL ANALYSIS',
        right: 'CONTENT ENGINE',
      },
      smartstore_brief: {
        main: 'SMARTSTORE BRIEF',
        left: 'ORDER PIPELINE',
        right: 'DAILY METRICS',
      },
      keyword_radar: {
        main: 'KEYWORD RADAR',
        left: 'RANK TRACKING',
        right: 'SEARCH VOLUME',
      },
      growth_link: {
        main: 'GROWTH LINK',
        left: 'DEEP LINK GEN',
        right: 'CHROME OPTIMIZE',
      },
      cs_copilot: {
        main: 'CS COPILOT',
        left: 'INQUIRY QUEUE',
        right: 'AUTO RESPONSE',
      },
      approval_gate: {
        main: 'APPROVAL GATE',
        left: 'SECURITY CHECK',
        right: 'EXECUTE PERMIT',
      },
    };

    const currentCards = cards[scene];
    if (!currentCards) return null;

    return (
      <div className="ui-e-central-reveal">
        <div className="ui-e-reveal-bloom" />
        <div className="ui-e-reveal-card card-main">
          <span className="ui-e-card-scan" />
          <em>ANALYZING...</em>
          <strong>{currentCards.main}</strong>
        </div>
        <div className="ui-e-reveal-card card-left">
          <span className="ui-e-card-scan" />
          <em>SYNCING...</em>
          <strong>{currentCards.left}</strong>
        </div>
        <div className="ui-e-reveal-card card-right">
          <span className="ui-e-card-scan" />
          <em>SCANNING...</em>
          <strong>{currentCards.right}</strong>
        </div>
      </div>
    );
  };

  // Research Orbit 링 렌더링 (isResearching=true 일 때)
  const renderResearchOrbit = () => {
    if (!isResearching) return null;
    const engines = researchEngines.length > 0 ? researchEngines : ['youtube', 'market'];
    return (
      <div className="ui-e-research-orbit" aria-hidden="true">
        {/* 외부 orbit 링 */}
        <span className="ui-e-orbit-ring orbit-outer" />
        <span className="ui-e-orbit-ring orbit-mid" />
        <span className="ui-e-orbit-ring orbit-inner" />
        {/* 엔진 노드 */}
        {engines.map((eng, i) => (
          <span
            key={eng}
            className={`ui-e-orbit-node node-${eng}`}
            style={{ '--orbit-idx': i, '--orbit-total': engines.length } as React.CSSProperties}
          >
            {ENGINE_LABELS[eng] || eng.toUpperCase().slice(0, 3)}
          </span>
        ))}
        {/* 스캔 펄스 */}
        <span className="ui-e-orbit-pulse" />
        <div className="ui-e-orbit-label">RESEARCH ACTIVE</div>
      </div>
    );
  };

  return (
    <div
      className={`ui-e-mission-deck ui-e-cinema-v2 ui-e-state-${safeState} ui-e-scene-${scene} ui-e-central-reveal-v1${isResearching ? ' ui-e-researching' : ''}`}
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

          {/* Research Orbit — isResearching 시 표시 */}
          {renderResearchOrbit()}

          {/* 중앙 Reveal Scene 삽입 */}
          {renderRevealScene()}
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
        <em>{sceneLabel}</em>
        <span>{stateLabel}</span>
        <strong>{approvalLabel}</strong>
      </div>

      <section className="ui-e-bottom-ribbon ui-e-cinema-ribbon">
        <span className="ui-e-ribbon-pill">JARVIS STATE: {stateLabel}</span>
        <span className="ui-e-ribbon-pill">TIME: {currentTime}</span>
        <span className="ui-e-ribbon-pill">CAMERA: CINEMATIC V2</span>
        {isResearching && (
          <span className="ui-e-ribbon-pill ui-e-ribbon-research">
            RESEARCH: {researchEngines.join('+').toUpperCase() || 'ACTIVE'}
          </span>
        )}
      </section>

      <div className="ui-e-axis-line ui-e-cinema-axis">
        X-AXIS // Y-AXIS // Z-AXIS // CAMERA DEPTH LOCKED
      </div>
    </div>
  );
}
