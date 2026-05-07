import React from 'react';

const MissionControlDeck: React.FC = () => {
  return (
    <div className="ui-e-mission-deck">
      {/* Left Stack: Intelligence & Intel */}
      <div className="ui-e-left-stack">
        <div className="ui-e-card">
          <div className="ui-e-card-header">
            <span className="ui-e-card-title">WEATHER INTEL</span>
            <span className="ui-e-card-status">NEXT DATA SOURCE</span>
          </div>
          <div className="ui-e-card-body">
            <div className="ui-e-intel-row">
              <span className="ui-e-label">LOCATION</span>
              <span className="ui-e-value">SEOUL, KR</span>
            </div>
            <div className="ui-e-intel-row">
              <span className="ui-e-label">STATUS</span>
              <span className="ui-e-value">PENDING SYNC</span>
            </div>
          </div>
          <div className="ui-e-card-footer">
            <div className="ui-e-scan-line"></div>
          </div>
        </div>

        <div className="ui-e-card">
          <div className="ui-e-card-header">
            <span className="ui-e-card-title">GLOBAL INTEL</span>
            <span className="ui-e-card-status">ROADMAP</span>
          </div>
          <div className="ui-e-card-body">
            <div className="ui-e-intel-row">
              <span className="ui-e-label">MARKET</span>
              <span className="ui-e-value">NASDAQ / KRW</span>
            </div>
            <div className="ui-e-intel-row">
              <span className="ui-e-label">TREND</span>
              <span className="ui-e-value">ANALYZING...</span>
            </div>
          </div>
          <div className="ui-e-card-footer">
            <div className="ui-e-scan-line"></div>
          </div>
        </div>
      </div>

      {/* Right Stack: System & Operator */}
      <div className="ui-e-right-stack">
        <div className="ui-e-card">
          <div className="ui-e-card-header">
            <span className="ui-e-card-title">OPERATOR LAYER</span>
            <span className="ui-e-card-status active">READY</span>
          </div>
          <div className="ui-e-card-body">
            <div className="ui-e-intel-row">
              <span className="ui-e-label">MODE</span>
              <span className="ui-e-value">ACTIVE_READONLY</span>
            </div>
            <div className="ui-e-intel-row">
              <span className="ui-e-label">AUTH</span>
              <span className="ui-e-value">VERIFIED</span>
            </div>
          </div>
          <div className="ui-e-card-footer">
            <div className="ui-e-scan-line"></div>
          </div>
        </div>

        <div className="ui-e-card">
          <div className="ui-e-card-header">
            <span className="ui-e-card-title">NEURAL SYNC</span>
            <span className="ui-e-card-status">STABLE</span>
          </div>
          <div className="ui-e-card-body">
            <div className="ui-e-intel-row">
              <span className="ui-e-label">LATENCY</span>
              <span className="ui-e-value">12ms</span>
            </div>
            <div className="ui-e-intel-row">
              <span className="ui-e-label">UPTIME</span>
              <span className="ui-e-value">99.9%</span>
            </div>
          </div>
          <div className="ui-e-card-footer">
            <div className="ui-e-scan-line"></div>
          </div>
        </div>
      </div>

      {/* Center Orbit Arcs */}
      <div className="ui-e-orbit-arc left"></div>
      <div className="ui-e-orbit-arc right"></div>

      {/* Bottom Ribbon */}
      <div className="ui-e-bottom-ribbon">
        <div className="ui-e-ribbon-pill">MISSION CONTROL ACTIVE</div>
        <div className="ui-e-ribbon-pill">SECURE PROTOCOL V4.1</div>
        <div className="ui-e-ribbon-pill">JARVIS LITE UI-E</div>
      </div>

      {/* Axis Line */}
      <div className="ui-e-axis-line">X-AXIS // Y-AXIS // Z-AXIS // SYNCED</div>
    </div>
  );
};

export default MissionControlDeck;
