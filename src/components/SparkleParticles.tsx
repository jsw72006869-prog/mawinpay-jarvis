import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import type { JarvisState } from '../lib/jarvis-brain';

interface SparkleParticlesProps {
  state: JarvisState;
  audioLevel: number;       // 0~1 마이크 입력 레벨
  speakingLevel: number;    // 0~1 TTS 출력 레벨
  clapBurst: boolean;       // true 시 폭발 효과
}

// ─── 셰이더: 각 파티클을 별(4각 스파클) 모양으로 렌더링 ───
const VERTEX_SHADER = `
  attribute float aSize;
  attribute float aBrightness;
  attribute vec3  aColor;
  attribute float aPhase;

  uniform float uTime;
  uniform float uAudioLevel;
  uniform float uSpeakingLevel;
  uniform float uBurst;
  uniform int   uState; // 0=idle 1=listening 2=thinking 3=speaking 4=working

  varying float vBrightness;
  varying vec3  vColor;
  varying float vDist;

  void main() {
    vec3 pos = position;

    // ── 상태별 움직임 ──
    float t = uTime + aPhase;
    float idleWave = sin(t * 0.4 + pos.x * 0.3) * 0.8 + cos(t * 0.3 + pos.z * 0.25) * 0.6;

    if (uState == 0) {
      // Idle: 은하수처럼 유영
      pos.x += sin(t * 0.25 + aPhase) * 1.2;
      pos.y += cos(t * 0.2  + aPhase * 1.3) * 0.9 + idleWave * 0.3;
      pos.z += sin(t * 0.18 + aPhase * 0.7) * 1.0;
    } else if (uState == 1) {
      // Listening: 중앙으로 소용돌이 + 오디오 반응
      float spiral = t * 1.4;
      float r = length(pos.xz);
      float pull = 0.08 + uAudioLevel * 0.18;
      pos.x += (-pos.x * pull + sin(spiral + aPhase) * 2.0 * uAudioLevel);
      pos.z += (-pos.z * pull + cos(spiral + aPhase) * 2.0 * uAudioLevel);
      pos.y += sin(t * 0.8 + aPhase) * (1.0 + uAudioLevel * 3.0);
    } else if (uState == 2) {
      // Thinking: 회전하는 링
      float angle = t * 0.6 + aPhase;
      float radius = 6.0 + sin(t * 0.4 + aPhase) * 2.0;
      pos.x = cos(angle) * radius;
      pos.z = sin(angle) * radius;
      pos.y += sin(t * 1.2 + aPhase) * 1.5;
    } else if (uState == 3) {
      // Speaking: 파동 확장 + TTS 레벨 반응
      float wave = sin(t * 2.0 + length(pos) * 0.3 + aPhase) * (1.5 + uSpeakingLevel * 4.0);
      pos += normalize(pos) * wave * 0.4;
      pos.y += sin(t * 1.5 + aPhase) * uSpeakingLevel * 2.5;
    } else {
      // Working: 빠른 소용돌이
      float angle = t * 1.8 + aPhase;
      float r2 = length(pos.xz);
      pos.x += sin(angle) * 1.5;
      pos.z += cos(angle) * 1.5;
      pos.y += sin(t * 2.0 + aPhase) * 1.2;
    }

    // ── 폭발 효과 ──
    if (uBurst > 0.0) {
      vec3 dir = normalize(pos + vec3(0.001));
      pos += dir * uBurst * 18.0 * (0.5 + aBrightness);
    }

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    // 거리에 따른 크기 감쇠
    float dist = -mvPos.z;
    vDist = dist;
    float sizeBoost = 1.0 + uAudioLevel * 2.5 + uSpeakingLevel * 3.0 + uBurst * 2.0;
    gl_PointSize = aSize * sizeBoost * (350.0 / dist);

    vBrightness = aBrightness * (0.7 + uAudioLevel * 0.8 + uSpeakingLevel * 1.2 + uBurst * 1.5);
    vColor = aColor;
  }
`;

