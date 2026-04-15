import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseCommand, JARVIS_GREETINGS, type JarvisState, type JarvisAction } from '../lib/jarvis-brain';
import { useSpeechRecognition, useTextToSpeech } from './SpeechEngine';
import { appendInfluencersToSheet, appendEmailLogToSheet, generateMockInfluencers, generateEmailLogs } from '../lib/google-sheets';
import ConversationStream, { type Message } from './ConversationStream';
import SparkleParticles from './SparkleParticles';
import ClapDetector from './ClapDetector';
import HoloDataPanel from './HoloDataPanel';
import WaveformVisualizer from './WaveformVisualizer';

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

  // ── 마이크 레벨 분석 (Web Audio API) ──
  const micContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micFrameRef = useRef<number>(0);

  const startMicAnalysis = useCallback(async () => {
    try {
      if (micContextRef.current) return; // 이미 실행 중
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      micContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      micAnalyserRef.current = analyser;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        setMicLevel(Math.min(avg / 100, 1));
        micFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn('[JARVIS] 마이크 분석 실패:', e);
    }
  }, []);

  const stopMicAnalysis = useCallback(() => {
    cancelAnimationFrame(micFrameRef.current);
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micContextRef.current?.close();
    micContextRef.current = null;
    micAnalyserRef.current = null;
    micStreamRef.current = null;
    setMicLevel(0);
  }, []);

  // ── TTS 오디오 레벨 시뮬레이션 (SpeechSynthesis는 Web Audio 연결 불가) ──
  const speakingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startSpeakingLevel = useCallback(() => {
    if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
    speakingTimerRef.current = setInterval(() => {
      setSpeakingLevel(0.3 + Math.random() * 0.7);
    }, 80);
  }, []);
  const stopSpeakingLevel = useCallback(() => {
    if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
    setSpeakingLevel(0);
  }, []);

  // ── 시계 업데이트 ──
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

  // ── 힌트 표시 ──
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), 2500);
    return () => clearTimeout(timer);
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
        const count = Number(action.params?.count) || 50;
        const category = String(action.params?.category || '전체');
        const platform = String(action.params?.platform || '');
        setStats(prev => ({ ...prev, collected: prev.collected + count }));
        const influencers = generateMockInfluencers(count, category, platform);
        appendInfluencersToSheet(influencers).then(result => {
          console.log('[JARVIS] 구글 시트:', result.success ? '기록 완료' : '기록 실패 - ' + result.message);
        });
      } else if (action.type === 'send_email') {
        const count = Number(action.params?.count) || 47;
        setStats(prev => ({ ...prev, emailsSent: prev.emailsSent + count }));
        const template = String(action.params?.template || '협업 제안');
        const dummyInfluencers = generateMockInfluencers(count, '전체', '');
        const logs = generateEmailLogs(dummyInfluencers, template);
        appendEmailLogToSheet(logs).then(result => {
          console.log('[JARVIS] 이메일 로그:', result.message);
        });
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
    onStart: () => { setState('listening'); },
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

    // 폭발 효과
    setClapBurst(true);
    setTimeout(() => setClapBurst(false), 100);
    setShowHint(false);

    if (currentState === 'idle') {
      if (!isInitialized) {
        setIsInitialized(true);
        const greeting = JARVIS_GREETINGS[Math.floor(Math.random() * JARVIS_GREETINGS.length)];
        setState('speaking');
        addMessage('jarvis', greeting);
        startSpeakingLevel();
        speak(greeting, undefined, () => {
          stopSpeakingLevel();
          setState('listening');
          setIsListening(true);
        });
      } else {
        setState('listening');
        setIsListening(true);
      }
      // 마이크 분석 시작
      startMicAnalysis();
    } else if (currentState === 'listening') {
      setIsListening(false);
      setState('idle');
    }
  }, [isInitialized, addMessage, speak, startMicAnalysis, startSpeakingLevel, stopSpeakingLevel]);

  // 상태가 listening이 아닐 때 마이크 레벨 0으로
  useEffect(() => {
    if (state !== 'listening') {
      setMicLevel(0);
    }
  }, [state]);

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
        background: '#020810',
        cursor: 'none',
      }}
      onClick={handleActivate}
    >
      {/* ── Three.js 풀스크린 스파클 파티클 ── */}
      <SparkleParticles
        state={state}
        audioLevel={micLevel}
        speakingLevel={speakingLevel}
        clapBurst={clapBurst}
      />

      {/* ── 박수 감지기 (오디오 레벨 분리) ── */}
      <ClapDetector onClap={handleActivate} onAudioLevel={setMicLevel} enabled={true} />

      {/* ── 중앙 글로우 오버레이 ── */}
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
        <motion.div
          style={{
            width: '55vmin',
            height: '55vmin',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${
              state === 'listening' ? 'rgba(255,107,53,0.12)' :
              state === 'speaking'  ? 'rgba(0,245,255,0.14)' :
              state === 'working'   ? 'rgba(34,197,94,0.10)' :
              state === 'thinking'  ? 'rgba(124,58,237,0.10)' :
              'rgba(0,102,255,0.08)'
            } 0%, transparent 70%)`,
            filter: 'blur(20px)',
          }}
          animate={{
            scale: state === 'listening' ? [1, 1.15, 1] : state === 'speaking' ? [1, 1.2, 1] : [1, 1.05, 1],
          }}
          transition={{ duration: state === 'speaking' ? 0.4 : 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* ── 중앙 JARVIS 코어 링 ── */}
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 3 }}>
        <motion.div
          style={{
            width: 'clamp(120px, 22vmin, 200px)',
            height: 'clamp(120px, 22vmin, 200px)',
            borderRadius: '50%',
            border: `1.5px solid ${stateColor[state]}44`,
            boxShadow: `0 0 40px ${stateColor[state]}33, inset 0 0 40px ${stateColor[state]}11`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: state === 'working' ? 2 : state === 'thinking' ? 4 : 12, repeat: Infinity, ease: 'linear' }}
        >
          {/* 내부 링 */}
          <motion.div
            style={{
              width: '72%',
              height: '72%',
              borderRadius: '50%',
              border: `1px solid ${stateColor[state]}66`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            animate={{ rotate: -360 }}
            transition={{ duration: state === 'working' ? 1.5 : 8, repeat: Infinity, ease: 'linear' }}
          >
            {/* 코어 */}
            <motion.div
              style={{
                width: '55%',
                height: '55%',
                borderRadius: '50%',
                background: `radial-gradient(circle, ${stateColor[state]}CC 0%, ${stateColor[state]}44 50%, transparent 100%)`,
                boxShadow: `0 0 30px ${stateColor[state]}, 0 0 60px ${stateColor[state]}66`,
              }}
              animate={{
                scale: state === 'listening'
                  ? [1, 1 + micLevel * 0.8, 1]
                  : state === 'speaking'
                  ? [1, 1 + speakingLevel * 0.6, 1]
                  : [1, 1.08, 1],
              }}
              transition={{ duration: state === 'listening' ? 0.1 : 0.8, repeat: Infinity }}
            />
          </motion.div>
        </motion.div>

        {/* 상태 텍스트 - 코어 아래 */}
        <div style={{ position: 'absolute', top: 'calc(50% + clamp(70px, 13vmin, 115px))', textAlign: 'center' }}>
          <motion.div
            key={state}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              fontFamily: 'Orbitron, monospace',
              color: stateColor[state],
              fontSize: 'clamp(0.55rem, 1.2vw, 0.75rem)',
              letterSpacing: '0.3em',
              textShadow: `0 0 12px ${stateColor[state]}`,
            }}
          >
            {stateLabel[state].toUpperCase()}
          </motion.div>
        </div>
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
            <div style={{ fontFamily: 'Orbitron, monospace', color: 'rgba(0,245,255,0.55)', fontSize: '0.88rem', letterSpacing: '0.12em' }}>
              {currentTime}
            </div>
            <div style={{ fontFamily: 'Orbitron, monospace', color: 'rgba(100,116,139,0.35)', fontSize: '0.55rem', letterSpacing: '0.1em', marginTop: '2px' }}>
              {currentDate}
            </div>
          </div>

          {/* 중앙 — 로고 */}
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
            <h1 style={{
              fontFamily: 'Orbitron, monospace',
              color: '#00F5FF',
              fontSize: 'clamp(1.1rem, 2.5vw, 1.8rem)',
              letterSpacing: '0.35em',
              textShadow: '0 0 20px rgba(0,245,255,0.9), 0 0 50px rgba(0,245,255,0.4)',
              margin: 0,
            }}>
              MAWINPAY
            </h1>
            <p style={{ fontFamily: 'Orbitron, monospace', color: 'rgba(100,116,139,0.4)', fontSize: '0.48rem', letterSpacing: '0.55em', marginTop: '4px' }}>
              INTELLIGENCE SYSTEM v3.0
            </p>
          </div>

          {/* 우측 — 상태 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <motion.div
              style={{
                width: 8, height: 8, borderRadius: '50%',
                backgroundColor: stateColor[state],
                boxShadow: `0 0 10px ${stateColor[state]}`,
              }}
              animate={{ scale: state !== 'idle' ? [1, 1.6, 1] : [1, 1.1, 1] }}
              transition={{ duration: 0.7, repeat: Infinity }}
            />
            <span style={{ fontFamily: 'Orbitron, monospace', color: stateColor[state], fontSize: '0.6rem', letterSpacing: '0.2em' }}>
              {stateLabel[state]}
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── 파형 시각화 ── */}
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
              audioLevel={state === 'listening' ? micLevel : speakingLevel}
              color={state === 'listening' ? '#FF6B35' : '#00F5FF'}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 대화 스트림 ── */}
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

        {/* 힌트 */}
        <AnimatePresence>
          {showHint && messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ textAlign: 'center', marginTop: 8 }}
            >
              <motion.p
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 2.5, repeat: Infinity }}
                style={{
                  fontFamily: 'Orbitron, monospace',
                  color: 'rgba(0,245,255,0.5)',
                  fontSize: 'clamp(0.52rem, 1.1vw, 0.68rem)',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { label: 'COLLECTED', value: stats.collected, unit: '명', color: '#00F5FF' },
            { label: 'EMAILS', value: stats.emailsSent, unit: '통', color: '#0066FF' },
            { label: 'RESPONSE', value: `${stats.responseRate}%`, unit: '', color: '#22C55E' },
            { label: 'CONTRACTS', value: stats.contracts, unit: '건', color: '#7C3AED' },
          ].map(item => (
            <div
              key={item.label}
              style={{
                background: 'rgba(2,8,16,0.8)',
                border: `1px solid ${item.color}1A`,
                borderLeft: `2px solid ${item.color}99`,
                padding: '7px 11px',
                minWidth: '105px',
                backdropFilter: 'blur(4px)',
              }}
            >
              <div style={{ fontFamily: 'Orbitron, monospace', color: 'rgba(100,116,139,0.45)', fontSize: '0.42rem', letterSpacing: '0.2em' }}>
                {item.label}
              </div>
              <div style={{ fontFamily: 'Orbitron, monospace', color: item.color, fontSize: '1.05rem', fontWeight: 700, textShadow: `0 0 8px ${item.color}55` }}>
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
            { label: 'VOICE AI',   active: state === 'listening' || state === 'speaking', color: '#FF6B35' },
            { label: 'DATA SYNC',  active: state === 'working', color: '#22C55E' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <motion.div
                style={{
                  width: 5, height: 5, borderRadius: '50%',
                  backgroundColor: item.active ? item.color : 'rgba(100,116,139,0.2)',
                  boxShadow: item.active ? `0 0 6px ${item.color}` : 'none',
                }}
                animate={item.active ? { scale: [1, 1.5, 1] } : {}}
                transition={{ duration: 0.9, repeat: Infinity }}
              />
              <span style={{
                fontFamily: 'Orbitron, monospace',
                color: item.active ? item.color : 'rgba(100,116,139,0.2)',
                fontSize: '0.48rem',
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
