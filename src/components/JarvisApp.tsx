import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { askGPT, parseCommand, JARVIS_GREETINGS, type JarvisState, type JarvisAction } from '../lib/jarvis-brain';
import { useSpeechRecognition, useTextToSpeech } from './SpeechEngine';
import { appendInfluencersToSheet, appendEmailLogToSheet, generateMockInfluencers, generateEmailLogs } from '../lib/google-sheets';
import ConversationStream, { type Message } from './ConversationStream';
import SparkleParticles from './SparkleParticles';
import ClapDetector from './ClapDetector';
import HoloDataPanel from './HoloDataPanel';

// ── 고급 색상 팔레트 ──
const THEME = {
  gold:       '#C8A96E',
  goldLight:  '#E8D5A3',
  goldDim:    '#8B6F3E',
  blue:       '#4A90E2',
  blueLight:  '#7BB3F0',
  silver:     '#A8B8C8',
  silverDim:  '#5A6A7A',
  bg:         '#060A12',
  bgDeep:     '#030608',
  text:       '#D4E0EC',
  textDim:    '#5A6A7A',
};

const STATE_COLOR: Record<JarvisState, string> = {
  idle:      THEME.gold,
  listening: '#E8A87C',
  thinking:  '#9B8EC4',
  speaking:  THEME.blueLight,
  working:   '#7EC89B',
};

const STATE_LABEL: Record<JarvisState, string> = {
  idle: 'STANDBY', listening: 'LISTENING', thinking: 'PROCESSING', speaking: 'SPEAKING', working: 'EXECUTING',
};

