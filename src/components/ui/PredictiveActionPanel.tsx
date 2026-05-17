import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── DUAL-MONITOR-C.1: Apple-grade Action Command Panel ──
   Dark cinematic 배경 위 glass morphism panel
   5 섹션: ACTION COMMAND / SYSTEM STATUS / NEXT ACTION / EXECUTION LOCK / COMMAND TRAIL
   fake data 금지 — 실제 상태값만 표시, 없으면 기본 문구 */

type PredictiveActionType = 'safe' | 'draft' | 'locked' | 'danger' | 'navigation';

type PredictiveAction = {
  id: string;
  scene: string;
  type: PredictiveActionType;
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string;
  tertiaryLabel?: string;
  status: 'available' | 'locked' | 'preview' | 'disabled';
  riskLevel: 'low' | 'medium' | 'high';
};

interface PredictiveActionPanelProps {
  actions: PredictiveAction[];
  visible: boolean;
  outreachOpen?: boolean;
  statusMessage: string;
  onActionClick: (action: PredictiveAction) => void;
}

/* ── Apple-like 색상 (dark cinematic 기반) ── */
const A = {
  green: '#30D158',
  amber: '#FFD60A',
  red: '#FF453A',
  purple: '#BF5AF2',
  blue: '#0A84FF',
  dim: 'rgba(255,255,255,0.40)',
};

const DOT_COLOR: Record<PredictiveActionType, string> = {
  safe: A.green, draft: A.purple, locked: A.amber, danger: A.red, navigation: A.dim,
};

const BADGE: Record<string, { text: string; color: string }> = {
  available: { text: 'READY', color: A.green },
  locked:    { text: 'LOCKED', color: A.amber },
  preview:   { text: 'PREVIEW', color: A.purple },
  disabled:  { text: 'PENDING', color: A.dim },
};

const PredictiveActionPanel: React.FC<PredictiveActionPanelProps> = ({
  actions, visible,
  outreachOpen = false, statusMessage, onActionClick,
}) => {
  if (!actions.length) return null;

  const hasLocked = actions.some(a => a.status === 'locked');
  const nextAction = actions.find(a => a.status === 'available');
  const sceneName = actions[0]?.scene?.replace(/_/g, ' ').toUpperCase() || 'STANDBY';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`acp-panel${outreachOpen ? " acp-outreach-shift" : ""}`}
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* ── S1: ACTION COMMAND ── */}
          <div className="acp-section acp-header">
            <div className="acp-header-row">
              <span className="acp-header-dot" />
              <span className="acp-header-label">ACTION COMMAND</span>
            </div>
            <span className="acp-header-scene">{sceneName}</span>
          </div>

          <div className="acp-divider" />

          {/* ── S2: SYSTEM STATUS ── */}
          <div className="acp-section">
            <span className="acp-section-label">SYSTEM STATUS</span>
            <div className="acp-status-row">
              <span className="acp-status-dot" style={{ background: hasLocked ? A.amber : A.green }} />
              <span className="acp-status-text">
                {hasLocked ? 'Approval required' : 'Waiting for command'}
              </span>
            </div>
          </div>

          <div className="acp-divider" />

          {/* ── S3: NEXT ACTION ── */}
          <div className="acp-section">
            <span className="acp-section-label">NEXT ACTION</span>
            <div className="acp-actions-list">
              {actions.map((action, i) => {
                const clickable = action.status === 'available' || action.status === 'preview';
                const dot = DOT_COLOR[action.type] || A.dim;
                const badge = BADGE[action.status] || BADGE.disabled;

                return (
                  <motion.div
                    key={action.id}
                    className={`acp-card${clickable ? ' acp-clickable' : ''}${action.status === 'locked' ? ' acp-locked' : ''}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                    onClick={() => clickable && onActionClick(action)}
                  >
                    <div className="acp-card-top">
                      <div className="acp-card-title-row">
                        <span className="acp-card-dot" style={{ background: dot }} />
                        <span className="acp-card-title">{action.title}</span>
                      </div>
                      <span className="acp-card-badge" style={{ color: badge.color, borderColor: `${badge.color}30` }}>
                        {badge.text}
                      </span>
                    </div>
                    <div className="acp-card-desc">{action.description}</div>
                    {clickable && (
                      <div className="acp-card-btns">
                        <span className="acp-btn">{action.primaryLabel}</span>
                        {action.secondaryLabel && (
                          <span className="acp-btn acp-btn-sec">{action.secondaryLabel}</span>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className="acp-divider" />

          {/* ── S4: EXECUTION LOCK ── */}
          <div className="acp-section">
            <span className="acp-section-label">EXECUTION LOCK</span>
            <div className="acp-lock-row">
              {hasLocked ? (
                <>
                  <span className="acp-lock-icon acp-lock-active">🔒</span>
                  <span className="acp-lock-text acp-lock-active">Locked until approval</span>
                </>
              ) : (
                <>
                  <span className="acp-lock-icon">✓</span>
                  <span className="acp-lock-text">No dangerous actions</span>
                </>
              )}
            </div>
          </div>

          <div className="acp-divider" />

          {/* ── S5: COMMAND TRAIL ── */}
          <div className="acp-section acp-trail">
            <span className="acp-section-label">COMMAND TRAIL</span>
            <AnimatePresence mode="wait">
              {statusMessage ? (
                <motion.div
                  key="msg"
                  className="acp-trail-msg"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                >
                  {statusMessage}
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  className="acp-trail-idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {nextAction ? `Ready: ${nextAction.title}` : 'No active mission'}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PredictiveActionPanel;
