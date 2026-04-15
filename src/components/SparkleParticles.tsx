import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import type { JarvisState } from '../lib/jarvis-brain';

interface SparkleParticlesProps {
  state: JarvisState;
  audioLevel: number;
  speakingLevel: number;
  clapBurst: boolean;
}

// ── 버텍스 셰이더: 부드럽고 천천히 흐르는 움직임 ──
const VERTEX_SHADER = `
  attribute float aSize;
  attribute float aBrightness;
  attribute vec3  aColor;
  attribute float aPhase;
  attribute vec3  aVelocity;

  uniform float uTime;
  uniform float uAudioLevel;
  uniform float uSpeakingLevel;
  uniform float uBurst;
  uniform int   uState;

  varying float vBrightness;
  varying vec3  vColor;

  void main() {
    vec3 pos = position;
    float t = uTime * 0.18 + aPhase; // 매우 느린 기본 속도

    if (uState == 0) {
      // Idle: 아주 천천히 부유 — 안개처럼
      pos.x += sin(t * 0.7 + aPhase * 1.1) * 1.8;
      pos.y += cos(t * 0.55 + aPhase * 0.9) * 1.4 + sin(uTime * 0.08 + aPhase) * 0.6;
      pos.z += sin(t * 0.45 + aPhase * 1.3) * 1.2;
    } else if (uState == 1) {
      // Listening: 중앙으로 부드럽게 수렴 + 마이크 반응
      float pull = 0.04 + uAudioLevel * 0.08;
      pos.x += -pos.x * pull + sin(uTime * 0.5 + aPhase) * (0.8 + uAudioLevel * 1.5);
      pos.z += -pos.z * pull + cos(uTime * 0.4 + aPhase) * (0.8 + uAudioLevel * 1.5);
      pos.y += sin(uTime * 0.6 + aPhase) * (0.5 + uAudioLevel * 1.2);
    } else if (uState == 2) {
      // Thinking: 우아한 나선형 회전
      float angle = uTime * 0.3 + aPhase;
      float radius = length(pos.xz) * 0.85 + 3.0;
      pos.x = cos(angle) * radius;
      pos.z = sin(angle) * radius;
      pos.y += sin(uTime * 0.4 + aPhase) * 0.8;
    } else if (uState == 3) {
      // Speaking: 부드러운 파동 확산
      float wave = sin(uTime * 0.9 + length(pos) * 0.15 + aPhase) * (0.8 + uSpeakingLevel * 2.0);
      pos += normalize(pos + vec3(0.001)) * wave * 0.25;
      pos.y += sin(uTime * 0.7 + aPhase) * uSpeakingLevel * 1.2;
    } else {
      // Working: 느린 소용돌이
      float angle = uTime * 0.5 + aPhase;
      pos.x += sin(angle) * 0.9;
      pos.z += cos(angle) * 0.9;
      pos.y += sin(uTime * 0.6 + aPhase) * 0.7;
    }

    // 폭발 효과 (박수)
    if (uBurst > 0.0) {
      vec3 dir = normalize(pos + vec3(0.001));
      pos += dir * uBurst * 8.0 * aBrightness;
    }

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float dist = max(-mvPos.z, 0.1);
    // 파티클 크기: 매우 작게 유지
    float sizeBoost = 1.0 + uAudioLevel * 0.8 + uSpeakingLevel * 1.0 + uBurst * 1.2;
    gl_PointSize = aSize * sizeBoost * (280.0 / dist);
    gl_PointSize = clamp(gl_PointSize, 0.5, 6.0); // 최대 6px로 제한

    vBrightness = aBrightness * (0.5 + uAudioLevel * 0.4 + uSpeakingLevel * 0.6 + uBurst * 0.8);
    vColor = aColor;
  }
`;

// ── 프래그먼트 셰이더: 부드러운 원형 글로우 ──
const FRAGMENT_SHADER = `
  varying float vBrightness;
  varying vec3  vColor;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);

    // 부드러운 원형 코어
    float core = 1.0 - smoothstep(0.0, 0.25, dist);
    // 넓은 글로우 헤일로
    float glow = exp(-dist * 6.0) * 0.5;
    // 작은 빛줄기 (매우 미세하게)
    float ray1 = max(0.0, 1.0 - abs(uv.x) * 18.0) * max(0.0, 1.0 - abs(uv.y) * 4.0) * 0.3;
    float ray2 = max(0.0, 1.0 - abs(uv.y) * 18.0) * max(0.0, 1.0 - abs(uv.x) * 4.0) * 0.3;

    float alpha = (core + glow + ray1 + ray2) * vBrightness;
    if (alpha < 0.008) discard;

    // 코어는 밝은 화이트, 외곽은 원래 색상
    vec3 col = mix(vColor, vec3(1.0), core * 0.7);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.9));
  }
`;

