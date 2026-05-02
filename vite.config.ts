import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('framer-motion')) {
              return 'vendor-motion';
            }
            if (id.includes('@google/generative-ai')) {
              return 'vendor-google-ai';
            }
            if (id.includes('three') || id.includes('@react-three')) {
              return 'vendor-three';
            }
          }
          // 대형 컴포넌트 분리
          if (id.includes('NeuralMissionMap')) {
            return 'chunk-mission-map';
          }
          if (id.includes('AgentConsolePanel') || id.includes('HologramWorkPanel') || id.includes('BookingPanel')) {
            return 'chunk-hud-panels';
          }
          if (id.includes('MarketIntelCard') || id.includes('PlatformDataCards')) {
            return 'chunk-data-cards';
          }
        },
      },
    },
  },
});
