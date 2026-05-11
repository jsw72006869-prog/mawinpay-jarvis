/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BOOKING_SERVER_URL: string;
  // VITE_OPENAI_API_KEY: 보안상 제거 - api/chat-proxy 서버 route 사용
  readonly VITE_ELEVENLABS_API_KEY: string;
  readonly VITE_GOOGLE_SHEETS_API_KEY: string;
  readonly VITE_NAVER_CLIENT_ID: string;
  readonly VITE_NAVER_CLIENT_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
