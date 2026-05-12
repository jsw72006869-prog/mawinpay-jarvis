import React from 'react';

/**
 * CinematicLayer — UI-V2 Z-depth Layer System + Ambient Motion
 * 배경에 고정되는 시네마틱 레이어 (pointer-events: none)
 */
export default function CinematicLayer() {
  return (
    <div className="cinematic-layer" aria-hidden="true">
      <div className="cl-grid" />
      <div className="cl-particles">
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className={`cl-particle p-${i}`} />
        ))}
      </div>
      <div className="cl-scanline" />
      <div className="cl-corner cl-corner-tl" />
      <div className="cl-corner cl-corner-tr" />
      <div className="cl-corner cl-corner-bl" />
      <div className="cl-corner cl-corner-br" />
      <div className="cl-rail cl-rail-left" />
      <div className="cl-rail cl-rail-right" />
      <div className="cl-crosshair-h" />
      <div className="cl-crosshair-v" />
    </div>
  );
}
