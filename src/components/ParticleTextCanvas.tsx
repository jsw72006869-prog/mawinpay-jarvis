import { useEffect, useRef, useCallback } from 'react';

interface ParticleTextCanvasProps {
  text: string;          // 현재 타이핑 중인 텍스트
  active: boolean;       // 타이핑 모드 활성 여부
}

const N = 8000; // 파티클 수

export function ParticleTextCanvas({ text, active }: ParticleTextCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    px: new Float32Array(N), py: new Float32Array(N), pz: new Float32Array(N),
    vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N),
    tx: new Float32Array(N), ty: new Float32Array(N), tz: new Float32Array(N),
    ox: new Float32Array(N), oy: new Float32Array(N), oz: new Float32Array(N),
    hue: new Float32Array(N), phase: new Float32Array(N),
    appState: 0 as 0 | 1 | 2,
    mouseX: -9999, mouseY: -9999,
    t: 0, rotY: 0,
    W: 0, H: 0, CX: 0, CY: 0, dpr: 1,
    animId: 0,
    initialized: false,
  });

  const FOV = 550;
  const CAMERA_Z = 600;
  const REPEL_RADIUS = 80;
  const REPEL_FORCE = 7;
  const PHI = Math.PI * (1 + Math.sqrt(5));

  const initSphereTargets = useCallback(() => {
    const s = stateRef.current;
    const baseDim = Math.min(s.W, s.H);
    const R = baseDim * 0.35;
    for (let i = 0; i < N; i++) {
      const polar = Math.acos(1 - 2 * (i + 0.5) / N);
      const azim = PHI * i;
      s.ox[i] = Math.sin(polar) * Math.cos(azim) * R;
      s.oy[i] = Math.sin(polar) * Math.sin(azim) * R;
      s.oz[i] = Math.cos(polar) * R;
      s.tx[i] = s.ox[i]; s.ty[i] = s.oy[i]; s.tz[i] = s.oz[i];
    }
  }, []);

  const initParticles = useCallback(() => {
    const s = stateRef.current;
    for (let i = 0; i < N; i++) {
      s.px[i] = (Math.random() - 0.5) * s.W * 2;
      s.py[i] = (Math.random() - 0.5) * s.H * 2;
      s.pz[i] = (Math.random() - 0.5) * 1000;
      s.vx[i] = s.vy[i] = s.vz[i] = 0;
      s.hue[i] = (i / N) * 320 + 170;
      s.phase[i] = Math.random() * Math.PI * 2;
    }
  }, []);

  const sampleTextPositions = useCallback((phrase: string) => {
    const s = stateRef.current;
    const cW = Math.floor(s.W);
    const cH = Math.floor(s.H);
    const off = document.createElement('canvas');
    off.width = cW;
    off.height = cH;
    const c2 = off.getContext('2d')!;

    const words = phrase.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    const maxChars = phrase.length > 25 ? 12 : 20;
    words.forEach(word => {
      if ((currentLine + word).length > maxChars) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine += word + ' ';
      }
    });
    lines.push(currentLine.trim());

    let fs = Math.min(cW * 0.72 / (maxChars * 0.5), cH * 0.50 / lines.length, 180);
    if (phrase.length > 30) fs *= 0.8;

    c2.fillStyle = '#fff';
    c2.font = `900 ${fs}px Arial Black, Arial, sans-serif`;
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';

    const lineHeight = fs * 1.15;
    const startY = (cH / 2) - ((lines.length - 1) * lineHeight / 2);
    lines.forEach((line, i) => {
      c2.fillText(line, cW / 2, startY + (i * lineHeight));
    });

    const data = c2.getImageData(0, 0, cW, cH).data;
    const pts: number[] = [];
    const step = phrase.length > 30 ? 2 : 1;
    for (let y = 0; y < cH; y += step) {
      for (let x = 0; x < cW; x += step) {
        if (data[(y * cW + x) * 4 + 3] > 120) {
          pts.push(x - cW / 2 + (Math.random() - 0.5) * 0.8, y - cH / 2 + (Math.random() - 0.5) * 0.8);
        }
      }
    }
    // 셔플
    for (let i = pts.length / 2 - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const ia = i * 2, ja = j * 2;
      let tmp = pts[ia]; pts[ia] = pts[ja]; pts[ja] = tmp;
      tmp = pts[ia + 1]; pts[ia + 1] = pts[ja + 1]; pts[ja + 1] = tmp;
    }
    return pts;
  }, []);

  const formWord = useCallback((phrase: string) => {
    const s = stateRef.current;
    if (!phrase.trim()) {
      s.appState = 0;
      initSphereTargets();
      return;
    }
    s.appState = 1;
    const pts = sampleTextPositions(phrase);
    const pCount = pts.length / 2;
    if (pCount === 0) return;
    for (let i = 0; i < N; i++) {
      const idx = (i % pCount) * 2;
      s.tx[i] = pts[idx];
      s.ty[i] = pts[idx + 1];
      s.tz[i] = 0;
    }
    s.rotY = 0;
    s.t = 0;
  }, [initSphereTargets, sampleTextPositions]);

  // 텍스트 변경 시 파티클 업데이트
  useEffect(() => {
    if (!stateRef.current.initialized) return;
    if (active && text.trim()) {
      formWord(text);
    } else if (!text.trim()) {
      stateRef.current.appState = 0;
      initSphereTargets();
    }
  }, [text, active, formWord, initSphereTargets]);

  // 비활성화 시 구체로 복귀
  useEffect(() => {
    if (!active && stateRef.current.initialized) {
      stateRef.current.appState = 0;
      initSphereTargets();
    }
  }, [active, initSphereTargets]);

  // 캔버스 초기화 및 애니메이션 루프
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const s = stateRef.current;

    function resize() {
      s.dpr = window.devicePixelRatio || 1;
      s.W = window.innerWidth;
      s.H = window.innerHeight;
      s.CX = s.W / 2;
      s.CY = s.H / 2;
      canvas!.width = s.W * s.dpr;
      canvas!.height = s.H * s.dpr;
      canvas!.style.width = s.W + 'px';
      canvas!.style.height = s.H + 'px';
      ctx.scale(s.dpr, s.dpr);
      if (s.appState === 0) initSphereTargets();
    }

    function update() {
      s.t += 0.005;
      if (s.appState === 0) s.rotY += 0.006;
      const jitter = s.appState === 0 ? 1.8 : 0;

      for (let i = 0; i < N; i++) {
        const cosY = Math.cos(s.rotY), sinY = Math.sin(s.rotY);
        let targetX = s.tx[i] * cosY - s.tz[i] * sinY;
        let targetY = s.ty[i];
        let targetZ = s.tx[i] * sinY + s.tz[i] * cosY;

        if (s.appState === 0) {
          targetX += Math.sin(s.t * 8 + s.phase[i]) * jitter;
          targetY += Math.cos(s.t * 9 + s.phase[i]) * jitter;
          targetZ += Math.sin(s.t * 7 + s.phase[i] * 2) * jitter;
        }

        const sp = s.appState === 0 ? 0.02 : 0.022;
        s.vx[i] += (targetX - s.px[i]) * sp;
        s.vy[i] += (targetY - s.py[i]) * sp;
        s.vz[i] += (targetZ - s.pz[i]) * sp;

        if (s.appState >= 1 && s.mouseX > 0) {
          const scale = FOV / (FOV + s.pz[i] + CAMERA_Z);
          const sx = s.px[i] * scale + s.CX;
          const sy = s.py[i] * scale + s.CY;
          const rdx = sx - s.mouseX;
          const rdy = sy - s.mouseY;
          const d2 = rdx * rdx + rdy * rdy;
          if (d2 < REPEL_RADIUS * REPEL_RADIUS && d2 > 1) {
            const d = Math.sqrt(d2);
            const mag = REPEL_FORCE * (1 - d / REPEL_RADIUS) * 5;
            s.vx[i] += (rdx / d) * mag;
            s.vy[i] += (rdy / d) * mag;
          }
        }

        s.vx[i] *= 0.82; s.vy[i] *= 0.82; s.vz[i] *= 0.82;
        s.px[i] += s.vx[i]; s.py[i] += s.vy[i]; s.pz[i] += s.vz[i];
      }
    }

    function draw() {
      // 자비스 배경과 블렌딩 — 반투명 페이드
      ctx.fillStyle = 'rgba(0,4,12,0.18)';
      ctx.fillRect(0, 0, s.W, s.H);

      for (let i = 0; i < N; i++) {
        const zPos = s.pz[i] + CAMERA_Z;
        if (zPos < 10) continue;
        const scale = FOV / zPos;
        const sx = s.px[i] * scale + s.CX;
        const sy = s.py[i] * scale + s.CY;
        const spd = Math.sqrt(s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i] + s.vz[i] * s.vz[i]);
        let a = Math.min(1, (0.18 + spd * 0.1) * (scale * 0.65));
        let size = (0.4 + spd * 0.12) * scale;
        let h: number, sat: number, l: number;

        if (s.appState >= 1) {
          // 자비스 테마: 시안/파란 네온
          h = 195; sat = 95; l = 80;
          a = Math.min(1, a * 1.6);
          size *= 0.85;
        } else {
          h = (s.hue[i] + s.t * 25) % 360;
          sat = 80; l = 70;
        }

        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.3, size), 0, 6.2832);
        ctx.fillStyle = `hsla(${h},${sat}%,${l}%,${a})`;
        ctx.fill();
      }

      // 마우스 리펠 글로우
      if (s.appState >= 1 && s.mouseX > 0) {
        const grd = ctx.createRadialGradient(s.mouseX, s.mouseY, 0, s.mouseX, s.mouseY, REPEL_RADIUS);
        grd.addColorStop(0, 'rgba(0,180,255,0.06)');
        grd.addColorStop(1, 'rgba(0,180,255,0)');
        ctx.beginPath();
        ctx.arc(s.mouseX, s.mouseY, REPEL_RADIUS, 0, 6.2832);
        ctx.fillStyle = grd;
        ctx.fill();
      }
    }

    function loop() {
      update();
      draw();
      s.animId = requestAnimationFrame(loop);
    }

    resize();
    initParticles();
    s.initialized = true;
    loop();

    const handleResize = () => {
      ctx.resetTransform();
      resize();
    };
    const handleMouseMove = (e: MouseEvent) => { s.mouseX = e.clientX; s.mouseY = e.clientY; };
    const handleMouseLeave = () => { s.mouseX = -9999; s.mouseY = -9999; };

    window.addEventListener('resize', handleResize);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      cancelAnimationFrame(s.animId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      s.initialized = false;
    };
  }, [initParticles, initSphereTargets]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 2,
        pointerEvents: active ? 'auto' : 'none',
        // 타이핑 모드 비활성 시 완전히 숨김 (자비스 UI 가림 방지)
        opacity: active ? 1 : 0,
        visibility: active ? 'visible' : 'hidden',
        transition: 'opacity 0.3s ease',
      }}
    />
  );
}
