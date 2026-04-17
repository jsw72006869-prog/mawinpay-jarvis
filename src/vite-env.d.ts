/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BOOKING_SERVER_URL: string;
  readonly VITE_OPENAI_API_KEY: string;
  readonly VITE_ELEVENLABS_API_KEY: string;
  readonly VITE_GOOGLE_SHEETS_API_KEY: string;
  readonly VITE_NAVER_CLIENT_ID: string;
  readonly VITE_NAVER_CLIENT_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
