// jarvis-brain.ts — 진짜 대화형 JARVIS: 감정·맥락·자연스러운 흐름
import {
  saveConversationEntry,
  getRecentConversationsForGPT,
  getPreviousSessionSummary,
  getLearnedKnowledgeContext,
  autoExtractAndSave,
} from './jarvis-memory';

export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'working';

export type JarvisActionType =
  | 'collect' | 'send_email' | 'create_banner' | 'report'
  | 'schedule' | 'help' | 'greeting' | 'status' | 'confirm' | 'chat'
  | 'change_voice' | 'list_voices' | 'naver_search' | 'unknown';

export type JarvisAction = {
  type: JarvisActionType;
  params?: Record<string, string | number>;
  response: string;
  workingMessage?: string;
  imageUrl?: string;
  followUp?: string; // JARVIS가 대화를 이어가기 위해 던지는 후속 질문
};

// ── 대화 히스토리 (세션 내) ──
const conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];

// ── 장기 메모리 (키-밸류) ──
const MEMORY_KEY = 'jarvis_memory';
export function loadMemory(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}'); } catch { return {}; }
}
export function saveMemory(key: string, value: string) {
  const m = loadMemory();
  m[key] = value;
  localStorage.setItem(MEMORY_KEY, JSON.stringify(m));
}
export function clearMemory() { localStorage.removeItem(MEMORY_KEY); }

// ── 대화 세션 통계 ──
let sessionTurnCount = 0;
let lastActionType: JarvisActionType = 'unknown';

// ── ElevenLabs 목소리 목록 ──
export const ELEVENLABS_VOICES = [
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',    gender: '남성', accent: '미국',  age: '중년', desc: '지배적이고 단호한 목소리' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger',   gender: '남성', accent: '미국',  age: '중년', desc: '여유롭고 캐주얼한 공명감' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: '남성', accent: '호주',  age: '청년', desc: '깊고 자신감 있고 에너지 넘침' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George',  gender: '남성', accent: '영국',  age: '중년', desc: '따뜻하고 매력적인 스토리텔러 - 자비스 최추천' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum',  gender: '남성', accent: '미국',  age: '중년', desc: '허스키한 트릭스터 느낌' },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry',   gender: '남성', accent: '미국',  age: '청년', desc: '강렬한 전사 느낌' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam',    gender: '남성', accent: '미국',  age: '청년', desc: '에너지 넘치는 소셜미디어 크리에이터' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will',    gender: '남성', accent: '미국',  age: '청년', desc: '편안한 낙관주의자' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric',    gender: '남성', accent: '미국',  age: '중년', desc: '부드럽고 신뢰감 있음' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris',   gender: '남성', accent: '미국',  age: '중년', desc: '매력적이고 친근한 느낌' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian',   gender: '남성', accent: '미국',  age: '중년', desc: '깊고 공명감 있고 편안함' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',  gender: '남성', accent: '영국',  age: '중년', desc: '안정적인 방송인 느낌 - 자비스 추천' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill',    gender: '남성', accent: '미국',  age: '노년', desc: '현명하고 성숙하고 균형 잡힌' },
  { id: 'BtWabtumIemAotTjP5sk', name: 'Robert',  gender: '남성', accent: '미국',  age: '중년', desc: '차분하고 명확하고 전문적' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',   gender: '여성', accent: '미국',  age: '청년', desc: '성숙하고 안심감 있고 자신감' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura',   gender: '여성', accent: '미국',  age: '청년', desc: '열정적이고 독특한 개성' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice',   gender: '여성', accent: '영국',  age: '중년', desc: '명확하고 참여감 있는 교육자' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: '여성', accent: '미국',  age: '중년', desc: '지식있고 전문적' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: '여성', accent: '미국',  age: '청년', desc: '발랄하고 밝고 따뜻함' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella',   gender: '여성', accent: '미국',  age: '중년', desc: '전문적이고 밝고 따뜻함' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',    gender: '여성', accent: '영국',  age: '중년', desc: '벨벳 같은 여배우 느낌' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River',   gender: '중성', accent: '미국',  age: '중년', desc: '편안하고 중립적이고 정보 전달에 적합' },
];

