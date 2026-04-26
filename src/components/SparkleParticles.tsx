import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import type { JarvisState } from '../lib/jarvis-brain';
import FACE_POINTS_RAW from '../lib/jarvis-face-points.json';

const FACE_POINTS = FACE_POINTS_RAW as [number, number, number][];

interface SparkleParticlesProps {
  state: JarvisState;
  audioLevel: number;
  speakingLevel: number;
  clapBurst: boolean;
  freqData?: Uint8Array; // 마이크 주파수 배열 (32~128 bins)
}

// ── 버텍스 셸이더 (고급스러운 우주 효과) ──
const VERT = `
  attribute float aSize;
  attribute float aBrightness;
  attribute vec3  aColor;
  attribute float aPhase;

  uniform float uTime;
  uniform float uAudioLevel;
  uniform float uSpeakingLevel;
  uniform float uBurst;
  uniform float uFaceBlend;
  uniform float uEntryPhase;

  varying float vBrightness;
  varying vec3  vColor;

  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float dist = max(-mvPos.z, 0.1);

    float sizeBoost = 1.0
      + uAudioLevel    * 0.6
      + uSpeakingLevel * 0.8
      + uBurst         * 2.0
      + uFaceBlend     * 0.5
      + uEntryPhase    * 0.6;
    gl_PointSize = aSize * sizeBoost * (280.0 / dist);
    gl_PointSize = clamp(gl_PointSize, 0.2, 5.5);

    // 은은한 맥동
    float pulse = 0.5 + 0.5 * sin(uTime * 2.0 + aPhase);
    float entryGlow = uEntryPhase * 0.5;
    vBrightness = aBrightness
      * (0.35 + uAudioLevel * 0.35 + uSpeakingLevel * 0.5
         + uBurst * 0.8 + uFaceBlend * 0.4 + entryGlow
         + pulse * 0.1);
    vColor = aColor;
  }
`;

