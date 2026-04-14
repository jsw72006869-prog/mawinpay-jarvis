import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseCommand, JARVIS_GREETINGS, type JarvisState, type JarvisAction } from '../lib/jarvis-brain';
import { useSpeechRecognition, useTextToSpeech } from './SpeechEngine';
import ConversationStream, { type Message } from './ConversationStream';
import JarvisOrb from './JarvisOrb';
import ParticleBackground from './ParticleBackground';
import ClapDetector from './ClapDetector';
import StatusPanel from './StatusPanel';
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
    type: JarvisAction['type'] | null;
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
    const timer = setTimeout(() => setShowHint(true), 2000);
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
    setMessages(prev => [...prev, { id: Date.now().toString(), role, text, timestamp: new Date() }]);
  }, []);

  const jarvisRespond = useCallback(async (text: string, action?: JarvisAction) => {
    setIsTyping(true);
    setState('thinking');
    await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
    setIsTyping(false);

    if (action && action.type !== 'help' && action.type !== 'unknown' && action.type !== 'greeting' && action.type !== 'status' && action.workingMessage) {
      setState('working');
      setDataPanel({ visible: true, type: action.type as JarvisAction['type'], progress: 0, message: action.workingMessage });
      for (let p = 0; p <= 100; p += 3) {
        await new Promise(r => setTimeout(r, 70));
        setDataPanel(prev => ({ ...prev, progress: p }));
      }
      await new Promise(r => setTimeout(r, 500));
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
      setState('idle');
      setIsListening(false);
    });
  }, [addMessage, speak]);

  const handleSpeechResult = useCallback((transcript: string) => {
    addMessage('user', transcript);
    setIsListening(false);
    const action = parseCommand(transcript);
    jarvisRespond(action.response, action);
  }, [addMessage, jarvisRespond]);

  useSpeechRecognition({
    onResult: handleSpeechResult,
    onStart: () => setState('listening'),
    onEnd: () => { if (stateRef.current === 'listening') setState('idle'); },
    isListening,
  });

  const handleActivate = useCallback(() => {
    if (stateRef.current === 'speaking' || stateRef.current === 'working') return;
    setClapDetected(true);
    setTimeout(() => setClapDetected(false), 800);
    setShowHint(false);

    if (stateRef.current === 'idle') {
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
    } else if (stateRef.current === 'listening') {
      setIsListening(false);
      setState('idle');
    }
  }, [isInitialized, addMessage, speak]);

  const stateLabel: Record<JarvisState, string> = {
    idle: '대기', listening: '듣는 중', thinking: '분석 중', speaking: '응답 중', working: '실행 중',
  };
  const stateColor: Record<JarvisState, string> = {
    idle: '#0066FF', listening: '#FF6B35', thinking: '#7C3AED', speaking: '#00F5FF', working: '#22C55E',
  };

  return (
    <main className="fixed inset-0 overflow-hidden" style={{ background: '#050A14', backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(0,102,255,0.03) 0%, transparent 70%), linear-gradient(rgba(0,245,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,0.015) 1px, transparent 1px)', backgroundSize: 'auto, 60px 60px, 60px 60px' }}>
      {/* ── 배경 레이어 ── */}
      <ParticleBackground isActive={state !== 'idle'} />
      <ScreenPulse state={state} clapDetected={clapDetected} />
      <ClapDetector onClap={handleActivate} onAudioLevel={setAudioLevel} enabled={true} />

      {/* ── 중앙 배경 글로우 ── */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 1 }}>
        <motion.div
          className="rounded-full"
          style={{
            width: 800,
            height: 800,
            background: `radial-gradient(circle, ${
              state === 'listening' ? 'rgba(255,107,53,0.06)' :
              state === 'speaking' ? 'rgba(0,245,255,0.08)' :
              state === 'working' ? 'rgba(34,197,94,0.05)' :
              state === 'thinking' ? 'rgba(124,58,237,0.05)' :
              'rgba(0,102,255,0.04)'
            } 0%, transparent 70%)`,
          }}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* ── 상단 헤더 ── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
        className="fixed top-0 left-0 right-0 pointer-events-none"
        style={{ zIndex: 20, padding: '28px 40px 0' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div style={{ fontFamily: 'Orbitron, monospace', color: 'rgba(0,245,255,0.55)', fontSize: '0.85rem', letterSpacing: '0.15em' }}>
              {currentTime}
            </div>
            <div style={{ fontFamily: 'Orbitron, monospace', color: 'rgba(100,116,139,0.4)', fontSize: '0.6rem', letterSpacing: '0.1em', marginTop: '2px' }}>
              {currentDate}
            </div>
          </div>

          <div style={{ textAlign: 'center', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            <h1 style={{ fontFamily: 'Orbitron, monospace', color: '#00F5FF', fontSize: '1.6rem', letterSpacing: '0.4em', fontWeight: 900, textShadow: '0 0 20px rgba(0,245,255,0.8), 0 0 40px rgba(0,245,255,0.4)' }}>
              MAWINPAY
            </h1>
            <p style={{ fontFamily: 'Orbitron, monospace', color: 'rgba(100,116,139,0.5)', fontSize: '0.55rem', letterSpacing: '0.7em', marginTop: '4px' }}>
              INTELLIGENCE SYSTEM v2.0
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <motion.div
              style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: stateColor[state], boxShadow: `0 0 8px ${stateColor[state]}` }}
              animate={{ scale: state !== 'idle' ? [1, 1.4, 1] : [1, 1.1, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span style={{ fontFamily: 'Orbitron, monospace', color: stateColor[state], fontSize: '0.65rem', letterSpacing: '0.25em' }}>
              {stateLabel[state]}
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── JARVIS 오브 — 화면 중앙 ── */}
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ zIndex: 10, paddingBottom: '80px' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.1 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, type: 'spring', damping: 12, stiffness: 50 }}
          onClick={handleActivate}
          style={{ cursor: 'none' }}
        >
          <JarvisOrb state={state} audioLevel={audioLevel} />
        </motion.div>
      </div>

      {/* ── 오브 아래 — 파형 + 대화 + 힌트 ── */}
      <div
        className="fixed bottom-0 left-0 right-0 flex flex-col items-center"
        style={{ zIndex: 15, paddingBottom: '52px' }}
      >
        <div style={{ height: 56, marginBottom: 4 }}>
          <WaveformVisualizer
            isVisible={state === 'listening' || state === 'speaking'}
            audioLevel={audioLevel}
            color={state === 'listening' ? '#FF6B35' : '#00F5FF'}
          />
        </div>

        <AnimatePresence>
          {messages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ width: '100%', maxWidth: '672px', padding: '0 24px' }}
            >
              <ConversationStream messages={messages} isTyping={isTyping} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showHint && messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{ textAlign: 'center', marginTop: 16 }}
            >
              <motion.p
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 2.5, repeat: Infinity }}
                style={{ fontFamily: 'Orbitron, monospace', color: 'rgba(0,245,255,0.5)', fontSize: '0.7rem', letterSpacing: '0.3em' }}
              >
                ◈ 박수 2번 또는 터치로 JARVIS 활성화 ◈
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 우측 상태 패널 ── */}
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="fixed right-0 top-1/2"
        style={{ zIndex: 20, transform: 'translateY(-50%)', padding: '0 20px' }}
      >
        <StatusPanel
          state={state}
          stats={stats}
          currentTime={currentTime}
        />
      </motion.div>

      {/* ── 하단 상태 표시줄 ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5, duration: 0.8 }}
        className="fixed bottom-0 left-0 right-0 pointer-events-none"
        style={{ zIndex: 20, padding: '0 40px 16px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', gap: '32px' }}>
          {[
            { label: 'NEURAL NET', active: state !== 'idle', color: '#00F5FF' },
            { label: 'VOICE AI', active: state === 'listening' || state === 'speaking', color: '#FF6B35' },
            { label: 'DATA SYNC', active: state === 'working', color: '#22C55E' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <motion.div
                style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: item.active ? item.color : 'rgba(100,116,139,0.3)', boxShadow: item.active ? `0 0 6px ${item.color}` : 'none' }}
                animate={item.active ? { scale: [1, 1.3, 1] } : {}}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <span style={{ fontFamily: 'Orbitron, monospace', color: item.active ? item.color : 'rgba(100,116,139,0.3)', fontSize: '0.55rem', letterSpacing: '0.2em' }}>
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