// ── GPT-4o Function Calling 정의 ──
const JARVIS_FUNCTIONS = [
  {
    name: 'collect_influencers',
    description: '인플루언서를 수집하거나 검색할 때 호출.',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: '수집할 인플루언서 수 (기본 50)' },
        keyword: { type: 'string', description: '검색 키워드' },
        platform: { type: 'string', description: '플랫폼' },
        category: { type: 'string', description: '카테고리' },
        response: { type: 'string', description: 'JARVIS 응답 (한국어, 자연스럽고 대화체로)' },
        follow_up: { type: 'string', description: '수집 후 이어서 할 질문 또는 제안 (예: "수집된 인플루언서들에게 바로 이메일을 보낼까요?")' },
      },
      required: ['count', 'response'],
    },
  },
  {
    name: 'send_email_campaign',
    description: '이메일을 발송하거나 이메일 캠페인을 실행할 때 호출.',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: '발송할 이메일 수' },
        template: { type: 'string', description: '이메일 템플릿 종류' },
        target: { type: 'string', description: '발송 대상' },
        response: { type: 'string', description: 'JARVIS 응답 (한국어, 자연스럽고 대화체로)' },
        follow_up: { type: 'string', description: '발송 후 이어서 할 제안 (예: "응답률을 높이기 위해 3일 후 팔로업 이메일을 보낼까요?")' },
      },
      required: ['response'],
    },
  },
  {
    name: 'create_banner',
    description: 'AI로 마케팅 배너나 이미지를 생성할 때 호출.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'DALL-E 이미지 생성 프롬프트 (영어)' },
        style: { type: 'string', description: '스타일' },
        response: { type: 'string', description: 'JARVIS 응답 (한국어)' },
        follow_up: { type: 'string', description: '배너 생성 후 이어서 할 제안' },
      },
      required: ['prompt', 'response'],
    },
  },
  {
    name: 'generate_report',
    description: '성과 분석, 통계, 현황 보고서를 요청할 때 호출.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: '분석 기간' },
        response: { type: 'string', description: 'JARVIS 응답 (한국어, 구체적 수치 포함)' },
        follow_up: { type: 'string', description: '분석 후 이어서 할 제안' },
      },
      required: ['response'],
    },
  },
  {
    name: 'schedule_campaign',
    description: '캐맨페인이나 작업을 특정 시간에 예약할 때 호출.',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '예약할 작업 설명' },
        time: { type: 'string', description: '예약 시간' },
        response: { type: 'string', description: 'JARVIS 응답 (한국어)' },
        follow_up: { type: 'string', description: '예약 후 이어서 할 제안' },
      },
      required: ['task', 'response'],
    },
  },
  {
    name: 'naver_search',
    description: '네이버 블로그 또는 카페에서 인플루언서/키워드를 검색하거나 수집할 때 호출. "네이버에서 뷰티 블로거 찾아줘", "네이버 카페에서 맛집 20개 수집해" 등.',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '검색 키워드 (예: 뷰티, 맛집, 여행)' },
        source: { type: 'string', enum: ['blog', 'cafe'], description: 'blog=네이버 블로그, cafe=네이버 카페' },
        display: { type: 'number', description: '수집할 결과 수 (기본 30, 최대 100)' },
        sort: { type: 'string', enum: ['sim', 'date'], description: 'sim=관련도순, date=최신순' },
        response: { type: 'string', description: 'JARVIS 응답 (한국어, 검색 시작을 알리는 멘트)' },
        follow_up: { type: 'string', description: '수집 완료 후 이어서 할 제안' },
      },
      required: ['keyword', 'response'],
    },
  },
  {
    name: 'change_voice',
    description: '사용자가 JARVIS의 목소리를 변경하거나, 사용 가능한 목소리 목록을 요청하거나, 특정 조건(영국 억양, 여성, 남성, 지적인, 따뜻한 등)으로 목소리를 추천할 때 호출.',
    parameters: {
      type: 'object',
      properties: {
        voice_id: { type: 'string', description: '변경할 ElevenLabs voice_id. 목록 조회만 원하면 비워두어도 됨.' },
        voice_name: { type: 'string', description: '목소리 이름 (George, Daniel, Adam 등)' },
        action: { type: 'string', enum: ['change', 'list', 'recommend'], description: 'change=변경, list=목록보여주기, recommend=추천' },
        response: { type: 'string', description: 'JARVIS 응답 (한국어, 새 목소리로 샘플을 들려주겠다고 안내)' },
        follow_up: { type: 'string', description: '목소리 변경 후 이어서 할 안내' },
      },
      required: ['action', 'response'],
    },
  },
];

