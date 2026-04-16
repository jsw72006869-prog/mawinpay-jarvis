import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { askGPT, parseCommand, generateBannerImage, saveSchedule, saveMemory, searchNaverAPI, searchYouTubeAPI, searchInstagramAPI, invalidateSheetCache, type JarvisState, type JarvisAction, type NaverSearchItem, type YouTubeChannel, type InstagramAccount } from '../lib/jarvis-brain';
import { useSpeechRecognition, useTextToSpeech, useBargein, setCurrentVoiceId, getCurrentVoiceId, ELEVENLABS_VOICES, stopGlobalAudio } from './SpeechEngine';
import { useMicrophoneFrequency } from '../lib/audio-analyzer';
import { saveLearnedKnowledge, getLearnedKnowledge, getMemoryStats, clearAllMemory, type LearnedKnowledge } from '../lib/jarvis-memory';
import { appendInfluencersToSheet, appendEmailLogToSheet, appendNaverResultsToSheet, appendInstagramToSheet, appendLocalBusinessToSheet, generateMockInfluencers, generateEmailLogs, sendEmailsViaResend, buildInfluencerEmailHtml, type NaverCollectedData } from '../lib/google-sheets';
import ConversationStream, { type Message } from './ConversationStream';
import SparkleParticles from './SparkleParticles';
import ClapDetector from './ClapDetector';
import HoloDataPanel from './HoloDataPanel';
import InfluencerCards, { type InfluencerData } from './InfluencerCards';
import LocalBusinessCards, { type LocalBusinessData } from './LocalBusinessCards';

