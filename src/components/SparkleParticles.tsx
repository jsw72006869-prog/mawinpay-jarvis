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
}

// ── 버텍스 셰이더 ──
const VERT = `
  attribute float aSize;
  attribute float aBrightness;
  attribute vec3  aColor;
  attribute float aPhase;

  uniform float uTime;
  uniform float uAudioLevel;
  uniform float uSpeakingLevel;
  uniform float uBurst;
  uniform float uFaceBlend;   // 0=자유, 1=얼굴 형태

  varying float vBrightness;
  varying vec3  vColor;
  varying float vDist;

  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float dist = max(-mvPos.z, 0.1);
    float sizeBoost = 1.0
      + uAudioLevel    * 0.6
      + uSpeakingLevel * 0.8
      + uBurst         * 1.5
      + uFaceBlend     * 0.3;
    gl_PointSize = aSize * sizeBoost * (300.0 / dist);
    gl_PointSize = clamp(gl_PointSize, 0.5, 5.5);

    vBrightness = aBrightness
      * (0.55 + uAudioLevel * 0.35 + uSpeakingLevel * 0.5 + uBurst * 0.6 + uFaceBlend * 0.4);
    vColor = aColor;
    vDist = dist;
  }
`;

// ── 프래그먼트 셰이더: 부드러운 원형 글로우 ──
const FRAG = `
  varying float vBrightness;
  varying vec3  vColor;
  varying float vDist;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);

    float core = 1.0 - smoothstep(0.0, 0.22, d);
    float glow = exp(-d * 7.0) * 0.45;
    float ray1 = max(0.0, 1.0 - abs(uv.x) * 20.0) * max(0.0, 1.0 - abs(uv.y) * 5.0) * 0.25;
    float ray2 = max(0.0, 1.0 - abs(uv.y) * 20.0) * max(0.0, 1.0 - abs(uv.x) * 5.0) * 0.25;

    float alpha = (core + glow + ray1 + ray2) * vBrightness;
    if (alpha < 0.008) discard;

    vec3 col = mix(vColor, vec3(1.0), core * 0.65);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
  }
`;

const COUNT = 12000;

// ── 고급 색상 팔레트 ──
const PALETTE = [
  new THREE.Color(0x4A90E2),
  new THREE.Color(0x7BB3F0),
  new THREE.Color(0xC8A96E),
  new THREE.Color(0xE8D5A3),
  new THREE.Color(0xD4E8FF),
  new THREE.Color(0xFFFFFF),
  new THREE.Color(0x8FB8E8),
  new THREE.Color(0xB8D4F0),
  new THREE.Color(0xA0C4FF),
  new THREE.Color(0xFFE8A0),
];

// 얼굴 형태 목표 좌표 (스케일 조정)
const FACE_SCALE = 1.6;
const FACE_TARGETS = new Float32Array(COUNT * 3);
for (let i = 0; i < COUNT; i++) {
  const fp = FACE_POINTS[i % FACE_POINTS.length];
  FACE_TARGETS[i * 3]     = fp[0] * FACE_SCALE;
  FACE_TARGETS[i * 3 + 1] = fp[1] * FACE_SCALE;
  FACE_TARGETS[i * 3 + 2] = fp[2] * FACE_SCALE * 0.3;
}

