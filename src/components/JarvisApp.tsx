import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseCommand, JARVIS_GREETINGS, type JarvisState, type JarvisAction } from '../lib/jarvis-brain';
import { useSpeechRecognition, useTextToSpeech } from './SpeechEngine';
import ConversationStream, { type Message } from './ConversationStream';
import JarvisOrb from './JarvisOrb';
import ParticleBackground from './ParticleBackground';
import ClapDetector from './ClapDetector';
import HoloDataPanel from './HoloDataPanel';
import WaveformVisualizer from './WaveformVisualizer';
import ScreenPulse from './ScreenPulse';

export default function JarvisApp() {
  const [state, setState] = useState<JarvisState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [clapDetected, setClapDetected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [dataPanel, setDataPanel] = useState<{
    visible: boolean;
    type: 'collect' | 'send_email' | 'create_banner' | 'report' | null;
    progress: number;
    message: string;
  }>({ visible: false, type: null, progress: 0, message: '' });
  const [stats, setStats] = useState({
    collected: 247,
    emailsSent: 183,
    responseRate: 23.5,
    contracts: 4,
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');

  const { speak } = useTextToSpeech();
  const stateRef = useRef(state);
  stateRef.current = state;
  const isListeningRef = useRef(isListening);
  isListeningRef.current = isListening;

  // 시계 업데이트
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      setCurrentDate(now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // 힌트 표시
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  // 커스텀 커서
  useEffect(() => {
    const cursor = document.createElement('div');
    cursor.className = 'jarvis-cursor';
    document.body.appendChild(cursor);
    const dot = document.createElement('div');
    dot.className = 'jarvis-cursor-dot';
    document.body.appendChild(dot);
    const move = (e: MouseEvent) => {
      cursor.style.left = e.clientX - 11 + 'px';
      cursor.style.top = e.clientY - 11 + 'px';
      dot.style.left = e.clientX - 2 + 'px';
      dot.style.top = e.clientY - 2 + 'px';
    };
    window.addEventListener('mousemove', move);
    return () => {
      window.removeEventListener('mousemove', move);
      cursor.remove();
      dot.remove();
    };
  }, []);

  const addMessage = useCallback((role: 'user' | 'jarvis', text: string) => {
    setMessages(prev => {
      const updated = [...prev, { id: Date.now().toString(), role, text, timestamp: new Date() }];
      // 최대 6개 메시지만 유지
      return updated.slice(-6);
    });
  }, []);

  const jarvisRespond = useCallback(async (text: string, action?: JarvisAction) => {
    setIsTyping(true);
    setState('thinking');
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    setIsTyping(false);

    const isWorkingType = action?.type === 'collect' || action?.type === 'send_email' || action?.type === 'create_banner' || action?.type === 'report';
    if (action && isWorkingType && action.workingMessage) {
      setState('working');
      setDataPanel({ visible: true, type: action.type as 'collect' | 'send_email' | 'create_banner' | 'report', progress: 0, message: action.workingMessage });
      for (let p = 0; p <= 100; p += 2) {
        await new Promise(r => setTimeout(r, 50));
        setDataPanel(prev => ({ ...prev, progress: p }));
      }
      await new Promise(r => setTimeout(r, 400));
      setDataPanel(prev => ({ ...prev, visible: false }));
      if (action.type === 'collect') {
        setStats(prev => ({ ...prev, collected: prev.collected + (Number(action.params?.count) || 50) }));
      } else if (action.type === 'send_email') {
        setStats(prev => ({ ...prev, emailsSent: prev.emailsSent + 47 }));
      }
    }

    setState('speaking');
    addMessage('jarvis', text);
    speak(text, undefined, () => {
      setState('listening');
      setIsListening(true);
    });
  }, [addMessage, speak]);

  const handleSpeechResult = useCallback((transcript: string) => {
    if (!transcript.trim()) return;
    addMessage('user', transcript);
    setIsListening(false);
    setState('thinking');
    const action = parseCommand(transcript);
    jarvisRespond(action.response, action);
  }, [addMessage, jarvisRespond]);

  useSpeechRecognition({
    onResult: handleSpeechResult,
    onStart: () => {
      setState('listening');
    },
    onEnd: () => {
      if (stateRef.current === 'listening') {
        setState('idle');
        setIsListening(false);
      }
    },
    isListening,
  });

  const handleActivate = useCallback(() => {
    const currentState = stateRef.current;
    if (currentState === 'speaking' || currentState === 'working' || currentState === 'thinking') return;

    setClapDetected(true);
    setTimeout(() => setClapDetected(false), 800);
    setShowHint(false);

    if (currentState === 'idle') {
      if (!isInitialized) {
        setIsInitialized(true);
        const greeting = JARVIS_GREETINGS[Math.floor(Math.random() * JARVIS_GREETINGS.length)];
        setState('speaking');
        addMessage('jarvis', greeting);
        speak(greeting, undefined, () => {
          setState('listening');
          setIsListening(true);
        });
      } else {
        setState('listening');
        setIsListening(true);
      }
    } else if (currentState === 'listening') {
      setIsListening(false);
      setState('idle');
    }
  }, [isInitialized, addMessage, speak]);

  const stateLabel: Record<JarvisState, string> = {
    idle: '대기', listening: '음성 인식 중', thinking: '분석 중', speaking: '응답 중', working: '실행 중',
  };
  const stateColor: Record<JarvisState, string> = {
    idle: '#0066FF', listening: '#FF6B35', thinking: '#7C3AED', speaking: '#00F5FF', working: '#22C55E',
  };

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: '#050A14',
        backgroundImage: `
          radial-gradient(ellipse at 50% 50%, rgba(0,102,255,0.04) 0%, transparent 60%),
          linear-gradient(rgba(0,245,255,0.012) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,245,255,0.012) 1px, transparent 1px)
        `,
        backgroundSize: 'auto, 50px 50px, 50px 50px',
      }}
    >
      {/* ── 배경 레이어 ── */}
      <ParticleBackground isActive={state !== 'idle'} />
      <ScreenPulse state={state} clapDetected={clapDetected} />
      <ClapDetector onClap={handleActivate} onAudioLevel={setAudioLevel} enabled={true} />

      {/* ── 중앙 배경 글로우 ── */}
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 1 }}>
        <motion.div
          style={{
            width: '80vmin',
            height: '80vmin',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${
              state === 'listening' ? 'rgba(255,107,53,0.07)' :
              state === 'speaking' ? 'rgba(0,245,255,0.09)' :
              state === 'working' ? 'rgba(34,197,94,0.06)' :
              state === 'thinking' ? 'rgba(124,58,237,0.06)' :
              'rgba(0,102,255,0.05)'
            } 0%, transparent 70%)`,
          }}
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* ── 상단 헤더 ── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          zIndex: 30, padding: '20px 32px 0',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          {/* 좌측 — 시간 */}
          <div>
            <div style={{ fontFamily: 'Orbitron, monospace', color: 'rgba(0,245,255,0.6)', fontSize: '0.9rem', letterSpacing: '0.12em' }}>
              {currentTime}
            </div>
            <div style={{ fontFamily: 'Orbitron, monospace', color: 'rgba(100,116,139,0.4)', fontSize: '0.58rem', letterSpacing: '0.1em', marginTop: '2px' }}>
              {currentDate}
            </div>
          </div>

          {/* 중앙 — 로고 */}
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
            <h1 style={{
              fontFamily: 'Orbitron, monospace',
              color: '#00F5FF',
              fontSize: 'clamp(1.1rem, 2.5vw, 1.8rem)',
              letterSpacing: '0.45em',
              fontWeight: 900,
              textShadow: '0 0 20px rgba(0,245,255,0.9), 0 0 50px rgba(0,245,255,0.4)',
              margin: 0,
            }}>
              MAWINPAY
            </h1>
            <p style={{ fontFamily: 'Orbitron, monospace', color: 'rgba(100,116,139,0.45)', fontSize: '0.5rem', letterSpacing: '0.6em', marginTop: '4px' }}>
              INTELLIGENCE SYSTEM v2.0
            </p>
          </div>

          {/* 우측 — 상태 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <motion.div
              style={{
                width: 9, height: 9, borderRadius: '50%',
                backgroundColor: stateColor[state],
                boxShadow: `0 0 10px ${stateColor[state]}`,
              }}
              animate={{ scale: state !== 'idle' ? [1, 1.5, 1] : [1, 1.1, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
            <span style={{ fontFamily: 'Orbitron, monospace', color: stateColor[state], fontSize: '0.62rem', letterSpacing: '0.2em' }}>
              {stateLabel[state]}
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── JARVIS 오브 — 화면 완전 중앙 ── */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        }}
        onClick={handleActivate}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.05 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, type: 'spring', damping: 14, stiffness: 45 }}
          style={{ cursor: 'none' }}
        >
          <JarvisOrb state={state} audioLevel={audioLevel} />
        </motion.div>
      </div>

      {/* ── 파형 시각화 — 오브 아래 오버레이 ── */}
      <AnimatePresence>
        {(state === 'listening' || state === 'speaking') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              bottom: '22%',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 20,
              pointerEvents: 'none',
            }}
          >
            <WaveformVisualizer
              isVisible={true}
              audioLevel={audioLevel}
              color={state === 'listening' ? '#FF6B35' : '#00F5FF'}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 대화 스트림 — 하단 오버레이 ── */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '700px',
          padding: '0 24px 60px',
          zIndex: 25,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {messages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <ConversationStream messages={messages} isTyping={isTyping} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 힌트 텍스트 */}
        <AnimatePresence>
          {showHint && messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ textAlign: 'center', marginTop: 8 }}
            >
              <motion.p
                animate={{ opacity: [0.35, 0.75, 0.35] }}
                transition={{ duration: 2.5, repeat: Infinity }}
                style={{
                  fontFamily: 'Orbitron, monospace',
                  color: 'rgba(0,245,255,0.55)',
                  fontSize: 'clamp(0.55rem, 1.2vw, 0.72rem)',
                  letterSpacing: '0.25em',
                  margin: 0,
                }}
              >
                ◈ 박수 2번 또는 터치로 JARVIS 활성화 ◈
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 좌측 통계 패널 ── */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.0, duration: 0.8 }}
        style={{
          position: 'fixed',
          left: 20,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { label: 'COLLECTED', value: stats.collected, unit: '명', color: '#00F5FF' },
            { label: 'EMAILS', value: stats.emailsSent, unit: '통', color: '#0066FF' },
            { label: 'RESPONSE', value: `${stats.responseRate}%`, unit: '', color: '#22C55E' },
            { label: 'CONTRACTS', value: stats.contracts, unit: '건', color: '#7C3AED' },
          ].map(item => (
            <div
              key={item.label}
              style={{
                background: 'rgba(5,10,20,0.85)',
                border: `1px solid ${item.color}22`,
                borderLeft: `2px solid ${item.color}`,
                padding: '8px 12px',
                minWidth: '110px',
              }}
            >
              <div style={{ fontFamily: 'Orbitron, monospace', color: 'rgba(100,116,139,0.5)', fontSize: '0.45rem', letterSpacing: '0.2em' }}>
                {item.label}
              </div>
              <div style={{ fontFamily: 'Orbitron, monospace', color: item.color, fontSize: '1.1rem', fontWeight: 700, textShadow: `0 0 8px ${item.color}60` }}>
                {item.value}{item.unit}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── 하단 상태 표시줄 ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5, duration: 0.8 }}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          zIndex: 30, padding: '0 40px 14px',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', gap: '28px' }}>
          {[
            { label: 'NEURAL NET', active: state !== 'idle', color: '#00F5FF' },
            { label: 'VOICE AI', active: state === 'listening' || state === 'speaking', color: '#FF6B35' },
            { label: 'DATA SYNC', active: state === 'working', color: '#22C55E' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <motion.div
                style={{
                  width: 5, height: 5, borderRadius: '50%',
                  backgroundColor: item.active ? item.color : 'rgba(100,116,139,0.25)',
                  boxShadow: item.active ? `0 0 6px ${item.color}` : 'none',
                }}
                animate={item.active ? { scale: [1, 1.4, 1] } : {}}
                transition={{ duration: 0.9, repeat: Infinity }}
              />
              <span style={{
                fontFamily: 'Orbitron, monospace',
                color: item.active ? item.color : 'rgba(100,116,139,0.25)',
                fontSize: '0.5rem',
                letterSpacing: '0.18em',
              }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── 홀로그램 데이터 패널 ── */}
      <AnimatePresence>
        {dataPanel.visible && (
          <HoloDataPanel
            type={dataPanel.type}
            progress={dataPanel.progress}
            message={dataPanel.message}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