// ── 시그니처 응답 목록 (GPT 대기 없이 즉시 재생) ──
const SIGNATURE_RESPONSES = [
  'At your service, sir.',
  'For you, sir, always.',
  'Systems online and standing by, sir.',
  'Always a pleasure to help, sir.',
  "I've been expecting you, sir.",
  'Ready and awaiting your command, sir.',
  'Online and fully operational, sir.',
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
    type: 'collect' | 'send_email' | 'create_banner' | 'report' | null;
    progress: number;
    message: string;
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

  // ── 타이핑 입력 모드 ──
  const [textInputMode, setTextInputMode] = useState(false);
  const [textInputValue, setTextInputValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  const [settingsForm, setSettingsForm] = useState(() => {
    const stored = JSON.parse(localStorage.getItem('jarvis_api_keys') || '{}');
    return {
      openaiKey: stored.openaiKey || '',
      elevenLabsKey: stored.elevenLabsKey || '',
    };
  });

  const { speak } = useTextToSpeech();
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
      stopGlobalAudio();
      stopSpeakingLevel();
      setState('listening');
      setIsListening(true);
    }, [stopSpeakingLevel])
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
              return filtered.slice(0, cnt);
            } catch (err) {
              console.error('[JARVIS] YouTube 수집 실패:', err);
              return [];
            }
          } else if (isIG) {
            try {
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
              return filtered.slice(0, cnt);
            } catch (err) {
              console.error('[JARVIS] Instagram 수집 실패:', err);
              return [];
            }
          } else {
            // 네이버 블로그
            try {
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
              return filtered.slice(0, cnt);
            } catch (err) {
              console.error('[JARVIS] 네이버 수집 실패:', err);
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
          setStats(prev => ({ ...prev, emailsSent: prev.emailsSent + count }));
          const logs = generateEmailLogs(generateMockInfluencers(count, '전체', ''), template);
          appendEmailLogToSheet(logs);
          saveMemory('마지막 이메일 발송', `${count}명 ${template} (시뮬레이션, ${new Date().toLocaleDateString('ko-KR')})`);
        }
      } else if (action.type === 'create_banner') {
        const prompt = String(action.params?.prompt || 'influencer marketing campaign');
        const style = String(action.params?.style || 'modern');
        const imageUrl = await generateBannerImage(prompt, style);
        if (imageUrl) {
          setBannerImage(imageUrl);
          saveMemory('마지막 배너', `${prompt} (${new Date().toLocaleDateString('ko-KR')})`);
        }
      } else if (action.type === 'schedule') {
        const task = String(action.params?.task || '');
        const time = String(action.params?.time || '내일 오전 9시');
        const saved = saveSchedule(task, time);
        setSchedules(prev => [...prev, { task: saved.task, time: saved.time }]);
      }
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
        const doneText = `네이버 ${source === 'cafe' ? '카페' : '블로그'}에서 '${keyword}' 검색 완료. ${result.items.length}건 수집, 이메일 ${emailCount}건, 이웃수 정보 ${neighborInfo}건 포함하여 구글 시트에 저장했습니다, 선생님.`;
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
        const errMsg = `네이버 검색 중 오류가 발생했습니다, 선생님. ${String(err).includes('credentials') ? 'NAVER API 키가 설정되지 않았습니다. Vercel 환경변수에 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 설정해주세요.' : String(err)}`;
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
        const doneText = `'${query}'${categoryText} 검색 완료. ${businessItems.length}개 업체를 수집했습니다. 전화번호 ${phoneCount}건, 주소 포함 구글 시트에 저장했습니다, 선생님.`;
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
        const errMsg = `지역 검색 중 오류가 발생했습니다, 선생님. ${String(err)}`;
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
        const sampleText = `이 목소리는 어때세요, 선생님? ${newName} 목소리로 설정되었습니다. 마음에 드시면 계속 사용하겠습니다.`;
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

    // ── 메인 응답 발화 ──
    setIsListening(false); // speaking 중 STT 완전 차단 (에코 방지)
    setState('speaking');
    // 작업 완료 타입이면 스파클링 효과 적용
    const isCompletionMsg = isWorkingType && !!action?.workingMessage;
    addMessage('jarvis', text, isCompletionMsg);
    // 수집/이메일 발송 완료 시 파티클 폭발 효과 (clapBurst 3회 연속)
    if (isCompletionMsg) {
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

  const handleSpeechResult = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;
    const currentState = stateRef.current;
    console.log('[JARVIS] 🎤 음성 명령 수신 (상태:', currentState, '):', transcript);
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
      // ★ 쿨다운: 활성화 후 5초 이내에는 비활성화 방지
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

  // ── Ctrl+K 단축키: 타이핑 모드 토글 ──
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

  const accent = STATE_COLOR[state];

  return (
    <main
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: THEME.bg, cursor: 'none' }}
      onClick={() => {
        // idle 상태에서만 클릭으로 활성화 허용
        // listening/speaking 등 상태에서는 클릭 무시 (오작동 방지)
        if (stateRef.current === 'idle') handleActivate();
      }}
    >
      {/* ── Three.js 파티클 배경 ── */}
      <SparkleParticles state={state} audioLevel={micLevel} speakingLevel={speakingLevel} clapBurst={clapBurst} freqData={micFreqData ?? undefined} />

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
        width: '100%', maxWidth: '760px',
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
              zIndex: 100,
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
                position: 'fixed', top: 20, right: 28, zIndex: 60,
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
                    const sampleText = `안녕하세요, 선생님. ${v.name} 목소리로 변경되었습니다.`;
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
        style={{ position: 'fixed', top: 20, left: 28, zIndex: 50, display: 'flex', gap: 8 }}
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
            fontSize: '0.42rem',
            letterSpacing: '0.2em',
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
            fontSize: '0.42rem',
            letterSpacing: '0.2em',
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
              position: 'fixed', top: 52, left: 28,
              zIndex: 50, pointerEvents: 'auto',
              minWidth: 320,
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

              {/* OpenAI Key */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>OPENAI API KEY</div>
                <input
                  type="password"
                  placeholder="sk-..."
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

              {/* 저장 버튼 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div
                  onClick={() => {
                    const keys = {
                      openaiKey: settingsForm.openaiKey,
                      elevenLabsKey: settingsForm.elevenLabsKey,
                    };
                    localStorage.setItem('jarvis_api_keys', JSON.stringify(keys));
                    setSettingsVisible(false);
                    // 페이지 리로드로 적용
                    setTimeout(() => window.location.reload(), 300);
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
              position: 'fixed', top: 52, left: 28,
              zIndex: 50, pointerEvents: 'auto',
              minWidth: 300, maxHeight: '70vh', overflowY: 'auto',
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
    </main>
  );
}
