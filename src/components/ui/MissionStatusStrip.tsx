import React, { useEffect, useState } from 'react';

/* ── UI-V3: Mission Status Strip ──
   상단 미션 상태 바 — 현재 운영 상태 요약
   tiny pulse + signal glow 포함
   실제 수치 금지 */

interface StatusItem {
  label: string;
  value: string;
  color: string;
  pulse?: boolean;
}

const STATUS_ITEMS: StatusItem[] = [
  { label: 'SYSTEM', value: 'ONLINE', color: '#10b981', pulse: true },
  { label: 'SMARTSTORE', value: 'STANDBY', color: '#22d3ee', pulse: true },
  { label: 'KEYWORD RADAR', value: 'READY', color: '#a78bfa' },
  { label: 'GROWTH LINK', value: 'READY', color: '#a78bfa' },
  { label: 'CS COPILOT', value: 'READY', color: '#6ee7b7' },
  { label: 'APPROVAL LOCK', value: 'ACTIVE', color: '#ef4444', pulse: true },
  { label: 'ROUTER', value: 'READONLY', color: '#f59e0b' },
];

export default function MissionStatusStrip() {
  const [tick, setTick] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick(t => !t), 900);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="scc-mission-strip">
      {STATUS_ITEMS.map((item, i) => (
        <div key={i} className="scc-strip-item">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {item.pulse && (
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: item.color,
                  display: 'inline-block',
                  opacity: tick ? 1 : 0.3,
                  transition: 'opacity 0.4s ease',
                  flexShrink: 0,
                }}
              />
            )}
            <span className="scc-strip-value" style={{ color: item.color }}>
              {item.value}
            </span>
          </div>
          <span className="scc-strip-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
