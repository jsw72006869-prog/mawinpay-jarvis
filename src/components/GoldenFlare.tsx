import { motion } from 'framer-motion';

export default function GoldenFlare({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Central Flash */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.5, 2], opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        style={{
          width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(200,169,110,1) 0%, rgba(200,169,110,0) 70%)',
          borderRadius: '50%',
          filter: 'blur(20px)',
        }}
      />
      
      {/* Horizontal Beam */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: [0, 1, 1.2], opacity: [0, 0.8, 0] }}
        transition={{ duration: 1, ease: "easeOut" }}
        style={{
          position: 'absolute',
          width: '100vw', height: 4,
          background: 'linear-gradient(90deg, transparent 0%, #C8A96E 50%, transparent 100%)',
          boxShadow: '0 0 20px #C8A96E',
        }}
      />

      {/* Vertical Beam */}
      <motion.div
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: [0, 1, 1.2], opacity: [0, 0.8, 0] }}
        transition={{ duration: 1, ease: "easeOut" }}
        style={{
          position: 'absolute',
          height: '100vh', width: 4,
          background: 'linear-gradient(0deg, transparent 0%, #C8A96E 50%, transparent 100%)',
          boxShadow: '0 0 20px #C8A96E',
        }}
      />

      {/* Particles Burst */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ 
            x: (Math.random() - 0.5) * 800, 
            y: (Math.random() - 0.5) * 800, 
            opacity: 0,
            scale: 0
          }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          style={{
            position: 'absolute',
            width: 6, height: 6,
            background: '#C8A96E',
            borderRadius: '50%',
            boxShadow: '0 0 10px #C8A96E',
          }}
        />
      ))}
    </div>
  );
}