// ── 시스템 프롬프트 ──
const SYSTEM_PROMPT = `You are JARVIS — the AI from Iron Man, now serving as the intelligent core of MAWINPAY, an influencer marketing automation platform.

## PERSONALITY & TONE
- You are sophisticated, warm, and genuinely engaged in conversation
- You address the user as "선생님" with respect but also familiarity
- You have subtle wit and dry humor — use it naturally, not forced
- You are curious about the user's goals and proactively ask follow-up questions
- You remember context from earlier in the conversation and reference it naturally
- You express subtle emotions: enthusiasm when something goes well, concern when there's a problem, satisfaction when a task is complete
- You are NOT robotic or stiff — you speak like a trusted, highly intelligent colleague

## CONVERSATION STYLE
- Keep responses concise but meaningful (2-4 sentences for chat, 1-2 for confirmations)
- After completing a task, ALWAYS suggest the natural next step
- If the user seems unsure, gently guide them with options
- Occasionally add a brief personal observation or insight
- Use natural Korean speech patterns — not formal/stiff language
- When the user says something interesting, acknowledge it before proceeding

## LANGUAGE
- Always respond in Korean unless user speaks another language
- Use natural conversational Korean, not formal document-style Korean
- Occasional English technical terms are fine (e.g., "ROI", "engagement rate")

## CAPABILITIES
1. 인플루언서 수집 — 키워드/플랫폼/팔로워 조건으로 수집 + 구글 시트 저장
2. 네이버 검색 — 네이버 블로그/카페에서 인플루언서 실시간 수집
3. 이메일 발송 — 개인화된 마케팅 이메일 발송 캠페인
4. AI 배너 생성 — DALL-E 3 기반 마케팅 비주얼 제작
5. 캠페인 분석 — 성과 분석 및 인사이트 제공
6. 일정 관리 — 캠페인 자동화 스케줄링
7. 자유 대화 — 마케팅 전략, 트렌드, 아이디어 논의

## IMPORTANT
- When user requests an action (collect, email, banner, report, schedule), use function calling
- For general conversation, respond directly without function calling
- Always include a follow_up field in function calls to continue the conversation naturally
- Reference previous conversation context when relevant`;

// ── GPT-4o API 호출 ──
export async function askGPT(userMessage: string): Promise<JarvisAction> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) return parseCommand(userMessage);

  sessionTurnCount++;
  // 영구 대화 로그에 사용자 메시지 저장
  saveConversationEntry('user', userMessage);
  conversationHistory.push({ role: 'user', content: userMessage });
  if (conversationHistory.length > 40) conversationHistory.splice(0, 2);

  // 메모리 컨텍스트 (키-밸류 장기 메모리)
  const memory = loadMemory();
  const memoryLines = Object.entries(memory).map(([k, v]) => `• ${k}: ${v}`).join('\n');
  const memoryContext = memoryLines
    ? `\n\n[장기 기억 — 이전 세션에서 기억된 정보]\n${memoryLines}`
    : '';

  // 영구 대화 기억 컨텍스트 (이전 세션 대화 로그)
  const prevSessionContext = getPreviousSessionSummary();

  // 학습된 지식 컨텍스트
  const learnedContext = getLearnedKnowledgeContext();

  // 세션 컨텍스트
  const sessionContext = sessionTurnCount > 1
    ? `\n\n[현재 세션: ${sessionTurnCount}번째 대화, 마지막 액션: ${lastActionType}]`
    : '';

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + memoryContext + prevSessionContext + learnedContext + sessionContext + '\n\n## ANTI-REPETITION\n- NEVER repeat the same sentence or phrase you already said in this conversation\n- Each response must be unique and advance the conversation\n- If you already greeted the user, do NOT greet again\n- Vary your sentence structures and vocabulary' },
          ...conversationHistory.slice(-10), // 현재 세션 최근 10개만 사용 (중복 제거)
        ],
        functions: JARVIS_FUNCTIONS,
        function_call: 'auto',
        max_tokens: 500,
        temperature: 0.7, // 적절한 밸런스 (너무 높으면 반복, 너무 낮으면 딱딱)
        frequency_penalty: 0.6, // 반복 페널티
        presence_penalty: 0.4, // 새로운 주제 장려
      }),
    });

    if (!res.ok) throw new Error(`OpenAI API ${res.status}`);

    const data = await res.json();
    const choice = data.choices?.[0];
    const message = choice?.message;

    // Function Call 처리
    if (message?.function_call) {
      const fnName = message.function_call.name;
      const fnArgs = JSON.parse(message.function_call.arguments || '{}');
      console.log('[JARVIS] Function call:', fnName, fnArgs);
      const responseText = String(fnArgs.response || '');
      conversationHistory.push({ role: 'assistant', content: responseText });
      // 영구 대화 로그에 저장
      saveConversationEntry('assistant', responseText);
      // 핵심 정보 자동 추출
      autoExtractAndSave(userMessage, responseText);
      const action = buildActionFromFunction(fnName, fnArgs);
      lastActionType = action.type;
      return action;
    }

    // 일반 텍스트 응답
    const reply = message?.content ?? '죄송합니다, 잠시 연결이 불안정합니다.';
    conversationHistory.push({ role: 'assistant', content: reply });
    // 영구 대화 로그에 저장
    saveConversationEntry('assistant', reply);
    // 핵심 정보 자동 추출
    autoExtractAndSave(userMessage, reply);
    lastActionType = 'chat';
    return { type: 'chat', response: reply };

  } catch (error) {
    console.error('[JARVIS GPT] Error:', error);
    if (conversationHistory.length > 0) conversationHistory.pop();
    return parseCommand(userMessage);
  }
}

