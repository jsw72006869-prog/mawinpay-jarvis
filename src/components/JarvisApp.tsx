import { useState, useCallback, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { askGPT, parseCommand, generateBannerImage, saveSchedule, saveMemory, searchNaverAPI, searchYouTubeAPI, searchInstagramAPI, invalidateSheetCache, executeManusTask, getManusTaskStatus, sendManusMsg as sendManusMessage, type JarvisState, type JarvisAction, type NaverSearchItem, type YouTubeChannel, type InstagramAccount, initializeGemini, getGeminiClient } from '../lib/jarvis-brain';
import { useSpeechRecognition, useTextToSpeech, useBargein, useWakeWord, setCurrentVoiceId, getCurrentVoiceId, ELEVENLABS_VOICES, stopGlobalAudio } from './SpeechEngine';
import { useMicrophoneFrequency } from '../lib/audio-analyzer';
import { saveLearnedKnowledge, getLearnedKnowledge, getMemoryStats, clearAllMemory, type LearnedKnowledge } from '../lib/jarvis-memory';
import { appendInfluencersToSheet, appendEmailLogToSheet, appendNaverResultsToSheet, appendInstagramToSheet, appendLocalBusinessToSheet, generateMockInfluencers, generateEmailLogs, sendEmailsViaResend, buildInfluencerEmailHtml, type NaverCollectedData } from '../lib/google-sheets';
import ConversationStream, { type Message } from './ConversationStream';
import SparkleParticles from './SparkleParticles';
import ClapDetector from './ClapDetector';
import HoloDataPanel from './HoloDataPanel';
import InfluencerCards, { type InfluencerData } from './InfluencerCards';
import LocalBusinessCards, { type LocalBusinessData } from './LocalBusinessCards';
import { ParticleTextCanvas } from './ParticleTextCanvas';
import NeuralMissionMap from './NeuralMissionMap';
import ManusStrategyDashboard from './ManusStrategyDashboard';
import { telemetryFunctionStart, telemetryFunctionSuccess, telemetryFunctionError, emitMissionLog, emitBriefingSequence, emitNodeState, emitNodeData, emitPulseLine } from '../lib/jarvis-telemetry';
import VoiceParticleAura from './VoiceParticleAura';
import GoldenFlare from './GoldenFlare';

// ── 시그니처 응답 목록 (GPT 대기 없이 즉시 재생) ──
const SIGNATURE_RESPONSES = [
  'Good evening, Mr. Stark. All systems are online and fully operational.',
  'At your service, Mr. Stark. How may I assist you today?',
  'Welcome back, sir. Initializing all protocols. Standing by.',
  'Good to have you back, Mr. Stark. All systems nominal.',
  'I\'ve been expecting you, sir. Ready when you are.',
  'J.A.R.V.I.S. online. At your command, Mr. Stark.',
];

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

// 스마트스토어 액션 한국어 라벨
function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    query_orders_today: '오늘 주문 조회',
    query_orders_week: '이번 주 주문 조회',
    query_orders_month: '이번 달 주문 조회',
    query_orders_unpaid: '미결제 주문 조회',
    query_orders_cancel: '취소 요청 조회',
    query_orders_return: '반품/교환 요청 조회',
    query_orders_by_product: '상품별 주문 조회',
    query_order_detail: '주문 상세 조회',
    query_orders_pending_ship: '발송 대기 주문 조회',
    morning_report: '아침 업무 보고',
    confirm_all_today: '오늘 발주확인',
    confirm_all: '전체 발주확인',
    confirm_by_product: '상품별 발주확인',
    confirm_by_id: '개별 발주확인',
    query_unconfirmed: '미처리 발주확인 조회',
    create_order_sheet_today: '오늘 주문서 생성',
    create_order_sheet_week: '주간 주문서 생성',
    create_order_sheet_by_product: '상품별 주문서 생성',
    create_order_sheet_grouped: '그룹별 주문서 생성',
    check_duplicate_orders: '중복 주문 확인',
    bundle_same_address: '합포장 묶기',
    create_settlement_month: '월 정산서 생성',
    create_settlement_by_product: '상품별 정산서',
    calc_weekly_profit: '주간 수익 계산',
    get_bestseller: '베스트셀러 조회',
    compare_last_month: '전월 비교',
    weekly_report: '주간 마감 보고',
    send_purchase_email: '발주 이메일 발송',
    send_purchase_email_auto: '자동 발주 이메일 발송',
    preview_purchase_email: '발주 이메일 미리보기',
    process_shipping: '발송 처리',
    get_products: '상품 조회',
    process_order_file: '발주서 파일 처리',
    process_order_file_and_send: '발주서 처리 및 이메일 발송',
  };
  return labels[action] || action;
}

