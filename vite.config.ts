import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  define: {
    // 빌드 캐시 무효화용 타임스탬프 (변경 시 새 번들 생성)
    __BUILD_TIME__: JSON.stringify('2026-05-18T17:35:00Z'),
  },
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