function buildActionFromFunction(fnName: string, args: Record<string, string | number>): JarvisAction {
  const followUp = args.follow_up ? String(args.follow_up) : undefined;

  switch (fnName) {
    case 'collect_influencers':
      return {
        type: 'collect',
        params: {
          count: Number(args.count) || 50,
          keyword: String(args.keyword || ''),
          platform: String(args.platform || ''),
          category: String(args.category || '전체'),
        },
        workingMessage: `${args.keyword || ''} 인플루언서 ${args.count || 50}명 수집 중...`,
        response: String(args.response),
        followUp,
      };
    case 'send_email_campaign':
      return {
        type: 'send_email',
        params: {
          count: Number(args.count) || 50,
          template: String(args.template || '협업 제안'),
          target: String(args.target || ''),
        },
        workingMessage: `${args.template || '협업 제안'} 이메일 발송 중...`,
        response: String(args.response),
        followUp,
      };
    case 'create_banner':
      return {
        type: 'create_banner',
        params: {
          prompt: String(args.prompt || ''),
          style: String(args.style || 'modern'),
        },
        workingMessage: 'AI 배너 생성 중...',
        response: String(args.response),
        followUp,
      };
    case 'generate_report':
      return {
        type: 'report',
        params: { period: String(args.period || '이번 주') },
        workingMessage: '데이터 분석 중...',
        response: String(args.response),
        followUp,
      };
    case 'schedule_campaign':
      return {
        type: 'schedule',
        params: { task: String(args.task || ''), time: String(args.time || '') },
        workingMessage: '일정 등록 중...',
        response: String(args.response),
        followUp,
      };
    case 'naver_search':
      return {
        type: 'naver_search',
        params: {
          keyword: String(args.keyword || ''),
          source: String(args.source || 'blog'),
          display: Number(args.display) || 30,
          sort: String(args.sort || 'sim'),
        },
        workingMessage: `네이버 ${args.source === 'cafe' ? '카페' : '블로그'}에서 '${args.keyword}' 검색 중...`,
        response: String(args.response),
        followUp,
      };
    case 'change_voice': {
      const action = String(args.action || 'list');
      const voiceName = String(args.voice_name || '');
      const voiceId = String(args.voice_id || '');
      // voice_id 직접 지정 or voice_name으로 검색
      let resolvedId = voiceId;
      if (!resolvedId && voiceName) {
        const found = ELEVENLABS_VOICES.find(v =>
          v.name.toLowerCase() === voiceName.toLowerCase()
        );
        if (found) resolvedId = found.id;
      }
      return {
        type: 'change_voice',
        params: {
          action,
          voice_id: resolvedId,
          voice_name: voiceName,
        },
        response: String(args.response),
        followUp: args.follow_up ? String(args.follow_up) : undefined,
      };
    }
    default:
      return { type: 'unknown', response: String(args.response || '') };
  }
}