// ── 프래그먼트 셸이더 (고급스러운 우주 스파클) ──
const FRAG = `
  varying float vBrightness;
  varying vec3  vColor;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);

    // 스파클 핵 + 부드러운 글로우 + 섬세한 십자 광선
    float core = 1.0 - smoothstep(0.0, 0.15, d);
    float glow = exp(-d * 6.0) * 0.5;
    float ray1 = max(0.0, 1.0 - abs(uv.x) * 20.0) * max(0.0, 1.0 - abs(uv.y) * 5.0) * 0.25;
    float ray2 = max(0.0, 1.0 - abs(uv.y) * 20.0) * max(0.0, 1.0 - abs(uv.x) * 5.0) * 0.25;
    float alpha = (core + glow + ray1 + ray2) * vBrightness;

    if (alpha < 0.005) discard;

    // 중심은 흰색, 바깥은 색상 유지 (우아한 발광)
    vec3 col = mix(vColor, vec3(1.0), core * 0.65);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

const COUNT = 15000; // 파티클 수 (고급스러운 밀도)

// 우아한 우주 색상 팔레트 (금색 + 청색 + 하연 + 은은한 보라)
const PALETTE = [
  // 금색/샴페인 계열
  new THREE.Color(0xC8A96E),
  new THREE.Color(0xE8D5A3),
  new THREE.Color(0xD4B896),
  // 청색/아이스 계열
  new THREE.Color(0x4A90E2),
  new THREE.Color(0x87CEEB),
  new THREE.Color(0xB0D4F1),
  // 하연/신비로운 흰색
  new THREE.Color(0xFFFFFF),
  new THREE.Color(0xF0F8FF),
  new THREE.Color(0xE8F0FE),
  // 은은한 보라
  new THREE.Color(0x9B8EC4),
  new THREE.Color(0xA78BFA),
];

// 얼굴 형태 목표 좌표
const FACE_SCALE = 1.6;
const FACE_TARGETS = new Float32Array(COUNT * 3);
for (let i = 0; i < COUNT; i++) {
  const fp = FACE_POINTS[i % FACE_POINTS.length];
  FACE_TARGETS[i * 3]     = fp[0] * FACE_SCALE;
  FACE_TARGETS[i * 3 + 1] = fp[1] * FACE_SCALE;
  FACE_TARGETS[i * 3 + 2] = fp[2] * FACE_SCALE * 0.3;
}

// 구체 목표 좌표 (speaking 시 수렴)
const SPHERE_R = 10;
const SPHERE_TARGETS = new Float32Array(COUNT * 3);
for (let i = 0; i < COUNT; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi   = Math.acos(2 * Math.random() - 1);
  SPHERE_TARGETS[i * 3]     = SPHERE_R * Math.sin(phi) * Math.cos(theta);
  SPHERE_TARGETS[i * 3 + 1] = SPHERE_R * Math.sin(phi) * Math.sin(theta);
  SPHERE_TARGETS[i * 3 + 2] = SPHERE_R * Math.cos(phi);
}

// 파형 링 목표 좌표 (listening 시 변형) — 32 밴드 × 여러 파티클
const WAVEFORM_BANDS = 64;
const WAVEFORM_TARGETS = new Float32Array(COUNT * 3);
for (let i = 0; i < COUNT; i++) {
  const band = i % WAVEFORM_BANDS;
  const ring = Math.floor(i / WAVEFORM_BANDS) % 3; // 3중 링
  const angle = (band / WAVEFORM_BANDS) * Math.PI * 2;
  const baseR = 8 + ring * 3;
  WAVEFORM_TARGETS[i * 3]     = Math.cos(angle) * baseR;
  WAVEFORM_TARGETS[i * 3 + 1] = Math.sin(angle) * baseR;
  WAVEFORM_TARGETS[i * 3 + 2] = (Math.random() - 0.5) * 2;
}

// ── 3단계 애니메이션 상태 ──
// phase 0: 자유 유영
// phase 1: 폭발 (0~0.6s)
// phase 2: 소용돌이 수렴 (0.6~2.0s)
// phase 3: 얼굴 고정 (2.0s~)
type EntryPhase = 0 | 1 | 2 | 3;

export default function SparkleParticles({ state, audioLevel, speakingLevel, clapBurst, freqData }: SparkleParticlesProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const materialRef  = useRef<THREE.ShaderMaterial | null>(null);
  const posAttrRef   = useRef<THREE.BufferAttribute | null>(null);
  const animRef      = useRef<number>(0);
  // THREE.Clock deprecated → performance.now() 기반 수동 시간 관리
  const clockStartRef = useRef(performance.now() / 1000);

  // CPU 파티클 상태
  const posRef   = useRef<Float32Array>(new Float32Array(COUNT * 3));
  const velRef   = useRef<Float32Array>(new Float32Array(COUNT * 3));
  const freeRef  = useRef<Float32Array>(new Float32Array(COUNT * 3));
  const phaseRef = useRef<Float32Array>(new Float32Array(COUNT));

  // 애니메이션 제어
  const faceBlendRef   = useRef(0);
  const burstRef       = useRef(0);
  const entryPhaseRef  = useRef<EntryPhase>(0);
  const entryTimeRef   = useRef(0);   // 엔트리 시작 시각
  const stateRef       = useRef<JarvisState>('idle');
  const audioRef       = useRef(0);
  const speakRef       = useRef(0);
  const clockElapsedRef = useRef(0);
  const freqRef        = useRef<Uint8Array | null>(null);
  // 상태 전환 블렌드 (0=자유, 1=파형, 2=구체)
  const waveBlendRef   = useRef(0); // listening 시 파형 블렌드
  const sphereBlendRef = useRef(0); // speaking 시 구체 블렌드

  const init = useCallback(() => {
    const pos   = posRef.current;
    const vel   = velRef.current;
    const free  = freeRef.current;
    const phase = phaseRef.current;

    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 4 + Math.pow(Math.random(), 0.5) * 24;

      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      pos[i * 3 + 2] = r * Math.cos(phi);

      free[i * 3]     = pos[i * 3];
      free[i * 3 + 1] = pos[i * 3 + 1];
      free[i * 3 + 2] = pos[i * 3 + 2];

      vel[i * 3]     = (Math.random() - 0.5) * 0.06;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.06;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.04;

      phase[i] = Math.random() * Math.PI * 2;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    init();

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    // WebGL Context Lost/Restored 핸들러 (크래시 방지)
    let contextLost = false;
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      console.warn('[SparkleParticles] WebGL context lost - pausing render');
      cancelAnimationFrame(animRef.current);
    };
    const handleContextRestored = () => {
      contextLost = false;
      console.log('[SparkleParticles] WebGL context restored - resuming render');
      animate();
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 0, 30);

    const geometry = new THREE.BufferGeometry();
    const posAttr  = new THREE.BufferAttribute(new Float32Array(posRef.current), 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', posAttr);
    posAttrRef.current = posAttr;

    const sizes  = new Float32Array(COUNT);
    const brigs  = new Float32Array(COUNT);
    const colors = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      sizes[i]  = 0.3 + Math.random() * 1.0; // 섬세한 크기 분포
      brigs[i]  = 0.12 + Math.random() * 0.6; // 은은한 밝기
      phases[i] = phaseRef.current[i];
      const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      colors[i * 3]     = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute('aSize',       new THREE.BufferAttribute(sizes,  1));
    geometry.setAttribute('aBrightness', new THREE.BufferAttribute(brigs,  1));
    geometry.setAttribute('aColor',      new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aPhase',      new THREE.BufferAttribute(phases, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
      uniforms: {
        uTime:          { value: 0 },
        uAudioLevel:    { value: 0 },
        uSpeakingLevel: { value: 0 },
        uBurst:         { value: 0 },
        uFaceBlend:     { value: 0 },
        uEntryPhase:    { value: 0 },
      },
    });
    materialRef.current = material;
    scene.add(new THREE.Points(geometry, material));

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    const animate = () => {
      if (contextLost) return; // WebGL context lost 시 렌더링 중단
      animRef.current = requestAnimationFrame(animate);
      const t   = (performance.now() / 1000) - clockStartRef.current;
      clockElapsedRef.current = t;
      const mat = materialRef.current;
      const pos = posRef.current;
      const vel = velRef.current;
      const free = freeRef.current;
      const phase = phaseRef.current;
      if (!mat) return;

      const curState  = stateRef.current;
      const audio     = audioRef.current;
      const speaking  = speakRef.current;
      const faceBlend = faceBlendRef.current;
      const burst     = burstRef.current;
      const ep        = entryPhaseRef.current;
      const entryAge  = t - entryTimeRef.current; // 엔트리 시작 후 경과 시간

      // ── 자유 목표 위치 업데이트 ──
      for (let i = 0; i < COUNT; i++) {
        const ph = phase[i];
        const slowT = t * 0.22;
        free[i * 3]     += Math.sin(slowT * 0.9 + ph * 1.3) * 0.018;
        free[i * 3 + 1] += Math.cos(slowT * 0.7 + ph * 0.9) * 0.015;
        free[i * 3 + 2] += Math.sin(slowT * 0.55 + ph * 1.1) * 0.010;

        const fx = free[i * 3], fy = free[i * 3 + 1], fz = free[i * 3 + 2];
        const fr = Math.sqrt(fx * fx + fy * fy + fz * fz);
        if (fr > 26) {
          free[i * 3]     *= 0.995;
          free[i * 3 + 1] *= 0.995;
          free[i * 3 + 2] *= 0.995;
        }
      }

      // ── 파티클 물리 업데이트 ──
      for (let i = 0; i < COUNT; i++) {
        const ix = i * 3, iy = ix + 1, iz = ix + 2;
        const px = pos[ix], py = pos[iy], pz = pos[iz];
        const ph = phase[i];

        let ax = 0, ay = 0, az = 0;

        if (ep === 0) {
          // ── 상태별 블렌드 목표 업데이트 ──
          const wBlend = waveBlendRef.current;
          const sBlend = sphereBlendRef.current;
          const freeBlend = Math.max(0, 1 - wBlend - sBlend);

          // 자유 유영 기본 힘
          const tx = free[ix], ty = free[iy], tz = free[iz];
          ax += (tx - px) * 0.010 * freeBlend;
          ay += (ty - py) * 0.010 * freeBlend;
          az += (tz - pz) * 0.010 * freeBlend;

          if (curState === 'listening' && wBlend > 0) {
            // ── 파형 링 목표로 수렴 ──
            const band = i % WAVEFORM_BANDS;
            const ring = Math.floor(i / WAVEFORM_BANDS) % 3;
            const angle = (band / WAVEFORM_BANDS) * Math.PI * 2;
            // 주파수 데이터로 반지름 변조
            let freqAmp = audio;
            const freq = freqRef.current;
            if (freq && freq.length > 0) {
              const freqIdx = Math.floor((band / WAVEFORM_BANDS) * freq.length);
              freqAmp = Math.max(freqAmp, freq[freqIdx] / 255);
            }
            const baseR = 8 + ring * 3.5;
            const waveR = baseR + freqAmp * 6 * Math.sin(t * 5 + band * 0.3);
            const wtx = Math.cos(angle) * waveR;
            const wty = Math.sin(angle) * waveR;
            const wtz = Math.sin(t * 3 + ph) * freqAmp * 3;
            ax += (wtx - px) * 0.06 * wBlend;
            ay += (wty - py) * 0.06 * wBlend;
            az += (wtz - pz) * 0.04 * wBlend;
            // 파형 진동 에너지
            ax += Math.sin(t * 6 + ph) * freqAmp * 0.08 * wBlend;
            ay += Math.cos(t * 5 + ph) * freqAmp * 0.08 * wBlend;
          } else if (curState !== 'listening') {
            // 파형 블렌드 감소
          }

          if (curState === 'speaking' && sBlend > 0) {
            // ── 구체 목표로 수렴 ──
            const stx = SPHERE_TARGETS[ix];
            const sty = SPHERE_TARGETS[iy];
            const stz = SPHERE_TARGETS[iz];
            ax += (stx - px) * 0.05 * sBlend;
            ay += (sty - py) * 0.05 * sBlend;
            az += (stz - pz) * 0.05 * sBlend;
            // 구체 표면 맥동 (JARVIS 목소리 진폭)
            const dist = Math.sqrt(px * px + py * py + pz * pz);
            const pulse = Math.sin(t * 3.0 - dist * 0.2 + ph) * speaking * 0.12;
            if (dist > 0.1) {
              ax += (px / dist) * pulse * sBlend;
              ay += (py / dist) * pulse * sBlend;
              az += (pz / dist) * pulse * sBlend;
            }
          }

          if (curState === 'thinking') {
            ax += -py * 0.004;
            ay +=  px * 0.004;;
          }

        } else if (ep === 1) {
          // ── Phase 1: 폭발 (0~0.6s) ──
          // 중앙에서 사방으로 강하게 폭발
          const dist = Math.sqrt(px * px + py * py + pz * pz) + 0.1;
          const blastStrength = Math.max(0, 1.0 - entryAge / 0.6);
          ax = (px / dist) * blastStrength * 1.8 + (Math.random() - 0.5) * blastStrength * 0.8;
          ay = (py / dist) * blastStrength * 1.8 + (Math.random() - 0.5) * blastStrength * 0.8;
          az = (pz / dist) * blastStrength * 1.2 + (Math.random() - 0.5) * blastStrength * 0.5;

          // 0.6초 지나면 phase 2로
          if (entryAge >= 0.6) {
            entryPhaseRef.current = 2;
          }

        } else if (ep === 2) {
          // ── Phase 2: 소용돌이 수렴 (0.6~2.2s) ──
          const age2 = entryAge - 0.6; // phase 2 내 경과 시간
          const progress = Math.min(age2 / 1.6, 1.0); // 0→1 (1.6초간)

          // 얼굴 목표
          const ftx = FACE_TARGETS[ix];
          const fty = FACE_TARGETS[iy];
          const ftz = FACE_TARGETS[iz];

          // 소용돌이 힘: 나선형으로 당기기
          const toFaceX = ftx - px;
          const toFaceY = fty - py;
          const toFaceZ = ftz - pz;

          // 직선 당김 (점점 강해짐)
          const pullStrength = 0.04 + progress * 0.12;
          ax += toFaceX * pullStrength;
          ay += toFaceY * pullStrength;
          az += toFaceZ * pullStrength;

          // 소용돌이 회전력 (초반에 강하고 후반에 약해짐)
          const swirlStrength = (1.0 - progress) * 0.08;
          const swirlSpeed = t * 6.0 + ph * 2.0;
          ax += -py * swirlStrength + Math.cos(swirlSpeed) * swirlStrength * 2.0;
          ay +=  px * swirlStrength + Math.sin(swirlSpeed) * swirlStrength * 2.0;

          // 진동 (에너지감)
          const vibration = (1.0 - progress) * 0.15;
          ax += Math.sin(t * 12 + ph * 3) * vibration;
          ay += Math.cos(t * 10 + ph * 2) * vibration;

          // 2.2초 지나면 phase 3으로
          if (entryAge >= 2.2) {
            entryPhaseRef.current = 3;
            faceBlendRef.current = 1.0;
          } else {
            // 블렌드 점진적 증가
            faceBlendRef.current = Math.min(progress * 1.1, 1.0);
          }

        } else if (ep === 3) {
          // ── Phase 3: 얼굴 고정 + 미세 진동 ──
          const ftx = FACE_TARGETS[ix];
          const fty = FACE_TARGETS[iy];
          const ftz = FACE_TARGETS[iz];

          // 강한 스프링으로 얼굴 위치 유지
          ax = (ftx - px) * 0.06;
          ay = (fty - py) * 0.06;
          az = (ftz - pz) * 0.06;

          // 미세한 생동감 진동
          const breathe = Math.sin(t * 1.5 + ph) * 0.008;
          ax += Math.sin(t * 2 + ph) * 0.012 + breathe;
          ay += Math.cos(t * 1.8 + ph) * 0.012;

          // 음성 반응 (말할 때 얼굴이 진동)
          if (curState === 'speaking') {
            ax += Math.sin(t * 8 + ph) * speaking * 0.06;
            ay += Math.cos(t * 7 + ph) * speaking * 0.06;
          }
          if (curState === 'listening') {
            ax += Math.sin(t * 6 + ph) * audio * 0.04;
            ay += Math.cos(t * 5 + ph) * audio * 0.04;
          }

        }

        // 폭발 힘 (박수 순간)
        if (burst > 0.01) {
          const dist = Math.sqrt(px * px + py * py + pz * pz) + 0.1;
          ax += (px / dist) * burst * 0.5;
          ay += (py / dist) * burst * 0.5;
          az += (pz / dist) * burst * 0.3;
        }

        // 감쇠 (phase별 다르게)
        const damping = ep === 1 ? 0.92 : ep === 2 ? 0.88 : ep === 3 ? 0.82 : 0.97;
        vel[ix] = vel[ix] * damping + ax;
        vel[iy] = vel[iy] * damping + ay;
        vel[iz] = vel[iz] * damping + az;

        // 속도 제한
        const speed = Math.sqrt(vel[ix] ** 2 + vel[iy] ** 2 + vel[iz] ** 2);
        const maxSpeed = ep === 1 ? 1.8 : ep === 2 ? 1.2 : ep === 3 ? 0.4 : 0.35;
        if (speed > maxSpeed) {
          vel[ix] *= maxSpeed / speed;
          vel[iy] *= maxSpeed / speed;
          vel[iz] *= maxSpeed / speed;
        }

        pos[ix] += vel[ix];
        pos[iy] += vel[iy];
        pos[iz] += vel[iz];
      }

      // ── 블렌드 값 부드럽게 전환 ──
      const targetWave   = (curState === 'listening'  && ep === 0) ? 1 : 0;
      const targetSphere = (curState === 'speaking'   && ep === 0) ? 1 : 0;
      waveBlendRef.current   += (targetWave   - waveBlendRef.current)   * 0.04;
      sphereBlendRef.current += (targetSphere - sphereBlendRef.current) * 0.04;

      // GPU 업데이트
      posAttrRef.current!.needsUpdate = true;
      // 유니폼 업데이트
      mat.uniforms.uTime.value          = t;
      mat.uniforms.uAudioLevel.value    = audio;
      mat.uniforms.uSpeakingLevel.value = speaking;
      mat.uniforms.uFaceBlend.value     = faceBlendRef.current;
      mat.uniforms.uEntryPhase.value    = ep > 0 ? Math.min(entryAge / 2.2, 1.0) : 0;

      // 상태별 색상 맥동 (라우팅 시각화)
      if (curState === 'working') {
        // Working 상태일 때 보라색/금색 맥동 (Manus/Engine 느낌)
        const pulse = Math.sin(t * 2.0) * 0.5 + 0.5;
        mat.uniforms.uAudioLevel.value += pulse * 0.2;
      }

      // 버스트 감쇠
      if (burstRef.current > 0) {
        burstRef.current = Math.max(0, burstRef.current - 0.04);
        mat.uniforms.uBurst.value = burstRef.current;
      }

      // 카메라: idle 시 느린 회전, 얼굴 수렴 시 정면으로 이동
      if (ep >= 2) {
        // 얼굴 수렴 중: 카메라가 정면으로 이동
        const camProgress = Math.min((entryTimeRef.current > 0 ? t - entryTimeRef.current : 0) / 2.5, 1);
        camera.position.x = Math.sin(t * 0.04) * 2.5 * (1 - camProgress * 0.7);
        camera.position.y = Math.cos(t * 0.03) * 1.2 * (1 - camProgress * 0.5);
        camera.position.z = 30 - camProgress * 4; // 살짝 줌인
      } else {
        camera.position.x = Math.sin(t * 0.04) * 2.5;
        camera.position.y = Math.cos(t * 0.03) * 1.2;
        camera.position.z = 30;
      }
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [init]);

  // 상태 변경 → idle로 돌아오면 자유 유영으로 복귀
  useEffect(() => {
    stateRef.current = state;
    if (state === 'idle' && entryPhaseRef.current > 0) {
      // 얼굴에서 자유 유영으로 복귀
      const startBlend = faceBlendRef.current;
      const startTime = performance.now();
      const duration = 2500;
      const dissolve = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        faceBlendRef.current = startBlend * (1 - ease);
        if (t < 1) requestAnimationFrame(dissolve);
        else {
          entryPhaseRef.current = 0;
          faceBlendRef.current = 0;
        }
      };
      requestAnimationFrame(dissolve);
    }
  }, [state]);

  useEffect(() => { audioRef.current = audioLevel; }, [audioLevel]);
  useEffect(() => { speakRef.current = speakingLevel; }, [speakingLevel]);
  useEffect(() => { freqRef.current = freqData ?? null; }, [freqData]);

  // 박수 → 3단계 애니메이션 시작
  useEffect(() => {
    if (!clapBurst) return;

    // 폭발 효과
    burstRef.current = 1.2;
    const mat = materialRef.current;
    if (mat) mat.uniforms.uBurst.value = 1.2;

    // Phase 1 시작
    entryPhaseRef.current = 1;
    entryTimeRef.current = clockElapsedRef.current;
    faceBlendRef.current = 0;

  }, [clapBurst]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
