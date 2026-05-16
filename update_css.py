css = open('src/index.css').read()

# 기존 scc-root 블록 제거 후 새 scc-stage/scc-workspace 블록으로 교체
old_block = '''.scc-root {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.97);
  width: min(1160px, 97vw);
  max-height: 92vh;
  z-index: 52;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 16px 18px 14px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.45s ease, transform 0.45s ease;
  perspective: 1800px;
  background: rgba(4, 8, 18, 0.94);
  border: 1px solid rgba(34,211,238,0.16);
  border-radius: 18px;
  backdrop-filter: blur(28px);
  box-shadow: 0 0 100px rgba(0,229,255,0.07), 0 50px 140px rgba(0,0,0,0.7);
  overflow: hidden;
}
.scc-root.scc-visible {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
  pointer-events: auto;
  overflow-y: auto;
}'''

new_block = '''/* ── UI-ORCH-A.2: scc-stage (위치 담당 — transform 사용 금지) ── */
.scc-stage {
  /* 위치만 담당: fixed inset:0, grid center */
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: clamp(16px, 3vw, 48px);
  box-sizing: border-box;
  pointer-events: none;
  /* transform 사용 금지 — Framer Motion x/y 사용 금지 */
}

/* ── dim backdrop ── */
.scc-dim {
  position: fixed;
  inset: 0;
  z-index: 39;
  background: rgba(0, 4, 12, 0.55);
  backdrop-filter: blur(1px);
  pointer-events: none;
}

/* ── scc-workspace (애니메이션 담당 — opacity/scale만) ── */
.scc-workspace {
  pointer-events: auto;
  position: relative;
  width: min(1280px, calc(100vw - 48px));
  height: min(760px, calc(100vh - 96px));
  max-height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 16px 18px 14px;
  box-sizing: border-box;
  background: rgba(4, 8, 18, 0.94);
  border: 1px solid rgba(34,211,238,0.16);
  border-radius: 24px;
  backdrop-filter: blur(28px);
  box-shadow: 0 0 100px rgba(0,229,255,0.07), 0 50px 140px rgba(0,0,0,0.7);
  overflow: hidden;
  /* transform 위치 제어 금지 — Framer Motion이 scale만 제어 */
}

/* ── scc-grid-main: 3열 레이아웃 ── */
.scc-grid-main {
  display: grid;
  grid-template-columns: minmax(220px, 0.9fr) minmax(360px, 1.6fr) minmax(240px, 1fr);
  gap: 14px;
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── 912px 이하 반응형 ── */
@media (max-width: 912px) {
  .scc-stage {
    padding: 12px;
  }
  .scc-workspace {
    width: calc(100vw - 24px);
    height: calc(100vh - 72px);
    max-height: calc(100vh - 72px);
    border-radius: 16px;
    overflow-y: auto;
  }
  .scc-grid-main {
    grid-template-columns: 1fr;
    overflow: visible;
  }
}'''

if old_block in css:
    css = css.replace(old_block, new_block)
    open('src/index.css', 'w').write(css)
    print('SUCCESS: scc-root replaced with scc-stage/scc-workspace/scc-dim/scc-grid-main')
else:
    print('ERROR: old_block not found in css')
    # 부분 매칭 확인
    if '.scc-root {' in css:
        print('Found .scc-root { — checking exact content...')
        idx = css.find('.scc-root {')
        print(repr(css[idx:idx+200]))
