import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import JarvisApp from './components/JarvisApp';

// 미션 맵은 lazy load (별도 탭에서만 사용)
const MissionMapPage = lazy(() => import('./components/MissionMapPage'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<JarvisApp />} />
        <Route
          path="/mission-map"
          element={
            <Suspense fallback={
              <div style={{
                width: '100vw', height: '100vh', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: '#030608', color: '#00D4FF',
                fontFamily: 'Inter, sans-serif', letterSpacing: '0.2em',
              }}>
                JARVIS NEURAL MAP LOADING...
              </div>
            }>
              <MissionMapPage />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
