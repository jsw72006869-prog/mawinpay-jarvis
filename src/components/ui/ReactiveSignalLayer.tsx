import React, { useEffect, useState, useRef } from 'react';

/**
 * ReactiveSignalLayer — UI-V3.2
 * 구현 A: Reactive Intelligence Signal (scene 전환 시 전체 반응)
 * 구현 B: Command Wave (중앙 Core 파동)
 * 구현 C: Neural Connection System (scene 노드 연결선 — CSS only)
 *
 * pointer-events: none — 클릭 방해 없음
 * GPU-friendly: transform + opacity only
 */

type JarvisScene = 'standby' | 'home' | 'smartstore_brief' | 'copy_research' | 'keyword_radar' | 'growth_link' | 'cs_copilot' | 'approval_gate' | 'outreach';

interface Props {
  scene: JarvisScene;
  reactionPulse: boolean;
  jarvisState: string; // idle | listening | thinking | speaking | working
}

/* Scene별 accent 색상 */
const SCENE_COLORS: Record<string, string> = {
  standby: '#00F5FF',
  home: '#00F5FF',
  smartstore_brief: '#00FF88',
  copy_research: '#00F5FF',
  keyword_radar: '#9B8EC4',
  growth_link: '#FF9800',
  cs_copilot: '#4A90E2',
  approval_gate: '#FF4444',
  outreach: '#C8A96E',
};

/* Scene별 Neural Connection 노드 */
const NEURAL_NODES: Record<string, string[]> = {
  smartstore_brief: ['ORDER PIPELINE', 'DAILY METRICS', 'DELIVERY STATUS'],
  copy_research: ['VIRAL ANALYSIS', 'CONTENT ENGINE', 'HOOK GENERATOR'],
  keyword_radar: ['RANK TRACKING', 'SEARCH VOLUME', 'TREND ANALYSIS'],
  growth_link: ['DEEP LINK', 'CHROME OPTIMIZE', 'UTM BUILDER'],
  cs_copilot: ['INQUIRY QUEUE', 'AUTO RESPONSE', 'SATISFACTION'],
  approval_gate: ['SECURITY GATE', 'APPROVAL QUEUE', 'AUDIT LOG'],
  outreach: ['INFLUENCER DB', 'CAMPAIGN ENGINE', 'OUTREACH LOG'],
};

export default function ReactiveSignalLayer({ scene, reactionPulse, jarvisState }: Props) {
  const [waveActive, setWaveActive] = useState(false);
  const [signalRings, setSignalRings] = useState(0);
  const prevScene = useRef(scene);

  /* scene 전환 시 Command Wave 발동 */
  useEffect(() => {
    if (scene !== prevScene.current && scene !== 'standby') {
      setWaveActive(true);
      setSignalRings(r => r + 1);
      const t = setTimeout(() => setWaveActive(false), 1800);
      prevScene.current = scene;
      return () => clearTimeout(t);
    }
    prevScene.current = scene;
  }, [scene]);

  const color = SCENE_COLORS[scene] || '#00F5FF';
  const nodes = NEURAL_NODES[scene] || [];
  const isActive = scene !== 'standby' && scene !== 'home';

  return (
    <div
      className={`v32-reactive-layer${reactionPulse ? ' v32-pulse-active' : ''}${waveActive ? ' v32-wave-active' : ''}`}
      data-scene={scene}
      data-state={jarvisState}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 5 }}
    >
      {/* ── A. Reactive Signal — 전체 화면 반응 flash ── */}
      <div
        className="v32-signal-flash"
        style={{
          background: `radial-gradient(ellipse at center, ${color}08 0%, transparent 70%)`,
          opacity: reactionPulse ? 1 : 0,
        }}
      />

      {/* ── B. Command Wave — 중앙에서 확산하는 파동 링 ── */}
      {waveActive && (
        <div className="v32-command-wave-container">
          {[0, 1, 2].map(i => (
            <div
              key={`wave-${signalRings}-${i}`}
              className="v32-command-wave-ring"
              style={{
                borderColor: color,
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* ── C. Neural Connection — scene 노드 연결선 ── */}
      {isActive && nodes.length > 0 && (
        <div className="v32-neural-connection">
          {nodes.map((node, i) => (
            <div
              key={node}
              className="v32-neural-node"
              style={{
                animationDelay: `${i * 0.4}s`,
                color,
                borderColor: `${color}30`,
              }}
            >
              <span className="v32-neural-dot" style={{ background: color }} />
              <span className="v32-neural-label">{node}</span>
              {i < nodes.length - 1 && (
                <span className="v32-neural-line" style={{ background: `linear-gradient(180deg, ${color}40, ${color}08)` }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Signal pulse dots (미세한 신호 입자) ── */}
      {isActive && (
        <div className="v32-signal-dots">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className="v32-signal-dot"
              style={{
                background: color,
                animationDelay: `${i * 0.7}s`,
                left: `${15 + i * 13}%`,
                top: `${20 + (i % 3) * 25}%`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