export default function SparkleParticles({ state, audioLevel, speakingLevel, clapBurst }: SparkleParticlesProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const materialRef  = useRef<THREE.ShaderMaterial | null>(null);
  const posAttrRef   = useRef<THREE.BufferAttribute | null>(null);
  const animRef      = useRef<number>(0);
  const clockRef     = useRef(new THREE.Clock());

  // CPU 파티클 상태 (물리 시뮬레이션)
  const posRef = useRef<Float32Array>(new Float32Array(COUNT * 3));
  const velRef = useRef<Float32Array>(new Float32Array(COUNT * 3));
  const freeRef = useRef<Float32Array>(new Float32Array(COUNT * 3)); // 자유 목표 위치
  const phaseRef = useRef<Float32Array>(new Float32Array(COUNT));

  // 블렌드 상태
  const faceBlendRef = useRef(0);
  const burstRef     = useRef(0);
  const stateRef     = useRef<JarvisState>('idle');
  const audioRef     = useRef(0);
  const speakRef     = useRef(0);

  // 초기화
  const init = useCallback(() => {
    const pos   = posRef.current;
    const vel   = velRef.current;
    const free  = freeRef.current;
    const phase = phaseRef.current;

    for (let i = 0; i < COUNT; i++) {
      // 구형 분포 초기 위치
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 4 + Math.pow(Math.random(), 0.5) * 24;

      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      pos[i * 3 + 2] = r * Math.cos(phi);

      // 자유 목표: 천천히 흐르는 구름 형태
      free[i * 3]     = pos[i * 3];
      free[i * 3 + 1] = pos[i * 3 + 1];
      free[i * 3 + 2] = pos[i * 3 + 2];

      // 초기 속도: 매우 작게
      vel[i * 3]     = (Math.random() - 0.5) * 0.008;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.008;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.005;

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

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 0, 30);

    // 지오메트리
    const geometry = new THREE.BufferGeometry();
    const posAttr  = new THREE.BufferAttribute(new Float32Array(posRef.current), 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', posAttr);
    posAttrRef.current = posAttr;

    // 정적 속성
    const sizes  = new Float32Array(COUNT);
    const brigs  = new Float32Array(COUNT);
    const colors = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      sizes[i]  = 0.6 + Math.random() * 1.8;
      brigs[i]  = 0.2 + Math.random() * 0.65;
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

    // ── 메인 애니메이션 루프 ──
    const animate = () => {
      animRef.current = requestAnimationFrame(animate);
      const t   = clockRef.current.getElapsedTime();
      const dt  = Math.min(clockRef.current.getDelta(), 0.05);
      const mat = materialRef.current;
      const pos = posRef.current;
      const vel = velRef.current;
      const free = freeRef.current;
      const phase = phaseRef.current;
      if (!mat) return;

      const curState   = stateRef.current;
      const audio      = audioRef.current;
      const speaking   = speakRef.current;
      const faceBlend  = faceBlendRef.current;
      const burst      = burstRef.current;

      // 자유 목표 위치 업데이트 (perlin-like noise로 천천히 이동)
      for (let i = 0; i < COUNT; i++) {
        const ph = phase[i];
        const slowT = t * 0.07; // 매우 느린 흐름
        free[i * 3]     = free[i * 3]     + Math.sin(slowT * 0.8 + ph * 1.3) * 0.004;
        free[i * 3 + 1] = free[i * 3 + 1] + Math.cos(slowT * 0.6 + ph * 0.9) * 0.003;
        free[i * 3 + 2] = free[i * 3 + 2] + Math.sin(slowT * 0.5 + ph * 1.1) * 0.002;

        // 경계 반발 (구형 경계 r=28)
        const fx = free[i * 3], fy = free[i * 3 + 1], fz = free[i * 3 + 2];
        const fr = Math.sqrt(fx * fx + fy * fy + fz * fz);
        if (fr > 26) {
          free[i * 3]     *= 0.995;
          free[i * 3 + 1] *= 0.995;
          free[i * 3 + 2] *= 0.995;
        }
      }

      // 파티클 물리 업데이트
      for (let i = 0; i < COUNT; i++) {
        const ix = i * 3, iy = ix + 1, iz = ix + 2;
        const px = pos[ix], py = pos[iy], pz = pos[iz];

        // 목표 위치 결정 (자유 ↔ 얼굴 블렌딩)
        const tx = free[ix]     * (1 - faceBlend) + FACE_TARGETS[ix]     * faceBlend;
        const ty = free[iy]     * (1 - faceBlend) + FACE_TARGETS[iy]     * faceBlend;
        const tz = free[iz]     * (1 - faceBlend) + FACE_TARGETS[iz]     * faceBlend;

        // 스프링 힘 (목표 방향)
        const springK = faceBlend > 0.1 ? 0.018 : 0.006;
        const fx2 = (tx - px) * springK;
        const fy2 = (ty - py) * springK;
        const fz2 = (tz - pz) * springK;

        // 상태별 추가 힘
        let ax = fx2, ay = fy2, az = fz2;

        if (curState === 'listening') {
          // 중앙으로 살짝 당기기 + 마이크 진동
          ax += -px * 0.003 + Math.sin(t * 3 + phase[i]) * audio * 0.08;
          ay += -py * 0.003 + Math.cos(t * 2.5 + phase[i]) * audio * 0.08;
        } else if (curState === 'speaking') {
          // 파동 확산
          const dist = Math.sqrt(px * px + py * py + pz * pz);
          const wave = Math.sin(t * 2.5 - dist * 0.2 + phase[i]) * speaking * 0.06;
          if (dist > 0.1) {
            ax += (px / dist) * wave;
            ay += (py / dist) * wave;
            az += (pz / dist) * wave;
          }
        } else if (curState === 'thinking') {
          // 부드러운 소용돌이
          ax += -py * 0.002;
          ay +=  px * 0.002;
        }

        // 폭발 힘
        if (burst > 0.01) {
          const dist = Math.sqrt(px * px + py * py + pz * pz) + 0.1;
          ax += (px / dist) * burst * 0.3;
          ay += (py / dist) * burst * 0.3;
          az += (pz / dist) * burst * 0.2;
        }

        // 속도 업데이트 (감쇠)
        const damping = faceBlend > 0.5 ? 0.88 : 0.96;
        vel[ix] = vel[ix] * damping + ax;
        vel[iy] = vel[iy] * damping + ay;
        vel[iz] = vel[iz] * damping + az;

        // 속도 제한
        const speed = Math.sqrt(vel[ix] ** 2 + vel[iy] ** 2 + vel[iz] ** 2);
        const maxSpeed = faceBlend > 0.5 ? 0.4 : 0.18;
        if (speed > maxSpeed) {
          vel[ix] *= maxSpeed / speed;
          vel[iy] *= maxSpeed / speed;
          vel[iz] *= maxSpeed / speed;
        }

        pos[ix] += vel[ix];
        pos[iy] += vel[iy];
        pos[iz] += vel[iz];
      }

      // GPU 업데이트
      posAttrRef.current!.needsUpdate = true;

      // 유니폼 업데이트
      mat.uniforms.uTime.value          = t;
      mat.uniforms.uAudioLevel.value    = audio;
      mat.uniforms.uSpeakingLevel.value = speaking;
      mat.uniforms.uFaceBlend.value     = faceBlend;

      // 버스트 감쇠
      if (burstRef.current > 0) {
        burstRef.current = Math.max(0, burstRef.current - 0.03);
        mat.uniforms.uBurst.value = burstRef.current;
      }

      // 카메라: 매우 느리고 우아하게
      camera.position.x = Math.sin(t * 0.02) * 2.0;
      camera.position.y = Math.cos(t * 0.015) * 1.0;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [init]);

  // 상태 변경
  useEffect(() => {
    stateRef.current = state;
    // 얼굴 형태 블렌드: listening/speaking/working 시 얼굴로 수렴
    const targetBlend = (state === 'listening' || state === 'speaking' || state === 'working') ? 1.0 : 0.0;
    const startBlend = faceBlendRef.current;
    const startTime = performance.now();
    const duration = 2200; // 2.2초 부드럽게 전환

    const blend = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      // ease in-out cubic
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      faceBlendRef.current = startBlend + (targetBlend - startBlend) * ease;
      if (t < 1) requestAnimationFrame(blend);
    };
    requestAnimationFrame(blend);
  }, [state]);

  useEffect(() => { audioRef.current = audioLevel; }, [audioLevel]);
  useEffect(() => { speakRef.current = speakingLevel; }, [speakingLevel]);

  useEffect(() => {
    if (!clapBurst) return;
    burstRef.current = 1.0;
    const mat = materialRef.current;
    if (mat) mat.uniforms.uBurst.value = 1.0;
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
