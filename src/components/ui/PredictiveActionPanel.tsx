import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── ACTION-A.1: Predictive Action Panel ──
   Scene 기반 추천 행동 카드 (HUD 스타일)
   실제 실행 절대 금지 — toast/log만 */

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
  statusMessage: string;
  onActionClick: (action: PredictiveAction) => void;
}

const TYPE_COLORS: Record<PredictiveActionType, { border: string; glow: string; bg: string; text: string }> = {
  safe:       { border: '#00e5ff', glow: '#00e5ff33', bg: 'rgba(0,229,255,0.06)', text: '#00e5ff' },
  draft:      { border: '#b388ff', glow: '#b388ff33', bg: 'rgba(179,136,255,0.06)', text: '#b388ff' },
  locked:     { border: '#ffab00', glow: '#ffab0033', bg: 'rgba(255,171,0,0.06)', text: '#ffab00' },
  danger:     { border: '#ff1744', glow: '#ff174433', bg: 'rgba(255,23,68,0.06)', text: '#ff1744' },
  navigation: { border: '#546e7a', glow: '#546e7a22', bg: 'rgba(84,110,122,0.04)', text: '#78909c' },
};

const RISK_INDICATOR: Record<string, { label: string; color: string }> = {
  low:    { label: '●', color: '#00e676' },
  medium: { label: '●', color: '#ffab00' },
  high:   { label: '●', color: '#ff1744' },
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  available: { label: 'READY', color: '#00e5ff' },
  locked:    { label: 'LOCKED', color: '#ffab00' },
  preview:   { label: 'PREVIEW', color: '#b388ff' },
  disabled:  { label: 'PENDING', color: '#546e7a' },
};

const PredictiveActionPanel: React.FC<PredictiveActionPanelProps> = ({
  actions,
  visible,
  statusMessage,
  onActionClick,
}) => {
  if (!actions.length) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`predictive-action-panel ${visible ? 'is-visible' : ''}`}
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'fixed',
            left: 20,
            bottom: 20,
            width: 340,
            maxHeight: 420,
            overflowY: 'auto',
            zIndex: 55,
            background: 'rgba(0, 8, 20, 0.92)',
            border: '1px solid rgba(0, 229, 255, 0.15)',
            borderRadius: 8,
            backdropFilter: 'blur(16px)',
            boxShadow: '0 0 30px rgba(0, 229, 255, 0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
            padding: '14px 16px',
            fontFamily: 'Orbitron, monospace',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12, paddingBottom: 8,
            borderBottom: '1px solid rgba(0,229,255,0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#00e5ff', fontSize: '0.55rem', letterSpacing: '0.2em' }}>
                ◈ PREDICTED ACTIONS
              </span>
            </div>
            <span style={{
              fontSize: '0.38rem', color: '#546e7a', letterSpacing: '0.15em',
            }}>
              {actions.length} ITEMS
            </span>
          </div>

          {/* Action Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {actions.map((action, i) => {
              const colors = TYPE_COLORS[action.type];
              const risk = RISK_INDICATOR[action.riskLevel];
              const badge = STATUS_BADGE[action.status];
              const isClickable = action.status !== 'disabled';

              return (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.3 }}
                  onClick={() => isClickable && onActionClick(action)}
                  style={{
                    padding: '10px 12px',
                    border: `1px solid ${colors.border}30`,
                    borderRadius: 6,
                    background: colors.bg,
                    boxShadow: `0 0 12px ${colors.glow}`,
                    cursor: isClickable ? 'pointer' : 'default',
                    opacity: action.status === 'disabled' ? 0.45 : 1,
                    transition: 'all 0.2s ease',
                  }}
                  whileHover={isClickable ? {
                    borderColor: `${colors.border}80`,
                    boxShadow: `0 0 20px ${colors.glow}, 0 0 40px ${colors.glow}`,
                    scale: 1.01,
                  } : undefined}
                >
                  {/* Top row: risk + title + badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 4,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: risk.color, fontSize: '0.4rem' }}>{risk.label}</span>
                      <span style={{
                        color: colors.text, fontSize: '0.44rem', fontWeight: 700,
                        letterSpacing: '0.08em',
                      }}>
                        {action.title}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '0.32rem', color: badge.color, letterSpacing: '0.15em',
                      padding: '1px 6px', border: `1px solid ${badge.color}40`,
                      borderRadius: 3, background: `${badge.color}10`,
                    }}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Description */}
                  <div style={{
                    fontSize: '0.36rem', color: '#8eacbb', lineHeight: 1.4,
                    fontFamily: "'Noto Sans KR', sans-serif",
                    letterSpacing: '0.02em',
                  }}>
                    {action.description}
                  </div>

                  {/* Button row */}
                  {isClickable && (
                    <div style={{
                      marginTop: 6, display: 'flex', gap: 6,
                    }}>
                      <span style={{
                        fontSize: '0.34rem', color: colors.text,
                        padding: '2px 10px', border: `1px solid ${colors.border}50`,
                        borderRadius: 3, cursor: 'pointer',
                        background: `${colors.border}08`,
                        letterSpacing: '0.1em',
                        transition: 'all 0.15s ease',
                      }}>
                        {action.primaryLabel}
                      </span>
                      {action.secondaryLabel && (
                        <span style={{
                          fontSize: '0.34rem', color: '#78909c',
                          padding: '2px 10px', border: '1px solid rgba(120,144,156,0.3)',
                          borderRadius: 3, letterSpacing: '0.1em',
                        }}>
                          {action.secondaryLabel}
                        </span>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Status Message */}
          <AnimatePresence>
            {statusMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  marginTop: 10, paddingTop: 8,
                  borderTop: '1px solid rgba(0,229,255,0.1)',
                  fontSize: '0.36rem', color: '#ffab00',
                  fontFamily: "'Noto Sans KR', sans-serif",
                  letterSpacing: '0.02em',
                  lineHeight: 1.5,
                }}
              >
                {statusMessage}
              </motion.div>
            )}
          </AnimatePresence>

          {/* LOCKED Footer */}
          {actions.some(a => a.status === 'locked') && (
            <div style={{
              marginTop: 10, paddingTop: 8,
              borderTop: '1px solid rgba(255,171,0,0.15)',
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.34rem', color: '#ffab00', letterSpacing: '0.12em',
            }}>
              <span>🔒</span>
              <span>EXECUTE LOCKED — 대표 승인 전 실행 불가</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PredictiveActionPanel;