export default function SparkleParticles({ state, audioLevel, speakingLevel, clapBurst }: SparkleParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const animFrameRef = useRef<number>(0);
  const clockRef = useRef(new THREE.Clock());
  const burstRef = useRef(0);

  const stateMap: Record<JarvisState, number> = {
    idle: 0, listening: 1, thinking: 2, speaking: 3, working: 4,
  };

  const initParticles = useCallback((count: number) => {
    const positions    = new Float32Array(count * 3);
    const sizes        = new Float32Array(count);
    const brightnesses = new Float32Array(count);
    const colors       = new Float32Array(count * 3);
    const phases       = new Float32Array(count);
    const velocities   = new Float32Array(count * 3);

    // 고급스러운 색상 팔레트: 딥 블루 + 소프트 골드 + 실버 화이트
    const palette = [
      new THREE.Color(0x4A90E2), // 소프트 블루
      new THREE.Color(0x7BB3F0), // 라이트 블루
      new THREE.Color(0xC8A96E), // 소프트 골드
      new THREE.Color(0xE8D5A3), // 페일 골드
      new THREE.Color(0xD4E8FF), // 아이스 화이트
      new THREE.Color(0xFFFFFF), // 퓨어 화이트
      new THREE.Color(0x8FB8E8), // 미드 블루
      new THREE.Color(0xB8D4F0), // 페일 블루
    ];

    for (let i = 0; i < count; i++) {
      // 구형 분포 — 더 넓게 퍼지게
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 5 + Math.pow(Math.random(), 0.6) * 28;

      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      positions[i * 3 + 2] = r * Math.cos(phi);

      // 크기: 매우 작게 (0.5~2.5)
      sizes[i]        = 0.5 + Math.random() * 2.0;
      brightnesses[i] = 0.15 + Math.random() * 0.65;
      phases[i]       = Math.random() * Math.PI * 2;

      velocities[i * 3]     = (Math.random() - 0.5) * 0.02;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;

      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3]     = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    return { positions, sizes, brightnesses, colors, phases, velocities };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 0, 32);

    // 파티클 수: 15,000개 (성능 + 품질 균형)
    const COUNT = 15000;
    const { positions, sizes, brightnesses, colors, phases, velocities } = initParticles(COUNT);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',    new THREE.BufferAttribute(positions,    3));
    geometry.setAttribute('aSize',       new THREE.BufferAttribute(sizes,        1));
    geometry.setAttribute('aBrightness', new THREE.BufferAttribute(brightnesses, 1));
    geometry.setAttribute('aColor',      new THREE.BufferAttribute(colors,       3));
    geometry.setAttribute('aPhase',      new THREE.BufferAttribute(phases,       1));
    geometry.setAttribute('aVelocity',   new THREE.BufferAttribute(velocities,   3));

    const material = new THREE.ShaderMaterial({
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
      uniforms: {
        uTime:          { value: 0 },
        uAudioLevel:    { value: 0 },
        uSpeakingLevel: { value: 0 },
        uBurst:         { value: 0 },
        uState:         { value: 0 },
      },
    });
    materialRef.current = material;

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const elapsed = clockRef.current.getElapsedTime();
      const mat = materialRef.current;
      if (!mat) return;

      mat.uniforms.uTime.value = elapsed;

      // 버스트 감쇠 (천천히)
      if (burstRef.current > 0) {
        burstRef.current = Math.max(0, burstRef.current - 0.025);
        mat.uniforms.uBurst.value = burstRef.current;
      }

      // 카메라: 매우 느리고 우아하게 회전
      camera.position.x = Math.sin(elapsed * 0.025) * 2.5;
      camera.position.y = Math.cos(elapsed * 0.018) * 1.2;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', onResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [initParticles]);

  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    mat.uniforms.uState.value = stateMap[state];
  }, [state]);

  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    mat.uniforms.uAudioLevel.value    = audioLevel;
    mat.uniforms.uSpeakingLevel.value = speakingLevel;
  }, [audioLevel, speakingLevel]);

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
