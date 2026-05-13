import React from 'react';

/**
 * SystemPulseOverlay — UI-V3.2
 * 구현 E: AI Thinking Overlay (상태별 미세한 전체 tint)
 *
 * LISTENING → soft cyan
 * THINKING  → blue neural
 * ANALYZING → cyan pulse
 * LOCKED    → red warning
 * EXECUTING → amber operational
 *
 * 매우 약하게 — 텍스트 가독성 깨지면 FAIL
 */

type JarvisScene = 'standby' | 'home' | 'smartstore_brief' | 'copy_research' | 'keyword_radar' | 'growth_link' | 'cs_copilot' | 'approval_gate' | 'outreach';

interface Props {
  scene: JarvisScene;
  jarvisState: string;
}

const STATE_TINTS: Record<string, { color: string; opacity: number }> = {
  listening: { color: '0, 245, 255', opacity: 0.03 },
  thinking:  { color: '74, 144, 226', opacity: 0.035 },
  working:   { color: '255, 152, 0',  opacity: 0.025 },
  speaking:  { color: '0, 200, 150',  opacity: 0.02 },
  idle:      { color: '0, 0, 0',      opacity: 0 },
};

/* approval_gate scene이면 red tint 추가 */
const SCENE_TINTS: Record<string, { color: string; opacity: number }> = {
  approval_gate: { color: '255, 68, 68', opacity: 0.03 },
};

export default function SystemPulseOverlay({ scene, jarvisState }: Props) {
  const stateTint = STATE_TINTS[jarvisState] || STATE_TINTS.idle;
  const sceneTint = SCENE_TINTS[scene];

  /* idle이고 scene tint도 없으면 렌더링 안 함 */
  if (stateTint.opacity === 0 && !sceneTint) return null;

  const finalColor = sceneTint && jarvisState === 'idle' ? sceneTint.color : stateTint.color;
  const finalOpacity = sceneTint && jarvisState === 'idle' ? sceneTint.opacity : stateTint.opacity;

  return (
    <div
      className={`v32-thinking-overlay v32-state-${jarvisState}`}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 4,
        background: `radial-gradient(ellipse at 50% 50%, rgba(${finalColor}, ${finalOpacity}) 0%, transparent 70%)`,
        transition: 'background 0.8s ease',
      }}
    />
  );
}