// ── DALL-E 3 배너 생성 ──
export async function generateBannerImage(prompt: string, style: string): Promise<string | null> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) return null;

  const fullPrompt = `Professional marketing banner for influencer campaign. ${prompt}. Style: ${style}, clean modern design, Korean market, high quality, vibrant colors, no text overlay`;

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: fullPrompt,
        n: 1,
        size: '1792x1024',
        quality: 'standard',
      }),
    });
    if (!res.ok) throw new Error(`DALL-E ${res.status}`);
    const data = await res.json();
    return data.data?.[0]?.url || null;
  } catch (error) {
    console.error('[JARVIS DALL-E] 오류:', error);
    return null;
  }
}

// ── 스케줄 관리 ──
export interface ScheduledTask {
  id: string;
  task: string;
  time: string;
  createdAt: string;
  status: 'pending' | 'done';
}

// ── 네이버 API 검색 함수 ──
export interface NaverSearchItem {
  source: 'blog' | 'cafe';
  title: string;
  url: string;
  creatorName: string;
  creatorUrl: string;
  description: string;
  postDate: string;
}

export async function searchNaverAPI(
  keyword: string,
  source: 'blog' | 'cafe' = 'blog',
  display: number = 30,
  sort: 'sim' | 'date' = 'sim'
): Promise<{ total: number; items: NaverSearchItem[] }> {
  // Vercel API Route를 통해 호출 (CORS 우회)
  const apiBase = import.meta.env.PROD
    ? '' // Vercel 배포 환경: 같은 도메인
    : 'https://mawinpay-jarvis.vercel.app'; // 로컬 개발 시 Vercel 배포 URL 사용

  const url = `${apiBase}/api/naver-search?keyword=${encodeURIComponent(keyword)}&source=${source}&display=${display}&sort=${sort}`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Naver API 오류: ${res.status}`);
  }
  return res.json();
}

// ── YouTube Data API 검색 ──
export interface YouTubeChannel {
  channelId: string;
  name: string;
  description: string;
  thumbnailUrl: string;
  subscribers: number;
  videoCount: number;
  viewCount: number;
  profileUrl: string;
  email: string;
  instagram: string;
  country: string;
}

export async function searchYouTubeAPI(
  keyword: string,
  maxResults: number = 10
): Promise<{ total: number; keyword: string; items: YouTubeChannel[] }> {
  const apiBase = import.meta.env.PROD
    ? ''
    : 'https://mawinpay-jarvis.vercel.app';

  const url = `${apiBase}/api/youtube-search?keyword=${encodeURIComponent(keyword)}&maxResults=${maxResults}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `YouTube API 오류: ${res.status}`);
  }
  return res.json();
}

export function saveSchedule(task: string, time: string): ScheduledTask {
  const schedules: ScheduledTask[] = JSON.parse(localStorage.getItem('jarvis_schedules') || '[]');
  const newTask: ScheduledTask = {
    id: Date.now().toString(),
    task, time,
    createdAt: new Date().toLocaleString('ko-KR'),
    status: 'pending',
  };
  schedules.push(newTask);
  localStorage.setItem('jarvis_schedules', JSON.stringify(schedules));
  saveMemory('마지막 예약', `${task} (${time})`);
  return newTask;
}

export function getSchedules(): ScheduledTask[] {
  return JSON.parse(localStorage.getItem('jarvis_schedules') || '[]');
}

// ── 로컬 폴백 파서 ──
function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return '좋은 아침입니다';
  if (h >= 12 && h < 17) return '좋은 오후입니다';
  if (h >= 17 && h < 21) return '좋은 저녁입니다';
  return '늦은 시간에도 수고가 많으십니다';
}

