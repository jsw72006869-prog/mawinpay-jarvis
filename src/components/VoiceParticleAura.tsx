import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Points, PointMaterial } from '@react-three/drei';

interface VoiceParticleAuraProps {
  micLevel: number;
  speakingLevel: number;
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'working';
}

function Particles({ micLevel, speakingLevel, state }: VoiceParticleAuraProps) {
  const count = 1000;
  const mesh = useRef<THREE.Points>(null);
  
  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 2 + Math.random() * 0.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
  }, []);

  const color = useMemo(() => {
    if (state === 'listening') return '#E8A87C';
    if (state === 'speaking') return '#4A90E2';
    if (state === 'thinking') return '#9B8EC4';
    if (state === 'working') return '#7EC89B';
    return '#C8A96E';
  }, [state]);

  useFrame((s) => {
    if (!mesh.current) return;
    const time = s.clock.getElapsedTime();
    const activeLevel = state === 'listening' ? micLevel : state === 'speaking' ? speakingLevel : 0.05;
    
    mesh.current.rotation.y = time * 0.2;
    mesh.current.rotation.z = time * 0.1;
    
    const scale = 1 + activeLevel * 2;
    mesh.current.scale.setScalar(THREE.MathUtils.lerp(mesh.current.scale.x, scale, 0.1));
  });

  return (
    <Points ref={mesh} positions={particles} stride={3}>
      <PointMaterial
        transparent
        color={color}
        size={0.05}
        sizeAttenuation={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

export default function VoiceParticleAura(props: VoiceParticleAuraProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
        <Particles {...props} />
      </Canvas>
    </div>
  );
}