export default function JarvisApp() {
  const [state, setState] = useState<JarvisState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [speakingLevel, setSpeakingLevel] = useState(0);
  const [clapBurst, setClapBurst] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [dataPanel, setDataPanel] = useState<{
    visible: boolean;
    type: 'collect' | 'send_email' | 'create_banner' | 'report' | null;
    progress: number;
    message: string;
  }>({ visible: false, type: null, progress: 0, message: '' });
  const [stats, setStats] = useState({ collected: 247, emailsSent: 183, responseRate: 23.5, contracts: 4 });
  const [isInitialized, setIsInitialized] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');

  const { speak } = useTextToSpeech();
  const stateRef = useRef(state);
  stateRef.current = state;
  const isListeningRef = useRef(isListening);
  isListeningRef.current = isListening;

  // ── 마이크 레벨 분석 ──
  const micContextRef = useRef<AudioContext | null>(null);
  const micFrameRef = useRef<number>(0);

  const startMicAnalysis = useCallback(async () => {
    try {
      if (micContextRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = new AudioContext();
      micContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        setMicLevel(Math.min(avg / 90, 1));
        micFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn('[JARVIS] 마이크 분석 실패:', e);
    }
  }, []);

  // ── TTS 레벨 시뮬레이션 ──
  const speakingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startSpeakingLevel = useCallback(() => {
    if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
    speakingTimerRef.current = setInterval(() => {
      setSpeakingLevel(0.25 + Math.random() * 0.55);
    }, 100);
  }, []);
  const stopSpeakingLevel = useCallback(() => {
    if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
    setSpeakingLevel(0);
  }, []);

  // ── 시계 ──
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      setCurrentDate(now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }));
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // ── 커스텀 커서 ──
  useEffect(() => {
    const cursor = document.createElement('div');
    cursor.className = 'jarvis-cursor';
    document.body.appendChild(cursor);
    const dot = document.createElement('div');
    dot.className = 'jarvis-cursor-dot';
    document.body.appendChild(dot);
    const move = (e: MouseEvent) => {
      cursor.style.left = e.clientX - 11 + 'px';
      cursor.style.top  = e.clientY - 11 + 'px';
      dot.style.left    = e.clientX - 2 + 'px';
      dot.style.top     = e.clientY - 2 + 'px';
    };
    window.addEventListener('mousemove', move);
    return () => { window.removeEventListener('mousemove', move); cursor.remove(); dot.remove(); };
  }, []);

  const addMessage = useCallback((role: 'user' | 'jarvis', text: string) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), role, text, timestamp: new Date() }].slice(-5));
  }, []);

  const jarvisRespond = useCallback(async (text: string, action?: JarvisAction) => {
    setIsTyping(true);
    setState('thinking');
    await new Promise(r => setTimeout(r, 700 + Math.random() * 500));
    setIsTyping(false);

    const isWorkingType = action?.type === 'collect' || action?.type === 'send_email' || action?.type === 'create_banner' || action?.type === 'report';
    if (action && isWorkingType && action.workingMessage) {
      setState('working');
      setDataPanel({ visible: true, type: action.type as 'collect' | 'send_email' | 'create_banner' | 'report', progress: 0, message: action.workingMessage });
      for (let p = 0; p <= 100; p += 2) {
        await new Promise(r => setTimeout(r, 55));
        setDataPanel(prev => ({ ...prev, progress: p }));
      }
      await new Promise(r => setTimeout(r, 500));
      setDataPanel(prev => ({ ...prev, visible: false }));
      if (action.type === 'collect') {
        const count = Number(action.params?.count) || 50;
        const category = String(action.params?.category || '전체');
        const platform = String(action.params?.platform || '');
        setStats(prev => ({ ...prev, collected: prev.collected + count }));
        const influencers = generateMockInfluencers(count, category, platform);
        appendInfluencersToSheet(influencers).then(r => console.log('[JARVIS] 시트:', r.success ? '완료' : r.message));
      } else if (action.type === 'send_email') {
        const count = Number(action.params?.count) || 47;
        setStats(prev => ({ ...prev, emailsSent: prev.emailsSent + count }));
        const template = String(action.params?.template || '협업 제안');
        const logs = generateEmailLogs(generateMockInfluencers(count, '전체', ''), template);
        appendEmailLogToSheet(logs).then(r => console.log('[JARVIS] 이메일 로그:', r.message));
      }
    }

    setState('speaking');
    addMessage('jarvis', text);
    startSpeakingLevel();
    speak(text, undefined, () => {
      stopSpeakingLevel();
      setState('listening');
      setIsListening(true);
    });
  }, [addMessage, speak, startSpeakingLevel, stopSpeakingLevel]);

  const handleSpeechResult = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;
    addMessage('user', transcript);
    setIsListening(false);
    setState('thinking');
    // GPT-4o API 호출 (폴백: 로컬 파서)
    const action = await askGPT(transcript).catch(() => parseCommand(transcript));
    jarvisRespond(action.response, action);
  }, [addMessage, jarvisRespond]);

  useSpeechRecognition({
    onResult: handleSpeechResult,
    onStart: () => setState('listening'),
    onEnd: () => {
      if (stateRef.current === 'listening') { setState('idle'); setIsListening(false); }
    },
    isListening,
  });

  const handleActivate = useCallback(() => {
    const s = stateRef.current;
    if (s === 'speaking' || s === 'working' || s === 'thinking') return;

    setClapBurst(true);
    setTimeout(() => setClapBurst(false), 120);
    setShowHint(false);

    if (s === 'idle') {
      startMicAnalysis();
      if (!isInitialized) {
        setIsInitialized(true);
        const greeting = JARVIS_GREETINGS[Math.floor(Math.random() * JARVIS_GREETINGS.length)];
        setState('speaking');
        addMessage('jarvis', greeting);
        startSpeakingLevel();
        speak(greeting, undefined, () => { stopSpeakingLevel(); setState('listening'); setIsListening(true); });
      } else {
        setState('listening');
        setIsListening(true);
      }
    } else if (s === 'listening') {
      setIsListening(false);
      setState('idle');
    }
  }, [isInitialized, addMessage, speak, startMicAnalysis, startSpeakingLevel, stopSpeakingLevel]);

  useEffect(() => { if (state !== 'listening') setMicLevel(0); }, [state]);

  const accent = STATE_COLOR[state];

  return (
    <main
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: THEME.bg, cursor: 'none' }}
      onClick={handleActivate}
    >
      {/* ── Three.js 파티클 배경 ── */}
      <SparkleParticles state={state} audioLevel={micLevel} speakingLevel={speakingLevel} clapBurst={clapBurst} />

      {/* ── 박수 감지 ── */}
      <ClapDetector onClap={handleActivate} onAudioLevel={setMicLevel} enabled={true} />

      {/* ── 배경 방사형 그라디언트 ── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
        <motion.div
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse 60% 55% at 50% 50%, ${accent}0A 0%, transparent 70%)`,
          }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* ── 중앙 JARVIS 코어 ── */}
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none', zIndex: 5,
      }}>
        {/* 외부 장식 링 */}
        <motion.div
          style={{
            position: 'absolute',
            width: 'clamp(200px, 38vmin, 340px)',
            height: 'clamp(200px, 38vmin, 340px)',
            borderRadius: '50%',
            border: `1px solid ${accent}22`,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
        >
          {/* 장식 점 4개 */}
          {[0, 90, 180, 270].map(deg => (
            <div key={deg} style={{
              position: 'absolute',
              top: '50%', left: '50%',
              width: 4, height: 4,
              borderRadius: '50%',
              background: accent,
              boxShadow: `0 0 8px ${accent}`,
              transform: `rotate(${deg}deg) translateY(-50%) translateX(-50%) translateY(calc(-1 * clamp(100px, 19vmin, 170px)))`,
            }} />
          ))}
        </motion.div>

        {/* 중간 링 */}
        <motion.div
          style={{
            position: 'absolute',
            width: 'clamp(150px, 28vmin, 250px)',
            height: 'clamp(150px, 28vmin, 250px)',
            borderRadius: '50%',
            border: `1px solid ${accent}33`,
            boxShadow: `0 0 20px ${accent}11`,
          }}
          animate={{ rotate: -360 }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
        />

        {/* 내부 링 */}
        <motion.div
          style={{
            position: 'absolute',
            width: 'clamp(100px, 18vmin, 160px)',
            height: 'clamp(100px, 18vmin, 160px)',
            borderRadius: '50%',
            border: `1px solid ${accent}55`,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
        />

        {/* 코어 글로우 */}
        <motion.div
          style={{
            position: 'absolute',
            width: 'clamp(60px, 10vmin, 90px)',
            height: 'clamp(60px, 10vmin, 90px)',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${accent}CC 0%, ${accent}44 50%, transparent 100%)`,
            boxShadow: `0 0 40px ${accent}88, 0 0 80px ${accent}33`,
          }}
          animate={{
            scale: state === 'listening'
              ? [1, 1 + micLevel * 0.5, 1]
              : state === 'speaking'
              ? [1, 1 + speakingLevel * 0.4, 1]
              : [1, 1.06, 1],
          }}
          transition={{ duration: state === 'listening' ? 0.15 : state === 'speaking' ? 0.12 : 2.5, repeat: Infinity }}
        />

        {/* 상태 텍스트 */}
        <div style={{
          position: 'absolute',
          top: 'calc(50% + clamp(110px, 21vmin, 185px))',
          textAlign: 'center',
          width: '200px',
          marginLeft: '-100px',
        }}>
          <motion.div
            key={state}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              fontFamily: 'Orbitron, monospace',
              color: accent,
              fontSize: 'clamp(0.5rem, 1vw, 0.65rem)',
              letterSpacing: '0.4em',
              textShadow: `0 0 15px ${accent}88`,
            }}
          >
            {STATE_LABEL[state]}
          </motion.div>
          {/* 상태 인디케이터 바 */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '8px' }}>
            {[0, 1, 2, 3, 4].map(i => (
              <motion.div
                key={i}
                style={{
                  width: 2,
                  height: state !== 'idle' ? 'clamp(4px, 0.8vmin, 8px)' : 'clamp(2px, 0.4vmin, 4px)',
                  background: accent,
                  borderRadius: 1,
                  opacity: state !== 'idle' ? 0.9 : 0.3,
                }}
                animate={state !== 'idle' ? { scaleY: [1, 1.5 + i * 0.3, 1] } : {}}
                transition={{ duration: 0.4 + i * 0.1, repeat: Infinity, delay: i * 0.08 }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── 상단 헤더 ── */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 1 }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          zIndex: 30, padding: '24px 36px 0',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          {/* 좌측 시간 */}
          <div>
            <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.gold, fontSize: '0.85rem', letterSpacing: '0.1em', opacity: 0.75 }}>
              {currentTime}
            </div>
            <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.5rem', letterSpacing: '0.12em', marginTop: '3px' }}>
              {currentDate}
            </div>
          </div>

          {/* 중앙 로고 */}
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
            <h1 style={{
              fontFamily: 'Orbitron, monospace',
              color: THEME.goldLight,
              fontSize: 'clamp(1rem, 2.2vw, 1.6rem)',
              letterSpacing: '0.5em',
              textShadow: `0 0 30px ${THEME.gold}66, 0 0 60px ${THEME.gold}22`,
              margin: 0,
              fontWeight: 400,
            }}>
              MAWINPAY
            </h1>
            <div style={{
              width: '100%',
              height: '1px',
              background: `linear-gradient(90deg, transparent, ${THEME.gold}44, transparent)`,
              marginTop: '6px',
            }} />
            <p style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.42rem', letterSpacing: '0.5em', marginTop: '5px' }}>
              INTELLIGENCE SYSTEM
            </p>
          </div>

          {/* 우측 상태 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <motion.div
              style={{
                width: 7, height: 7, borderRadius: '50%',
                background: accent,
                boxShadow: `0 0 8px ${accent}`,
              }}
              animate={{ opacity: state !== 'idle' ? [1, 0.3, 1] : [0.6, 0.9, 0.6] }}
              transition={{ duration: state !== 'idle' ? 0.7 : 2, repeat: Infinity }}
            />
            <span style={{ fontFamily: 'Orbitron, monospace', color: accent, fontSize: '0.55rem', letterSpacing: '0.2em', opacity: 0.85 }}>
              {STATE_LABEL[state]}
            </span>
          </div>
        </div>
      </motion.header>

      {/* ── 좌측 통계 패널 ── */}
      <motion.aside
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.2, duration: 1 }}
        style={{
          position: 'fixed', left: 24, top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 20, pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { label: 'COLLECTED', value: stats.collected, unit: '명', color: THEME.gold },
            { label: 'EMAILS',    value: stats.emailsSent, unit: '통', color: THEME.blue },
            { label: 'RESPONSE',  value: `${stats.responseRate}%`, unit: '', color: '#7EC89B' },
            { label: 'CONTRACTS', value: stats.contracts, unit: '건', color: '#9B8EC4' },
          ].map(item => (
            <div key={item.label} style={{
              background: 'rgba(6,10,18,0.85)',
              borderLeft: `2px solid ${item.color}66`,
              borderTop: `1px solid ${item.color}11`,
              padding: '8px 14px',
              minWidth: '108px',
              backdropFilter: 'blur(8px)',
            }}>
              <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.4rem', letterSpacing: '0.22em', marginBottom: '3px' }}>
                {item.label}
              </div>
              <div style={{ fontFamily: 'Orbitron, monospace', color: item.color, fontSize: '1rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                {item.value}{item.unit}
              </div>
            </div>
          ))}
        </div>
      </motion.aside>

      {/* ── 대화 스트림 ── */}
      <div style={{
        position: 'fixed', bottom: 0,
        left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '680px',
        padding: '0 28px 56px',
        zIndex: 25, pointerEvents: 'none',
      }}>
        <AnimatePresence>
          {messages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <ConversationStream messages={messages} isTyping={isTyping} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showHint && messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ textAlign: 'center', marginTop: 12 }}
            >
              <motion.p
                animate={{ opacity: [0.25, 0.6, 0.25] }}
                transition={{ duration: 3, repeat: Infinity }}
                style={{
                  fontFamily: 'Orbitron, monospace',
                  color: THEME.gold,
                  fontSize: 'clamp(0.48rem, 1vw, 0.62rem)',
                  letterSpacing: '0.3em',
                  margin: 0,
                  opacity: 0.5,
                }}
              >
                ◈  TOUCH TO ACTIVATE  ◈
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 하단 시스템 상태 ── */}
      <motion.footer
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8, duration: 1 }}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          zIndex: 30, padding: '0 40px 16px',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', gap: '32px' }}>
          {[
            { label: 'NEURAL NET', active: state !== 'idle',                                   color: THEME.gold },
            { label: 'VOICE AI',   active: state === 'listening' || state === 'speaking',      color: '#E8A87C' },
            { label: 'DATA SYNC',  active: state === 'working',                                color: '#7EC89B' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <motion.div
                style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: item.active ? item.color : THEME.textDim,
                  boxShadow: item.active ? `0 0 5px ${item.color}` : 'none',
                  opacity: item.active ? 1 : 0.25,
                }}
                animate={item.active ? { opacity: [1, 0.4, 1] } : {}}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <span style={{
                fontFamily: 'Orbitron, monospace',
                color: item.active ? item.color : THEME.textDim,
                fontSize: '0.44rem',
                letterSpacing: '0.2em',
                opacity: item.active ? 0.8 : 0.2,
              }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </motion.footer>

      {/* ── 홀로그램 데이터 패널 ── */}
      <AnimatePresence>
        {dataPanel.visible && (
          <HoloDataPanel type={dataPanel.type} progress={dataPanel.progress} message={dataPanel.message} />
        )}
      </AnimatePresence>
    </main>
  );
}