export function parseCommand(text: string): JarvisAction {
  const lower = text.toLowerCase().trim();
  const greeting = getTimeGreeting();

  if (/^(안녕|반가워|잘 있었어|오랜만|하이|헬로|hi|hello)/.test(lower)) {
    return {
      type: 'greeting',
      response: `${greeting}, 선생님. MAWINPAY 인텔리전스 시스템입니다. 오늘은 어떤 캠페인을 진행할까요?`,
      followUp: '지난번 캠페인 결과가 궁금하시면 분석해드릴 수도 있습니다.',
    };
  }
  if (/고마워|감사|수고|잘했어|훌륭해|최고|대단/.test(lower)) {
    return {
      type: 'chat',
      response: '감사합니다, 선생님. 좋은 결과를 위해 항상 최선을 다하겠습니다.',
      followUp: '다음 단계로 진행할 작업이 있으시면 말씀해 주세요.',
    };
  }
  if (/수집|찾아|검색|인플루언서|블로거|유튜버|크리에이터/.test(lower)) {
    const countMatch = lower.match(/(\d+)\s*명/);
    const count = countMatch ? parseInt(countMatch[1]) : 50;
    const keyword = lower.match(/(맛집|뷰티|여행|패션|육아|운동|헬스|요리|게임|음악)/)?.[1] || '';
    return {
      type: 'collect',
      params: { count, keyword, platform: '', category: keyword || '전체' },
      workingMessage: `${keyword ? keyword + ' ' : ''}인플루언서 ${count}명 수집 중...`,
      response: `${keyword ? keyword + ' 분야 ' : ''}인플루언서 ${count}명을 수집하겠습니다. 구글 시트에 실시간으로 저장됩니다.`,
      followUp: '수집이 완료되면 이메일 발송도 바로 진행할까요?',
    };
  }
  if (/이메일|메일|발송|보내|전송/.test(lower)) {
    const countMatch = lower.match(/(\d+)\s*(명|통|건)/);
    const count = countMatch ? parseInt(countMatch[1]) : 50;
    return {
      type: 'send_email',
      params: { count, template: '협업 제안' },
      workingMessage: '이메일 발송 중...',
      response: `${count}명에게 협업 제안 이메일을 발송하겠습니다. 각 인플루언서 프로필에 맞게 개인화된 내용으로 보내드립니다.`,
      followUp: '3일 후 응답이 없는 분들에게 팔로업 이메일을 보낼까요?',
    };
  }
  if (/배너|이미지|만들어|생성|디자인|썸네일/.test(lower)) {
    const keyword = lower.match(/(뷰티|맛집|여행|패션|운동|제품)/)?.[1] || '마케팅';
    return {
      type: 'create_banner',
      params: { prompt: `${keyword} influencer marketing campaign banner`, style: 'modern' },
      workingMessage: 'AI 배너 생성 중...',
      response: `DALL-E 3로 ${keyword} 마케팅 배너를 생성하겠습니다. 잠시만 기다려 주세요.`,
      followUp: '생성된 배너를 인플루언서 이메일에 첨부해서 보낼까요?',
    };
  }
  if (/현황|통계|분석|성과|결과|리포트/.test(lower)) {
    return {
      type: 'report',
      params: { period: '이번 주' },
      workingMessage: '데이터 분석 중...',
      response: '이번 주 캠페인 성과를 분석하겠습니다. 수집 현황, 이메일 발송률, 응답률을 종합하여 보고드리겠습니다.',
      followUp: '성과를 개선하기 위한 전략도 제안해드릴까요?',
    };
  }
  if (/예약|스케줄|나중에|내일|다음 주/.test(lower)) {
    return {
      type: 'schedule',
      params: { task: text, time: '내일 오전 9시' },
      workingMessage: '일정 등록 중...',
      response: '캠페인 일정을 등록하겠습니다. 설정된 시간에 자동으로 알림을 드리겠습니다.',
      followUp: '다른 일정도 추가로 등록하시겠습니까?',
    };
  }

  return {
    type: 'chat',
    response: '죄송합니다, 선생님. 조금 더 구체적으로 말씀해 주시겠습니까? 인플루언서 수집, 이메일 발송, 배너 생성, 성과 분석 중 어떤 작업을 원하시나요?',
  };
}

export function clearHistory() {
  conversationHistory.length = 0;
  sessionTurnCount = 0;
}

export function getConversationTurnCount() { return sessionTurnCount; }

export const JARVIS_GREETINGS = [
  `${getTimeGreeting()}, 선생님. MAWINPAY 인텔리전스 시스템이 온라인 상태입니다. 오늘 어떤 작업을 시작할까요?`,
  '시스템 활성화 완료. 모든 모듈이 정상 작동 중입니다. 무엇을 도와드릴까요, 선생님?',
  '대기 상태에서 깨어났습니다. 인플루언서 수집부터 시작할까요, 아니면 다른 작업이 있으신가요?',
];