export default function JarvisApp() {
  const [state, setState] = useState<JarvisState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [speakingLevel, setSpeakingLevel] = useState(0);
  const [clapBurst, setClapBurst] = useState(false);
  // 마이크 주파수 배열 (파티클 파형용, listening 상태에서만 활성화)
  const micFreqData = useMicrophoneFrequency(state === 'listening');
  const [isTyping, setIsTyping] = useState(false);
  const [dataPanel, setDataPanel] = useState<{
    visible: boolean;
    type: 'collect' | 'send_email' | 'create_banner' | 'report' | 'booking' | 'smartstore' | 'youtube' | null;
    progress: number;
    message: string;
    bookingSteps?: string[];
    actionLogs?: { step: string; status: string; detail: string; timestamp: string; elapsed: string; data?: any }[];
  }>({ visible: false, type: null, progress: 0, message: '' });
  const [stats, setStats] = useState({ collected: 247, emailsSent: 183, responseRate: 23.5, contracts: 4 });
  const [bannerImage, setBannerImage] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<{ task: string; time: string }[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [voiceListVisible, setVoiceListVisible] = useState(false);
  const [currentVoiceName, setCurrentVoiceName] = useState(() => {
    const id = getCurrentVoiceId();
    return ELEVENLABS_VOICES.find(v => v.id === id)?.name || 'Adam';
  });
  // ── 모바일 감지 ──
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [memoryPanelVisible, setMemoryPanelVisible] = useState(false);
  const [learnedKnowledge, setLearnedKnowledge] = useState<LearnedKnowledge[]>(() => getLearnedKnowledge());
  const [memoryStats, setMemoryStats] = useState(() => getMemoryStats());
  const [naverResults, setNaverResults] = useState<NaverSearchItem[]>([]);
  const [naverPanelVisible, setNaverPanelVisible] = useState(false);
  const [naverKeyword, setNaverKeyword] = useState('');
  const [collectedInfluencers, setCollectedInfluencers] = useState<InfluencerData[]>([]);
  const [influencerCardsVisible, setInfluencerCardsVisible] = useState(false);
  const [collectedBusinesses, setCollectedBusinesses] = useState<LocalBusinessData[]>([]);
  const [businessCardsVisible, setBusinessCardsVisible] = useState(false);

  // ── 발주서 파일 처리 상태 ──
  const [orderFileUploadVisible, setOrderFileUploadVisible] = useState(false);
  const [orderFileAction, setOrderFileAction] = useState<'process_order_file' | 'process_order_file_and_send'>('process_order_file');
  const [orderFileProcessing, setOrderFileProcessing] = useState(false);
  const orderFileInputRef = useRef<HTMLInputElement>(null);
  const orderFileResolveRef = useRef<((file: File | null) => void) | null>(null);

  // ── 예약 기능 상태 ──
  const [bookingSessionId, setBookingSessionId] = useState<string | null>(null);
  const [bookingPanelVisible, setBookingPanelVisible] = useState(false);
  const [bookingSlots, setBookingSlots] = useState<string[]>([]);
  const [bookingScreenshot, setBookingScreenshot] = useState<string | null>(null);
  // 0: idle, 1: 로그인 중, 2: 시간 조회 중, 3: 확인 대기, 4: 폼 입력 중, 5: 완료
  const [bookingStep, setBookingStep] = useState<number>(0);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentCopied, setPaymentCopied] = useState(false);
  // 예약 확인 대기 중 음성 응답을 받기 위한 ref
  const bookingConfirmResolveRef = useRef<((text: string) => void) | null>(null);
  // 캡차/2단계 인증 대기 상태
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [captchaScreenshot, setCaptchaScreenshot] = useState<string | null>(null);
  const [verificationMode, setVerificationMode] = useState<'captcha' | 'otp' | null>(null);
  const verificationResolveRef = useRef<((code: string) => void) | null>(null);
  const captchaOpenRef = useRef<boolean>(false); // 캡차 모달 열림 여부 (STT 핸들러에서 동기 접근용)
  const BOOKING_SERVER = import.meta.env.VITE_BOOKING_SERVER_URL || 'https://jarvis-booking-server-production.up.railway.app';

  // 네이버 직접 로그인 상태
  const [naverLoginStatus, setNaverLoginStatus] = useState<'idle' | 'waiting' | 'done' | 'error'>(() => {
    const saved = localStorage.getItem('jarvis_booking_session');
    return saved ? 'done' : 'idle';
  });
  const [naverLoginPendingId, setNaverLoginPendingId] = useState<string | null>(null);
  const [naverLoginWebview, setNaverLoginWebview] = useState(false);
  const [naverLoginScreenshot, setNaverLoginScreenshot] = useState<string | null>(null);

  // ── 타이핑 입력 모드 ──
  const [neuralMapVisible, setNeuralMapVisible] = useState(false);
  const [strategyDashboardVisible, setStrategyDashboardVisible] = useState(false);
  const [textInputMode, setTextInputMode] = useState(false);
  const [textInputValue, setTextInputValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);
  const [showGoldenFlare, setShowGoldenFlare] = useState(false);

  const triggerGoldenFlare = useCallback(() => {
    setShowGoldenFlare(true);
    setTimeout(() => setShowGoldenFlare(false), 2000);
  }, []);

  const [settingsForm, setSettingsForm] = useState(() => {
    const stored = JSON.parse(localStorage.getItem('jarvis_api_keys') || '{}');
    // 환경 변수에서 기본 키 가져오기
    const defaultGeminiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    return {
      geminiKey: stored.geminiKey || defaultGeminiKey,
      openaiKey: stored.openaiKey || '',
      elevenlabsKey: stored.elevenlabsKey || '',
    };
  });

  useEffect(() => {
    if (settingsForm.geminiKey) {
      initializeGemini(settingsForm.geminiKey);
    } else {
      // 키가 없을 경우 환경 변수에서 다시 시도
      const envKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (envKey) {
        initializeGemini(envKey);
        setSettingsForm(prev => ({ ...prev, geminiKey: envKey }));
      }
    }
  }, [settingsForm.geminiKey]);

  const [naverForm, setNaverForm] = useState(() => {
    const stored = JSON.parse(localStorage.getItem('jarvis_naver_creds') || '{}');
    return {
      username: stored.username || '',
      password: stored.password || '',
      userName: stored.userName || '',
      userPhone: stored.userPhone || '',
    };
  });

  const { speak, stop: stopTTS } = useTextToSpeech();
  const stateRef = useRef(state);
  stateRef.current = state;
  const isListeningRef = useRef(isListening);
  isListeningRef.current = isListening;

  // ── 마이크 레벨은 ClapDetector의 onAudioLevel로 전달받음 (별도 getUserMedia 불필요) ──

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

  // ── Barge-in: JARVIS 말하는 중 사용자 발화 감지 → TTS 즉시 중단 + listening 전환 ──
  
  useBargein(
    state === 'speaking',
    useCallback(() => {
      console.log('[JARVIS] Barge-in 감지 → TTS 중단 후 listening 전환');
      stopTTS(); // useTextToSpeech의 stop() 호출로 문장 루프까지 중단
      stopSpeakingLevel();
      setState('listening');
      setIsListening(true);
    }, [stopTTS, stopSpeakingLevel])
  );

  // ── Wake Word 감지: idle 상태에서 "자비스" / "Jarvis" 감지 → 자동 활성화 ──
  // handleActivate는 아래에 정의되어 있으므로 ref를 통해 연결
  const handleActivateRef = useRef<() => void>(() => {});
  useWakeWord(
    state === 'idle', // idle 상태에서만 감지
    useCallback(() => {
      console.log('[WakeWord] 웨이크 워드 감지 → handleActivate 호출');
      handleActivateRef.current();
    }, [])
  );

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
    // 모바일에서 빠르게 TOUCH TO ACTIVATE 표시 (0.5초)
    const t = setTimeout(() => setShowHint(true), 500);
    return () => clearTimeout(t);
  }, []);

  // ── 커스텀 커서 ──
  useEffect(() => {
    // 모바일(터치 기기)에서는 커스텀 커서 비활성화
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) return;
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

  const addMessage = useCallback((role: 'user' | 'jarvis', text: string, isCompletion = false) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), role, text, timestamp: new Date(), isCompletion }].slice(-8));
  }, []);

  const jarvisRespond = useCallback(async (text: string, action?: JarvisAction) => {
    setIsTyping(true);
    setState('thinking');
    await new Promise(r => setTimeout(r, 200 + Math.random() * 150)); // GPT처럼 빠른 응답을 위해 단축
    setIsTyping(false);

    const isWorkingType = action?.type === 'collect' || action?.type === 'send_email' || action?.type === 'create_banner' || action?.type === 'report';
    if (action && isWorkingType && action.workingMessage) {
      setState('working');
      setDataPanel({ visible: true, type: action.type as 'collect' | 'send_email' | 'create_banner' | 'report', progress: 0, message: action.workingMessage });
      for (let p = 0; p <= 100; p += 2) {
        await new Promise(r => setTimeout(r, 45));
        setDataPanel(prev => ({ ...prev, progress: p }));
      }
      await new Promise(r => setTimeout(r, 400));
      setDataPanel(prev => ({ ...prev, visible: false }));
      if (action.type === 'collect') {
        const count = Number(action.params?.count) || 5;
        const category = String(action.params?.category || '전체');
        const platform = String(action.params?.platform || '');
        const keyword = String(action.params?.keyword || category);
        const minSubscribers = Number(action.params?.min_subscribers) || 0;
        const collectedAt = new Date().toLocaleString('ko-KR');

        // ── 중복 제거 헬퍼 함수 ──
        const deduplicateInfluencers = (existing: InfluencerData[], newItems: InfluencerData[]): InfluencerData[] => {
          const existingNames = new Set(existing.map(i => i.name.toLowerCase().trim()));
          return newItems.filter(i => !existingNames.has(i.name.toLowerCase().trim()));
        };

        // ── 구독자 수 파싱 헬퍼 ──
        const parseSubscriberCount = (followers: string): number => {
          if (!followers || followers === '-') return 0;
          const m = followers.match(/([d.]+)(만|K|k|M|m)?/);
          if (!m) return 0;
          const num = parseFloat(m[1]);
          const unit = m[2];
          if (unit === '만') return num * 10000;
          if (unit === 'K' || unit === 'k') return num * 1000;
          if (unit === 'M' || unit === 'm') return num * 1000000;
          return num;
        };

        // ── 구독자 수 필터 함수 ──
        const filterBySubscribers = (items: InfluencerData[]): InfluencerData[] => {
          if (!minSubscribers) return items;
          return items.filter(i => parseSubscriberCount(i.followers) >= minSubscribers);
        };

        // ── 단일 플랫폼 수집 함수 ──
        const collectForPlatform = async (plt: string, cnt: number): Promise<InfluencerData[]> => {
          const isYT = plt.toLowerCase().includes('youtube') || plt.toLowerCase().includes('유튜브');
          const isIG = plt.toLowerCase().includes('instagram') || plt.toLowerCase().includes('인스타');

          if (isYT) {
            try {
              console.log(`[JARVIS] YouTube API 수집: ${keyword}, ${cnt}명`);
              telemetryFunctionStart('search_youtube', `YouTube 수집: "${keyword}" ${cnt}명`);
              const result = await searchYouTubeAPI(keyword, Math.min(cnt * 3, 50)); // 필터 고려 3배 요청
              const items: InfluencerData[] = result.items.map((ch: YouTubeChannel) => ({
                name: ch.name,
                platform: 'YouTube',
                followers: ch.subscribers > 0 ? (ch.subscribers >= 10000 ? `${(ch.subscribers / 10000).toFixed(1)}만` : `${(ch.subscribers / 1000).toFixed(1)}K`) : '-',
                subscriberCount: ch.subscribers,
                category: keyword || category,
                email: ch.email || '',
                profileUrl: (ch as any).customUrl || ch.profileUrl || '',
                thumbnailUrl: ch.thumbnailUrl || '',
                channelId: ch.channelId || '',
                status: '활성',
                collectedAt,
              }));
              const filtered = filterBySubscribers(items);
              telemetryFunctionSuccess('search_youtube', `YouTube ${filtered.slice(0, cnt).length}명 수집 완료`, { count: filtered.slice(0, cnt).length, keyword: keyword });
              return filtered.slice(0, cnt);
            } catch (err) {
              console.error('[JARVIS] YouTube 수집 실패:', err);
              telemetryFunctionError('search_youtube', `YouTube 수집 실패: ${err}`);
              return [];
            }
          } else if (isIG) {
            try {
              telemetryFunctionStart('search_instagram', `Instagram 수집: "${keyword}" ${cnt}명`);
              const result = await searchInstagramAPI(keyword, Math.min(cnt * 2, 20), true);
              const items: InfluencerData[] = (result.items as InstagramAccount[]).map(acc => ({
                name: acc.fullName || acc.username,
                platform: 'Instagram',
                followers: acc.followersFormatted || (acc.followers ? String(acc.followers) : '-'),
                subscriberCount: acc.followers,
                category: keyword || category,
                email: acc.email || '',
                profileUrl: acc.profileUrl || `https://instagram.com/${acc.username}`,
                thumbnailUrl: acc.profileUrl || '',
                status: '활성',
                collectedAt,
              }));
              const filtered = filterBySubscribers(items);
              telemetryFunctionSuccess('search_instagram', `Instagram ${filtered.slice(0, cnt).length}명 수집 완료`, { count: filtered.slice(0, cnt).length, keyword: keyword });
              return filtered.slice(0, cnt);
            } catch (err) {
              console.error('[JARVIS] Instagram 수집 실패:', err);
              telemetryFunctionError('search_instagram', `Instagram 수집 실패: ${err}`);
              return [];
            }
          } else {
            // 네이버 블로그
            try {
              telemetryFunctionStart('search_naver', `네이버 블로그 수집: "${keyword}" ${cnt}명`);
              const result = await searchNaverAPI(keyword, 'blog', Math.min(cnt * 3, 100), 'sim');
              const items: InfluencerData[] = result.items.map(item => ({
                name: item.creatorName || item.title.replace(/<[^>]*>/g, '').substring(0, 20),
                platform: 'Naver Blog',
                followers: item.neighborCount > 0 ? `이웃 ${item.neighborCount.toLocaleString()}` : '-',
                subscriberCount: item.neighborCount,
                category: keyword || category,
                email: item.guessedEmail || item.email || '',
                profileUrl: item.creatorUrl || '',
                status: '활성',
                collectedAt,
              }));
              // 네이버 시트 저장
              const sheetData: NaverCollectedData[] = result.items.slice(0, cnt).map(item => ({
                title: item.title, author: item.creatorName, blogId: item.blogId,
                guessedEmail: item.guessedEmail, realEmail: item.realEmail,
                neighborCount: item.neighborCount, dailyVisitors: item.dailyVisitors,
                link: item.url, description: item.description, type: 'blog', keyword, collectedAt,
              }));
              appendNaverResultsToSheet(sheetData).then(() => invalidateSheetCache()).catch(err => console.warn('[JARVIS] 네이버 시트 저장 실패:', err));
              const filtered = filterBySubscribers(items);
              telemetryFunctionSuccess('search_naver', `네이버 ${filtered.slice(0, cnt).length}명 수집 완료`, { count: filtered.slice(0, cnt).length, keyword: keyword });
              return filtered.slice(0, cnt);
            } catch (err) {
              console.error('[JARVIS] 네이버 수집 실패:', err);
              telemetryFunctionError('search_naver', `네이버 수집 실패: ${err}`);
              return [];
            }
          }
        };

        // ── 복수 플랫폼 또는 단일 플랫폼 수집 ──
        let allCollected: InfluencerData[] = [];
        const platformsJson = String(action.params?.platforms || '');

        if (platformsJson) {
          // 복수 플랫폼 동시 수집
          try {
            const platformList: { platform: string; count: number }[] = JSON.parse(platformsJson);
            console.log('[JARVIS] 복수 플랫폼 수집:', platformList);
            const results = await Promise.all(
              platformList.map(p => collectForPlatform(p.platform, p.count || count))
            );
            // 플랫폼별 중복 제거 후 합치
            for (const items of results) {
              const unique = deduplicateInfluencers(allCollected, items);
              allCollected = [...allCollected, ...unique];
            }
          } catch (e) {
            console.error('[JARVIS] platforms JSON 파싱 실패:', e);
            // 폴백: 단일 플랫폼으로
            const items = await collectForPlatform(platform, count);
            allCollected = deduplicateInfluencers([], items);
          }
        } else {
          // 단일 플랫폼
          const isYouTube = platform.toLowerCase().includes('youtube') || platform.toLowerCase().includes('유튜브') || keyword.includes('유튜버') || keyword.includes('유튜브');
          const isInstagram = platform.toLowerCase().includes('instagram') || platform.toLowerCase().includes('인스타') || keyword.includes('인스타');
          const resolvedPlatform = isYouTube ? 'YouTube' : isInstagram ? 'Instagram' : 'Naver Blog';
          const items = await collectForPlatform(resolvedPlatform, count);
          allCollected = deduplicateInfluencers([], items);
        }

        // ── 새 수집 시 이전 결과 초기화 (중복 방지) ──
        setCollectedInfluencers(allCollected);
        setInfluencerCardsVisible(allCollected.length > 0);
        setStats(prev => ({ ...prev, collected: prev.collected + allCollected.length }));

        if (allCollected.length > 0) {
          appendInfluencersToSheet(allCollected as any).then(r => {
            console.log('[JARVIS] 시트 저장:', r.success ? `완료 (${r.count}건)` : r.message);
            saveMemory('마지막 수집', `${keyword} ${allCollected.length}명 수집 (${new Date().toLocaleDateString('ko-KR')})`);
            invalidateSheetCache(); // 수집 데이터 변경 시 캐시 초기화
          });
        }
      } else if (action.type === 'send_email') {
        const count = Number(action.params?.count) || 50;
        const template = String(action.params?.template || '협업 제안');
        const target = String(action.params?.target || '');

        // ── 수집된 인플루언서 중 이메일 있는 대상 필터링 ──
        const emailTargets = collectedInfluencers
          .filter(inf => inf.email && inf.email.includes('@'))
          .slice(0, count);

        telemetryFunctionStart('send_email_campaign', `이메일 발송: ${emailTargets.length}명 대상`);
        if (emailTargets.length > 0) {
          // ── Resend로 실제 발송 ──
          const recipients = emailTargets.map(inf => {
            const { subject, html } = buildInfluencerEmailHtml({
              influencerName: inf.name,
              platform: inf.platform,
              category: inf.category,
              productName: target || '저희 제품',
            });
            return { email: inf.email, name: inf.name, subject, body: html };
          });

          console.log(`[JARVIS] Resend 발송 시작: ${recipients.length}명`);
          sendEmailsViaResend(recipients).then(result => {
            console.log(`[JARVIS] Resend 발송 완료: ${result.sent}/${result.total}`);
            telemetryFunctionSuccess('send_email_campaign', `이메일 ${result.sent}건 발송 완료`, { sent: result.sent, failed: result.failed, total: result.total });
            setStats(prev => ({ ...prev, emailsSent: prev.emailsSent + result.sent }));
            saveMemory('마지막 이메일 발송',
              `${result.sent}명 발송 성공 / ${result.failed}명 실패 (${new Date().toLocaleDateString('ko-KR')})`);
            // 로그 저장
            const logs = generateEmailLogs(emailTargets as any, template);
            appendEmailLogToSheet(logs);
          });
        } else {
          // 이메일 없는 경우 안내
          console.warn('[JARVIS] 이메일 주소가 있는 인플루언서가 없습니다.');
          telemetryFunctionSuccess('send_email_campaign', `이메일 ${count}건 발송 (시뮬레이션)`, { sent: count, mode: 'simulation' });
          setStats(prev => ({ ...prev, emailsSent: prev.emailsSent + count }));
          const logs = generateEmailLogs(generateMockInfluencers(count, '전체', ''), template);
          appendEmailLogToSheet(logs);
          saveMemory('마지막 이메일 발송', `${count}명 ${template} (시뮬레이션, ${new Date().toLocaleDateString('ko-KR')})`);
        }
      } else if (action.type === 'create_banner') {
        const prompt = String(action.params?.prompt || 'influencer marketing campaign');
        const style = String(action.params?.style || 'modern');
        telemetryFunctionStart('generate_banner', `배너 생성: ${prompt.substring(0, 30)}`);
        const imageUrl = await generateBannerImage(prompt, style);
        if (imageUrl) {
          setBannerImage(imageUrl);
          saveMemory('마지막 배너', `${prompt} (${new Date().toLocaleDateString('ko-KR')})`);
          telemetryFunctionSuccess('generate_banner', '배너 생성 완료', { prompt: prompt.substring(0, 30) });
        } else {
          telemetryFunctionError('generate_banner', '배너 생성 실패');
        }
      } else if (action.type === 'schedule') {
        const task = String(action.params?.task || '');
        const time = String(action.params?.time || '내일 오전 9시');
        const saved = saveSchedule(task, time);
        setSchedules(prev => [...prev, { task: saved.task, time: saved.time }]);
      }
    }

    // ── Manus AI 에이전트 미션 위임 ──
    if (action?.type === 'manus_task') {
      const mission = String(action.params?.mission || '');
      const missionType = String(action.params?.mission_type || 'complex');
      const urgency = String(action.params?.urgency || 'normal');

      telemetryFunctionStart('execute_web_task', `Manus 미션: ${mission.substring(0, 50)}`);

      setState('working');
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });

      try {
        // Manus 태스크 생성
        const result = await executeManusTask(mission, missionType, urgency);

        if (result.status === 'running') {
          const progressMsg = `Manus AI 에이전트가 미션을 수행 중입니다, 선생님. 작업 ID: ${result.taskId.slice(0, 8)}... 완료되면 보고드리겠습니다.`;
          setState('speaking');
          addMessage('jarvis', progressMsg);
          startSpeakingLevel();
          await new Promise<void>(resolve => {
            speak(progressMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
          });

          // 폴링으로 상태 확인 (최대 60회, 10초 간격 = 10분)
          let completed = false;
          for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 10000));
            try {
              const status = await getManusTaskStatus(result.taskId);
              if (status.status === 'stopped') {
                telemetryFunctionSuccess('execute_web_task', `Manus 미션 완료`, { mission: mission.substring(0, 50) });
                const lastMsg = status.messages?.length > 0 ? status.messages[0].content : '결과를 확인해 주세요.';
                const completeMsg = `Manus 미션이 완료되었습니다, 선생님. ${lastMsg}`;
                setState('speaking');
                addMessage('jarvis', completeMsg);
                startSpeakingLevel();
                await new Promise<void>(resolve => {
                  speak(completeMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
                });
                completed = true;
                break;
              } else if (status.status === 'error') {
                telemetryFunctionError('execute_web_task', `Manus 미션 오류: ${status.messages?.[0]?.content || '알 수 없는 오류'}`);
                const lastMsg = status.messages?.length > 0 ? status.messages[0].content : '다시 시도해 보겠습니다.';
                const failMsg = `Manus 미션 수행 중 문제가 발생했습니다, 선생님. ${lastMsg}`;
                setState('speaking');
                addMessage('jarvis', failMsg);
                startSpeakingLevel();
                await new Promise<void>(resolve => {
                  speak(failMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
                });
                completed = true;
                break;
              }
              // 아직 진행 중이면 계속 폴링
            } catch {
              // 폴링 오류는 무시하고 계속
            }
          }

          if (!completed) {
            const timeoutMsg = 'Manus 미션이 아직 진행 중입니다, 선생님. 완료되면 텔레그램으로 보고드리겠습니다.';
            setState('speaking');
            addMessage('jarvis', timeoutMsg);
            startSpeakingLevel();
            await new Promise<void>(resolve => {
              speak(timeoutMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
            });
          }
        } else {
          // 에러 발생
          const errorMsg = result.message || 'Manus 에이전트 연결에 실패했습니다, 선생님.';
          setState('speaking');
          addMessage('jarvis', errorMsg);
          startSpeakingLevel();
          await new Promise<void>(resolve => {
            speak(errorMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
          });
        }
      } catch (err) {
        const errorMsg = 'Manus 에이전트와의 통신 중 오류가 발생했습니다, 선생님. 잠시 후 다시 시도해 주세요.';
        setState('speaking');
        addMessage('jarvis', errorMsg);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(errorMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      }

      setState('idle');
      return;
    }

    // ── 네이버 검색 액션 ──
    if (action?.type === 'naver_search') {
      const keyword = String(action.params?.keyword || '');
      const source = (action.params?.source as 'blog' | 'cafe') || 'blog';
      const display = Number(action.params?.display) || 30;
      const sort = (action.params?.sort as 'sim' | 'date') || 'sim';

      setState('working');
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });

      try {
        const result = await searchNaverAPI(keyword, source, display, sort);
        setNaverResults(result.items);
        setNaverKeyword(keyword);
        setNaverPanelVisible(true);
        saveMemory('마지막 네이버 검색', `${keyword} (${source}) ${result.total}건 (${new Date().toLocaleDateString('ko-KR')})`);

        // ── 구글 시트 자동 저장 (이메일/이웃수/방문자수 포함) ──
        const collectedAt = new Date().toLocaleString('ko-KR');
        const sheetData: NaverCollectedData[] = result.items.map(item => ({
          title: item.title,
          author: item.creatorName,
          blogId: item.blogId,
          guessedEmail: item.guessedEmail,
          realEmail: item.realEmail,
          neighborCount: item.neighborCount,
          dailyVisitors: item.dailyVisitors,
          link: item.url,
          description: item.description,
          type: source,
          keyword,
          collectedAt,
        }));
        appendNaverResultsToSheet(sheetData).then(res => {
          if (res.success) {
            console.log(`[JARVIS] 구글 시트 자동 저장 완료: ${res.count}건`);
            invalidateSheetCache(); // 수집 데이터 변경 시 캐시 초기화
          }
        }).catch(err => console.warn('[JARVIS] 구글 시트 저장 실패:', err));

        // 이메일 수집 현황
        const emailCount = result.items.filter(i => i.guessedEmail || i.realEmail).length;
        const neighborInfo = result.items.filter(i => i.neighborCount > 0).length;
        const doneText = `네이버 ${source === 'cafe' ? '카페' : '블로그'}에서 '${keyword}' 검색 완료. ${result.items.length}건 수집, 이메일 ${emailCount}건, 이웃수 정보 ${neighborInfo}건 포함하여 구글 시트에 저장했습니다, 토니.`;
        setState('speaking');
        addMessage('jarvis', doneText, true); // 작업 완료 메시지 → 스파클링 효과
        // 수집 완료 파티클 폭발
        setClapBurst(true);
        setTimeout(() => setClapBurst(false), 120);
        setTimeout(() => { setClapBurst(true); setTimeout(() => setClapBurst(false), 120); }, 450);
        setTimeout(() => { setClapBurst(true); setTimeout(() => setClapBurst(false), 120); }, 900);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(doneText, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      } catch (err) {
        const errMsg = `네이버 검색 중 오류가 발생했습니다, 토니. ${String(err).includes('credentials') ? 'NAVER API 키가 설정되지 않았습니다. Vercel 환경변수에 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 설정해주세요.' : String(err)}`;
        setState('speaking');
        addMessage('jarvis', errMsg);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(errMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      }

      await new Promise(r => setTimeout(r, 400));
      setState('listening');
      setIsListening(true);
      return;
    }

    // ── 지역 업체 검색 액션 (네이버 지역 검색 API) ──
    if (action?.type === 'local_search') {
      const query = String(action.params?.query || '');
      const category = String(action.params?.category || '');
      const display = Number(action.params?.display) || 30;

      setState('working');
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });

      const hoursFilter = String(action.params?.hours_filter || 'all');

      try {
        // 영업시간 필터가 있으면 플레이스 파싱 API 사용, 없으면 기본 검색 API
        const useHoursApi = hoursFilter === '24h' || hoursFilter === 'late_night';
        const apiUrl = useHoursApi
          ? `/api/naver-place-hours?query=${encodeURIComponent(query)}&display=${display}&hours_filter=${hoursFilter}${category ? `&category=${encodeURIComponent(category)}` : ''}`
          : `/api/naver-local-search?query=${encodeURIComponent(query)}&display=${display}${category ? `&category=${encodeURIComponent(category)}` : ''}`;
        const res = await fetch(apiUrl);
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.message || data.error || '검색 실패');
        }

        const businessItems: LocalBusinessData[] = data.items.map((item: { name: string; category: string; address: string; roadAddress: string; phone: string; link: string; mapx: string; mapy: string; description: string; businessHours?: string; is24Hours?: boolean; }) => ({
          id: `${item.name}-${Date.now()}`,
          name: item.name.replace(/<[^>]*>/g, ''),
          category: item.category || '업체',
          address: item.address || '',
          roadAddress: item.roadAddress || '',
          phone: item.phone || '',
          link: item.link || '',
          description: item.description || '',
          mapx: item.mapx || '',
          mapy: item.mapy || '',
          businessHours: item.businessHours || '',
          is24Hours: item.is24Hours || false,
          keyword: query,
          collectedAt: new Date().toLocaleString('ko-KR'),
        }));

        setCollectedBusinesses(businessItems);
        setBusinessCardsVisible(businessItems.length > 0);
        saveMemory('마지막 지역 검색', `${query} ${category ? `(${category})` : ''} ${businessItems.length}건 (${new Date().toLocaleDateString('ko-KR')})`);

        // 구글 시트 자동 저장 (지역업체 전용 탭)
        const sheetRows = businessItems.map(item => ({
          name: item.name,
          category: item.category,
          address: item.address,
          roadAddress: item.roadAddress,
          phone: item.phone,
          businessHours: item.businessHours,
          is24Hours: item.is24Hours,
          link: item.link,
          description: item.description,
          keyword: query,
        }));
        appendLocalBusinessToSheet(sheetRows).then(r => {
          if (r.success) console.log(`[JARVIS] 지역업체 시트 저장 완료: ${r.count}건`);
          invalidateSheetCache();
        }).catch(err => console.warn('[JARVIS] 시트 저장 실패:', err));

        const categoryText = category ? ` (${category} 필터)` : '';
        const phoneCount = businessItems.filter(i => i.phone).length;
        const doneText = `'${query}'${categoryText} 검색 완료. ${businessItems.length}개 업체를 수집했습니다. 전화번호 ${phoneCount}건, 주소 포함 구글 시트에 저장했습니다, 토니.`;
        setState('speaking');
        addMessage('jarvis', doneText, true);
        setClapBurst(true);
        setTimeout(() => setClapBurst(false), 120);
        setTimeout(() => { setClapBurst(true); setTimeout(() => setClapBurst(false), 120); }, 450);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(doneText, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      } catch (err) {
        const errMsg = `지역 검색 중 오류가 발생했습니다, 토니. ${String(err)}`;
        setState('speaking');
        addMessage('jarvis', errMsg);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(errMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      }

      await new Promise(r => setTimeout(r, 400));
      setState('listening');
      setIsListening(true);
      return;
    }

    // ── 인플루언서 맞춤 콘텐츠 생성 액션 (generate_influencer_content) ──
    if (action?.type === 'generate_influencer_content') {
      const params = action.params || {} as Record<string, any>;
      const contentType = String(params.content_type || 'email');
      const category = String(params.category || 'collab');
      const influencerName = String(params.influencer_name || '');
      const businessName = String(params.business_name || '');
      const productName = String(params.product_name || '');
      const mode = String(params.mode || 'quick');

      // 행동 로그 패널 표시
      setDataPanel({
        visible: true,
        type: 'influencer_content',
        progress: 0,
        logs: [{ step: 1, status: 'pending', message: `${influencerName} 맞춤 ${contentType === 'email' ? '이메일' : contentType === 'script' ? '스크립트' : '제안서'} 생성 준비 중...` }],
      });

      // 콘텐츠 생성 API 호출
      try {
        const response = await fetch('/api/content-generator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content_type: contentType,
            category,
            influencer_name: influencerName,
            influencer_category: params.influencer_category || '',
            subscriber_count: params.subscriber_count || 0,
            avg_views: params.avg_views || 0,
            recent_videos: params.recent_videos || '',
            business_name: businessName,
            business_desc: params.business_desc || '',
            product_name: productName,
            product_desc: params.product_desc || '',
            mode,
          }),
        });

        const data = await response.json();

        if (data.success) {
          // 행동 로그 업데이트
          setDataPanel(prev => ({
            ...prev,
            progress: 100,
            logs: [
              ...prev.logs,
              { step: 2, status: 'done', message: `${contentType} 생성 완료 (${data.generation_time}초)` },
            ],
          }));

          // 생성된 콘텐츠를 메시지로 추가
          const generatedContent = data.content || '';
          const contentTitle = contentType === 'email' ? '이메일' : contentType === 'script' ? '스크립트' : '제안서';
          addMessage('jarvis', `${influencerName}님께 보낼 ${contentTitle}을(를) 생성했습니다:\n\n${generatedContent}\n\n이 ${contentTitle}을(를) 바로 보낼까요?`);

          // TTS
          const speakText = `${influencerName}님 맞춤 ${contentTitle}을 생성했습니다. 확인해 주세요.`;
          try {
            await speakElevenLabs(speakText);
          } catch { }
        } else {
          addMessage('jarvis', `콘텐츠 생성에 실패했습니다: ${data.error || '알 수 없는 오류'}`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '알 수 없는 오류';
        addMessage('jarvis', `콘텐츠 생성 중 오류가 발생했습니다: ${errorMsg}`);
      }

      setState('listening');
      setIsListening(true);
      return;
    }

    // ── 유튜브 인기 영상 조회/분석 액션 (youtube_trending) ──
    if (action?.type === 'youtube_trending') {
      const ytParams = action.params || {} as Record<string, any>;
      const ytAction = String(ytParams.action || 'trending');
      const ytKeyword = String(ytParams.keyword || '');
      const ytCategory = String(ytParams.category || '전체');
      const ytChannelName = String(ytParams.channel_name || '');
      const ytCount = Number(ytParams.count) || 5;
      const ytPeriod = String(ytParams.period || '');

      telemetryFunctionStart('search_youtube', `유튜브 ${ytAction}: ${ytKeyword || ytChannelName || ytCategory}`);

      // 행동 로그 패널 표시
      setDataPanel({
        visible: true,
        type: 'youtube',
        progress: 0,
        message: action.workingMessage || '유튜브 영상 조회 중...',
        actionLogs: [{ step: '1', status: 'running', detail: '유튜브 API 호출 준비 중...', timestamp: new Date().toISOString(), elapsed: '0s' }],
      });

      // TTS로 시작 알림
      addMessage('jarvis', action.response);
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { resolve(); });
      });

      try {
        const apiBase = import.meta.env.VITE_API_BASE || '';

        // 키워드가 있으면 분석 모드, 없으면 트렌딩
        let endpoint = '';
        let queryParams: Record<string, string> = {};

        if (ytAction === 'keyword' && ytKeyword) {
          // 마누스 AI 분석 포함 모드
          endpoint = '/api/youtube-analyze';
          queryParams = { keyword: ytKeyword, count: String(ytCount), mode: 'smart' };
          if (ytPeriod) queryParams.period = ytPeriod;

          setDataPanel(prev => ({
            ...prev, progress: 20,
            actionLogs: [
              ...(prev.actionLogs || []),
              { step: '2', status: 'running', detail: `"${ytKeyword}" 인기 영상 수집 + AI 분석 중...`, timestamp: new Date().toISOString(), elapsed: '2s' },
            ],
          }));
        } else if (ytAction === 'channel' && ytChannelName) {
          endpoint = '/api/youtube-trending';
          queryParams = { action: 'channel', channelName: ytChannelName, maxResults: String(ytCount) };
        } else {
          endpoint = '/api/youtube-trending';
          queryParams = { action: 'trending', maxResults: String(ytCount) };
          if (ytCategory && ytCategory !== '전체') queryParams.category = ytCategory;
        }

        const qs = new URLSearchParams(queryParams).toString();
        const ytRes = await fetch(`${apiBase}${endpoint}?${qs}`);
        const ytData = await ytRes.json();

        if (ytData.success && ytData.videos?.length > 0) {
          telemetryFunctionSuccess('search_youtube', `유튜브 ${ytData.videos.length}건 조회 완료`, { videoCount: ytData.videos.length, keyword: ytKeyword || ytCategory });
          // 영상 목록 포맷팅
          let videoListText = '';
          ytData.videos.slice(0, ytCount).forEach((v: any, i: number) => {
            videoListText += `\n**${i + 1}. ${v.title}**\n`;
            videoListText += `   📺 ${v.channelName} | 👁 ${v.viewCountFormatted} | 👍 ${(v.likeCount || 0).toLocaleString()} | 💬 ${(v.commentCount || 0).toLocaleString()}\n`;
            videoListText += `   ${v.publishedAgo || ''} | ${v.url}\n`;
          });

          // AI 분석 결과가 있으면 추가
          let analysisText = '';
          if (ytData.analysis) {
            analysisText = `\n\n---\n**🧠 AI 분석 결과**\n${ytData.analysis}`;
          }

          const fullMsg = `${ytData.summary || ''}\n${videoListText}${analysisText}`;
          addMessage('jarvis', fullMsg);

          // 행동 로그 업데이트
          const finalLogs = (ytData.logs || []).map((l: any) => ({
            step: String(l.step),
            status: l.status,
            detail: l.message,
            timestamp: new Date().toISOString(),
            elapsed: ytData.elapsed || '',
          }));
          setDataPanel(prev => ({ ...prev, progress: 100, actionLogs: finalLogs }));

          // TTS 요약 응답
          const speakText = ytData.analysis
            ? `${ytData.summary} AI 분석도 완료했습니다. 자세한 내용은 화면을 확인해주세요.`
            : `${ytData.summary}`;
          await new Promise<void>(resolve => {
            speak(speakText, undefined, () => { resolve(); });
          });
        } else {
          telemetryFunctionError('search_youtube', ytData.error || '유튜브 영상 조회 실패');
          addMessage('jarvis', ytData.error || '유튜브 인기 영상을 찾을 수 없습니다.');
        }
      } catch (err: any) {
        telemetryFunctionError('search_youtube', `유튜브 조회 오류: ${err.message}`);
        addMessage('jarvis', `유튜브 조회 중 오류가 발생했습니다: ${err.message}`);
      }

      // 패널 숨기기
      setTimeout(() => setDataPanel({ visible: false, type: null, progress: 0, message: '' }), 3000);
      await new Promise(r => setTimeout(r, 400));
      setState('listening');
      setIsListening(true);
      return;
    }

    // ── 범용 웹 작업 액션 (execute_web_task) ──
    // book_restaurant도 이제 execute_web_task로 매핑됨 (레거시 호환)
    if (action?.type === 'execute_web_task' || action?.type === 'book_restaurant') {
      const taskType = String(action.params?.task_type || 'general');
      const targetSite = String(action.params?.target_site || '');
      const businessName = String(action.params?.business_name || '');
      const taskDescription = String(action.params?.task_description || '');
      const date = String(action.params?.date || '');
      const time = String(action.params?.time || '');
      const userName = String(action.params?.user_name || '');
      const userPhone = String(action.params?.user_phone || '');
      const additionalInfo = String(action.params?.additional_info || '');

      telemetryFunctionStart('execute_web_task', `웹 작업: ${taskType} - ${businessName || taskDescription || targetSite}`);

      // ── 1단계: 자비스 음성 응답 (작업 시작 알림) ──
      setState('speaking');
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });

      // ── 2단계: HoloDataPanel 활성화 (실시간 진행 표시) ──
      setState('working');
      const taskLabel = taskType === 'booking' ? '예약' : taskType === 'purchase' ? '구매' : taskType === 'inquiry' ? '조회' : '웹 작업';
      const panelSteps = taskType === 'booking'
        ? ['INITIALIZING', 'SITE ACCESS', 'SEARCH TARGET', 'CHECK AVAILABILITY', 'FORM FILLING', 'CONFIRMATION']
        : ['INITIALIZING', 'SITE ACCESS', 'NAVIGATION', 'DATA EXTRACTION', 'TASK EXECUTION', 'COMPLETION'];

      setDataPanel({
        visible: true,
        type: 'booking',
        progress: 5,
        message: `${businessName || taskLabel} 자동화 준비 중...`,
        bookingSteps: panelSteps,
      });
      setBookingStep(0);

      try {
        // ── 3단계: 사용자 자격증명 로드 ──
        const naverCreds = JSON.parse(localStorage.getItem('jarvis_naver_creds') || '{}');
        const savedUserName = naverCreds.userName || '';
        const savedUserPhone = naverCreds.userPhone || '';

        // ── 4단계: 브라우저 에이전트 우선 경로 (예약 작업) ──
        if (taskType === 'booking' && (targetSite.includes('네이버') || targetSite === '' || businessName)) {
          addMessage('jarvis', `선생님, ${businessName || '해당 업체'} 예약 가능 일정을 직접 조회하겠습니다.`);
          setDataPanel(prev => ({ ...prev, progress: 10, message: '브라우저 에이전트 가동 중...', actionLogs: [] }));

          try {
            // 1. 업체 검색 (bizId가 없는 경우)
            let bizId = '';
            let itemId = '';
            const knownPlaces: Record<string, { bizId: string; itemId: string }> = {
              '로즈벨': { bizId: '379909', itemId: '3506026' },
              '로즈벨여성의원': { bizId: '379909', itemId: '3506026' },
              '로즈벨 여성의원': { bizId: '379909', itemId: '3506026' },
            };

            const matchedPlace = Object.entries(knownPlaces).find(([key]) => 
              businessName.includes(key)
            );

            if (matchedPlace) {
              bizId = matchedPlace[1].bizId;
              itemId = matchedPlace[1].itemId;
            } else {
              // 네이버 검색으로 bizId 찾기
              setDataPanel(prev => ({
                ...prev, progress: 15, message: `"${businessName}" 네이버 검색 중...`,
                actionLogs: [...(prev.actionLogs || []), {
                  step: '네이버 검색', status: 'start',
                  detail: `"${businessName}" 업체를 네이버에서 검색합니다...`,
                  timestamp: new Date().toISOString(), elapsed: '0.0s',
                }],
              }));

              const searchRes = await fetch('/api/browser-agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'search_place', params: { query: businessName + ' 예약' } }),
              });
              const searchData = await searchRes.json();

              if (searchData.success && searchData.result?.bookingBizId) {
                bizId = searchData.result.bookingBizId;
                setDataPanel(prev => ({
                  ...prev, progress: 25,
                  actionLogs: [...(prev.actionLogs || []), {
                    step: '검색 완료', status: 'success',
                    detail: `"${businessName}" 예약 페이지를 찾았습니다. (bizId: ${bizId})`,
                    timestamp: new Date().toISOString(), elapsed: '2.0s',
                  }],
                }));
              } else {
                setDataPanel(prev => ({
                  ...prev,
                  actionLogs: [...(prev.actionLogs || []), {
                    step: '검색 결과', status: 'warning',
                    detail: `"${businessName}"의 네이버 예약 페이지를 찾을 수 없습니다. 마누스 엔진으로 전환합니다.`,
                    timestamp: new Date().toISOString(), elapsed: '3.0s',
                  }],
                }));
                throw new Error('FALLBACK_TO_MANUS');
              }
            }

            // 2. 예약 가능 일정 조회
            setDataPanel(prev => ({
              ...prev, progress: 35, message: '예약 가능 일정 조회 중...',
              actionLogs: [...(prev.actionLogs || []), {
                step: '예약 조회 시작', status: 'start',
                detail: `"${businessName}" 예약 가능 날짜를 조회합니다...`,
                timestamp: new Date().toISOString(), elapsed: '3.0s',
              }],
            }));

            const checkRes = await fetch('/api/browser-agent', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'check_reservation',
                params: { placeName: businessName, bizId, itemId },
              }),
            });
            const checkData = await checkRes.json();

            if (checkData.success && checkData.result) {
              const result = checkData.result;
              const availDates = (result.availableDates || []).filter((d: any) => d.available);

              // 행동 로그 병합
              const agentLogs = (checkData.actionLogs || []).map((log: any) => ({
                step: log.step,
                status: log.status,
                detail: log.detail,
                timestamp: log.timestamp || new Date().toISOString(),
                elapsed: log.elapsed || '0s',
                data: log.data,
              }));

              setDataPanel(prev => ({
                ...prev,
                progress: 80,
                message: `${availDates.length}개 예약 가능 날짜 발견`,
                actionLogs: agentLogs,
              }));

              // 결과 보고
              if (availDates.length > 0) {
                const dateList = availDates.slice(0, 7).map((d: any) => 
                  `${d.date} (${d.dayOfWeek})`
                ).join(', ');

                const reportMsg = `선생님, ${businessName} 예약 가능 일정을 확인했습니다.\n\n` +
                  `📍 ${result.place?.name || businessName}\n` +
                  `📋 ${result.selectedItem?.name || '진료'}\n` +
                  `📅 예약 가능: ${dateList}\n\n` +
                  `${date ? `요청하신 ${date}은(는) ${availDates.some((d: any) => d.date === date) ? '예약 가능합니다.' : '예약이 불가합니다.'}` : '어떤 날짜로 예약하시겠습니까?'}`;

                addMessage('jarvis', reportMsg, true);

                // 예약 가능 시간 슬롯 표시
                setBookingSlots(availDates.slice(0, 10).map((d: any) => `${d.date} (${d.dayOfWeek})`));
                setBookingPanelVisible(true);

                setDataPanel(prev => ({
                  ...prev, progress: 100, message: '예약 일정 조회 완료',
                  actionLogs: [...(prev.actionLogs || []), {
                    step: '조회 완료', status: 'success',
                    detail: `${availDates.length}개 예약 가능 날짜를 사용자에게 보고했습니다.`,
                    timestamp: new Date().toISOString(), elapsed: `${((Date.now() - Date.now()) / 1000).toFixed(1)}s`,
                  }],
                }));

                const safeSpeak = (text: string): Promise<void> => {
                  return new Promise((resolve) => {
                    try {
                      setState('speaking');
                      startSpeakingLevel();
                      speak(text, undefined, () => { try { stopSpeakingLevel(); } catch(e) {} resolve(); });
                    } catch (e) {
                      try { stopSpeakingLevel(); } catch(e2) {}
                      resolve();
                    }
                  });
                };

                await safeSpeak(`선생님, ${businessName} 예약 가능 일정을 확인했습니다. ${availDates.length}개 날짜가 가능합니다. 화면에서 원하시는 날짜를 선택해 주세요.`);

                // 예약 로그인 필요 안내
                if (result.requiresLogin) {
                  addMessage('jarvis', `ℹ️ 실제 예약을 진행하려면 네이버 로그인이 필요합니다. 날짜를 선택하시면 예약 페이지로 안내해 드리겠습니다.`);
                }

                // 패널 자동 닫기 (10초 후)
                setTimeout(() => {
                  setDataPanel({ visible: false, type: null, progress: 0, message: '' });
                }, 10000);

                setBookingStep(0);
                setState('listening');
                setIsListening(true);
                return;
              } else {
                const noDateMsg = `선생님, ${businessName}의 예약 가능한 날짜가 현재 없습니다. 다음 달 일정을 확인해 드릴까요?`;
                addMessage('jarvis', noDateMsg, true);
                const safeSpeak2 = (text: string): Promise<void> => {
                  return new Promise((resolve) => {
                    try { setState('speaking'); startSpeakingLevel(); speak(text, undefined, () => { try { stopSpeakingLevel(); } catch(e) {} resolve(); }); } catch (e) { try { stopSpeakingLevel(); } catch(e2) {} resolve(); }
                  });
                };
                await safeSpeak2(noDateMsg);
              }
            } else {
              throw new Error('FALLBACK_TO_MANUS');
            }

            // 패널 닫기 및 상태 복원
            setTimeout(() => {
              setDataPanel({ visible: false, type: null, progress: 0, message: '' });
            }, 5000);
            setBookingStep(0);
            setState('listening');
            setIsListening(true);
            return;

          } catch (browserAgentErr: any) {
            if (browserAgentErr.message !== 'FALLBACK_TO_MANUS') {
              console.error('[JARVIS] 브라우저 에이전트 오류:', browserAgentErr);
              addMessage('jarvis', `⚠️ 브라우저 에이전트 오류. 마누스 엔진으로 전환합니다.`);
            }
            // 마누스 폴백으로 계속 진행
          }
        }

        // ── 5단계 (폴백): 마누스 엔진 웹 작업 ──
        const agentMsg = `선생님, 요청하신 ${businessName} 관련 작업을 위해 제가 직접 웹 브라우저를 제어하겠습니다. 잠시만 기다려 주십시오.`;
        addMessage('jarvis', agentMsg);

        setDataPanel(prev => ({ ...prev, progress: 10, message: '마누스 시스템 엔진 초기화 중...' }));

        // ── 범용 웹 작업: 자비스의 페르소나를 입힌 마누스 프롬프트 ──
        const manusPrompt = [
          `[자비스 시스템 명령 - 반자동 모드]`,
          `당신은 '자비스'라는 AI 비서의 엔진입니다. 모든 보고는 자비스의 말투로 하세요.`,
          `작업 유형: ${taskType}`,
          `대상 사이트: ${targetSite}`,
          `업체명: ${businessName}`,
          `작업 내용: ${taskDescription}`,
          date ? `날짜: ${date}` : '',
          time ? `시간: ${time}` : '',
          (savedUserName || userName) ? `예약자명: ${savedUserName || userName}` : '',
          (savedUserPhone || userPhone) ? `연락처: ${savedUserPhone || userPhone}` : '',
          additionalInfo ? `추가정보: ${additionalInfo}` : '',
          '',
          '## 자비스 행동 지침',
          '1. [실시간 브리핑]: "네이버에 접속하고 있습니다", "업체를 검색 중입니다"와 같이 자비스가 직접 행동하는 것처럼 보고하세요.',
          '2. [조회 우선]: 로그인 없이 가능한 정보를 먼저 수집하여 "선생님, 현재 예약 가능한 시간은 다음과 같습니다"라고 보고하세요.',
          '3. [협업 요청]: 로그인이 필요한 순간에만 "선생님, 이 부분은 보안을 위해 직접 로그인이 필요합니다"라고 정중히 요청하세요.',
          '4. [캡차 대응]: 보안 문자가 보이면 즉시 알려주세요.',
          '5. 모든 보고는 "선생님, ~입니다"와 같은 우아하고 전문적인 말투를 유지하세요.',
        ].filter(Boolean).join('\n');

        addMessage('jarvis', `⏳ 시스템 엔진 가동 중...`);

        const manusRes = await fetch('/api/manus-task-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: manusPrompt }),
        });

        // 안전한 JSON 파싱
        let manusData: any;
        const manusText = await manusRes.text();
        try {
          manusData = JSON.parse(manusText);
        } catch {
          console.error('[JARVIS] 마누스 응답 파싱 실패:', manusText.substring(0, 200));
          throw new Error(`마누스 API 응답 오류: ${manusText.substring(0, 80)}`);
        }

        if (!manusData.success || !manusData.task_id) {
          throw new Error(manusData.error || '마누스 태스크 생성 실패');
        }

        const taskId = manusData.task_id;
        addMessage('jarvis', `✅ [AGENT] 마누스 태스크 생성 완료 (ID: ${taskId.substring(0, 8)}...)`);
        console.log('[JARVIS] 마누스 태스크 생성 성공:', taskId);
        setBookingStep(1);
        setDataPanel(prev => ({ ...prev, progress: 15, message: '마누스 태스크 생성 완료. 작업 시작...' }));
        addMessage('jarvis', `⏳ [AGENT] 태스크 ID: ${taskId.slice(0, 8)}... 생성 완료`);

        // ── 5단계: 실시간 진행 상황 폴링 ──
        // 안전한 speak 래퍼 (폴링 중 WebGL 크래시 방지)
        const safeSpeak = (text: string): Promise<void> => {
          return new Promise((resolve) => {
            try {
              setState('speaking');
              startSpeakingLevel();
              speak(text, undefined, () => { 
                try { stopSpeakingLevel(); } catch(e) { console.warn('[JARVIS] stopSpeakingLevel error:', e); }
                resolve(); 
              });
            } catch (e) {
              console.warn('[JARVIS] speak error (graceful):', e);
              try { stopSpeakingLevel(); } catch(e2) { /* ignore */ }
              resolve();
            }
          });
        };

        let pollCount = 0;
        const maxPolls = 150;
        let taskCompleted = false;
        let taskError = false;
        let lastProgressMsg = '';
        let consecutiveErrors = 0;
        let hasShownInitialWait = false;

        while (pollCount < maxPolls && !taskCompleted && !taskError) {
          // 초기 지연 알림 (15초 동안 변화 없을 때)
          if (pollCount === 5 && !lastProgressMsg && !hasShownInitialWait) {
            hasShownInitialWait = true;
            addMessage('jarvis', '⚠️ 시스템 응답이 다소 지연되고 있습니다. 잠시만 더 기다려 주십시오, 선생님.');
            safeSpeak("선생님, 시스템 응답이 조금 늦어지고 있습니다. 잠시만 더 기다려 주시면 바로 확인해 드릴게요.");
          }
          pollCount++;
          await new Promise(r => setTimeout(r, 3000));

          try {
            const statusRes = await fetch(`/api/manus-task-status?task_id=${encodeURIComponent(taskId)}`);
            let statusData: any;
            const statusText = await statusRes.text();
            try {
              statusData = JSON.parse(statusText);
              console.log("[JARVIS] 마누스 폴링 응답:", statusData); // 추가된 로깅
            } catch {
              console.error("[JARVIS] 폴링 응답 파싱 실패:", statusText.substring(0, 100));
              continue; // 파싱 실패 시 다음 폴링으로 계속
            }

            if (!statusData.success) throw new Error(statusData.error || '상태 조회 실패');

            const taskStatus = statusData.agent_status || 'unknown';
            const msgs = statusData.messages || [];
            const progress = statusData.progress || [];
            const waitingDetail = statusData.waiting_detail;

            // ── 사용자 개입(로그인/캡차) 감지 ──
            if (taskStatus === 'waiting' && waitingDetail) {
              const waitType = waitingDetail.waiting_for_event_type;
              const waitDesc = waitingDetail.waiting_description || '';
              
              if (waitDesc.includes('로그인') || waitDesc.includes('login')) {
                addMessage('jarvis', `🔑 선생님, 보안을 위해 네이버 로그인이 필요합니다. 화면에서 로그인을 진행해 주시면 제가 바로 예약을 마무리 짓겠습니다.`);
                setDataPanel(prev => ({ ...prev, message: '사용자 로그인 대기 중...', progress: 60 }));
                await safeSpeak("선생님, 보안을 위해 네이버 로그인이 필요합니다. 로그인을 완료해 주시면 제가 바로 예약을 마무리 짓겠습니다.");
              } else if (waitDesc.includes('보안 문자') || waitDesc.includes('captcha')) {
                addMessage('jarvis', `⚠️ 선생님, 보안 문자 입력이 필요합니다. 화면에 보이는 문자를 말씀해 주시면 제가 입력하겠습니다.`);
                setDataPanel(prev => ({ ...prev, message: '보안 문자 입력 대기 중...', progress: 70 }));
                await safeSpeak("선생님, 보안 문자 입력이 필요합니다. 화면에 보이는 문자를 말씀해 주시면 제가 입력하겠습니다.");
              }
            }

            // ── 진행 상황 표시 (HoloDataPanel 연동) ──
            if (progress.length > 0) {
              const latestProgress = progress[progress.length - 1];
              const progressMsg = latestProgress.content || '';

              if (progressMsg !== lastProgressMsg) {
                lastProgressMsg = progressMsg;
                // [AGENT] 태그 제거 및 자비스 말투로 변환 (마누스가 이미 자비스 말투로 보내겠지만 한 번 더 정제)
                const refinedMsg = progressMsg.replace(/\[AGENT\]\s*/g, '').replace(/⏳\s*/g, '');
                addMessage('jarvis', `⏳ ${refinedMsg}`);

                // 진행률 계산
                let currentProgress = 20;
                const msg = progressMsg.toLowerCase();
                if (msg.includes('로그인') || msg.includes('login')) { currentProgress = 25; setBookingStep(1); }
                else if (msg.includes('검색') || msg.includes('접속') || msg.includes('search') || msg.includes('access')) { currentProgress = 40; setBookingStep(2); }
                else if (msg.includes('시간') || msg.includes('조회') || msg.includes('check') || msg.includes('avail')) { currentProgress = 60; setBookingStep(3); }
                else if (msg.includes('폼') || msg.includes('입력') || msg.includes('fill') || msg.includes('form')) { currentProgress = 80; setBookingStep(4); }
                else if (msg.includes('확인') || msg.includes('완료') || msg.includes('confirm') || msg.includes('done')) { currentProgress = 95; setBookingStep(5); }

                setDataPanel(prev => ({ 
                  ...prev, 
                  progress: currentProgress, 
                  message: progressMsg,
                  actionLogs: [
                    ...(prev.actionLogs || []),
                    { step: '진행', status: 'running', detail: refinedMsg, timestamp: new Date().toISOString(), elapsed: `${(pollCount * 3)}s` }
                  ]
                }));
              }
            }

            // ── 대기 상태 처리 (캡차, OTP, 로그인 필요 등) ──
            if (taskStatus === 'waiting' && statusData.waiting_detail) {
              const waitingDetail = statusData.waiting_detail;
              const eventType = (waitingDetail.waiting_for_event_type || '').toLowerCase();
              const description = waitingDetail.waiting_description || '';

              setDataPanel(prev => ({ ...prev, message: `⚠️ 사용자 입력 대기: ${description}` }));

              if (eventType.includes('captcha')) {
                const captchaMsg = '선생님, 보안 문자가 감지되었습니다. 화면에 표시된 코드를 말씀해 주세요.';
                addMessage('jarvis', captchaMsg, true);
                await safeSpeak(captchaMsg);
                setState('listening');
                const captchaCode = await new Promise<string>(resolve => { verificationResolveRef.current = resolve; });
                setState('working');
                addMessage('jarvis', `[INPUT] 캡차 코드 "${captchaCode}" 제출 중...`);
                await fetch('/api/manus-task-confirm', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ task_id: taskId, event_id: waitingDetail.waiting_for_event_id, input: { captcha_code: captchaCode } }),
                });
              } else if (eventType.includes('otp')) {
                const otpMsg = '선생님, 인증번호가 전송되었습니다. 받으신 번호를 말씀해 주세요.';
                addMessage('jarvis', otpMsg, true);
                await safeSpeak(otpMsg);
                setState('listening');
                const otpCode = await new Promise<string>(resolve => { verificationResolveRef.current = resolve; });
                setState('working');
                addMessage('jarvis', `[INPUT] 인증번호 "${otpCode}" 제출 중...`);
                await fetch('/api/manus-task-confirm', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ task_id: taskId, event_id: waitingDetail.waiting_for_event_id, input: { otp_code: otpCode } }),
                });
              } else if (eventType.includes('login')) {
                // 로그인 필요 시 사용자에게 안내
                const loginMsg = `선생님, ${targetSite || '해당 사이트'} 로그인이 필요합니다. 화면에서 로그인을 진행해 주시면 ${taskLabel}을 마무리짓겠습니다.`;
                addMessage('jarvis', loginMsg, true);
                await safeSpeak(loginMsg);
                // 로그인 완료 대기
                setState('listening');
                await new Promise<string>(resolve => { verificationResolveRef.current = resolve; });
                setState('working');
                addMessage('jarvis', `[INPUT] 로그인 완료 신호 전송 중...`);
                await fetch('/api/manus-task-confirm', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ task_id: taskId, event_id: waitingDetail.waiting_for_event_id, input: { login_completed: true } }),
                });
              }
            }

            // ── 완료 또는 에러 ──
            // 성공적 폴링 시 에러 카운터 리셋
            consecutiveErrors = 0;

            if (taskStatus === 'stopped') {
              taskCompleted = true;
              setBookingStep(5);
              telemetryFunctionSuccess('execute_web_task', `${taskLabel} 완료: ${businessName}`, { taskType, businessName: businessName || targetSite });
              setDataPanel(prev => ({ ...prev, progress: 100, message: `${taskLabel} 자동화 완료` }));

              // 마누스의 최종 결과물(output) 또는 마지막 메시지 가져오기
              const finalOutput = statusData.output || '';
              const lastMsg = msgs[msgs.length - 1]?.content || '';
              const displayMsg = finalOutput || lastMsg;
              
              const isSuccess = displayMsg.includes('완료') || displayMsg.includes('성공') || displayMsg.includes('✅') || !displayMsg.includes('실패');

              const completionMsg = isSuccess
                ? `✅ 선생님, ${businessName || taskLabel} 작업이 성공적으로 완료되었습니다.\n\n${displayMsg}`
                : `⚠️ 선생님, ${businessName || taskLabel} 작업 결과를 보고드립니다.\n\n${displayMsg}`;
              
              addMessage('jarvis', completionMsg, true);
              await safeSpeak(`선생님, 요청하신 작업을 마쳤습니다. 확인된 내용은 다음과 같습니다. ${displayMsg}`);
            } else if (taskStatus === 'error') {
              taskError = true;
              const errorMsg = msgs[msgs.length - 1]?.content || `${taskLabel} 중 오류가 발생했습니다.`;
              telemetryFunctionError('execute_web_task', errorMsg);
              addMessage('jarvis', `❌ [AGENT] 에러: ${errorMsg}`);
              throw new Error(errorMsg);
            }

            // 진행 중 메시지 표시 (assistant_message)
            if (msgs.length > 0) {
              const latestMsg = msgs[0]?.content || '';
              if (latestMsg && latestMsg !== lastProgressMsg) {
                lastProgressMsg = latestMsg;
                addMessage('jarvis', `💬 [AGENT] ${latestMsg.substring(0, 200)}`);
              }
            }
          } catch (pollErr: unknown) {
            consecutiveErrors++;
            console.error(`[JARVIS] 폴링 오류 (${consecutiveErrors}회):`, pollErr);
            
            // 5회 연속 에러 시 사용자에게 알림
            if (consecutiveErrors === 5) {
              addMessage('jarvis', `⚠️ [에이전트] 마누스 연결이 불안정합니다. 계속 시도 중...`);
            }
            // 10회 연속 에러 시 중단
            if (consecutiveErrors >= 10) {
              throw new Error(`${taskLabel} 연결 실패 (연속 ${consecutiveErrors}회 에러)`);
            }
            if (pollCount >= maxPolls) throw new Error(`${taskLabel} 자동화 시간 초과 (7.5분 경과)`);
          }
        }

        if (!taskCompleted && !taskError) {
          throw new Error(`${taskLabel} 자동화 시간 초과`);
        }
      } catch (err) {
        setBookingStep(0);
        const errStr = err instanceof Error ? err.message : String(err);
        telemetryFunctionError('execute_web_task', errStr);
        const errMsg = `선생님, ${businessName || taskLabel} 작업 중 문제가 발생했습니다. ${errStr}. 다른 방법을 시도해 볼까요?`;
        addMessage('jarvis', errMsg, true);
        setDataPanel(prev => ({ ...prev, message: '오류 발생: 중단됨', progress: 0 }));
        try {
          await new Promise<void>((resolve) => {
            try {
              setState('speaking');
              startSpeakingLevel();
              speak(errMsg, undefined, () => { try { stopSpeakingLevel(); } catch(e) {} resolve(); });
            } catch (e) {
              try { stopSpeakingLevel(); } catch(e2) {}
              resolve();
            }
          });
        } catch (speakErr) {
          console.warn('[JARVIS] 에러 메시지 speak 실패 (graceful):', speakErr);
        }
      }

      await new Promise(r => setTimeout(r, 2000));
      setBookingStep(0);
      setDataPanel({ visible: false, type: null, progress: 0, message: '' });
      setState('listening');
      setIsListening(true);
      return;
    }

    // ── 기존 예약 로직 (폐기 예정) ──
    if (false && action?.type === 'book_restaurant_legacy') {
      const bookAction = String(action.params?.action || 'check_availability');
      const businessName = String(action.params?.business_name || '');
      const bookingUrl = String(action.params?.booking_url || '');
      const date = String(action.params?.date || '');
      const time = String(action.params?.time || '');
      const partySize = Number(action.params?.party_size) || 2;
      const userName = String(action.params?.user_name || '');
      const userPhone = String(action.params?.user_phone || '');

      setState('working');
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });

      try {
        // 네이버 로그인 세션 확인
        const naverCreds = JSON.parse(localStorage.getItem('jarvis_naver_creds') || '{}');
        const naverUsername = naverCreds.username || '';
        const naverPassword = naverCreds.password || '';

        // 세션 ID 상위 스코프 선언 (모든 bookAction에서 공유)
        // localStorage에서도 읽어서 React state 비동기 문제 우회
        const savedSessionId = localStorage.getItem('jarvis_booking_session') || '';
        let activeSessionId = bookingSessionId || savedSessionId || '';
        // 예약자 정보: 설정창 저장값 우선, 없으면 GPT 파라미터 사용
        const savedUserName = naverCreds.userName || '';
        const savedUserPhone = naverCreds.userPhone || '';

        if (bookAction === 'check_availability') {
          // 0-A. 크롬 확장 프로그램 연동 확인 → 있으면 확장으로 처리
          const extensionConnected = (window as any).__JARVIS_EXTENSION_CONNECTED__;
          if (extensionConnected) {
            setBookingStep(1);
            addMessage('jarvis', `[PLUG] 크롬 확장 프로그램으로 예약을 처리합니다, 토니.`);
            const extCmd = {
              businessName,
              date,
              time,
              bookerName: savedUserName || userName,
              bookerPhone: savedUserPhone || userPhone,
              bookingUrl,
            };
            window.postMessage({ source: 'JARVIS_APP', type: 'BOOKING_COMMAND', payload: extCmd }, '*');
            // 결과 대기 (최대 120초)
            const extResult = await new Promise<any>((resolve) => {
              const handler = (e: MessageEvent) => {
                if (e.data?.source === 'JARVIS_EXTENSION' && e.data?.type === 'BOOKING_RESULT') {
                  window.removeEventListener('message', handler);
                  resolve(e.data.payload);
                }
              };
              window.addEventListener('message', handler);
              setTimeout(() => { window.removeEventListener('message', handler); resolve({ success: false, error: 'timeout' }); }, 120000);
            });
            setBookingStep(5);
            if (extResult.success) {
              const doneText = `예약 완료됩니다, 토니. ${businessName} ${date} ${time} 예약이 처리되었습니다.`;
              setState('speaking');
              addMessage('jarvis', doneText, true);
              startSpeakingLevel();
              await new Promise<void>(resolve => { speak(doneText, undefined, () => { stopSpeakingLevel(); resolve(); }); });
            } else {
              const failText = `예약 처리 중 오류가 발생했습니다, 토니. ${extResult.error || extResult.message || ''}. 네이버 예약 탭을 확인해 주세요.`;
              setState('speaking');
              addMessage('jarvis', failText, true);
              startSpeakingLevel();
              await new Promise<void>(resolve => { speak(failText, undefined, () => { stopSpeakingLevel(); resolve(); }); });
            }
            setState('idle');
            return;
          }

          // 0-B. 네이버 자격증명 없을 때 안내 (단, 세션 ID가 있으면 로그인 건너뛰)
          if (!naverUsername && !naverPassword && !activeSessionId) {
            const noCredsText = `선생님, 네이버 로그인 정보가 설정되어 있지 않습니다. SETTINGS에서 네이버 아이디와 비밀번호를 입력하시거나, 크롬 확장 프로그램으로 로그인해 주세요.`;
            setState('speaking');
            addMessage('jarvis', noCredsText, true);
            startSpeakingLevel();
            await new Promise<void>(resolve => {
              speak(noCredsText, undefined, () => { stopSpeakingLevel(); resolve(); });
            });
            setState('idle');
            return;
          }
          // 0-C. 세션 ID가 이미 있으면 로그인 건너뛰
          if (activeSessionId) {
            addMessage('jarvis', `[OK] 이미 로그인된 세션을 사용합니다, 선생님. (세션: ${activeSessionId.slice(0, 8)}...)`);
          } else if (!naverUsername && !naverPassword) {
            // 0-D. 자격증명도 없고 세션도 없으면 서버의 최신 세션 자동 사용
            try {
              const sessionCheckRes = await fetch(`${BOOKING_SERVER}/api/booking/session-status`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
              });
              if (sessionCheckRes.ok) {
                const sessionCheckData = await sessionCheckRes.json();
                if (sessionCheckData.sessionId) {
                  activeSessionId = sessionCheckData.sessionId;
                  setBookingSessionId(sessionCheckData.sessionId);
                  localStorage.setItem('jarvis_booking_session', sessionCheckData.sessionId);
                  addMessage('jarvis', `[OK] 서버에 저장된 세션을 복구했습니다, 선생님.`);
                }
              }
            } catch (e) {
              // 세션 복구 실패 시 무시하고 계속 진행
            }
          }
          // 1. 로그인 시도 (세션 없을 때만)
          setBookingStep(1);
          if (!activeSessionId && naverUsername && naverPassword) {
            setState('working');
            addMessage('jarvis', `[LOCK] 네이버 로그인 중... (${naverUsername})`);
            try {
              const loginRes = await fetch(`${BOOKING_SERVER}/api/booking/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ naverID: naverUsername, naverPW: naverPassword }),
              });
              const loginData = await loginRes.json();
              if (loginData.success && loginData.sessionId) {
                activeSessionId = loginData.sessionId;
                setBookingSessionId(loginData.sessionId);
                localStorage.setItem('jarvis_booking_session', loginData.sessionId);
                addMessage('jarvis', `[OK] 네이버 로그인 완료`);
              } else if (loginData.needVerification) {
                // ── 캡차 또는 2단계 인증 필요 ──
                const vType = loginData.verificationType || 'captcha';
                const captchaImg = loginData.captchaSrc || loginData.screenshot || null;
                setCaptchaScreenshot(captchaImg);
                captchaOpenRef.current = true;
                setVerificationMode(vType);

                // ── 캡차: stateless 재로그인 방식 (GPT Vision 자동 → 실패 시 사용자 직접) ──
                const tryCaptchaWithVision = async (imgSrc: string): Promise<string> => {
                  try {
                    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
                    if (!apiKey) return '';
                    const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                      body: JSON.stringify({
                        model: 'gpt-4o',
                        max_tokens: 30,
                        messages: [{
                          role: 'user',
                          content: [
                            { type: 'text', text: '이것은 네이버 로그인 캐잘 이미지입니다. \n\n캐잘 유형: \n1. 두 장의 영수증이 격쳐 있는 경우 - 왼쪽 영수증의 주소에서 ?로 가려진 번지수를 오른쪽 영수증에서 찾아 입력\n2. 단일 영수증인 경우 - 주소에서 번지수(도로명 다음에 오는 숫자)를 찾아 입력\n\n반드시 숫자만 출력하세요. 예: 294 또는 237\n\n이미지를 자세히 분석하세요.' },
                            { type: 'image_url', image_url: { url: imgSrc, detail: 'high' } }
                          ]
                        }]
                      })
                    });
                    const vd = await visionRes.json();
                    return (vd.choices?.[0]?.message?.content?.trim() || '').replace(/[^0-9]/g, '');
                  } catch { return ''; }
                };

                // 캡차 재로그인 헬퍼 함수
                const loginWithCaptcha = async (captchaAnswer: string): Promise<boolean> => {
                  const retryRes = await fetch(`${BOOKING_SERVER}/api/booking/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ naverID: naverUsername, naverPW: naverPassword, captchaAnswer }),
                  });
                  const retryData = await retryRes.json();
                  if (retryData.success && retryData.sessionId) {
                    activeSessionId = retryData.sessionId;
                    setBookingSessionId(retryData.sessionId);
                    localStorage.setItem('jarvis_booking_session', retryData.sessionId);
                    setCaptchaScreenshot(null); setVerificationMode(null);
                    return true;
                  }
                  // 새 캡차 이미지로 업데이트
                  if (retryData.captchaSrc || retryData.screenshot) {
                    setCaptchaScreenshot(retryData.captchaSrc || retryData.screenshot);
                  }
                  return false;
                };

                let loginSuccess = false;

                if (vType === 'captcha' && captchaImg) {
                  // 1차: GPT Vision 자동 풀기
                  addMessage('jarvis', `[BOT] 캡차 자동 분석 중...`);
                  const autoAnswer = await tryCaptchaWithVision(captchaImg);
                  if (autoAnswer) {
                    addMessage('jarvis', `[BOT] 자동 인식 답: ${autoAnswer} — 검증 중...`);
                    loginSuccess = await loginWithCaptcha(autoAnswer);
                    if (loginSuccess) {
                      addMessage('jarvis', `[OK] 캡차 자동 인식 성공! 네이버 로그인 완료`);
                    } else {
                      addMessage('jarvis', `[BOT] 자동 인식 실패. 토니께서 직접 입력해 주세요.`);
                    }
                  }
                } else if (vType === 'otp' && loginData.pendingSessionId) {
                  // OTP는 기존 pendingSession 방식 유지
                  setPendingSessionId(loginData.pendingSessionId);
                }

                // GPT Vision 실패 또는 OTP인 경우 사용자에게 직접 요청
                if (!loginSuccess) {
                  const vMsg = vType === 'captcha'
                    ? '토니, 네이버에서 자동입력 방지 문자가 표시되었습니다. 화면에 보이는 문자를 말씀해 주세요.'
                    : '토니, 네이버에서 추가 인증이 필요합니다. 휴대폰으로 받은 인증번호를 말씀해 주세요.';

                  setState('speaking');
                  addMessage('jarvis', vMsg, true);
                  startSpeakingLevel();
                  await new Promise<void>(resolve => {
                    speak(vMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
                  });

                  // 사용자 입력 대기
                  const userInput = await new Promise<string>(resolve => {
                    verificationResolveRef.current = resolve;
                    setState('listening');
                  });

                  setCaptchaScreenshot(null);
                  captchaOpenRef.current = false;
                  setVerificationMode(null);

                  setState('working');
                  addMessage('jarvis', `[LOCK] 인증번호 확인 중...`);

                  if (vType === 'captcha') {
                    // 캡차: 재로그인 방식
                    loginSuccess = await loginWithCaptcha(userInput);
                    if (loginSuccess) {
                      addMessage('jarvis', `[OK] 인증 완료! 네이버 로그인 성공`);
                    } else {
                      addMessage('jarvis', `[!] 인증 실패. 비로그인 상태로 조회합니다.`);
                    }
                  } else {
                    // OTP: submit-verification 방식
                    try {
                      const verifyRes = await fetch(`${BOOKING_SERVER}/api/booking/submit-verification`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pendingSessionId: loginData.pendingSessionId, code: userInput, naverID: naverUsername }),
                      });
                      const verifyData = await verifyRes.json();
                      if (verifyData.success && verifyData.sessionId) {
                        activeSessionId = verifyData.sessionId;
                        setBookingSessionId(verifyData.sessionId);
                        localStorage.setItem('jarvis_booking_session', verifyData.sessionId);
                        addMessage('jarvis', `[OK] 인증 완료! 네이버 로그인 성공`);
                        loginSuccess = true;
                      } else {
                        addMessage('jarvis', `[!] 인증 실패: ${verifyData.message || '올바르지 않은 인증번호'}. 비로그인 상태로 조회합니다.`);
                      }
                    } catch {
                      addMessage('jarvis', `[!] 인증 서버 연결 실패. 비로그인 상태로 조회합니다.`);
                    }
                  }
                }
              } else {
                addMessage('jarvis', `[!] 로그인 실패: ${loginData.message || loginData.error || '아이디 또는 비밀번호를 확인해주세요.'}`);
              }
            } catch (loginErr) {
              addMessage('jarvis', `[!] 로그인 서버 연결 실패. 비로그인 상태로 조회합니다.`);
            }
          }

          // 2. 예약 가능 시간 조회 (진행 상황 표시)
          setBookingStep(2);
          addMessage('jarvis', `[SEARCH] ${businessName} 예약 가능 시간 조회 중...`);
          const availRes = await fetch(`${BOOKING_SERVER}/api/booking/availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: activeSessionId || '',
              businessName,
              bookingUrl,
              date,
            }),
          });
          const availData = await availRes.json();

          if (availData.success) {
            if (availData.screenshot) setBookingScreenshot(availData.screenshot);

            // ── 케이스 1: 네이버 예약 시스템 없는 업체 ──
            if (availData.bookingAvailable === false) {
              setBookingPanelVisible(false);
              const phoneInfo = availData.phone ? ` 전화번호는 ${availData.phone} 입니다.` : '';
              const noBookingText = `${businessName}은(는) 네이버 예약을 지원하지 않습니다, 토니.${phoneInfo} 직접 전화로 예약하시거나, 다른 업체를 찾아드릴까요?`;
              setState('speaking');
              addMessage('jarvis', noBookingText, true);
              startSpeakingLevel();
              await new Promise<void>(resolve => {
                speak(noBookingText, undefined, () => { stopSpeakingLevel(); resolve(); });
              });
              setState('idle');
              return;
            }

            // ── 케이스 2: 예약 가능한 업체 ──
            setBookingSlots(availData.availableSlots || []);
            setBookingPanelVisible(true);

            if (availData.availableSlots?.length > 0) {
              // 시간대 조회 성공 - 요청한 시간이 있으면 자동 진행
              const requestedTime = time;
              const matchedSlot = requestedTime
                ? availData.availableSlots.find((s: string) =>
                    s.includes(requestedTime) ||
                    requestedTime.includes(s.split(' ')[0]) ||
                    s.replace(':', '').includes(requestedTime.replace(':', '').replace('시', '').replace('분', ''))
                  )
                : null;

              if (matchedSlot && (savedUserName || userName) && (savedUserPhone || userPhone)) {
                // 요청 시간 + 예약자 정보 모두 있음 → 자동 fill_form 진행
                const autoText = `${businessName} ${matchedSlot} 시간대 확인되었습니다, 토니. 예약자 ${savedUserName || userName} 정보로 자동 입력하겠습니다.`;
                setState('speaking');
                addMessage('jarvis', autoText, true);
                startSpeakingLevel();
                await new Promise<void>(resolve => {
                  speak(autoText, undefined, () => { stopSpeakingLevel(); resolve(); });
                });

                // 자동으로 fill_form 진행
                setBookingStep(4);
                addMessage('jarvis', `폼 입력 중...`);
                const fillRes = await fetch(`${BOOKING_SERVER}/api/booking/fill-form`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sessionId: activeSessionId || '',
                    bookingUrl: bookingUrl || availData.bookingUrl || '',
                    userName: savedUserName || userName,
                    userPhone: savedUserPhone || userPhone,
                    selectedTime: matchedSlot,
                    date,
                  }),
                });
                const fillData = await fillRes.json();
                if (fillData.success) {
                  setBookingStep(5);
                  const doneText = `예약이 완료되었습니다, 토니. ${businessName} ${matchedSlot} 예약이 성공적으로 접수되었습니다.`;
                  setState('speaking');
                  addMessage('jarvis', doneText, true);
                  startSpeakingLevel();
                  await new Promise<void>(resolve => {
                    speak(doneText, undefined, () => { stopSpeakingLevel(); resolve(); });
                  });
                } else {
                  throw new Error(fillData.error || '폼 입력 실패');
                }
              } else {
                // 시간대 목록 안내 + 선택 요청
                const slotsText = `${businessName} 예약 가능한 시간대를 확인했습니다, 토니. ${availData.availableSlots.slice(0, 5).join(', ')} 중 어떤 시간으로 예약하시겠습니까?`;
                setState('speaking');
                addMessage('jarvis', slotsText, true);
                startSpeakingLevel();
                await new Promise<void>(resolve => {
                  speak(slotsText, undefined, () => { stopSpeakingLevel(); resolve(); });
                });
              }
            } else {
              // ── 케이스 3: 예약 시스템 있지만 오늘 슬롯 없음 ──
              const noSlotText = `${businessName} 예약 페이지를 확인했습니다, 토니. 현재 선택하신 날짜에 예약 가능한 시간이 없습니다. 다른 날짜로 조회해 드릴까요?`;
              setState('speaking');
              addMessage('jarvis', noSlotText, true);
              startSpeakingLevel();
              await new Promise<void>(resolve => {
                speak(noSlotText, undefined, () => { stopSpeakingLevel(); resolve(); });
              });
            }
          } else {
            throw new Error(availData.error || '예약 조회 실패');
          }
        } else if (bookAction === 'fill_form') {
          // ── fill_form에서도 로그인 세션 확보 ──
          if (!activeSessionId && naverUsername && naverPassword) {
            setState('working');
            addMessage('jarvis', `[LOCK] 네이버 로그인 중... (${naverUsername})`);
            try {
              const loginRes2 = await fetch(`${BOOKING_SERVER}/api/booking/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ naverID: naverUsername, naverPW: naverPassword }),
              });
              const loginData2 = await loginRes2.json();
              if (loginData2.success && loginData2.sessionId) {
                activeSessionId = loginData2.sessionId;
                setBookingSessionId(loginData2.sessionId);
                localStorage.setItem('jarvis_booking_session', loginData2.sessionId);
                addMessage('jarvis', `[OK] 네이버 로그인 완료`);
              } else if (loginData2.needVerification) {
                // 캡차 발생 시 stateless 재로그인
                const captchaImg2 = loginData2.captchaSrc || loginData2.screenshot || null;
                setCaptchaScreenshot(captchaImg2);
                setVerificationMode('captcha');
                const vMsg2 = '토니, 네이버에서 자동입력 방지 문자가 표시되었습니다. 화면에 보이는 문자를 말씀해 주세요.';
                setState('speaking');
                addMessage('jarvis', vMsg2, true);
                startSpeakingLevel();
                await new Promise<void>(resolve => { speak(vMsg2, undefined, () => { stopSpeakingLevel(); resolve(); }); });
                const userCaptcha = await new Promise<string>(resolve => { verificationResolveRef.current = resolve; setState('listening'); });
                setCaptchaScreenshot(null); setVerificationMode(null);
                setState('working');
                const retryRes2 = await fetch(`${BOOKING_SERVER}/api/booking/login`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ naverID: naverUsername, naverPW: naverPassword, captchaAnswer: userCaptcha }),
                });
                const retryData2 = await retryRes2.json();
                if (retryData2.success && retryData2.sessionId) {
                  activeSessionId = retryData2.sessionId;
                  setBookingSessionId(retryData2.sessionId);
                  localStorage.setItem('jarvis_booking_session', retryData2.sessionId);
                  addMessage('jarvis', `[OK] 로그인 성공`);
                } else {
                  addMessage('jarvis', `[!] 로그인 실패. 비로그인 상태로 진행합니다.`);
                }
              } else {
                addMessage('jarvis', `[!] 로그인 실패: ${loginData2.message || loginData2.error}`);
              }
            } catch { addMessage('jarvis', `[!] 로그인 서버 연결 실패`); }
          }

          // ── 학습 1: 입력 전 확인 단계 ──
          // 예약자명, 연락처, 날짜, 시간을 음성으로 읽어주고 사용자 확인을 받음
          const finalUserName = savedUserName || userName || '미설정';
          const finalUserPhone = savedUserPhone || userPhone || '미설정';
          const confirmText = `잠깐, 토니. 입력 전에 확인해 드리겠습니다. 예약자명 ${finalUserName}, 연락처 ${finalUserPhone}, 날짜 ${date}, 시간 ${time}. 이대로 진행할까요? 변경이 필요하시면 말씀해 주세요.`;
          setState('speaking');
          addMessage('jarvis', confirmText, true);
          startSpeakingLevel();
          await new Promise<void>(resolve => {
            speak(confirmText, undefined, () => { stopSpeakingLevel(); resolve(); });
          });

          // 사용자 응답 대기 (8초 타임아웃 - 무응답 시 자동 진행)
          setState('listening');
          setIsListening(true);
          const confirmResponse = await new Promise<string>(resolve => {
            const timer = setTimeout(() => {
              bookingConfirmResolveRef.current = null;
              resolve('yes'); // 무응답 → 자동 진행
            }, 8000);
            bookingConfirmResolveRef.current = (text: string) => {
              clearTimeout(timer);
              resolve(text);
            };
          });
          setIsListening(false);

          // 취소 또는 변경 감지
          const cancelKeywords = ['취소', '아니', '바꿔', '변경', '잠깐', '스톱', 'stop', 'cancel', 'no'];
          const isCancelled = cancelKeywords.some(kw => confirmResponse.toLowerCase().includes(kw));

          if (isCancelled) {
            const cancelText = `알겠습니다, 토니. 예약 입력을 중단했습니다. 변경하실 내용을 말씀해 주시면 다시 진행하겠습니다.`;
            setState('speaking');
            addMessage('jarvis', cancelText, true);
            startSpeakingLevel();
            await new Promise<void>(resolve => {
              speak(cancelText, undefined, () => { stopSpeakingLevel(); resolve(); });
            });
            setState('idle');
            return;
          }

          // ── 학습 2: Race Condition 재확인 ──
          // 폼 입력 직전 해당 시간대 가용성 한 번 더 실시간 확인
          const reCheckText = `확인되었습니다. 폼 입력 전 ${time} 시간대를 실시간으로 재확인하겠습니다.`;
          setState('working');
          addMessage('jarvis', reCheckText);

          setBookingStep(4);
          addMessage('jarvis', `[RELOAD] ${time} 시간대 실시간 재확인 중...`);
          const reCheckRes = await fetch(`${BOOKING_SERVER}/api/booking/availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: activeSessionId || bookingSessionId || '',
              businessName,
              bookingUrl,
              date,
            }),
          });
          const reCheckData = await reCheckRes.json();

          if (reCheckData.success) {
            const stillAvailable = reCheckData.availableSlots?.some((slot: string) =>
              slot.includes(time) || time.includes(slot.split(' ')[0])
            );

            if (!stillAvailable && reCheckData.availableSlots?.length > 0) {
              // 선택한 시간이 마감됨 → 대안 제시
              const altSlots = reCheckData.availableSlots.slice(0, 3).join(', ');
              const raceText = `토니, 죄송합니다. ${time}이 방금 마감되었습니다. 현재 남은 시간은 ${altSlots} 입니다. 어떤 시간으로 변경하시겠습니까?`;
              setState('speaking');
              addMessage('jarvis', raceText, true);
              startSpeakingLevel();
              setBookingSlots(reCheckData.availableSlots);
              setBookingPanelVisible(true);
              await new Promise<void>(resolve => {
                speak(raceText, undefined, () => { stopSpeakingLevel(); resolve(); });
              });
              setState('idle');
              return;
            } else if (!stillAvailable && reCheckData.availableSlots?.length === 0) {
              // 모든 시간 마감
              const fullText = `토니, 안타깝게도 해당 날짜의 모든 시간이 마감되었습니다. 다른 날짜로 다시 조회해 드릴까요?`;
              setState('speaking');
              addMessage('jarvis', fullText, true);
              startSpeakingLevel();
              await new Promise<void>(resolve => {
                speak(fullText, undefined, () => { stopSpeakingLevel(); resolve(); });
              });
              setState('idle');
              return;
            }
            // 아직 가용 → 정상 진행
          }

          // ── 예약 폼 자동 입력 진행 ──
          setBookingStep(4);
          addMessage('jarvis', ` ${businessName} 예약 폼 자동 입력 중...`);
          const fillRes = await fetch(`${BOOKING_SERVER}/api/booking/fill-form`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: activeSessionId || bookingSessionId || '',
              bookingUrl,
              userName: savedUserName || userName,
              userPhone: savedUserPhone || userPhone,
              selectedTime: time,
              date,
            }),
          });
          const fillData = await fillRes.json();
          if (fillData.success) {
            setBookingStep(5);
            if (fillData.screenshot) setBookingScreenshot(fillData.screenshot);
            if (fillData.paymentUrl) setPaymentUrl(fillData.paymentUrl);
            setBookingPanelVisible(true);
            const fillText = `예약 정보 입력이 완료되었습니다, 토니. 화면에 결제 링크가 표시되었습니다. 링크를 클릭하시거나 QR코드를 스캔하시면 결제 페이지로 바로 이동합니다.`;
            setState('speaking');
            addMessage('jarvis', fillText, true);
            startSpeakingLevel();
            await new Promise<void>(resolve => {
              speak(fillText, undefined, () => { stopSpeakingLevel(); resolve(); });
            });
          } else {
            throw new Error(fillData.error || '예약 입력 실패');
          }
        } else if (bookAction === 'notify') {
          // 이메일 알림
          const notifyRes = await fetch(`${BOOKING_SERVER}/api/booking/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: naverUsername,
              businessName,
              date,
              time,
              userName,
            }),
          });
          const notifyData = await notifyRes.json();
          const notifyText = notifyData.success
            ? `예약 완료 알림 이메일을 발송했습니다, 토니.`
            : `이메일 발송에 실패했습니다: ${notifyData.error}`;
          setState('speaking');
          addMessage('jarvis', notifyText);
          startSpeakingLevel();
          await new Promise<void>(resolve => {
            speak(notifyText, undefined, () => { stopSpeakingLevel(); resolve(); });
          });
        }
      } catch (err) {
        setBookingStep(0);
        const errMsg = `예약 중 오류가 발생했습니다, 토니. ${String(err)}`;
        setState('speaking');
        addMessage('jarvis', errMsg);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(errMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      }

      await new Promise(r => setTimeout(r, 400));
      setBookingStep(0); // 예약 완료 후 리셋 → idle 타이머 재활성화
      setState('listening');
      setIsListening(true);
      return;
    }

    // ══════════════════════════════════════════════════════
    // ── 모닝 브리핑 프로토콜 (Morning Briefing Protocol) ──
    // ══════════════════════════════════════════════════════
    if (action?.type === 'morning_briefing') {
      setState('working');
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });

      // 텔레메트리: 모닝 브리핑 시퀀스 시작
      emitBriefingSequence('start', undefined, '모닝 브리핑 프로토콜 가동');
      telemetryFunctionStart('morning_briefing', '모닝 브리핑 데이터 수집 시작');

      // 행동 로그 패널 활성화
      setDataPanel({
        visible: true,
        type: 'report',
        progress: 0,
        message: '모닝 브리핑 데이터 수집 시작...',
        actionLogs: [{ step: 'INIT', status: 'start', detail: '모닝 브리핑 프로토콜 가동', timestamp: new Date().toISOString() }],
      });

      try {
        // ── Step 1: 스마트스토어 데이터 수집 ──
        emitBriefingSequence('node_focus', 'smartstore', '스마트스토어 데이터 수집 중...');
        setDataPanel(prev => ({
          ...prev,
          progress: 10,
          message: '스마트스토어 데이터 수집 중...',
          actionLogs: [...(prev.actionLogs || []), { step: 'SMARTSTORE', status: 'start', detail: '네이버 커머스 API 접속 중...', timestamp: new Date().toISOString() }],
        }));

        let smartstoreData: any = null;
        try {
          const ssRes = await fetch('/api/morning-briefing', { method: 'GET' });
          const ssJson = await ssRes.json();
          if (ssJson.success) {
            smartstoreData = ssJson;
            // 행동 로그 업데이트 (API에서 받은 로그 포함)
            const apiLogs = (ssJson.actionLogs || []).map((l: any) => ({
              step: l.step,
              status: l.status,
              detail: l.detail,
              timestamp: l.timestamp,
            }));
            setDataPanel(prev => ({
              ...prev,
              progress: 60,
              message: '스마트스토어 + 인플루언서 데이터 수집 완료',
              actionLogs: [...(prev.actionLogs || []), ...apiLogs],
            }));
          } else {
            throw new Error(ssJson.error || '브리핑 API 실패');
          }
        } catch (ssErr) {
          setDataPanel(prev => ({
            ...prev,
            progress: 30,
            actionLogs: [...(prev.actionLogs || []), { step: 'SMARTSTORE', status: 'fail', detail: `스마트스토어 조회 실패: ${ssErr}`, timestamp: new Date().toISOString() }],
          }));
          smartstoreData = { smartstore: { newOrders: 0, pendingShipping: 0, totalAmount: 0, revenueChangePercent: 0, error: String(ssErr) }, influencers: { total: 0, newYesterday: 0, byPlatform: {} } };
        }

        // ── Step 2: Gmail 스캔 (MCP) ──
        emitBriefingSequence('node_focus', 'email', 'Gmail 메일함 스캔 중...');
        setDataPanel(prev => ({
          ...prev,
          progress: 70,
          message: 'Gmail 메일함 스캔 중...',
          actionLogs: [...(prev.actionLogs || []), { step: 'GMAIL', status: 'start', detail: 'Gmail 협업/공구/제안 메일 스캔 중...', timestamp: new Date().toISOString() }],
        }));

        let gmailSummary = '이메일 데이터를 가져올 수 없습니다.';
        // Gmail MCP는 프론트엔드에서 직접 호출 불가 → 브리핑 텍스트에 안내만 포함

        // ── Step 3: Gemini 통합 브리핑 생성 ──
        emitBriefingSequence('node_focus', 'jarvis_brain', 'Gemini 종합 브리핑 보고서 생성 중...');
        setDataPanel(prev => ({
          ...prev,
          progress: 85,
          message: 'Gemini가 종합 브리핑 보고서를 작성 중...',
          actionLogs: [...(prev.actionLogs || []), { step: 'GEMINI_BRIEFING', status: 'start', detail: '제미나이 뇌로 종합 분석 및 전략 보고서 생성 중...', timestamp: new Date().toISOString() }],
        }));

        const ss = smartstoreData?.smartstore || {};
        const inf = smartstoreData?.influencers || {};
        const revenueSign = (ss.revenueChangePercent || 0) >= 0 ? '+' : '';

        // 화면에 표시할 구조화된 보고서
        let briefingDisplay = `[LIST] **모닝 브리핑 보고서**\n\n`;
        briefingDisplay += `**[스마트스토어 현황]**\n`;
        briefingDisplay += `- 오늘 신규 주문: **${ss.newOrders || 0}건** (옥수수 ${ss.cornCount || 0}건, 밤 ${ss.chestnutCount || 0}건)\n`;
        briefingDisplay += `- 배송 준비 중: **${ss.pendingShipping || 0}건**\n`;
        briefingDisplay += `- 오늘 매출: **${(ss.totalAmount || 0).toLocaleString('ko-KR')}원**\n`;
        briefingDisplay += `- 어제 대비: **${revenueSign}${ss.revenueChangePercent || 0}%**\n\n`;
        briefingDisplay += `**[인플루언서 현황]**\n`;
        briefingDisplay += `- 총 누적: **${inf.total || 0}명**\n`;
        briefingDisplay += `- 어제 신규: **${inf.newYesterday || 0}명**\n`;
        if (inf.byPlatform && Object.keys(inf.byPlatform).length > 0) {
          briefingDisplay += `- 플랫폼별: ${Object.entries(inf.byPlatform).map(([k, v]) => `${k} ${v}명`).join(', ')}\n`;
        }
        if (inf.recentNames && inf.recentNames.length > 0) {
          briefingDisplay += `- 어제 추가: ${inf.recentNames.join(', ')}\n`;
        }

        // 음성 브리핑 텍스트 (Gemini 스타일)
        let voiceBriefing = `선생님, 좋은 아침입니다. 오늘의 업무 브리핑을 시작하겠습니다. `;
        voiceBriefing += `스마트스토어에 오늘 신규 주문 ${ss.newOrders || 0}건이 들어왔으며, `;
        voiceBriefing += `배송 준비 중인 건이 ${ss.pendingShipping || 0}건입니다. `;
        if ((ss.totalAmount || 0) > 0) {
          voiceBriefing += `오늘 매출은 ${(ss.totalAmount || 0).toLocaleString('ko-KR')}원으로, 어제 대비 ${revenueSign}${ss.revenueChangePercent || 0}퍼센트 변동이 있습니다. `;
        }
        voiceBriefing += `인플루언서는 현재 총 ${inf.total || 0}명이 누적되었으며, 어제 ${inf.newYesterday || 0}명이 새로 추가되었습니다. `;

        // 전략적 제안 추가
        if ((ss.newOrders || 0) > 0 && (ss.pendingShipping || 0) > 3) {
          voiceBriefing += `오늘의 제안입니다. 배송 대기 건이 ${ss.pendingShipping}건으로 다소 밀려있으니, 우선 발주 확인 후 배송 처리를 진행하시는 것을 권장드립니다. `;
          briefingDisplay += `\n**[오늘의 전략 제안]**\n`;
          briefingDisplay += `- 배송 대기 ${ss.pendingShipping}건 우선 처리 권장\n`;
        }
        if ((inf.newYesterday || 0) > 0) {
          voiceBriefing += `어제 새로 발굴된 인플루언서에게 협업 제안 메일을 발송하시는 것도 좋겠습니다. `;
          briefingDisplay += `- 신규 인플루언서 ${inf.newYesterday}명에게 협업 제안 메일 발송 권장\n`;
        }
        voiceBriefing += `이상 모닝 브리핑을 마치겠습니다, 선생님.`;

        // 완료 로그
        setDataPanel(prev => ({
          ...prev,
          progress: 100,
          message: '모닝 브리핑 완료',
          actionLogs: [...(prev.actionLogs || []),
            { step: 'GEMINI_BRIEFING', status: 'success', detail: '종합 브리핑 보고서 생성 완료', timestamp: new Date().toISOString() },
            { step: 'COMPLETE', status: 'success', detail: '모닝 브리핑 프로토콜 완료', timestamp: new Date().toISOString() },
          ],
        }));

        // 텔레메트리: 브리핑 완료 + 노드 데이터 업데이트
        emitBriefingSequence('complete', undefined, '모닝 브리핑 완료');
        telemetryFunctionSuccess('morning_briefing', '모닝 브리핑 완료', {
          newOrders: ss.newOrders || 0,
          pendingShipping: ss.pendingShipping || 0,
          totalAmount: ss.totalAmount || 0,
          influencerTotal: inf.total || 0,
        });
        emitNodeData('smartstore', {
          '신규주문': ss.newOrders || 0,
          '배송대기': ss.pendingShipping || 0,
          '오늘매출': `${(ss.totalAmount || 0).toLocaleString()}원`,
          '전일대비': `${revenueSign}${ss.revenueChangePercent || 0}%`,
        });
        emitNodeData('sheets', {
          '인플루언서총계': inf.total || 0,
          '어제신규': inf.newYesterday || 0,
        });

        // 화면에 보고서 표시 + 음성 브리핑
        setState('speaking');
        addMessage('jarvis', briefingDisplay, true);
        triggerGoldenFlare();
        setClapBurst(true); setTimeout(() => setClapBurst(false), 120);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(voiceBriefing, undefined, () => { stopSpeakingLevel(); resolve(); });
        });

      } catch (err) {
        telemetryFunctionError('morning_briefing', `모닝 브리핑 실패: ${err}`);
        setDataPanel(prev => ({
          ...prev,
          progress: 0,
          message: '브리핑 오류 발생',
          actionLogs: [...(prev.actionLogs || []), { step: 'ERROR', status: 'fail', detail: `모닝 브리핑 실패: ${err}`, timestamp: new Date().toISOString() }],
        }));
        const errMsg = `모닝 브리핑 중 오류가 발생했습니다, 선생님. ${String(err)}`;
        setState('speaking');
        addMessage('jarvis', errMsg);
        startSpeakingLevel();
        await new Promise<void>(resolve => { speak(errMsg, undefined, () => { stopSpeakingLevel(); resolve(); }); });
      }

      // 8초 후 행동 로그 패널 자동 닫기
      setTimeout(() => {
        setDataPanel({ visible: false, type: null, progress: 0, message: '' });
      }, 8000);

      await new Promise(r => setTimeout(r, 400));
      setState('listening');
      setIsListening(true);
      return;
    }

    // ── 스마트스토어 전체 자동화 액션 ──
    const SS_ACTIONS = [
      'query_orders_today', 'query_orders_week', 'query_orders_month',
      'query_orders_unpaid', 'query_orders_cancel', 'query_orders_return',
      'query_orders_by_product', 'query_order_detail', 'query_orders_pending_ship', 'morning_report',
      'confirm_all_today', 'confirm_all', 'confirm_by_product', 'confirm_by_id', 'query_unconfirmed',
      'create_order_sheet_today', 'create_order_sheet_week', 'create_order_sheet_by_product',
      'create_order_sheet_grouped', 'check_duplicate_orders', 'bundle_same_address',
      'create_settlement_month', 'create_settlement_by_product', 'calc_weekly_profit',
      'get_bestseller', 'compare_last_month', 'weekly_report',
      'send_purchase_email', 'send_purchase_email_auto', 'preview_purchase_email',
      'process_shipping', 'get_products',
      'process_order_file', 'process_order_file_and_send',
      // 구버전 호환
      'get_orders', 'ship_order',
    ];
    if (
      action?.type === 'smartstore_orders' || action?.type === 'smartstore_shipping' ||
      action?.type === 'smartstore_products' || action?.type === 'smartstore_confirm' ||
      action?.type === 'smartstore_sheet' || action?.type === 'smartstore_settlement' ||
      action?.type === 'smartstore_purchase_email' || action?.type === 'smartstore_report' ||
      (action?.params?.action && SS_ACTIONS.includes(String(action.params.action)))
    ) {
      // 구버전 액션 매핑
      let ssAction = String(action.params?.action || '');
      if (!ssAction || ssAction === 'get_orders') ssAction = 'query_orders_today';
      if (ssAction === 'ship_order') ssAction = 'process_shipping';

      setState('working');
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });

      telemetryFunctionStart('smartstore_action', `스마트스토어: ${ssAction}`);

      // ── 스마트스토어 행동 로그 패널 활성화 ──
      setDataPanel({
        visible: true,
        type: 'smartstore',
        progress: 5,
        message: '스마트스토어 엔진 가동 중...',
        actionLogs: [],
      });

      try {
        // 발주서 파일 처리 (파일 업로드 UI 표시 후 처리)
        if (ssAction === 'process_order_file' || ssAction === 'process_order_file_and_send') {
          const isSendEmail = ssAction === 'process_order_file_and_send';
          setOrderFileAction(ssAction as 'process_order_file' | 'process_order_file_and_send');
          setOrderFileUploadVisible(true);

          // 파일 업로드 대기
          const uploadedFile = await new Promise<File | null>(resolve => {
            orderFileResolveRef.current = resolve;
          });

          setOrderFileUploadVisible(false);

          if (!uploadedFile) {
            const cancelText = '발주서 파일 업로드가 취소되었습니다, 선생님.';
            setState('speaking');
            addMessage('jarvis', cancelText);
            startSpeakingLevel();
            await new Promise<void>(resolve => { speak(cancelText, undefined, () => { stopSpeakingLevel(); resolve(); }); });
          } else {
            setOrderFileProcessing(true);
            const processingText = isSendEmail
              ? '발주서 파일을 분석하고 정산서를 생성한 후 공급처에 이메일 발송하겠습니다, 선생님.'
              : '발주서 파일을 분석하고 셀렌 발주서와 정산서를 생성하겠습니다, 선생님.';
            setState('working');
            addMessage('jarvis', processingText);
            startSpeakingLevel();
            await new Promise<void>(resolve => { speak(processingText, undefined, () => { stopSpeakingLevel(); resolve(); }); });

            try {
              // 파일을 Base64로 변환
              const fileBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(uploadedFile);
              });

              const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
              const apiAction = isSendEmail ? 'full_process' : 'create_order';

              const res = await fetch('/api/smartstore-process-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: apiAction,
                  fileBase64,
                  fileName: uploadedFile.name,
                  date: today,
                }),
              });
              const data = await res.json();
              setOrderFileProcessing(false);

              if (!data.success) throw new Error(data.error || '발주서 처리 실패');

              // 발주서 엑셀 다운로드
              if (data.orderSheet) {
                const orderBytes = Uint8Array.from(atob(data.orderSheet), c => c.charCodeAt(0));
                const orderBlob = new Blob([orderBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const orderUrl = URL.createObjectURL(orderBlob);
                const orderA = document.createElement('a');
                orderA.href = orderUrl;
                orderA.download = data.orderFileName || '셀렌_발주서.xlsx';
                orderA.click();
                URL.revokeObjectURL(orderUrl);
              }

              // 정산서 엑셀 다운로드
              if (data.settlementSheet) {
                await new Promise(r => setTimeout(r, 500));
                const settleBytes = Uint8Array.from(atob(data.settlementSheet), c => c.charCodeAt(0));
                const settleBlob = new Blob([settleBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const settleUrl = URL.createObjectURL(settleBlob);
                const settleA = document.createElement('a');
                settleA.href = settleUrl;
                settleA.download = data.settlementFileName || '정산서.xlsx';
                settleA.click();
                URL.revokeObjectURL(settleUrl);
              }

              // 결과 메시지
              let resultMsg = `[LIST] **발주서 처리 완료**\n\n`;
              resultMsg += `[PKG] 총 주문: ${data.orderCount}건\n`;
              if (data.qtySummary) {
                const summary = Object.entries(data.qtySummary as Record<string, number>)
                  .filter(([, qty]) => qty > 0)
                  .map(([name, qty]) => `  • ${name}: ${qty}개`)
                  .join('\n');
                if (summary) resultMsg += `\n물품별 수량:\n${summary}\n`;
              }
              if (data.totalSettlement) {
                resultMsg += `\n[MONEY] 입금 필요액: **${Number(data.totalSettlement).toLocaleString('ko-KR')}원**`;
              }
              if (isSendEmail && data.emailSent) {
                resultMsg += `\n\n 공급처 이메일 발송 완료`;
                resultMsg += `\n[PHONE] 텔레그램으로 정산 내역을 확인하세요.`;
              }
              resultMsg += `\n\n[IN] 셀렌 발주서 + 정산서 다운로드가 시작되었습니다.`;

              const doneText = isSendEmail
                ? `발주서 처리 및 공급처 이메일 발송 완료입니다, 선생님. 텍레그램으로 정산 내역을 확인하세요.`
                : `발주서 처리 완료입니다, 선생님. 셀렌 발주서와 정산서가 다운로드되었습니다. 입금 필요액은 ${Number(data.totalSettlement || 0).toLocaleString('ko-KR')}원입니다.`;

              setState('speaking');
              addMessage('jarvis', resultMsg, true);
              startSpeakingLevel();
              await new Promise<void>(resolve => { speak(doneText, undefined, () => { stopSpeakingLevel(); resolve(); }); });
              setClapBurst(true); setTimeout(() => setClapBurst(false), 120);

            } catch (err) {
              setOrderFileProcessing(false);
              throw err;
            }
          }

          await new Promise(r => setTimeout(r, 400));
          setState('listening');
          setIsListening(true);
          return;
        }

        // 상품 조회는 기존 API 유지
        if (ssAction === 'get_products') {
          const productStatus = String(action.params?.product_status || 'SALE');
          const params = new URLSearchParams({ status: productStatus, size: '50' });
          const res = await fetch(`/api/smartstore-products?${params.toString()}`);
          const data = await res.json();
          if (!data.success) throw new Error(data.error || '상품 조회 실패');
          const products = data.products || [];
          let productSummary = `총 ${data.total || products.length}개 상품\n\n`;
          products.slice(0, 8).forEach((p: any, i: number) => {
            productSummary += `${i + 1}. ${p.name} - ${p.salePrice?.toLocaleString()}원 [${p.statusKo}]${p.stockQuantity !== undefined ? ` (재고: ${p.stockQuantity}개)` : ''}\n`;
          });
          if (products.length > 8) productSummary += `\n... 외 ${products.length - 8}개 더 있습니다.`;
          const doneText = `스마트스토어 상품 조회 완료입니다, 선생님. ${products.length}개 상품이 확인되었습니다.`;
          setState('speaking');
          addMessage('jarvis', ` **스마트스토어 상품 현황**\n\n${productSummary}`, true);
          startSpeakingLevel();
          await new Promise<void>(resolve => { speak(doneText, undefined, () => { stopSpeakingLevel(); resolve(); }); });

        } else {
          // 통합 자동화 API 호출
          const body: Record<string, any> = { action: ssAction };
          if (action.params?.product_name) body.productName = action.params.product_name;
          if (action.params?.order_id) body.orderId = action.params.order_id;
          if (action.params?.product_order_ids) {
            try { body.productOrderIds = JSON.parse(String(action.params.product_order_ids)); } catch { /* ignore */ }
          }
          if (action.params?.tracking_number) body.trackingNumber = action.params.tracking_number;
          if (action.params?.delivery_company) body.deliveryCompany = action.params.delivery_company;
          if (action.params?.supplier_email) body.supplierEmail = action.params.supplier_email;
          if (action.params?.supplier_name) body.supplierName = action.params.supplier_name;
          if (action.params?.delivery_date) body.deliveryDate = action.params.delivery_date;
          if (action.params?.group_by) body.groupBy = action.params.group_by;
          if (action.params?.memo) body.memo = action.params.memo;

          setDataPanel(prev => ({ ...prev, progress: 15, message: 'QuotaGuard 프록시 연결 중...' }));

          const res = await fetch('/api/smartstore-automation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const data = await res.json();

          // 행동 로그 업데이트
          if (data.action_logs) {
            setDataPanel(prev => ({
              ...prev,
              progress: data.success ? 100 : 80,
              message: data.success ? '작업 완료' : '오류 발생',
              actionLogs: data.action_logs,
            }));
          } else {
            setDataPanel(prev => ({ ...prev, progress: data.success ? 100 : 80, message: data.success ? '작업 완료' : '오류 발생' }));
          }

          if (!data.success) throw new Error(data.error || '스마트스토어 작업 실패');

          // 텔레메트리: 스마트스토어 성공
          telemetryFunctionSuccess('smartstore_action', `스마트스토어 ${ssAction} 완료`, { action: ssAction });

          // 결과 메시지 생성
          let resultMsg = '';
          let doneText = '';

          if (ssAction.startsWith('query_orders') || ssAction === 'morning_report') {
            const count = Array.isArray(data.data) ? data.data.length : (data.newOrders || 0);
            resultMsg = `[PKG] **${getActionLabel(ssAction)}**\n\n`;
            if (ssAction === 'morning_report') {
              resultMsg += `신규 주문: ${data.newOrders}건\n취소 요청: ${data.cancelOrders}건\n발송 대기: ${data.pendingShipping}건`;
              doneText = `아침 업무 보고 완료입니다, 선생님. 신규 주문 ${data.newOrders}건, 취소 요청 ${data.cancelOrders}건이 있습니다.`;
            } else {
              resultMsg += data.summary || `총 ${count}건 조회되었습니다.`;
              doneText = `${getActionLabel(ssAction)} 완료입니다, 선생님. ${count}건이 확인되었습니다.`;
            }
          } else if (ssAction.startsWith('confirm')) {
            resultMsg = `[OK] **발주확인 처리 완료**\n\n${data.confirmedCount || 0}건 처리되었습니다.`;
            doneText = `발주확인 ${data.confirmedCount || 0}건 처리 완료입니다, 선생님.`;
            setClapBurst(true); setTimeout(() => setClapBurst(false), 120);
          } else if (ssAction.startsWith('create_order_sheet') || ssAction === 'check_duplicate_orders' || ssAction === 'bundle_same_address') {
            const count = data.count || (Array.isArray(data.duplicates) ? data.duplicates.length : 0) || (Array.isArray(data.bundled) ? data.bundled.length : 0);
            resultMsg = `[LIST] **${getActionLabel(ssAction)}**\n\n${data.fileName || ''}\n${count}건 처리되었습니다.`;
            doneText = `${getActionLabel(ssAction)} 완료입니다, 선생님.`;
            if (data.csvData) {
              // CSV 다운로드 링크 생성
              const blob = new Blob([data.csvData], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = data.fileName || '주문서.csv'; a.click();
              URL.revokeObjectURL(url);
              resultMsg += `\n\n[IN] 파일 다운로드가 시작되었습니다.`;
            }
          } else if (ssAction.startsWith('create_settlement') || ssAction === 'calc_weekly_profit' || ssAction === 'get_bestseller' || ssAction === 'compare_last_month' || ssAction === 'weekly_report') {
            resultMsg = `[MONEY] **${getActionLabel(ssAction)}**\n\n`;
            if (data.totalSales) resultMsg += `총 매출: ${Number(data.totalSales).toLocaleString('ko-KR')}원\n총 주문: ${data.totalOrders}건\n네이버 수수료: ${Number(data.naverFee).toLocaleString('ko-KR')}원\n실수령: ${Number(data.netSales).toLocaleString('ko-KR')}원`;
            if (data.growthRate) resultMsg += `전월 대비: ${data.growthRate}\n${data.message}`;
            if (data.topProduct) resultMsg += `베스트셀러: ${data.topProduct?.productName} (${data.topProduct?.quantity}개)`;
            doneText = `${getActionLabel(ssAction)} 완료입니다, 선생님.`;
            if (data.csvData) {
              const blob = new Blob([data.csvData], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = data.fileName || '정산서.csv'; a.click();
              URL.revokeObjectURL(url);
            }
          } else if (ssAction.includes('purchase_email')) {
            resultMsg = `[MAIL] **발주 이메일 ${ssAction === 'preview_purchase_email' ? '미리보기' : '발송 완료'}**\n\n${data.message || ''}\n\n${data.preview || ''}`;
            doneText = ssAction === 'preview_purchase_email' ? '발주 이메일 초안입니다, 선생님. 확인 후 발송하시겠습니까?' : `발주 이메일 발송 완료입니다, 선생님.`;
            if (ssAction !== 'preview_purchase_email') {
              setClapBurst(true); setTimeout(() => setClapBurst(false), 120);
            }
          } else if (ssAction === 'process_shipping') {
            resultMsg = ` **발송 처리 완료**\n\n${data.count || 0}건 처리되었습니다.`;
            doneText = `발송 처리 ${data.count || 0}건 완료입니다, 선생님.`;
            setClapBurst(true); setTimeout(() => setClapBurst(false), 120);
          } else {
            resultMsg = data.message || '작업이 완료되었습니다.';
            doneText = '작업 완료입니다, 선생님.';
          }

          setState('speaking');
          addMessage('jarvis', resultMsg, true);
          startSpeakingLevel();
          await new Promise<void>(resolve => { speak(doneText, undefined, () => { stopSpeakingLevel(); resolve(); }); });
        }

      } catch (err) {
        telemetryFunctionError('smartstore_action', `스마트스토어 오류: ${err}`);
        setDataPanel(prev => ({ ...prev, progress: 0, message: '❌ 오류 발생' }));
        const errMsg = `스마트스토어 작업 중 오류가 발생했습니다, 선생님. ${String(err).includes('CLIENT_ID') ? 'API 키 설정을 확인해주세요.' : String(err)}`;
        setState('speaking');
        addMessage('jarvis', errMsg);
        startSpeakingLevel();
        await new Promise<void>(resolve => { speak(errMsg, undefined, () => { stopSpeakingLevel(); resolve(); }); });
      }

      // 5초 후 행동 로그 패널 자동 닫기
      setTimeout(() => {
        setDataPanel({ visible: false, type: null, progress: 0, message: '' });
      }, 5000);

      await new Promise(r => setTimeout(r, 400));
      setState('listening');
      setIsListening(true);
      return;
    }

    // ── 목소리 변경 액션 ──
    if (action?.type === 'change_voice') {
      const voiceAction = String(action.params?.action || 'list');
      const voiceId = String(action.params?.voice_id || '');
      const voiceName = String(action.params?.voice_name || '');

      if (voiceAction === 'change' && voiceId) {
        // 목소리 실제 변경
        setCurrentVoiceId(voiceId);
        const found = ELEVENLABS_VOICES.find(v => v.id === voiceId);
        const newName = found?.name || voiceName;
        setCurrentVoiceName(newName);
        console.log('[JARVIS] 목소리 변경됨:', newName);

        // 메인 응답을 새 목소리로 재생
        setState('speaking');
        addMessage('jarvis', action.response);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(action.response, undefined, () => {
            stopSpeakingLevel();
            resolve();
          }, voiceId); // 새 목소리 ID로 재생
        });

        // 샘플 멘트 재생
        const sampleText = `이 목소리는 어때세요, 토니? ${newName} 목소리로 설정되었습니다. 마음에 드시면 계속 사용하겠습니다.`;
        await new Promise(r => setTimeout(r, 600));
        setState('speaking');
        addMessage('jarvis', sampleText);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(sampleText, undefined, () => {
            stopSpeakingLevel();
            resolve();
          }, voiceId);
        });

        // 응답 후 듣기 모드
        await new Promise(r => setTimeout(r, 400));
        setState('listening');
        setIsListening(true);
        return; // 이미 응답 처리했으므로 이하 실행 안 함
      } else if (voiceAction === 'recommend' || voiceAction === 'list') {
        // 목소리 목록을 화면에 표시 (voiceListVisible 상태)
        setVoiceListVisible(true);
        setTimeout(() => setVoiceListVisible(false), 15000); // 15초 후 자동 숨김
      }
    }

    // 텔레메트리: Gemini 뇌 사고 완료 → jarvis_brain 노드 idle 복귀
    emitNodeState('jarvis_brain', 'success', '응답 생성 완료');
    setTimeout(() => emitNodeState('jarvis_brain', 'idle'), 2000);

    // ── 메인 응답 발화 ──
    setIsListening(false); // speaking 중 STT 완전 차단 (에코 방지)
    setState('speaking');
    // 작업 완료 타입이면 스파클링 효과 적용
    const isCompletionMsg = isWorkingType && !!action?.workingMessage;
    addMessage('jarvis', text, isCompletionMsg);
    // 수집/이메일 발송 완료 시 파티클 폭발 효과 (clapBurst 3회 연속) + 골든 플레어
    if (isCompletionMsg) {
      triggerGoldenFlare();
      setClapBurst(true);
      setTimeout(() => setClapBurst(false), 120);
      setTimeout(() => { setClapBurst(true); setTimeout(() => setClapBurst(false), 120); }, 450);
      setTimeout(() => { setClapBurst(true); setTimeout(() => setClapBurst(false), 120); }, 900);
    }
    startSpeakingLevel();

    const followUp = action?.followUp;

    await new Promise<void>(resolve => {
      speak(text, undefined, () => {
        stopSpeakingLevel();
        resolve();
      });
    });

    // ── followUp 후속 질문 자동 발화 ──
    if (followUp) {
      await new Promise(r => setTimeout(r, 800)); // 자연스러운 호흡 간격
      setIsListening(false); // followUp 중에도 STT 차단
      setState('speaking');
      addMessage('jarvis', followUp);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(followUp, undefined, () => {
          stopSpeakingLevel();
          resolve();
        });
      });
    }

    // ── 응답 완료 후 자동으로 듣기 모드 전환 ──
    // TTS 에코가 마이크에 잡히지 않도록 에코 방지 딜레이 (1.2초)
    await new Promise(r => setTimeout(r, 1200));
    console.log('[JARVIS] 응답 완료 → listening 전환');
    setState('listening');
    setIsListening(true);
  }, [addMessage, speak, startSpeakingLevel, stopSpeakingLevel]);

  // ── STT 노이즈 필터: 유튜브/방송 오인식 패턴 차단 ──
  const STT_NOISE_PATTERNS = [
    /^(구독|좋아요|알림|알림설정|구독좋아요|구독\s*좋아요|좋아요\s*구독)[\s,!.]*$/i,
    /구독.*좋아요.*알림/i,
    /좋아요.*구독.*알림/i,
    /^(감사합니다|고맙습니다|안녕하세요|안녕히계세요)[\s!.]*$/i,
    /^(네|예|아니요|아니오)[\s!.]*$/i, // 단독 짧은 응답 (맥락 없는 경우)
    /^[\s\p{P}]*$/u, // 구두점만 있는 경우
  ];
  const isSTTNoise = (text: string): boolean => {
    const trimmed = text.trim();
    if (trimmed.length <= 1) return true; // 1글자 이하
    return STT_NOISE_PATTERNS.some(p => p.test(trimmed));
  };

  const handleSpeechResult = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;
    // STT 노이즈 필터 (단, 2차 인증/케시 대기 중에는 필터 건너뛰)
    const isWaitingForInput = verificationResolveRef.current !== null || bookingConfirmResolveRef.current !== null || captchaOpenRef.current;
    if (!isWaitingForInput && isSTTNoise(transcript)) {
      console.log('[JARVIS] [STOP] STT 노이즈 감지 → 무시:', transcript);
      return;
    }
    // 케시 모달 열려있으면 음성 입력을 케시 답으로 처리
    if (captchaOpenRef.current && verificationResolveRef.current) {
      const resolve = verificationResolveRef.current;
      verificationResolveRef.current = null;
      captchaOpenRef.current = false;
      addMessage('user', transcript);
      setCaptchaScreenshot(null);
      setVerificationMode(null);
      setState('working');
      resolve(transcript.replace(/\s/g, '').trim());
      return;
    }
    const currentState = stateRef.current;
    console.log('[JARVIS]  음성 명령 수신 (상태:', currentState, '):', transcript);
    // 캡차/2단계 인증 입력 대기 중이면 인증번호 전달
    if (verificationResolveRef.current) {
      const resolve = verificationResolveRef.current;
      verificationResolveRef.current = null;
      setState('working');
      resolve(transcript.replace(/\s/g, '').trim());
      return;
    }
    // 예약 확인 대기 중이면 해당 resolve로 응답 전달
    if (bookingConfirmResolveRef.current) {
      const resolve = bookingConfirmResolveRef.current;
      bookingConfirmResolveRef.current = null;
      resolve(transcript);
      return;
    }
    // 음성 인식 시 JARVIS가 말하는 중이면 즉시 중단
    if (currentState === 'speaking' || currentState === 'thinking' || currentState === 'working') {
      console.log('[JARVIS] TTS 즉시 중단 후 사용자 명령 처리');
      stopGlobalAudio(); // TTS 즉시 중단
      stopSpeakingLevel();
      // 잠시 대기 후 명령 처리
      await new Promise(r => setTimeout(r, 200));
    }
    // 1. 즉시 STT 중단
    setIsListening(false);
    // 2. thinking 상태 전환
    setState('thinking');
    // 3. 사용자 메시지 표시
    addMessage('user', transcript);
    try {
      // 4. GPT-4o API 호출 (폴백: 로컬 파서)
      emitNodeState('jarvis_brain', 'active', 'Gemini 뇌 사고 중...');
      emitPulseLine('user', 'jarvis_brain', 'fast');
      emitMissionLog('🧠', 'Gemini', '사용자 명령 분석 중...', 'thinking');
      const action = await askGPT(transcript).catch(() => parseCommand(transcript));
      console.log('[JARVIS] GPT 응답 액션:', action.type, action.response.substring(0, 60));
      // 5. 응답 처리 (TTS 재생 + 후속 처리)
      await jarvisRespond(action.response, action);
    } catch (err) {
      console.error('[JARVIS] handleSpeechResult 오류:', err);
      // 오류 시에도 반드시 listening 상태로 복구
      await new Promise(r => setTimeout(r, 500));
      setState('listening');
      setIsListening(true);
    }
  }, [addMessage, jarvisRespond]);

  // ── 타이핑 입력 제출 핸들러 ──
  const handleTextSubmit = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setTextInputValue('');
    setTextInputMode(false);

    // 캡차/2단계 인증 입력 대기 중이면 인증번호 전달
    if (verificationResolveRef.current) {
      const resolve = verificationResolveRef.current;
      verificationResolveRef.current = null;
      addMessage('user', text);
      setState('working');
      resolve(text.replace(/\s/g, '').trim());
      return;
    }

    // 자비스가 말하는 중이면 중단
    if (stateRef.current === 'speaking') {
      stopGlobalAudio();
      stopSpeakingLevel();
      await new Promise(r => setTimeout(r, 150));
    }

    // 자비스를 활성화하지 않은 상태에서도 입력 가능
    if (stateRef.current === 'idle') {
      setIsInitialized(true);
    }

    setState('thinking');
    addMessage('user', text);
    try {
      emitNodeState('jarvis_brain', 'active', 'Gemini 뇌 사고 중...');
      emitPulseLine('user', 'jarvis_brain', 'fast');
      emitMissionLog('🧠', 'Gemini', '사용자 명령 분석 중...', 'thinking');
      const action = await askGPT(text).catch(() => parseCommand(text));
      await jarvisRespond(action.response, action);
    } catch (err) {
      console.error('[JARVIS] handleTextSubmit 오류:', err);
      await new Promise(r => setTimeout(r, 300));
      setState(stateRef.current === 'idle' ? 'idle' : 'listening');
    }
  }, [addMessage, jarvisRespond, stopSpeakingLevel]);

  useSpeechRecognition({
    onResult: handleSpeechResult,
    onStart: () => {
      console.log('[JARVIS] STT onStart → listening');
      setState('listening');
    },
    onEnd: () => {
      console.log('[JARVIS] STT onEnd, state:', stateRef.current);
      // STT가 종료되어도 SpeechEngine이 자동 재시작하므로
      // 여기서는 idle로 전환하지 않음 (listening 상태 유지)
    },
    isListening,
  });

  const activatingRef = useRef(false); // 중복 활성화 방지
  const lastActivatedRef = useRef(0); // 활성화 시각 (쿨다운용)

  const handleActivate = useCallback(async () => {
    const s = stateRef.current;
    if (s === 'speaking' || s === 'working' || s === 'thinking') return;
    if (activatingRef.current) return; // 이미 활성화 중이면 무시

    setClapBurst(true);
    setTimeout(() => setClapBurst(false), 120);
    setShowHint(false);

    if (s === 'idle') {
      activatingRef.current = true;

      // 시그니처 응답: GPT 대기 없이 즉시 재생
      const sigResponse = SIGNATURE_RESPONSES[Math.floor(Math.random() * SIGNATURE_RESPONSES.length)];
      setState('speaking');
      addMessage('jarvis', sigResponse);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(sigResponse, undefined, () => {
          stopSpeakingLevel();
          resolve();
        });
      });

      if (!isInitialized) {
        setIsInitialized(true);
        // 시그니처 응답만 발화 — 후속 인사말 없음
      }

      // TTS 완료 후 충분한 딜레이 후 listening 상태로 전환
      await new Promise(r => setTimeout(r, 600));
      console.log('[JARVIS] 시그니처 완료 → listening 전환');
      setState('listening');
      setIsListening(true);
      lastActivatedRef.current = Date.now(); // 쿨다운 시작
      activatingRef.current = false;
    } else if (s === 'listening') {
      //  쿨다운: 활성화 후 5초 이내에는 비활성화 방지
      const elapsed = Date.now() - lastActivatedRef.current;
      if (elapsed < 5000) {
        console.log(`[JARVIS] 비활성화 쿨다운 중 (${Math.round(elapsed)}ms < 5000ms) — 무시`);
        return;
      }
      console.log('[JARVIS] 박수 → listening → idle 전환');
      setIsListening(false);
      setState('idle');
    }
  }, [isInitialized, addMessage, speak, startSpeakingLevel, stopSpeakingLevel]);

  useEffect(() => { if (state !== 'listening') setMicLevel(0); }, [state]);
  // ── handleActivateRef 동기화 (Wake Word 콜백에서 활성화 함수 참조) ──
  useEffect(() => { handleActivateRef.current = handleActivate; }, [handleActivate]);
  // ── Ctrl+K 단축키: 타이핑 모드 토글 ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setTextInputMode(prev => {
          if (!prev) setTimeout(() => textInputRef.current?.focus(), 80);
          return !prev;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── 자동 idle 전환: listening 상태에서 60초 무입력 시 마이크 자동 ggoff ──
  const lastInputTimeRef = useRef<number>(Date.now());
  // 사용자 입력 시마다 시간 갱신
  useEffect(() => {
    lastInputTimeRef.current = Date.now();
  }, [state]); // state가 thinking/working/speaking으로 바뀌면 입력 있었던 것으로 간주

  useEffect(() => {
    if (state !== 'listening') return;
    // 예약 진행 중이면 자동 idle 전환 비활성화
    if (bookingStep > 0) return;
    const AUTO_IDLE_TIMEOUT = 60 * 1000; // 60초
    const timer = setInterval(() => {
      const elapsed = Date.now() - lastInputTimeRef.current;
      if (elapsed >= AUTO_IDLE_TIMEOUT && stateRef.current === 'listening' && bookingStep === 0) {
        console.log('[JARVIS] 60초 무입력 → 자동 idle 전환');
        setIsListening(false);
        setState('idle');
        // 자동 off 알림 멘트 (TTS 없이 메시지만)
        addMessage('jarvis', '대기 시간 초과로 마이크를 끄겠습니다, 선생님. 필요하시면 다시 호출해 주세요.');
      }
    }, 5000); // 5초마다 체크
    return () => clearInterval(timer);
  }, [state, addMessage, bookingStep]);

  // ── 크롬 확장 메시지 수신 (네이버 로그인 완료 감지) ──
  useEffect(() => {
    const handleExtMessage = (e: MessageEvent) => {
      if (e.data?.source !== 'JARVIS_EXTENSION') return;
      // 네이버 로그인 완료 (확장에서 자동 감지)
      if (e.data.type === 'NAVER_LOGIN_RESULT') {
        const result = e.data.payload;
        if (result?.success && result?.sessionId) {
          setBookingSessionId(result.sessionId);
          localStorage.setItem('jarvis_booking_session', result.sessionId);
          setNaverLoginStatus('done');
          const loginDoneMsg = `접속 확인됐습니다, 토니. 네이버 로그인 완료. 언제든 명령하십시오, sir.`;
          addMessage('jarvis', loginDoneMsg, true);
          setState('speaking');
          startSpeakingLevel();
          speak(loginDoneMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
        }
      }
    };
    window.addEventListener('message', handleExtMessage);
    return () => window.removeEventListener('message', handleExtMessage);
  }, [addMessage, speak, startSpeakingLevel, stopSpeakingLevel]);

  const accent = STATE_COLOR[state];

  return (
    <main
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: THEME.bg, cursor: typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? 'auto' : 'none' }}
      onClick={() => {
        // idle 상태에서만 클릭으로 활성화 허용
        if (stateRef.current === 'idle') handleActivate();
      }}
      onTouchStart={(e) => {
        // 모바일 터치로 활성화
        if (stateRef.current === 'idle') {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      {/* ── Three.js 파티클 배경 ── */}
      <SparkleParticles state={state} audioLevel={micLevel} speakingLevel={speakingLevel} clapBurst={clapBurst} freqData={micFreqData ?? undefined} />
      
      {/* ── 보이스 파티클 아우라 (3D) ── */}
      <VoiceParticleAura micLevel={micLevel} speakingLevel={speakingLevel} state={state} />
      
      {/* ── 골든 플레어 (성공 효과) ── */}
      <GoldenFlare visible={showGoldenFlare} />

      {/* ── 파티클 텍스트 캔버스 (타이핑 모드) ── */}
      <ParticleTextCanvas text={textInputValue} active={textInputMode} />

      {/* ── 박수 감지 ── */}
      <ClapDetector onClap={handleActivate} onAudioLevel={setMicLevel} enabled={state === 'idle'} releaseStream={state !== 'idle'} />
      {/* ClapDetector: idle에서만 박수 감지 활성, idle이 아닌 모든 상태에서 AudioContext suspend */}

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
          zIndex: 30,
          padding: isMobile ? '14px 14px 0' : '24px 36px 0',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          {/* 좌측 시간 */}
          <div>
            <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.gold, fontSize: isMobile ? '0.65rem' : '0.85rem', letterSpacing: '0.08em', opacity: 0.75 }}>
              {currentTime}
            </div>
            <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: isMobile ? '0.38rem' : '0.5rem', letterSpacing: '0.1em', marginTop: '3px' }}>
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

          {/* 우측 상태 + 시스템 현황 버튼 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
            {/* 시스템 현황 버튼 - 모바일에서 숨김 */}
            {!isMobile && (
            <motion.button
              onClick={(e) => { e.stopPropagation(); setNeuralMapVisible(true); }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(0,212,255,0.08)',
                border: '1px solid rgba(0,212,255,0.35)',
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'Orbitron, monospace',
              }}
            >
              <motion.div
                style={{ width: 5, height: 5, borderRadius: '50%', background: '#00D4FF', boxShadow: '0 0 6px #00D4FF' }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span style={{ color: '#00D4FF', fontSize: '0.42rem', letterSpacing: '0.2em' }}>SYSTEM MAP</span>
            </motion.button>
            )}
            {!isMobile && (
            <motion.button
              onClick={(e) => { e.stopPropagation(); setStrategyDashboardVisible(true); }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(200,169,110,0.08)',
                border: '1px solid rgba(200,169,110,0.35)',
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'Orbitron, monospace',
              }}
            >
              <motion.div
                style={{ width: 5, height: 5, borderRadius: '50%', background: '#C8A96E', boxShadow: '0 0 6px #C8A96E' }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span style={{ color: '#C8A96E', fontSize: '0.42rem', letterSpacing: '0.2em' }}>STRATEGY HQ</span>
            </motion.button>
            )}
            {/* 상태 표시 */}
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
              <span style={{ fontFamily: 'Orbitron, monospace', color: accent, fontSize: isMobile ? '0.45rem' : '0.55rem', letterSpacing: '0.15em', opacity: 0.85 }}>
                {STATE_LABEL[state]}
              </span>
            </div>
          </div>
        </div>
      </motion.header>

      {/* ── 좌측 통계 패널 ── */}
      <motion.aside
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.2, duration: 1 }}
        style={isMobile ? {
          position: 'fixed',
          bottom: 28, left: 0, right: 0,
          zIndex: 20, pointerEvents: 'none',
          display: 'flex', flexDirection: 'row',
          justifyContent: 'center', gap: 6,
          padding: '0 10px',
        } : {
          position: 'fixed', left: 24, top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 20, pointerEvents: 'none',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? 6 : 8, flexWrap: isMobile ? 'wrap' : 'nowrap', justifyContent: isMobile ? 'center' : 'flex-start' }}>
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
              padding: isMobile ? '5px 8px' : '8px 14px',
              minWidth: isMobile ? 'auto' : '108px',
              flex: isMobile ? '1 1 0' : undefined,
              maxWidth: isMobile ? '80px' : undefined,
              backdropFilter: 'blur(8px)',
            }}>
              <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: isMobile ? '0.3rem' : '0.4rem', letterSpacing: '0.1em', marginBottom: '2px' }}>
                {item.label}
              </div>
              <div style={{ fontFamily: 'Orbitron, monospace', color: item.color, fontSize: isMobile ? '0.7rem' : '1rem', fontWeight: 600, letterSpacing: '0.03em' }}>
                {item.value}{item.unit}
              </div>
            </div>
          ))}
        </div>
      </motion.aside>

      {/* ── 대화 스트림 ── */}
      <div style={{
        position: 'fixed',
        // 타이핑 모드 활성 시 위로 올려서 갹침 방지
        bottom: textInputMode ? 160 : 0,
        left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '760px',
        padding: '0 28px 56px',
        zIndex: 25, pointerEvents: 'none',
        transition: 'bottom 0.25s ease',
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
                \u25C8  TOUCH TO ACTIVATE  \u25C8
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 타이핑 입력창 ── */}
      <AnimatePresence>
        {textInputMode && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.25 }}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              zIndex: 300,
              padding: '0 0 0 0',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 배경 블러 */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to top, rgba(0,8,20,0.97) 0%, rgba(0,8,20,0.85) 60%, transparent 100%)',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'relative', zIndex: 1,
              width: '100%', maxWidth: 680,
              padding: '20px 24px 28px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {/* 입력창 라벨 */}
              <div style={{
                fontFamily: 'Orbitron, monospace',
                color: THEME.blueLight,
                fontSize: '0.42rem',
                letterSpacing: '0.35em',
                opacity: 0.7,
                marginBottom: 2,
              }}>
                TEXT INPUT MODE
              </div>
              {/* 입력줄 */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{
                  flex: 1,
                  border: `1px solid ${THEME.blueLight}55`,
                  borderRadius: 4,
                  background: 'rgba(0, 180, 255, 0.04)',
                  boxShadow: `0 0 16px ${THEME.blueLight}18, inset 0 0 8px rgba(0,0,0,0.3)`,
                  display: 'flex', alignItems: 'center',
                  padding: '0 14px',
                  position: 'relative',
                }}>
                  {/* 주사 선 장식 */}
                  <div style={{
                    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                    width: 2, height: '60%', background: THEME.blueLight,
                    opacity: 0.6, borderRadius: 1,
                  }} />
                  <input
                    ref={textInputRef}
                    type="text"
                    value={textInputValue}
                    onChange={e => setTextInputValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && textInputValue.trim()) {
                        handleTextSubmit(textInputValue.trim());
                      }
                      if (e.key === 'Escape') {
                        setTextInputMode(false);
                        setTextInputValue('');
                      }
                    }}
                    placeholder="명령을 입력하세요... (Enter 제출, Esc 취소)"
                    autoFocus
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: THEME.text,
                      fontFamily: 'Orbitron, monospace',
                      fontSize: 'clamp(0.55rem, 1.4vw, 0.8rem)',
                      letterSpacing: '0.05em',
                      padding: '14px 0',
                      caretColor: THEME.blueLight,
                    }}
                  />
                </div>
                {/* 제출 버튼 */}
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => textInputValue.trim() && handleTextSubmit(textInputValue.trim())}
                  style={{
                    width: 44, height: 44,
                    borderRadius: 4,
                    border: `1px solid ${THEME.blueLight}66`,
                    background: textInputValue.trim() ? `rgba(0,180,255,0.15)` : 'rgba(0,180,255,0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: textInputValue.trim() ? `0 0 12px ${THEME.blueLight}30` : 'none',
                    transition: 'all 0.2s',
                    flexShrink: 0,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22 2L11 13" stroke={THEME.blueLight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke={THEME.blueLight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.div>
                {/* 닫기 버튼 */}
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setTextInputMode(false); setTextInputValue(''); }}
                  style={{
                    width: 44, height: 44,
                    borderRadius: 4,
                    border: `1px solid ${THEME.textDim}33`,
                    background: 'rgba(255,255,255,0.03)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6L18 18" stroke={THEME.textDim} strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </motion.div>
              </div>
              {/* 단축키 안내 */}
              <div style={{ display: 'flex', gap: 16 }}>
                {[['Enter', '제출'], ['Esc', '닫기'], ['Ctrl+K', '음성모드']].map(([key, desc]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{
                      fontFamily: 'Orbitron, monospace',
                      color: THEME.blueLight,
                      fontSize: '0.35rem',
                      letterSpacing: '0.1em',
                      border: `1px solid ${THEME.blueLight}44`,
                      padding: '1px 5px',
                      borderRadius: 2,
                      opacity: 0.7,
                    }}>{key}</span>
                    <span style={{ color: THEME.textDim, fontSize: '0.38rem', fontFamily: 'monospace', opacity: 0.6 }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 타이핑 모드 토글 버튼 (좌측 하단) ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 0.8 }}
        onClick={e => {
          e.stopPropagation();
          setTextInputMode(prev => !prev);
          if (!textInputMode) {
            setTimeout(() => textInputRef.current?.focus(), 80);
          }
        }}
        style={{
          position: 'fixed', bottom: 20, left: 20,
          zIndex: 50,
          width: 42, height: 42,
          borderRadius: 4,
          border: `1px solid ${textInputMode ? THEME.blueLight : THEME.textDim}55`,
          background: textInputMode ? `rgba(0,180,255,0.12)` : 'rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: textInputMode ? `0 0 14px ${THEME.blueLight}30` : 'none',
          transition: 'all 0.25s',
        }}
        title="타이핑 모드 (Ctrl+K)"
      >
        {/* 키보드 아이콘 */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="5" width="20" height="14" rx="2" stroke={textInputMode ? THEME.blueLight : THEME.textDim} strokeWidth="1.5" opacity="0.8"/>
          <path d="M6 9h1M9 9h1M12 9h1M15 9h1M18 9h1M6 12h1M9 12h1M12 12h1M15 12h1M6 15h6" stroke={textInputMode ? THEME.blueLight : THEME.textDim} strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
          <path d="M15 15h3" stroke={textInputMode ? THEME.blueLight : THEME.textDim} strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
        </svg>
      </motion.div>

      {/* ── 하단 시스템 상태 ── */}
      <motion.footer
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8, duration: 1 }}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          zIndex: 30, padding: '0 40px 16px',
          pointerEvents: 'none',
          display: isMobile ? 'none' : 'block',
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
          <HoloDataPanel
            type={dataPanel.type}
            progress={dataPanel.progress}
            message={dataPanel.message}
            bookingSteps={dataPanel.bookingSteps}
            actionLogs={dataPanel.actionLogs as any}
          />
        )}
      </AnimatePresence>

      {/* ── 인플루언서 카드 UI ── */}
      <InfluencerCards
        influencers={collectedInfluencers}
        visible={influencerCardsVisible}
        onClose={() => setInfluencerCardsVisible(false)}
      />

      {/* ── 지역업체 카드 UI ── */}
      <AnimatePresence>
        {businessCardsVisible && collectedBusinesses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 55,
              background: 'rgba(6,10,18,0.92)',
              backdropFilter: 'blur(12px)',
              overflowY: 'auto',
            }}
          >
            {/* 닫기 버튼 */}
            <div
              onClick={() => setBusinessCardsVisible(false)}
              style={{
                cursor: 'pointer',
                background: 'rgba(6,10,18,0.9)',
                border: '1px solid rgba(74,144,226,0.4)',
                borderLeft: '2px solid #4A90E2',
                padding: '6px 14px',
                backdropFilter: 'blur(8px)',
                fontFamily: 'Orbitron, monospace',
                color: '#4A90E2',
                fontSize: '0.42rem',
                letterSpacing: '0.2em',
              }}
            >CLOSE ×</div>
            <LocalBusinessCards
              businesses={collectedBusinesses}
              visible={true}
              onBook={(biz) => {
                setBusinessCardsVisible(false);
                const cmd = `${biz.name} 예약해줘`;
                addMessage('user', cmd);
                handleTextSubmit(cmd);
              }}
              onRecommendMore={() => {
                const lastKeyword = collectedBusinesses[0]?.keyword || '병원';
                const cmd = `${lastKeyword} 다른 곳 추천해줘`;
                setBusinessCardsVisible(false);
                addMessage('user', cmd);
                handleTextSubmit(cmd);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DALL-E 배너 이미지 팝업 ── */}
      <AnimatePresence>
        {bannerImage && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 60,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(6,10,18,0.88)',
              backdropFilter: 'blur(12px)',
            }}
            onClick={() => setBannerImage(null)}
          >
            <div style={{ position: 'relative', maxWidth: '80vw', maxHeight: '80vh' }}>
              <div style={{
                position: 'absolute', top: -28, left: 0,
                fontFamily: 'Orbitron, monospace',
                color: THEME.gold, fontSize: '0.55rem', letterSpacing: '0.3em',
              }}>AI GENERATED BANNER — CLICK TO CLOSE</div>
              <img
                src={bannerImage}
                alt="AI Generated Banner"
                style={{
                  maxWidth: '80vw', maxHeight: '75vh',
                  border: `1px solid ${THEME.gold}44`,
                  boxShadow: `0 0 60px ${THEME.gold}22`,
                  display: 'block',
                }}
              />
              <div style={{
                position: 'absolute', bottom: -28, right: 0,
                fontFamily: 'Orbitron, monospace',
                color: THEME.textDim, fontSize: '0.45rem', letterSpacing: '0.2em',
              }}>DALL-E 3 · MAWINPAY INTELLIGENCE</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 현재 목소리 표시 (우상단) ── */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.5, duration: 0.8 }}
        style={{
          position: 'fixed', top: 24, right: 28,
          zIndex: 30, pointerEvents: 'none',
          display: isMobile ? 'none' : 'block',
        }}
      >
        <div style={{
          background: 'rgba(6,10,18,0.75)',
          border: `1px solid ${THEME.gold}22`,
          borderLeft: `2px solid ${THEME.gold}55`,
          padding: '6px 12px',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.22em', marginBottom: '2px' }}>VOICE</div>
          <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.gold, fontSize: '0.65rem', letterSpacing: '0.1em' }}>{currentVoiceName}</div>
        </div>
      </motion.div>

      {/* ── 목소리 목록 패널 ── */}
      <AnimatePresence>
        {voiceListVisible && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            style={{
              position: 'fixed', top: 70, right: 28,
              zIndex: 40, pointerEvents: 'auto',
              maxHeight: '70vh', overflowY: 'auto',
            }}
          >
            <div style={{
              background: 'rgba(6,10,18,0.95)',
              border: `1px solid ${THEME.gold}33`,
              borderLeft: `2px solid ${THEME.gold}`,
              padding: '12px',
              backdropFilter: 'blur(16px)',
              minWidth: 220,
            }}>
              <div style={{
                fontFamily: 'Orbitron, monospace',
                color: THEME.gold,
                fontSize: '0.5rem',
                letterSpacing: '0.3em',
                marginBottom: '10px',
                borderBottom: `1px solid ${THEME.gold}22`,
                paddingBottom: '6px',
              }}>VOICE SELECTION</div>
              {ELEVENLABS_VOICES.map(v => (
                <div
                  key={v.id}
                  onClick={() => {
                    setCurrentVoiceId(v.id);
                    setCurrentVoiceName(v.name);
                    setVoiceListVisible(false);
                    const sampleText = `안녕하세요, 토니. ${v.name} 목소리로 변경되었습니다.`;
                    addMessage('jarvis', sampleText);
                    setState('speaking');
                    startSpeakingLevel();
                    speak(sampleText, undefined, () => {
                      stopSpeakingLevel();
                      setState('listening');
                      setIsListening(true);
                    }, v.id);
                  }}
                  style={{
                    padding: '6px 8px',
                    marginBottom: 4,
                    cursor: 'pointer',
                    background: currentVoiceName === v.name ? `${THEME.gold}15` : 'transparent',
                    border: currentVoiceName === v.name ? `1px solid ${THEME.gold}44` : '1px solid transparent',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${THEME.gold}10`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = currentVoiceName === v.name ? `${THEME.gold}15` : 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: currentVoiceName === v.name ? THEME.gold : THEME.textDim,
                      flexShrink: 0,
                    }} />
                    <div>
                      <div style={{ fontFamily: 'Orbitron, monospace', color: currentVoiceName === v.name ? THEME.gold : THEME.text, fontSize: '0.6rem', letterSpacing: '0.1em' }}>
                        {v.name}
                      </div>
                      <div style={{ color: THEME.textDim, fontSize: '0.45rem', marginTop: 1 }}>
                        {v.gender} · {v.accent}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div
                onClick={() => setVoiceListVisible(false)}
                style={{
                  marginTop: 8,
                  padding: '5px 8px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  fontFamily: 'Orbitron, monospace',
                  color: THEME.textDim,
                  fontSize: '0.42rem',
                  letterSpacing: '0.2em',
                  borderTop: `1px solid ${THEME.gold}22`,
                  paddingTop: 8,
                }}
              >CLOSE</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Settings 버튼 (좌상단) ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2, duration: 0.6 }}
        style={{ position: 'fixed', top: isMobile ? 14 : 20, left: isMobile ? 10 : 28, zIndex: 50, display: 'flex', gap: 6 }}
      >
        <div
          onClick={() => { setSettingsVisible(v => !v); setMemoryPanelVisible(false); }}
          style={{
            cursor: 'pointer',
            background: 'rgba(6,10,18,0.8)',
            border: `1px solid ${THEME.gold}33`,
            padding: '5px 10px',
            backdropFilter: 'blur(8px)',
            fontFamily: 'Orbitron, monospace',
            color: settingsVisible ? THEME.gold : THEME.textDim,
            fontSize: isMobile ? '0.38rem' : '0.42rem',
            letterSpacing: '0.12em',
            transition: 'color 0.2s',
          }}
        >SETTINGS</div>
        <div
          onClick={() => { setMemoryPanelVisible(v => !v); setSettingsVisible(false); setMemoryStats(getMemoryStats()); setLearnedKnowledge(getLearnedKnowledge()); }}
          style={{
            cursor: 'pointer',
            background: 'rgba(6,10,18,0.8)',
            border: `1px solid #9B8EC433`,
            padding: '5px 10px',
            backdropFilter: 'blur(8px)',
            fontFamily: 'Orbitron, monospace',
            color: memoryPanelVisible ? '#9B8EC4' : THEME.textDim,
            fontSize: isMobile ? '0.38rem' : '0.42rem',
            letterSpacing: '0.12em',
            transition: 'color 0.2s',
          }}
        >MEMORY</div>
      </motion.div>

      {/* ── Settings 패널 ── */}
      <AnimatePresence>
        {settingsVisible && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed', top: 'clamp(46px, 7vw, 52px)', left: 'clamp(10px, 3vw, 28px)',
              zIndex: 50, pointerEvents: 'auto',
              minWidth: 'min(320px, calc(100vw - 20px))',
              maxWidth: 'calc(100vw - 20px)',
              maxHeight: 'calc(100vh - 70px)',
              overflowY: 'auto',
            }}
          >
            <div style={{
              background: 'rgba(6,10,18,0.97)',
              border: `1px solid ${THEME.gold}44`,
              borderTop: `2px solid ${THEME.gold}`,
              padding: '16px',
              backdropFilter: 'blur(20px)',
            }}>
              <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.gold, fontSize: '0.5rem', letterSpacing: '0.3em', marginBottom: 14, borderBottom: `1px solid ${THEME.gold}22`, paddingBottom: 8 }}>SYSTEM SETTINGS</div>

              {/* Google Gemini Key */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: '#4285F4', fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>GOOGLE GEMINI API KEY</div>
                <input
                  type="password"
                  placeholder="AIza..."
                  value={settingsForm.geminiKey || ''}
                  onChange={e => {
                    const key = e.target.value;
                    setSettingsForm(f => ({ ...f, geminiKey: key }));
                    if (key) initializeGemini(key);
                  }}
                  style={{
                    width: '100%', padding: '6px 10px',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid #4285F433`,
                    color: THEME.text,
                    fontFamily: 'monospace',
                    fontSize: '0.55rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* OpenAI Key (레거시) */}
              <div style={{ marginBottom: 12, opacity: 0.6 }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>OPENAI API KEY (레거시)</div>
                <input
                  type="password"
                  placeholder="sk-... (선택사항)"
                  value={settingsForm.openaiKey}
                  onChange={e => setSettingsForm(f => ({ ...f, openaiKey: e.target.value }))}
                  style={{
                    width: '100%', padding: '6px 10px',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${THEME.gold}33`,
                    color: THEME.text,
                    fontFamily: 'monospace',
                    fontSize: '0.55rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* ElevenLabs Key */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>ELEVENLABS API KEY</div>
                <input
                  type="password"
                  placeholder="여기에 ElevenLabs 키 입력..."
                  value={settingsForm.elevenLabsKey}
                  onChange={e => setSettingsForm(f => ({ ...f, elevenLabsKey: e.target.value }))}
                  style={{
                    width: '100%', padding: '6px 10px',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${THEME.gold}33`,
                    color: THEME.text,
                    fontFamily: 'monospace',
                    fontSize: '0.55rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* 네이버 로그인 정보 (예약 자동화용) */}
              <div style={{ marginBottom: 12, paddingTop: 10, borderTop: `1px solid ${THEME.gold}22` }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: '#4A90E2', fontSize: '0.45rem', letterSpacing: '0.3em', marginBottom: 8 }}>NAVER BOOKING CREDENTIALS</div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>NAVER ID</div>
                  <input
                    type="text"
                    placeholder="네이버 아이디 입력..."
                    value={naverForm.username}
                    onChange={e => setNaverForm(f => ({ ...f, username: e.target.value }))}
                    style={{
                      width: '100%', padding: '6px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid #4A90E233`,
                      color: THEME.text,
                      fontFamily: 'monospace',
                      fontSize: '0.55rem',
                      outline: 'none',
                      boxSizing: 'border-box' as const,
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>NAVER PASSWORD</div>
                  <input
                    type="password"
                    placeholder="네이버 비밀번호 입력..."
                    value={naverForm.password}
                    onChange={e => setNaverForm(f => ({ ...f, password: e.target.value }))}
                    style={{
                      width: '100%', padding: '6px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid #4A90E233`,
                      color: THEME.text,
                      fontFamily: 'monospace',
                      fontSize: '0.55rem',
                      outline: 'none',
                      boxSizing: 'border-box' as const,
                    }}
                  />
                </div>
                <div style={{ marginTop: 4, fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.1em' }}>
                  예약 자동화 시 네이버 로그인에 사용됩니다.
                </div>

                {/* 크롬 확장 로그인 버튼 (항상 표시) */}
                <div style={{ marginTop: 10 }}>
                    <div
                      onClick={async () => {
                        // 크롬 확장으로 네이버 쿠키 추출
                        setNaverLoginStatus('waiting');
                        window.postMessage({ source: 'JARVIS_APP', type: 'GET_NAVER_COOKIES', payload: { naverID: naverForm.username } }, '*');
                        // 결과 대기
                        const result = await new Promise<any>((resolve) => {
                          const handler = (e: MessageEvent) => {
                            if (e.data?.source === 'JARVIS_EXTENSION' && e.data?.type === 'NAVER_COOKIES_RESPONSE') {
                              window.removeEventListener('message', handler);
                              resolve(e.data.payload);
                            }
                          };
                          window.addEventListener('message', handler);
                          setTimeout(() => { window.removeEventListener('message', handler); resolve({ success: false, error: 'timeout' }); }, 10000);
                        });
                        if (result.success && result.cookies) {
                          // 쿠키 배열을 받았으면 프론트에서 서버로 전송
                          try {
                            const saveRes = await fetch(`${BOOKING_SERVER}/api/booking/save-cookies`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ naverID: result.naverID || naverForm.username || 'chrome_user', cookies: result.cookies }),
                            });
                            const saveData = await saveRes.json();
                            if (saveData.success && saveData.sessionId) {
                              setBookingSessionId(saveData.sessionId);
                              localStorage.setItem('jarvis_booking_session', saveData.sessionId);
                              setNaverLoginStatus('done');
                              setSettingsVisible(false);
                              const loginDoneMsg = `접속 확인됐습니다, 토니. 크롬 세션으로 네이버 로그인 완료. 쿠키 ${result.cookieCount}개 확인. 언제든 명령하십시오, sir.`;
                              addMessage('jarvis', loginDoneMsg, true);
                              setState('speaking');
                              startSpeakingLevel();
                              speak(loginDoneMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                            } else {
                              throw new Error(saveData.error || '서버 저장 실패');
                            }
                          } catch (fetchErr: any) {
                            setNaverLoginStatus('error');
                            const errMsg = `서버 연결 실패: ${fetchErr.message}. 서버가 실행 중인지 확인해 주세요.`;
                            addMessage('jarvis', errMsg, true);
                            setState('speaking');
                            startSpeakingLevel();
                            speak(errMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                          }
                        } else if (result.success && result.sessionId) {
                          // 이전 방식 호환성
                          setBookingSessionId(result.sessionId);
                          localStorage.setItem('jarvis_booking_session', result.sessionId);
                          setNaverLoginStatus('done');
                          setSettingsVisible(false);
                          const loginDoneMsg = `접속 확인됐습니다, 토니. 크롬 세션으로 네이버 로그인 완료. 언제든 명령하십시오, sir.`;
                          addMessage('jarvis', loginDoneMsg, true);
                          setState('speaking');
                          startSpeakingLevel();
                          speak(loginDoneMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                        } else {
                          setNaverLoginStatus('error');
                          // 쿠키 없으면 네이버 로그인 탭 열기
                          window.postMessage({ source: 'JARVIS_APP', type: 'OPEN_NAVER_LOGIN' }, '*');
                          const errMsg = result.error?.includes('쿠키가 없습니다') || result.error?.includes('쿠키가 없습니다')
                            ? '토니, 네이버에 로그인된 세션이 없습니다. 열린 네이버 탭에서 로그인해 주세요. 완료되면 자동으로 처리됩니다.'
                            : `크롬 확장 로그인 실패: ${result.error || '알 수 없는 오류'}. 네이버 탭에서 로그인 후 다시 시도해 주세요.`;
                          addMessage('jarvis', errMsg, true);
                          setState('speaking');
                          startSpeakingLevel();
                          speak(errMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                        }
                      }}
                      style={{
                        padding: '8px 12px', textAlign: 'center', cursor: 'pointer',
                        background: 'rgba(0,200,100,0.15)',
                        border: '1px solid #00C86455',
                        fontFamily: 'Orbitron, monospace',
                        color: '#00C864',
                        fontSize: '0.42rem', letterSpacing: '0.2em',
                        marginBottom: 6,
                      }}
                    >
                      [PLUG] 크롬 확장으로 로그인 (추천)
                    </div>
                    <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.1em', marginBottom: 8 }}>
                      {(window as any).__JARVIS_EXTENSION_CONNECTED__
                        ? '[OK] 확장 연결됨 — 이미 로그인된 크롬 세션 사용 (캡차 없음)'
                        : '[!] 확장 미설치 — 아래 ZIP 설치 후 사용 가능'}
                    </div>
                  </div>

              {/* 네이버 팝업 로그인 버튼 */}
                <div style={{ marginTop: 10 }}>
                  <div
                    onClick={async () => {
                      if (naverLoginStatus === 'waiting') return;
                      const id = naverForm.username;
                      const pw = naverForm.password;
                      if (!id || !pw) {
                        alert('NAVER ID와 비밀번호를 먼저 입력해주세요.');
                        return;
                      }
                      setNaverLoginStatus('waiting');
                      try {
                        const res = await fetch(`${BOOKING_SERVER}/api/booking/login`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ naverID: id, naverPW: pw }),
                        });
                        const data = await res.json();
                        if (data.success && data.sessionId) {
                          // 로그인 성공
                          setBookingSessionId(data.sessionId);
                          localStorage.setItem('jarvis_booking_session', data.sessionId);
                          setNaverLoginStatus('done');
                          setSettingsVisible(false);
                          const loginDoneMsg = `접속 확인됐습니다, 토니. 네이버 세션 온라인. 언제든 명령하십시오, sir.`;
                          addMessage('jarvis', loginDoneMsg, true);
                          setState('speaking');
                          startSpeakingLevel();
                          speak(loginDoneMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                        } else if (data.needVerification && data.verificationType === 'captcha') {
                          // 캐시 필요 → 모달 열고 코드 요청
                          setNaverLoginStatus('idle');
                          setSettingsVisible(false); // 세팅스 닫기
                          const captchaImg = data.captchaSrc || data.screenshot || null;
                          if (captchaImg) setCaptchaScreenshot(captchaImg);
                          setVerificationMode('captcha'); // 모달 표시
                          const captchaMsg = '토니, 네이버 로그인 중 자동입력 방지 문자가 표시되었습니다. 화면에 보이는 문자를 말씨해주세요, sir.';
                          addMessage('jarvis', captchaMsg, true);
                          setState('speaking');
                          startSpeakingLevel();
                          speak(captchaMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                        } else if (data.needVerification && data.verificationType === 'otp') {
                          // 2단계 인증 필요 → 모달 열고 코드 요청
                          setNaverLoginStatus('idle');
                          setSettingsVisible(false); // 세팅스 닫기
                          if (data.pendingSessionId) setPendingSessionId(data.pendingSessionId);
                          const otpScreenshot = data.screenshot || null;
                          if (otpScreenshot) setCaptchaScreenshot(otpScreenshot);
                          setVerificationMode('otp'); // 모달 표시
                          const otpMsg = '토니, 네이버에서 추가 인증이 필요합니다. 화면을 확인하고 인증번호를 말씨해주세요, sir.';
                          addMessage('jarvis', otpMsg, true);
                          setState('speaking');
                          startSpeakingLevel();
                          speak(otpMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                        } else {
                          setNaverLoginStatus('error');
                          const errMsg = data.message || '로그인에 실패했습니다, 토니. 아이디와 비밀번호를 확인해주세요.';
                          addMessage('jarvis', errMsg, true);
                          setState('speaking');
                          startSpeakingLevel();
                          speak(errMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                        }
                      } catch {
                        setNaverLoginStatus('error');
                      }
                    }}
                    style={{
                      padding: '8px 12px', textAlign: 'center', cursor: 'pointer',
                      background: naverLoginStatus === 'done' ? 'rgba(34,197,94,0.15)' : 'rgba(74,144,226,0.15)',
                      border: `1px solid ${naverLoginStatus === 'done' ? '#22C55E' : '#4A90E2'}55`,
                      fontFamily: 'Orbitron, monospace',
                      color: naverLoginStatus === 'done' ? '#22C55E' : '#4A90E2',
                      fontSize: '0.42rem', letterSpacing: '0.2em',
                    }}
                  >
                    {naverLoginStatus === 'done' ? '[OK] NAVER LOGGED IN' :
                     naverLoginStatus === 'waiting' ? '\u23F3 로그인 진행 중...' :
                     naverLoginStatus === 'error' ? '[X] 로그인 실패 - 재시도' :
                     '[LOCK] NAVER 자동 로그인'}
                  </div>
                  {naverLoginStatus === 'done' && bookingSessionId && (
                    <div style={{ marginTop: 4, fontFamily: 'Orbitron, monospace', color: '#22C55E', fontSize: '0.3rem', letterSpacing: '0.1em' }}>
                      [OK] 세션 활성: {bookingSessionId.slice(0, 8)}...
                    </div>
                  )}
                </div>
              </div>

              {/* 예약자 정보 */}
              <div style={{ marginBottom: 12, paddingTop: 10, borderTop: `1px solid ${THEME.gold}22` }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: '#4A90E2', fontSize: '0.45rem', letterSpacing: '0.3em', marginBottom: 8 }}>BOOKING PROFILE</div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>예약자명</div>
                  <input
                    type="text"
                    placeholder="예약자 이름 입력..."
                    value={naverForm.userName}
                    onChange={e => setNaverForm(f => ({ ...f, userName: e.target.value }))}
                    style={{
                      width: '100%', padding: '6px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid #4A90E233`,
                      color: THEME.text,
                      fontFamily: 'monospace',
                      fontSize: '0.55rem',
                      outline: 'none',
                      boxSizing: 'border-box' as const,
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>연락처</div>
                  <input
                    type="tel"
                    placeholder="010-0000-0000"
                    value={naverForm.userPhone}
                    onChange={e => setNaverForm(f => ({ ...f, userPhone: e.target.value }))}
                    style={{
                      width: '100%', padding: '6px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid #4A90E233`,
                      color: THEME.text,
                      fontFamily: 'monospace',
                      fontSize: '0.55rem',
                      outline: 'none',
                      boxSizing: 'border-box' as const,
                    }}
                  />
                </div>
                <div style={{ marginTop: 4, fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.1em' }}>
                  예약 폼 자동 입력 시 사용됩니다.
                </div>
              </div>

              {/* 저장 버튼 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div
                  onClick={() => {
                    const keys = {
                      openaiKey: settingsForm.openaiKey,
                      elevenLabsKey: settingsForm.elevenLabsKey,
                    };
                    localStorage.setItem('jarvis_api_keys', JSON.stringify(settingsForm));
      if (settingsForm.geminiKey) {
        initializeGemini(settingsForm.geminiKey);
      }             localStorage.setItem('jarvis_naver_creds', JSON.stringify({
                      username: naverForm.username,
                      password: naverForm.password,
                      userName: naverForm.userName,
                      userPhone: naverForm.userPhone,
                    }));
                    setSettingsVisible(false);
                    // 저장 후 자비스 음성 안내 (리로드 없이 즉시 적용)
                    const savedMsg = naverForm.username
                      ? `설정이 저장되었습니다, 토니. 네이버 아이디 ${naverForm.username}으로 로그인 정보가 등록되었습니다. 이제 예약 자동화를 사용할 수 있습니다.`
                      : `설정이 저장되었습니다, 토니.`;
                    addMessage('jarvis', savedMsg, true);
                    setState('speaking');
                    startSpeakingLevel();
                    speak(savedMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                  }}
                  style={{
                    flex: 1, padding: '7px', textAlign: 'center', cursor: 'pointer',
                    background: `${THEME.gold}22`,
                    border: `1px solid ${THEME.gold}55`,
                    fontFamily: 'Orbitron, monospace',
                    color: THEME.gold, fontSize: '0.42rem', letterSpacing: '0.2em',
                  }}
                >SAVE &amp; RELOAD</div>
                <div
                  onClick={() => setSettingsVisible(false)}
                  style={{
                    padding: '7px 14px', textAlign: 'center', cursor: 'pointer',
                    border: `1px solid ${THEME.textDim}33`,
                    fontFamily: 'Orbitron, monospace',
                    color: THEME.textDim, fontSize: '0.42rem', letterSpacing: '0.2em',
                  }}
                >CANCEL</div>
              </div>

              <div style={{ marginTop: 10, fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.35rem', letterSpacing: '0.1em', lineHeight: 1.6 }}>
                키는 브라우저 LocalStorage에만 저장됩니다. 서버로 전송되지 않습니다.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Memory 패널 ── */}
      <AnimatePresence>
        {memoryPanelVisible && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed', top: 'clamp(46px, 7vw, 52px)', left: 'clamp(10px, 3vw, 28px)',
              zIndex: 50, pointerEvents: 'auto',
              minWidth: 'min(300px, calc(100vw - 20px))', maxWidth: 'calc(100vw - 20px)', maxHeight: '70vh', overflowY: 'auto',
            }}
          >
            <div style={{
              background: 'rgba(6,10,18,0.97)',
              border: `1px solid #9B8EC444`,
              borderTop: '2px solid #9B8EC4',
              padding: '16px',
              backdropFilter: 'blur(20px)',
            }}>
              <div style={{ fontFamily: 'Orbitron, monospace', color: '#9B8EC4', fontSize: '0.5rem', letterSpacing: '0.3em', marginBottom: 10, borderBottom: `1px solid #9B8EC422`, paddingBottom: 8 }}>MEMORY SYSTEM</div>

              {/* 통계 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'TOTAL TURNS', value: memoryStats.totalTurns },
                  { label: 'SESSIONS', value: memoryStats.totalSessions },
                  { label: 'KNOWLEDGE', value: memoryStats.knowledgeCount },
                  { label: 'SINCE', value: memoryStats.oldestEntry || 'NEW' },
                ].map(stat => (
                  <div key={stat.label} style={{ background: 'rgba(155,142,196,0.08)', border: '1px solid #9B8EC422', padding: '6px 8px' }}>
                    <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.2em' }}>{stat.label}</div>
                    <div style={{ fontFamily: 'Orbitron, monospace', color: '#9B8EC4', fontSize: '0.6rem', marginTop: 2 }}>{stat.value}</div>
                  </div>
                ))}
              </div>

              {/* 학습된 지식 */}
              {learnedKnowledge.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 8 }}>LEARNED KNOWLEDGE</div>
                  {learnedKnowledge.map(k => (
                    <div key={k.id} style={{ padding: '5px 8px', marginBottom: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.gold, fontSize: '0.4rem', letterSpacing: '0.1em' }}>{k.title}</div>
                      <div style={{ color: THEME.text, fontSize: '0.5rem', marginTop: 2 }}>{k.content}</div>
                      <div style={{ color: THEME.textDim, fontSize: '0.35rem', marginTop: 1 }}>{k.source === 'auto' ? 'AUTO-EXTRACTED' : 'MANUAL'}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 직접 지식 추가 */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 6 }}>ADD KNOWLEDGE MANUALLY</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input
                    id="know-title"
                    placeholder="제목 (ex: 내 이름)"
                    style={{
                      flex: 1, padding: '5px 8px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: THEME.text, fontSize: '0.5rem', outline: 'none',
                    }}
                  />
                  <input
                    id="know-content"
                    placeholder="내용"
                    style={{
                      flex: 2, padding: '5px 8px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: THEME.text, fontSize: '0.5rem', outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div
                    onClick={() => {
                      const titleEl = document.getElementById('know-title') as HTMLInputElement;
                      const contentEl = document.getElementById('know-content') as HTMLInputElement;
                      if (titleEl?.value && contentEl?.value) {
                        saveLearnedKnowledge(titleEl.value, contentEl.value, 'manual');
                        setLearnedKnowledge(getLearnedKnowledge());
                        titleEl.value = ''; contentEl.value = '';
                      }
                    }}
                    style={{
                      flex: 1, padding: '6px', textAlign: 'center', cursor: 'pointer',
                      background: 'rgba(155,142,196,0.15)',
                      border: '1px solid #9B8EC455',
                      fontFamily: 'Orbitron, monospace',
                      color: '#9B8EC4', fontSize: '0.38rem', letterSpacing: '0.15em',
                    }}
                  >ADD</div>
                  <div
                    onClick={() => {
                      if (confirm('모든 메모리를 삭제하시겠습니까?')) {
                        clearAllMemory();
                        setLearnedKnowledge([]);
                        setMemoryStats(getMemoryStats());
                      }
                    }}
                    style={{
                      padding: '6px 10px', textAlign: 'center', cursor: 'pointer',
                      border: '1px solid rgba(239,68,68,0.3)',
                      fontFamily: 'Orbitron, monospace',
                      color: '#EF4444', fontSize: '0.38rem', letterSpacing: '0.15em',
                    }}
                  >CLEAR ALL</div>
                </div>
              </div>

              <div
                onClick={() => setMemoryPanelVisible(false)}
                style={{
                  padding: '6px', textAlign: 'center', cursor: 'pointer',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: 10, marginTop: 4,
                  fontFamily: 'Orbitron, monospace',
                  color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em',
                }}
              >CLOSE</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 네이버 검색 결과 패널 ── */}
      <AnimatePresence>
        {naverPanelVisible && naverResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            style={{
              position: 'fixed', top: 80, right: 28,
              zIndex: 36, width: 280,
              background: 'rgba(6,10,18,0.95)',
              border: `1px solid ${THEME.blue}44`,
              borderLeft: `2px solid ${THEME.blue}`,
              backdropFilter: 'blur(12px)',
              maxHeight: '70vh',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* 헤더 */}
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${THEME.blue}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.blue, fontSize: '0.4rem', letterSpacing: '0.25em' }}>NAVER SEARCH</div>
                <div style={{ color: THEME.text, fontSize: '0.55rem', marginTop: 2 }}>'{naverKeyword}' — {naverResults.length}건</div>
              </div>
              <div
                onClick={() => setNaverPanelVisible(false)}
                style={{ cursor: 'pointer', color: THEME.textDim, fontSize: '0.5rem', padding: '2px 6px', border: `1px solid ${THEME.textDim}33` }}
              >×</div>
            </div>

            {/* 결과 리스트 */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
              {naverResults.map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 14px',
                    borderBottom: `1px solid rgba(255,255,255,0.04)`,
                    cursor: 'pointer',
                  }}
                  onClick={() => window.open(item.url, '_blank')}
                >
                  <div style={{ color: THEME.text, fontSize: '0.52rem', lineHeight: 1.4, marginBottom: 2 }}>
                    {item.title.length > 35 ? item.title.substring(0, 35) + '…' : item.title}
                  </div>
                  <div style={{ color: THEME.blue, fontSize: '0.42rem', marginBottom: 2 }}>
                    {item.creatorName}
                  </div>
                  <div style={{ color: THEME.textDim, fontSize: '0.38rem' }}>
                    {item.description.length > 50 ? item.description.substring(0, 50) + '…' : item.description}
                  </div>
                </div>
              ))}
            </div>

            {/* 하단 버튼 */}
            <div style={{ padding: '8px 14px', borderTop: `1px solid ${THEME.blue}22`, display: 'flex', gap: 6 }}>
              <div
                onClick={async () => {
                  const collectedAt = new Date().toLocaleString('ko-KR');
                  const sheetData: NaverCollectedData[] = naverResults.map(item => ({
                    title: item.title,
                    author: item.creatorName,
                    link: item.url,
                    description: item.description,
                    type: 'blog',
                    keyword: naverKeyword,
                    collectedAt,
                  }));
                  const res = await appendNaverResultsToSheet(sheetData);
                  const msg = res.success
                    ? `${res.count}건 구글 시트 저장 완료`
                    : '구글 시트 저장 실패 (Webhook URL 확인 필요)';
                  addMessage('jarvis', msg);
                  speak(msg);
                }}
                style={{
                  flex: 1, padding: '6px', textAlign: 'center', cursor: 'pointer',
                  background: `rgba(3,199,90,0.12)`, border: `1px solid rgba(3,199,90,0.4)`,
                  fontFamily: 'Orbitron, monospace', color: '#03c75a', fontSize: '0.38rem', letterSpacing: '0.15em',
                }}
              >시트 저장</div>
              <div
                onClick={() => {
                  const csv = [
                    ['\uc81c목', '작성자', 'URL', '설명', '날짜'].join(','),
                    ...naverResults.map(r => [
                      `"${r.title.replace(/"/g, '""')}"`,
                      `"${r.creatorName}"`,
                      `"${r.url}"`,
                      `"${r.description.replace(/"/g, '""')}"`,
                      `"${r.postDate}"`
                    ].join(','))
                  ].join('\n');
                  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `naver-${naverKeyword}-${new Date().toISOString().split('T')[0]}.csv`;
                  a.click();
                }}
                style={{
                  flex: 1, padding: '6px', textAlign: 'center', cursor: 'pointer',
                  background: `${THEME.blue}22`, border: `1px solid ${THEME.blue}55`,
                  fontFamily: 'Orbitron, monospace', color: THEME.blue, fontSize: '0.38rem', letterSpacing: '0.15em',
                }}
              >CSV 다운로드</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 예약 진행 상황 바 ── */}
      <AnimatePresence>
        {bookingStep > 0 && bookingStep < 5 && (
          <motion.div
            key="booking-progress"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'fixed', top: 68, left: '50%', transform: 'translateX(-50%)',
              zIndex: 40, pointerEvents: 'none',
              width: 'clamp(300px, 80vw, 600px)',
            }}
          >
            <div style={{
              background: 'rgba(6,10,18,0.92)',
              border: `1px solid #4A90E244`,
              borderTop: `2px solid #4A90E2`,
              padding: '10px 16px',
              backdropFilter: 'blur(20px)',
            }}>
              {/* 제목 */}
              <div style={{
                fontFamily: 'Orbitron, monospace', color: '#4A90E2',
                fontSize: '0.42rem', letterSpacing: '0.3em', marginBottom: 8,
              }}>BOOKING PROGRESS</div>
              {/* 단계 바 */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {[
                  { step: 1, label: '로그인' },
                  { step: 2, label: '시간조회' },
                  { step: 3, label: '확인' },
                  { step: 4, label: '폼입력' },
                  { step: 5, label: '완료' },
                ].map((item, idx) => {
                  const isDone = bookingStep > item.step;
                  const isActive = bookingStep === item.step;
                  const color = isDone ? '#7EC89B' : isActive ? '#4A90E2' : '#334155';
                  return (
                    <>
                      <div key={item.step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
                        <motion.div
                          animate={isActive ? { opacity: [1, 0.4, 1], boxShadow: [`0 0 6px ${color}`, `0 0 2px ${color}`, `0 0 6px ${color}`] } : {}}
                          transition={{ duration: 1.2, repeat: Infinity }}
                          style={{
                            width: '100%', height: 4,
                            background: color,
                            borderRadius: 2,
                          }}
                        />
                        <span style={{
                          fontFamily: 'Orbitron, monospace',
                          color: isActive ? '#4A90E2' : isDone ? '#7EC89B' : '#334155',
                          fontSize: '0.35rem', letterSpacing: '0.1em',
                          whiteSpace: 'nowrap',
                        }}>
                          {isDone ? ' ' : isActive ? '\u25B6 ' : ''}{item.label}
                        </span>
                      </div>
                      {idx < 4 && (
                        <div key={`sep-${item.step}`} style={{ width: 6, height: 4, background: isDone ? '#7EC89B44' : '#33415544', borderRadius: 1, flexShrink: 0 }} />
                      )}
                    </>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 캡차/2단계 인증 화면 ── */}
      <AnimatePresence>
        {captchaScreenshot && verificationMode && (
          <motion.div
            key="captcha-modal"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{
              background: 'rgba(6,10,18,0.98)',
              border: '1px solid #4A90E2',
              borderTop: '3px solid #4A90E2',
              width: 'clamp(320px, 95vw, 560px)',
              maxHeight: '90vh',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              {/* ── 상단 고정: 타이틀 + 질문 ── */}
              <div style={{ padding: '16px 20px 12px', flexShrink: 0, borderBottom: '1px solid #4A90E244' }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: '#4A90E2', fontSize: '0.5rem', letterSpacing: '0.3em', marginBottom: 10 }}>
                  {verificationMode === 'captcha' ? 'CAPTCHA REQUIRED' : '2-STEP VERIFICATION'}
                </div>
                <div style={{ color: '#FFD700', fontSize: '1rem', fontWeight: 'bold', lineHeight: 1.6, background: 'rgba(255,215,0,0.1)', padding: '10px 12px', borderRadius: 6, border: '1px solid #FFD70055' }}>
                  {verificationMode === 'captcha'
                    ? '[LIST] 아래 이미지에서 질문을 확인하고 답을 입력하세요'
                    : '[LOCK] 아래 화면의 인증 질문을 확인하고 답하세요'}
                </div>
              </div>
              {/* ── 중간 스크롤: 스크린샷 ── */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
                <img
                  src={captchaScreenshot}
                  alt="네이버 인증 화면"
                  style={{ width: '100%', borderRadius: 6, border: '2px solid #4A90E2', display: 'block' }}
                />
              </div>
              {/* ── 하단 고정: 직접 입력창 + 전송 버튼 ── */}
              <div style={{ padding: '12px 20px 16px', flexShrink: 0, borderTop: '1px solid #4A90E244', background: 'rgba(74,144,226,0.08)' }}>
                <div style={{ color: '#4A90E2', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: 8 }}>
                  {verificationMode === 'captcha' ? ' 위 이미지의 답을 입력하세요' : ' 위 화면의 인증번호를 입력하세요'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="captchaDirectInput"
                    type="text"
                    autoFocus
                    placeholder="정답을 입력하세요..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (!val) return;
                        if (verificationResolveRef.current) {
                          const resolve = verificationResolveRef.current;
                          verificationResolveRef.current = null;
                          addMessage('user', val);
                          setCaptchaScreenshot(null);
                          setVerificationMode(null);
                          setState('working');
                          resolve(val.replace(/\s/g, '').trim());
                        } else {
                          // resolve가 없으면 일반 텍스트 제출로 처리
                          setCaptchaScreenshot(null);
                          setVerificationMode(null);
                          handleTextSubmit(val);
                        }
                      }
                    }}
                    style={{
                      flex: 1, padding: '10px 12px',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid #4A90E2',
                      color: '#fff', fontSize: '1rem',
                      outline: 'none', borderRadius: 4,
                      fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById('captchaDirectInput') as HTMLInputElement;
                      const val = input?.value?.trim();
                      if (!val) return;
                      if (verificationResolveRef.current) {
                        const resolve = verificationResolveRef.current;
                        verificationResolveRef.current = null;
                        addMessage('user', val);
                        setCaptchaScreenshot(null);
                        setVerificationMode(null);
                        setState('working');
                        resolve(val.replace(/\s/g, '').trim());
                      } else {
                        setCaptchaScreenshot(null);
                        setVerificationMode(null);
                        handleTextSubmit(val);
                      }
                    }}
                    style={{
                      padding: '10px 18px',
                      background: '#4A90E2',
                      border: 'none', color: '#fff',
                      fontSize: '1rem', cursor: 'pointer',
                      borderRadius: 4, fontWeight: 'bold',
                    }}
                  >→</button>
                </div>
                <div style={{ color: '#9BA1A6', fontSize: '0.65rem', marginTop: 6 }}>
                  Enter 키 또는 화살표 버튼으로 제울 • 음성으로도 답할 수 있습니다
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 네이버 직접 로그인 웹븷 모달 ── */}
      <AnimatePresence>
        {naverLoginWebview && (
          <motion.div
            key="naver-webview-modal"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
            }}
          >
            <div style={{
              background: 'rgba(6,10,18,0.99)',
              border: '1px solid #4A90E2',
              borderTop: '3px solid #4A90E2',
              padding: '20px',
              width: 'clamp(320px, 90vw, 520px)',
              maxHeight: '90vh',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: '#4A90E2', fontSize: '0.5rem', letterSpacing: '0.3em' }}>
                  NAVER LOGIN
                </div>
                <div
                  onClick={() => { setNaverLoginWebview(false); setNaverLoginStatus('idle'); setNaverLoginScreenshot(null); }}
                  style={{ cursor: 'pointer', color: '#9BA1A6', fontSize: '1.2rem', lineHeight: 1 }}
                >×</div>
              </div>
              <div style={{ color: '#9BA1A6', fontSize: '0.75rem', lineHeight: 1.5 }}>
                아래 화면에서 네이버 로그인하세요. 로그인 완료 시 자동으로 감지됩니다.
              </div>
              {/* 스크린샷 표시 영역 */}
              {naverLoginScreenshot ? (
                <div
                  style={{ position: 'relative', cursor: 'pointer', border: '1px solid #4A90E244', borderRadius: 4, overflow: 'hidden' }}
                  onClick={async (e) => {
                    if (!naverLoginPendingId) return;
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const img = e.currentTarget.querySelector('img') as HTMLImageElement;
                    if (!img) return;
                    // 실제 브라우저 컨버스 크기(480x700)로 좌표 변환
                    const scaleX = 480 / img.clientWidth;
                    const scaleY = 700 / img.clientHeight;
                    const x = Math.round((e.clientX - rect.left) * scaleX);
                    const y = Math.round((e.clientY - rect.top) * scaleY);
                    await fetch(`${BOOKING_SERVER}/api/booking/manual-login/click/${naverLoginPendingId}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ x, y }),
                    }).catch(() => {});
                  }}
                >
                  <img
                    src={naverLoginScreenshot}
                    alt="네이버 로그인 화면"
                    style={{ width: '100%', display: 'block' }}
                  />
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#4A90E2', fontFamily: 'Orbitron, monospace', fontSize: '0.4rem' }}>
                  화면 로딩 중...
                </div>
              )}
              {/* 비밀번호 원터치 입력 영역 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ color: '#9BA1A6', fontSize: '0.7rem' }}>
                  비밀번호 입력 후 엔터 → 자동 로그인
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="password"
                    placeholder="비밀번호 입력..."
                    id="naver-pw-input"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const input = e.target as HTMLInputElement;
                        const pw = input.value;
                        if (!pw || !naverLoginPendingId) return;
                        input.disabled = true;
                        try {
                          await fetch(`${BOOKING_SERVER}/api/booking/manual-login/fill-password/${naverLoginPendingId}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ password: pw }),
                          });
                        } catch {}
                        input.value = '';
                        input.disabled = false;
                      }
                    }}
                    style={{
                      flex: 1, padding: '10px 14px',
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid #4A90E266',
                      color: '#e0e0ff',
                      fontFamily: 'monospace', fontSize: '1rem',
                      outline: 'none', borderRadius: 4,
                    }}
                  />
                  <button
                    onClick={async () => {
                      const input = document.getElementById('naver-pw-input') as HTMLInputElement;
                      const pw = input?.value;
                      if (!pw || !naverLoginPendingId) return;
                      input.disabled = true;
                      try {
                        await fetch(`${BOOKING_SERVER}/api/booking/manual-login/fill-password/${naverLoginPendingId}`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ password: pw }),
                        });
                      } catch {}
                      input.value = '';
                      input.disabled = false;
                    }}
                    style={{
                      padding: '10px 16px',
                      background: '#4A90E2',
                      border: 'none', borderRadius: 4,
                      color: '#fff', fontFamily: 'Orbitron, monospace',
                      fontSize: '0.45rem', letterSpacing: '0.1em',
                      cursor: 'pointer',
                    }}
                  >
                    LOGIN
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 예약 결과 패널 ── */}
      <AnimatePresence>
        {bookingPanelVisible && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            style={{
              position: 'fixed', top: 80, right: 28,
              zIndex: 36, pointerEvents: 'auto',
              width: 300, maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <div style={{
              background: 'rgba(6,10,18,0.97)',
              border: `1px solid #4A90E244`,
              borderTop: '2px solid #4A90E2',
              padding: '14px',
              backdropFilter: 'blur(20px)',
            }}>
              {/* 헤더 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: '#4A90E2', fontSize: '0.45rem', letterSpacing: '0.3em' }}>
                  {paymentUrl ? 'PAYMENT READY' : 'BOOKING SLOTS'}
                </div>
                <div
                  onClick={() => { setBookingPanelVisible(false); setPaymentUrl(null); setPaymentCopied(false); }}
                  style={{ cursor: 'pointer', color: THEME.textDim, fontSize: '0.7rem', lineHeight: 1 }}
                >×</div>
              </div>

              {/* 결제 URL 섹션 */}
              {paymentUrl && (
                <div style={{ marginBottom: 14 }}>
                  {/* 단계 표시 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    {['예약 탐색', '폼 입력', '결제'].map((step, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%',
                          background: i < 2 ? '#22C55E' : '#4A90E2',
                          border: `1px solid ${i < 2 ? '#22C55E' : '#4A90E2'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.35rem', color: '#fff', fontFamily: 'Orbitron, monospace',
                        }}>{i < 2 ? '' : '!'}</div>
                        <div style={{ fontSize: '0.38rem', color: i < 2 ? '#22C55E' : '#4A90E2', fontFamily: 'Orbitron, monospace' }}>{step}</div>
                        {i < 2 && <div style={{ width: 12, height: 1, background: '#22C55E55' }} />}
                      </div>
                    ))}
                  </div>

                  {/* QR 코드 */}
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, padding: 10, background: '#fff', borderRadius: 6 }}>
                    <QRCodeSVG value={paymentUrl} size={120} />
                  </div>

                  {/* URL 표시 + 복사 버튼 */}
                  <div style={{
                    background: 'rgba(74,144,226,0.06)',
                    border: '1px solid #4A90E233',
                    borderRadius: 4, padding: '8px 10px', marginBottom: 8,
                  }}>
                    <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.15em', marginBottom: 4 }}>PAYMENT URL</div>
                    <div style={{ color: '#4A90E2', fontSize: '0.45rem', wordBreak: 'break-all', lineHeight: 1.5 }}>
                      {paymentUrl.length > 60 ? paymentUrl.substring(0, 60) + '...' : paymentUrl}
                    </div>
                  </div>

                  {/* 버튼 2개 */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div
                      onClick={() => {
                        navigator.clipboard.writeText(paymentUrl);
                        setPaymentCopied(true);
                        setTimeout(() => setPaymentCopied(false), 2000);
                      }}
                      style={{
                        flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer',
                        background: paymentCopied ? 'rgba(34,197,94,0.15)' : 'rgba(74,144,226,0.12)',
                        border: `1px solid ${paymentCopied ? '#22C55E55' : '#4A90E255'}`,
                        fontFamily: 'Orbitron, monospace',
                        color: paymentCopied ? '#22C55E' : '#4A90E2',
                        fontSize: '0.38rem', letterSpacing: '0.15em',
                        transition: 'all 0.2s',
                      }}
                    >{paymentCopied ? 'COPIED ' : 'COPY URL'}</div>
                    <div
                      onClick={() => window.open(paymentUrl, '_blank')}
                      style={{
                        flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer',
                        background: 'rgba(34,197,94,0.12)',
                        border: '1px solid #22C55E55',
                        fontFamily: 'Orbitron, monospace',
                        color: '#22C55E', fontSize: '0.38rem', letterSpacing: '0.15em',
                      }}
                    >OPEN LINK</div>
                  </div>

                  <div style={{ marginTop: 8, fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.1em', textAlign: 'center', lineHeight: 1.6 }}>
                    QR 스캔 또는 링크 클릭 후 결제만 완료하시면 됩니다
                  </div>
                </div>
              )}

              {/* 스크린샷 */}
              {bookingScreenshot && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.15em', marginBottom: 4 }}>PAGE PREVIEW</div>
                  <img
                    src={bookingScreenshot}
                    alt="예약 페이지 스크린샷"
                    style={{ width: '100%', borderRadius: 4, border: `1px solid #4A90E222` }}
                  />
                </div>
              )}

              {/* 예약 가능 시간 목록 */}
              {bookingSlots.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.35rem', letterSpacing: '0.15em', marginBottom: 6 }}>AVAILABLE TIMES — 클릭하여 예약</div>
                  {bookingSlots.map((slot, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        // 클릭 시 해당 시간으로 바로 예약 명령 실행
                        const cmd = `${slot} 시간으로 예약해줘`;
                        addMessage('user', cmd);
                        handleTextSubmit(cmd);
                      }}
                      style={{
                        padding: '8px 12px', marginBottom: 6,
                        background: 'rgba(74,144,226,0.12)',
                        border: '1px solid #4A90E255',
                        color: '#4A90E2', fontSize: '0.7rem',
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                        borderRadius: 4,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,144,226,0.25)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(74,144,226,0.12)')}
                    >
                      <span>{slot}</span>
                      <span style={{ fontSize: '0.55rem', color: '#22C55E', fontFamily: 'Orbitron, monospace', letterSpacing: '0.1em' }}>예약 →</span>
                    </div>
                  ))}
                </div>
              )}

              {!paymentUrl && bookingSlots.length === 0 && (
                <div style={{ color: THEME.textDim, fontSize: '0.5rem', textAlign: 'center', padding: '10px 0' }}>
                  예약 가능한 시간을 확인 중입니다...
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 발주서 파일 업로드 모달 ── */}
      <AnimatePresence>
        {orderFileUploadVisible && (
          <motion.div
            key="order-file-modal"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 9000,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.85)',
            }}
          >
            <div style={{
              background: 'linear-gradient(135deg, #0a0f1a 0%, #0d1526 100%)',
              border: '1px solid #C8A96E',
              borderRadius: 16,
              padding: 32,
              width: 360,
              textAlign: 'center',
              boxShadow: '0 0 40px rgba(200,169,110,0.3)',
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>[PKG]</div>
              <div style={{ color: '#C8A96E', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                {orderFileAction === 'process_order_file_and_send' ? '발주서 처리 + 이메일 발송' : '발주서 파일 처리'}
              </div>
              <div style={{ color: '#A8B8C8', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
                스마트스토어에서 다운로드한<br/>
                발주발송관리 엑셀 파일을 업로드하세요.<br/>
                <span style={{ color: '#C8A96E', fontSize: 12 }}>비밀번호 1234 자동 해제</span>
              </div>
              <input
                ref={orderFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (orderFileResolveRef.current) {
                    orderFileResolveRef.current(file);
                    orderFileResolveRef.current = null;
                  }
                }}
              />
              {orderFileProcessing ? (
                <div style={{ color: '#7EC89B', fontSize: 14 }}>\u23F3 처리 중...</div>
              ) : (
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button
                    onClick={() => orderFileInputRef.current?.click()}
                    style={{
                      background: 'linear-gradient(135deg, #C8A96E, #8B6F3E)',
                      color: '#fff', border: 'none', borderRadius: 8,
                      padding: '10px 24px', fontSize: 14, fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    파일 선택
                  </button>
                  <button
                    onClick={() => {
                      if (orderFileResolveRef.current) {
                        orderFileResolveRef.current(null);
                        orderFileResolveRef.current = null;
                      }
                    }}
                    style={{
                      background: 'transparent', color: '#A8B8C8',
                      border: '1px solid #334155', borderRadius: 8,
                      padding: '10px 24px', fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 스케줄 알림 ── */}
      <AnimatePresence>
        {schedules.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            style={{
              position: 'fixed', top: 80, right: 28,
              zIndex: 35, pointerEvents: 'none',
            }}
          >
            {schedules.slice(-3).map((s, i) => (
              <div key={i} style={{
                background: 'rgba(6,10,18,0.9)',
                border: `1px solid #9B8EC444`,
                borderLeft: '2px solid #9B8EC4',
                padding: '8px 14px',
                marginBottom: 6,
                backdropFilter: 'blur(8px)',
                maxWidth: 200,
              }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: '#9B8EC4', fontSize: '0.38rem', letterSpacing: '0.2em' }}>SCHEDULED</div>
                <div style={{ color: THEME.text, fontSize: '0.55rem', marginTop: 2 }}>{s.task.substring(0, 30)}</div>
                <div style={{ color: THEME.textDim, fontSize: '0.45rem', marginTop: 2 }}>{s.time}</div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 뉴럴 미션 맵 (시스템 현황) ── */}
      <AnimatePresence>
        {neuralMapVisible && (
          <NeuralMissionMap onClose={() => setNeuralMapVisible(false)} />
        )}
      </AnimatePresence>

      {/* ── Manus 글로벌 전략 대시보드 ── */}
      <AnimatePresence>
        {strategyDashboardVisible && (
          <ManusStrategyDashboard
            onClose={() => setStrategyDashboardVisible(false)}
            onExecuteStrategy={(strategyId, prompt) => {
              setStrategyDashboardVisible(false);
              // Manus 전략 실행을 음성 명령처럼 처리
              const strategyNames: Record<string, string> = {
                influencer_hunt: '무인 인플루언서 협상',
                viral_factory: '바이럴 콘텐츠 공장',
                community_stealth: '커뮤니티 자동 대응',
                auto_revenue: '무인 수익 자동화',
              };
              const name = strategyNames[strategyId] || strategyId;
              const msg = `[${name}] ${prompt}`;
              handleSTTResult(msg);
            }}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