const FRAGMENT_SHADER = `
  varying float vBrightness;
  varying vec3  vColor;
  varying float vDist;

  void main() {
    // 별(스파클) 모양: 중심에서 방사형 + 4방향 빛줄기
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);

    // 원형 코어
    float core = 1.0 - smoothstep(0.0, 0.22, dist);

    // 4방향 빛줄기 (스파클)
    float ray1 = max(0.0, 1.0 - abs(uv.x) * 12.0) * max(0.0, 1.0 - abs(uv.y) * 3.0);
    float ray2 = max(0.0, 1.0 - abs(uv.y) * 12.0) * max(0.0, 1.0 - abs(uv.x) * 3.0);
    // 45도 빛줄기
    vec2 rot45 = vec2(uv.x + uv.y, uv.x - uv.y) * 0.707;
    float ray3 = max(0.0, 1.0 - abs(rot45.x) * 14.0) * max(0.0, 1.0 - abs(rot45.y) * 3.5);
    float ray4 = max(0.0, 1.0 - abs(rot45.y) * 14.0) * max(0.0, 1.0 - abs(rot45.x) * 3.5);

    float sparkle = core + (ray1 + ray2) * 0.55 + (ray3 + ray4) * 0.35;
    sparkle = clamp(sparkle, 0.0, 1.0);

    if (sparkle < 0.01) discard;

    // 글로우 헤일로
    float glow = exp(-dist * 5.0) * 0.4;
    float alpha = (sparkle + glow) * vBrightness;

    // 색상: 코어는 화이트, 외곽은 파란빛
    vec3 coreColor = mix(vColor, vec3(1.0, 1.0, 1.0), core * 0.85);
    gl_FragColor = vec4(coreColor, alpha);
  }
`;

export default function SparkleParticles({ state, audioLevel, speakingLevel, clapBurst }: SparkleParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const animFrameRef = useRef<number>(0);
  const clockRef = useRef(new THREE.Clock());
  const burstRef = useRef(0);

  const stateMap: Record<JarvisState, number> = {
    idle: 0, listening: 1, thinking: 2, speaking: 3, working: 4,
  };

  // ── 파티클 초기화 ──
  const initParticles = useCallback((count: number) => {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const brightnesses = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);

    // 색상 팔레트: 일렉트릭 블루 ~ 네온 화이트 ~ 아이스 블루
    const palette = [
      new THREE.Color(0x00F5FF), // 시안
      new THREE.Color(0x0066FF), // 블루
      new THREE.Color(0x4FC3F7), // 라이트 블루
      new THREE.Color(0xFFFFFF), // 화이트
      new THREE.Color(0xB3E5FC), // 아이스
      new THREE.Color(0x00B4D8), // 딥 시안
      new THREE.Color(0xE0F7FA), // 거의 화이트
    ];

    for (let i = 0; i < count; i++) {
      // 구형 분포 + 약간의 디스크 형태
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 4 + Math.random() * 22; // 반지름 4~26

      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55; // Y축 압축 → 디스크
      positions[i * 3 + 2] = r * Math.cos(phi);

      sizes[i] = 1.2 + Math.random() * 4.5;
      brightnesses[i] = 0.25 + Math.random() * 0.75;
      phases[i] = Math.random() * Math.PI * 2;

      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3]     = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    return { positions, sizes, brightnesses, colors, phases };
  }, []);

  // ── Three.js 씬 초기화 ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 0, 28);
    cameraRef.current = camera;

    // 파티클 수: 성능 고려 30,000개
    const COUNT = 30000;
    const { positions, sizes, brightnesses, colors, phases } = initParticles(COUNT);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',    new THREE.BufferAttribute(positions,    3));
    geometry.setAttribute('aSize',       new THREE.BufferAttribute(sizes,        1));
    geometry.setAttribute('aBrightness', new THREE.BufferAttribute(brightnesses, 1));
    geometry.setAttribute('aColor',      new THREE.BufferAttribute(colors,       3));
    geometry.setAttribute('aPhase',      new THREE.BufferAttribute(phases,       1));

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime:         { value: 0 },
        uAudioLevel:   { value: 0 },
        uSpeakingLevel:{ value: 0 },
        uBurst:        { value: 0 },
        uState:        { value: 0 },
      },
    });
    materialRef.current = material;

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // 리사이즈 핸들러
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // 애니메이션 루프
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const elapsed = clockRef.current.getElapsedTime();
      const mat = materialRef.current;
      if (!mat) return;

      mat.uniforms.uTime.value = elapsed;

      // 버스트 감쇠
      if (burstRef.current > 0) {
        burstRef.current = Math.max(0, burstRef.current - 0.04);
        mat.uniforms.uBurst.value = burstRef.current;
      }

      // 카메라 천천히 회전
      camera.position.x = Math.sin(elapsed * 0.05) * 3;
      camera.position.y = Math.cos(elapsed * 0.04) * 1.5;
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

  // ── 상태 업데이트 ──
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    mat.uniforms.uState.value = stateMap[state];
  }, [state]);

  // ── 오디오 레벨 업데이트 ──
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    mat.uniforms.uAudioLevel.value = audioLevel;
    mat.uniforms.uSpeakingLevel.value = speakingLevel;
  }, [audioLevel, speakingLevel]);

  // ── 박수 폭발 ──
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
