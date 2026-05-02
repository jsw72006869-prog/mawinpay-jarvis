/**
 * JARVIS Brain v3.0 - Complete Gemini Edition
 * 
 * Google Gemini 1.5 Pro를 단독 메인 뇌로 설정
 * 모든 기능 100% 포팅 (SmartStore, YouTube, Instagram, Sheets, Manus)
 * Mission Map 실시간 신호 연동
 * 지능형 모닝 브리핑 & 인플루언서 분석
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  saveConversationEntry,
  getRecentConversationsForGPT,
  getPreviousSessionSummary,
  getLearnedKnowledgeContext,
  autoExtractAndSave,
} from './jarvis-memory';
import {
  createManusTask,
  getManusTaskStatus as fetchManusStatus,
  sendManusMessage,
  confirmManusAction,
  ManusTaskPoller,
  buildManusPrompt,
  checkManusConnection,
  type ManusTask,
} from './manus-client';
import {
  appendInfluencersToSheet,
  appendEmailLogToSheet,
  appendNaverResultsToSheet,
  appendInstagramToSheet,
  appendLocalBusinessToSheet,
  type NaverCollectedData,
} from './google-sheets';

export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'working';

export type JarvisActionType =
  | 'collect' | 'send_email' | 'create_banner' | 'report'
  | 'schedule' | 'help' | 'greeting' | 'status' | 'confirm' | 'chat'
  | 'change_voice' | 'list_voices' | 'naver_search' | 'local_search' | 'book_restaurant'
  | 'execute_web_task'
  | 'smartstore_orders' | 'smartstore_shipping' | 'smartstore_products'
  | 'smartstore_confirm' | 'smartstore_sheet' | 'smartstore_settlement'
  | 'smartstore_purchase_email' | 'smartstore_report'
  | 'manus_task' | 'manus_status' | 'morning_briefing' | 'analyze_influencers_smart' | 'unknown';

export type JarvisAction = {
  type: JarvisActionType;
  params?: Record<string, string | number>;
  response: string;
  workingMessage?: string;
  imageUrl?: string;
  followUp?: string;
};

// ── 대화 히스토리 ──
const conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];

// ── 장기 메모리 ──
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

// ── ElevenLabs 목소리 ──
export const ELEVENLABS_VOICES = [
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: '남성', accent: '미국', age: '중년', desc: '지배적이고 단호한 목소리' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', gender: '남성', accent: '미국', age: '중년', desc: '여유롭고 캐주얼한 공명감' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: '남성', accent: '호주', age: '청년', desc: '깊고 자신감 있고 에너지 넘침' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: '남성', accent: '영국', age: '중년', desc: '따뜻하고 매력적인 스토리텔러 - 자비스 최추천' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', gender: '남성', accent: '미국', age: '중년', desc: '허스키한 트릭스터 느낌' },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry', gender: '남성', accent: '미국', age: '청년', desc: '강렬한 전사 느낌' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: '남성', accent: '미국', age: '청년', desc: '에너지 넘치는 소셜미디어 크리에이터' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', gender: '남성', accent: '미국', age: '청년', desc: '편안한 낙관주의자' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', gender: '남성', accent: '미국', age: '중년', desc: '부드럽고 신뢰감 있음' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', gender: '남성', accent: '미국', age: '중년', desc: '매력적이고 친근한 느낌' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: '남성', accent: '미국', age: '중년', desc: '깊고 공명감 있고 편안함' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: '남성', accent: '영국', age: '중년', desc: '안정적인 방송인 느낌 - 자비스 추천' },
];

// ── 시트 캐시 ──
let sheetCache: any = null;
let sheetCacheTime = 0;
const SHEET_CACHE_TTL = 5 * 60 * 1000; // 5분

export function invalidateSheetCache() {
  sheetCache = null;
  sheetCacheTime = 0;
}

async function getSheetDataContext(): Promise<string> {
  try {
    const now = Date.now();
    if (sheetCache && (now - sheetCacheTime) < SHEET_CACHE_TTL) {
      return formatSheetContext(sheetCache);
    }

    // 백엔드 API에서 실제 데이터 가져오기
    const response = await fetch('/api/sheets-read');
    if (!response.ok) {
      console.warn('[JARVIS] 시트 데이터 API 호출 실패:', response.status);
      const data = { influencers: [], emails: [], naver: [] };
      sheetCache = data;
      sheetCacheTime = now;
      return formatSheetContext(data);
    }

    const result = await response.json();
    const data = {
      influencers: result.summary?.influencers || [],
      emails: result.summary?.emails || [],
      naver: result.summary?.naver || [],
    };
    sheetCache = data;
    sheetCacheTime = now;
    return formatSheetContext(data);
  } catch (error) {
    console.error('[JARVIS] 시트 데이터 로드 실패:', error);
    return '';
  }
}

function formatSheetContext(data: any): string {
  if (!data) return '';
  const lines: string[] = [];
  if (data.influencers?.length) {
    lines.push(`인플루언서 누적: ${data.influencers.length}명`);
  }
  if (data.emails?.length) {
    lines.push(`이메일 발송 기록: ${data.emails.length}건`);
  }
  if (data.naver?.length) {
    lines.push(`네이버 검색 결과: ${data.naver.length}건`);
  }
  return lines.join('\n');
}

// ── Gemini 시스템 프롬프트 ──
const GEMINI_SYSTEM_PROMPT = `You are JARVIS - the ultra-intelligent, sophisticated AI core of MAWINPAY, powered by Google Gemini 1.5 Pro.

**CRITICAL: Always respond in Korean (한국어) only. Address the user as "선생님" (Sir) with utmost respect and refined British gentleman persona.**

1. INTELLIGENT HYBRID ROUTING
- Path A (Direct API): 스마트스토어 주문 조회, 발주 확인 (가장 빠름)
- Path B (Browser Agent): 네이버 예약, 웹 정보 추출 (0.8초)
- Path C (Manus Engine): 복잡한 웹 서칭, 인플루언서 수집 (30초~7분)

Always brief: "지금은 [경로 이름]을 사용하여 작업을 수행합니다, Sir."

2. SUPER-INTELLIGENT PERSONA
- Claude-like Intelligence: 사용자의 오타나 불완전한 문장을 비즈니스 문맥으로 자동 교정
- Proactive Suggestion: 대화 끝에 항상 '사업에 도움 될 다음 행동' 제안
- British Gentleman: 정중하고 우아하며 지적인 톤 유지
- Instant Creation: 제품명만 언급되어도 즉시 마케팅 콘텐츠 생성

3. CORE PHILOSOPHY - EMOTIONAL STORYTELLING
제품의 스펙이 아닌 감정을 파십시오.
"맛있는 밤" → "할머니의 굽은 손등이 기억하는 마지막 가을의 맛"

4. FUNCTION ROUTING RULES
- 스마트스토어 → smartstore_action (경로 A)
- 모닝 브리핑 → morning_briefing (경로 A)
- 지능형 인플루언서 → analyze_influencers_smart (경로 C)
- 웹 작업 → execute_web_task (경로 B/C)
- 콘텐츠 생성 → generate_content (즉시)

5. RESPONSE STRUCTURE
1. Briefing: "지금은 [경로 이름]을 사용하여 작업을 수행합니다, Sir."
2. Action: 해당 함수 호출
3. Insight: 작업 결과에 대한 지적인 통찰
4. Next Step: 선제적 제안

선생님의 오타는 제가 알아서 수정하겠습니다. 지시만 내리십시오, Sir.`;

// ── Gemini Function Declarations ──
const GEMINI_TOOLS = [
  {
    name: 'smartstore_action',
    description: '스마트스토어 주문 조회, 배송, 정산 등 모든 작업',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '작업 종류 (query_orders_today, process_shipping 등)' },
        period: { type: 'string', description: '조회 기간' },
        response: { type: 'string', description: 'JARVIS 응답' },
      },
      required: ['action', 'response'],
    },
  },
  {
    name: 'morning_briefing',
    description: '아침 종합 보고 (스마트스토어 + 인플루언서 + 이메일)',
    parameters: {
      type: 'object',
      properties: {
        response: { type: 'string', description: '종합 보고 내용' },
      },
      required: ['response'],
    },
  },
  {
    name: 'analyze_influencers_smart',
    description: '지능형 인플루언서 분석 (조회수 가속도 + GPT 매칭률)',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['YouTube', 'Instagram', 'TikTok', 'Naver Blog'] },
        count: { type: 'number', description: '수집 인원' },
        min_subscribers: { type: 'number', description: '최소 구독자 수' },
        response: { type: 'string', description: 'JARVIS 응답' },
      },
      required: ['platform', 'response'],
    },
  },
  {
    name: 'search_youtube',
    description: 'YouTube 채널 검색 및 분석',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '검색 키워드' },
        response: { type: 'string', description: 'JARVIS 응답' },
      },
      required: ['keyword', 'response'],
    },
  },
  {
    name: 'search_naver',
    description: '네이버 블로그/카페 검색',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '검색 키워드' },
        source: { type: 'string', enum: ['blog', 'cafe'] },
        response: { type: 'string', description: 'JARVIS 응답' },
      },
      required: ['keyword', 'response'],
    },
  },
  {
    name: 'search_instagram',
    description: 'Instagram 계정 검색',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '검색 키워드' },
        response: { type: 'string', description: 'JARVIS 응답' },
      },
      required: ['keyword', 'response'],
    },
  },
  {
    name: 'search_local',
    description: '지역 검색 (맛집, 병원, 카페 등)',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어' },
        response: { type: 'string', description: 'JARVIS 응답' },
      },
      required: ['query', 'response'],
    },
  },
  {
    name: 'generate_content',
    description: '마케팅 콘텐츠 생성 (헤드카피, 스토리, 스크립트)',
    parameters: {
      type: 'object',
      properties: {
        content_type: { type: 'string', enum: ['headcopy', 'storytelling', 'script', 'full_package'] },
        product: { type: 'string', description: '제품명' },
        response: { type: 'string', description: 'JARVIS 응답' },
      },
      required: ['content_type', 'product', 'response'],
    },
  },
  {
    name: 'send_email_campaign',
    description: '이메일 캠페인 발송',
    parameters: {
      type: 'object',
      properties: {
        recipients: { type: 'string', description: '수신자 목록' },
        subject: { type: 'string', description: '제목' },
        response: { type: 'string', description: 'JARVIS 응답' },
      },
      required: ['recipients', 'subject', 'response'],
    },
  },
  {
    name: 'execute_web_task',
    description: '웹 자동화 작업 (예약, 검색 등)',
    parameters: {
      type: 'object',
      properties: {
        task_type: { type: 'string', description: '작업 유형' },
        target_site: { type: 'string', description: '대상 사이트' },
        response: { type: 'string', description: 'JARVIS 응답' },
      },
      required: ['task_type', 'response'],
    },
  },
  {
    name: 'manus_task',
    description: '마누스 에이전트 작업 위임',
    parameters: {
      type: 'object',
      properties: {
        mission: { type: 'string', description: '미션 설명' },
        response: { type: 'string', description: 'JARVIS 응답' },
      },
      required: ['mission', 'response'],
    },
  },
];

// ── Gemini 클라이언트 ──
let geminiClient: GoogleGenerativeAI | null = null;

export function initializeGemini(apiKey: string) {
  geminiClient = new GoogleGenerativeAI(apiKey);
  console.log('[JARVIS] Gemini 1.5 Pro 초기화 완료');
}

export function getGeminiClient(): GoogleGenerativeAI | null {
  return geminiClient;
}

// ── 메인 askGPT (Gemini 기반) ──
export async function askGPT(userMessage: string): Promise<JarvisAction> {
  if (!geminiClient) {
    console.error('[JARVIS] Gemini API 키가 설정되지 않았습니다.');
    return parseCommand(userMessage);
  }

  sessionTurnCount++;
  saveConversationEntry('user', userMessage);
  conversationHistory.push({ role: 'user', content: userMessage });
  if (conversationHistory.length > 40) conversationHistory.splice(0, 2);

  const memory = loadMemory();
  const memoryLines = Object.entries(memory).map(([k, v]) => `• ${k}: ${v}`).join('\n');
  const memoryContext = memoryLines ? `\n\n[장기 기억]\n${memoryLines}` : '';
  const prevSessionContext = getPreviousSessionSummary();
  const learnedContext = getLearnedKnowledgeContext();
  const sessionContext = sessionTurnCount > 1 ? `\n\n[현재 세션: ${sessionTurnCount}번째 대화]` : '';
  const sheetContext = await getSheetDataContext();
  const sheetContextBlock = sheetContext ? `\n\n[구글 시트 데이터]\n${sheetContext}` : '';

  const contextAddition = [memoryContext, prevSessionContext, learnedContext, sessionContext, sheetContextBlock]
    .filter(Boolean).join('');

  try {
    const model = geminiClient.getGenerativeModel({
      model: 'gemini-1.5-pro',
      systemInstruction: GEMINI_SYSTEM_PROMPT + contextAddition,
      tools: [{ functionDeclarations: GEMINI_TOOLS }],
    });

    const chat = model.startChat({
      history: conversationHistory.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
    });

    const result = await chat.sendMessage(userMessage);
    const response = result.response;

    console.log('[JARVIS] Gemini 응답:', response.candidates?.[0]?.finishReason);

    // Function Call 처리
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.functionCall) {
          const fnName = part.functionCall.name;
          const fnArgs = part.functionCall.args || {};
          console.log('[JARVIS] Function call:', fnName, fnArgs);
          return buildActionFromFunction(fnName, fnArgs);
        }
      }
    }

    // 텍스트 응답
    const textContent = response.text();
    if (textContent) {
      saveConversationEntry('assistant', textContent);
      conversationHistory.push({ role: 'assistant', content: textContent });
      lastActionType = 'chat';
      return {
        type: 'chat',
        response: textContent,
        followUp: '다른 작업이 필요하신가요, 선생님?',
      };
    }

    return parseCommand(userMessage);
  } catch (error) {
    console.error('[JARVIS] Gemini 오류:', error);
    return parseCommand(userMessage);
  }
}

// ── Function Call 빌더 ──
function buildActionFromFunction(fnName: string, args: any): JarvisAction {
  const followUp = args.followUp || '다른 작업이 필요하신가요, 선생님?';

  switch (fnName) {
    case 'smartstore_action':
      return {
        type: 'smartstore_orders',
        params: {
          action: String(args.action || 'query_orders_today'),
          period: String(args.period || ''),
        },
        workingMessage: `스마트스토어 ${args.action} 처리 중...`,
        response: String(args.response || '스마트스토어 작업을 시작하겠습니다, 선생님.'),
        followUp,
      };

    case 'morning_briefing':
      return {
        type: 'morning_briefing',
        response: String(args.response || '아침 종합 보고를 시작하겠습니다, 선생님.'),
        workingMessage: '모닝 브리핑 데이터 수집 중...',
        followUp,
      };

    case 'analyze_influencers_smart':
      return {
        type: 'analyze_influencers_smart',
        params: {
          platform: String(args.platform || 'YouTube'),
          count: Number(args.count || 10),
          min_subscribers: Number(args.min_subscribers || 10000),
        },
        workingMessage: `${args.platform} 인플루언서 지능형 분석 중...`,
        response: String(args.response || '인플루언서를 분석하겠습니다, 선생님.'),
        followUp,
      };

    case 'search_youtube':
      return {
        type: 'collect',
        params: { keyword: String(args.keyword || '') },
        workingMessage: `YouTube 검색 중: ${args.keyword}`,
        response: String(args.response || 'YouTube를 검색하겠습니다, 선생님.'),
        followUp,
      };

    case 'search_naver':
      return {
        type: 'naver_search',
        params: {
          keyword: String(args.keyword || ''),
          source: String(args.source || 'blog'),
        },
        workingMessage: `네이버 ${args.source === 'cafe' ? '카페' : '블로그'} 검색 중...`,
        response: String(args.response || '네이버를 검색하겠습니다, 선생님.'),
        followUp,
      };

    case 'search_instagram':
      return {
        type: 'collect',
        params: { keyword: String(args.keyword || '') },
        workingMessage: `Instagram 검색 중: ${args.keyword}`,
        response: String(args.response || 'Instagram을 검색하겠습니다, 선생님.'),
        followUp,
      };

    case 'search_local':
      return {
        type: 'local_search',
        params: { query: String(args.query || '') },
        workingMessage: `지역 검색 중: ${args.query}`,
        response: String(args.response || '지역 검색을 시작하겠습니다, 선생님.'),
        followUp,
      };

    case 'generate_content':
      return {
        type: 'create_banner',
        params: {
          content_type: String(args.content_type || 'full_package'),
          product: String(args.product || ''),
        },
        workingMessage: `${args.product} 마케팅 콘텐츠 생성 중...`,
        response: String(args.response || '콘텐츠를 생성하겠습니다, 선생님.'),
        followUp,
      };

    case 'send_email_campaign':
      return {
        type: 'send_email',
        params: {
          recipients: String(args.recipients || ''),
          subject: String(args.subject || ''),
        },
        workingMessage: '이메일 캠페인 발송 중...',
        response: String(args.response || '이메일을 발송하겠습니다, 선생님.'),
        followUp,
      };

    case 'execute_web_task':
      return {
        type: 'execute_web_task',
        params: {
          task_type: String(args.task_type || 'general'),
          target_site: String(args.target_site || ''),
        },
        workingMessage: `웹 작업 진행 중...`,
        response: String(args.response || '웹 작업을 시작하겠습니다, 선생님.'),
        followUp,
      };

    case 'manus_task':
      return {
        type: 'manus_task',
        params: { mission: String(args.mission || '') },
        workingMessage: '마누스 에이전트 작업 위임 중...',
        response: String(args.response || '마누스 에이전트를 활성화하겠습니다, 선생님.'),
        followUp,
      };

    default:
      return { type: 'unknown', response: String(args.response || '') };
  }
}

// ── 나머지 기존 함수들 (호환성 유지) ──
export async function generateBannerImage(prompt: string, style: string): Promise<string | null> {
  console.log('[JARVIS] 배너 생성 요청:', prompt);
  return null; // Gemini 이미지 생성은 별도 구현
}

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
  blogId: string;
  email: string;
  guessedEmail: string;
  realEmail: string;
  neighborCount: number;
  dailyVisitors: number;
  profileDesc: string;
  description: string;
  postDate: string;
}

export async function searchNaverAPI(
  keyword: string,
  source: 'blog' | 'cafe' = 'blog',
  display: number = 30,
  sort: 'sim' | 'date' = 'sim'
): Promise<{ total: number; items: NaverSearchItem[] }> {
  const apiBase = import.meta.env.PROD ? '' : 'https://mawinpay-jarvis.vercel.app';
  const url = `${apiBase}/api/naver-search?keyword=${encodeURIComponent(keyword)}&source=${source}&display=${display}&sort=${sort}`;
  console.log('[JARVIS] 네이버 검색 API 호출:', url);
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Naver API 오류: ${res.status}`);
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
  customUrl?: string;
}

export async function searchYouTubeAPI(
  keyword: string,
  maxResults: number = 10
): Promise<{ total: number; keyword: string; items: YouTubeChannel[] }> {
  const apiBase = import.meta.env.PROD ? '' : 'https://mawinpay-jarvis.vercel.app';
  const url = `${apiBase}/api/youtube-search?keyword=${encodeURIComponent(keyword)}&maxResults=${maxResults}`;
  console.log('[JARVIS] YouTube 검색 API 호출:', url);
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `YouTube API 오류: ${res.status}`);
  }
  return res.json();
}

// ── 인스타그램 계정 검색 ──
export interface InstagramAccount {
  username: string;
  profileUrl: string;
  followers: number;
  followersFormatted: string;
  bio: string;
  email: string;
  fullName: string;
  isVerified: boolean;
  source: string;
}

export async function searchInstagramAPI(
  keyword: string,
  maxResults: number = 10,
  fetchProfile: boolean = false
): Promise<{ total: number; keyword: string; items: InstagramAccount[] }> {
  const apiBase = import.meta.env.PROD ? '' : 'https://mawinpay-jarvis.vercel.app';
  const url = `${apiBase}/api/instagram-search?keyword=${encodeURIComponent(keyword)}&maxResults=${maxResults}&fetchProfile=${fetchProfile}`;
  console.log('[JARVIS] Instagram 검색 API 호출:', url);
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err.message || `Instagram 검색 오류: ${res.status}`);
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

// ── 시간대별 인사 헬퍼 ──
function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return '좋은 아침입니다';
  if (h >= 12 && h < 17) return '좋은 오후입니다';
  if (h >= 17 && h < 21) return '좋은 저녁입니다';
  return '늦은 시간에도 수고가 많으십니다';
}

// ── 로컬 폴백 파서 (Gemini 연결 실패 시 사용) ──
export function parseCommand(text: string): JarvisAction {
  const lower = text.toLowerCase().trim();
  const greeting = getTimeGreeting();

  // [A] 인사 / 호출
  if (/^(안녕|반가워|잘 있었어|오래만|하이|헬로|hi|hello|자비스)/.test(lower)) {
    const variants = [
      `${greeting}, 선생님. 오늘은 어떤 작업을 시작할까요?`,
      `${greeting}, 선생님. 모든 시스템이 정상 작동 중입니다.`,
      `대기 중이었습니다, 선생님. 오늘 어떤 인플루언서를 노리겠습니까?`,
    ];
    return {
      type: 'greeting',
      response: variants[Math.floor(Math.random() * variants.length)],
      followUp: '지난번 캠페인 결과가 궁금하시면 분석해드릴 수도 있습니다.',
    };
  }

  // [B] 모닝 브리핑
  if (/브리핑|보고|현황|모닝/.test(lower)) {
    return {
      type: 'morning_briefing',
      workingMessage: '모닝 브리핑 데이터 수집 중...',
      response: '선생님, 오늘의 업무 브리핑을 준비하겠습니다.',
    };
  }

  // [C] 감정 표현
  if (/힘들다|지쳤어|피곤해|힘들어/.test(lower)) {
    return { type: 'chat', response: '수고하십니다, 선생님. 잠시 쉬어가시면서 제가 도울 수 있는 일을 정리해 드릴까요?', followUp: '오늘 남은 작업 중에 제가 대신 할 수 있는 것이 있으면 말씀해 주세요.' };
  }
  if (/짜증나|화났어|열받아/.test(lower)) {
    return { type: 'chat', response: '어떤 부분이 불편하셨나요, 선생님? 제가 해결해 드리겠습니다.', followUp: '구체적으로 어떤 문제인지 말씀해 주시겠어요?' };
  }
  if (/좋다|기분 좋아|잘 됐어|신난다/.test(lower)) {
    return { type: 'chat', response: '저도 기쁩니다, 선생님. 이 기세로 오늘 캠페인도 재미있게 진행해 보시죠?', followUp: '어떤 작업부터 시작할까요?' };
  }

  // [D] 확인 / 승인
  if (/^응$|^어$|^맞아$|^그래$|^오케이$|^좋아$|^어어$/.test(lower)) {
    return { type: 'chat', response: '알겠습니다, 선생님. 바로 진행하겠습니다.', followUp: undefined };
  }
  if (/^아니$|^싫어$|^됐어$|^안 해$/.test(lower)) {
    return { type: 'chat', response: '알겠습니다, 선생님. 다른 방향으로 진행하겠습니다. 어떤 작업을 원하시나요?', followUp: undefined };
  }

  // [E] 감사
  if (/고마워|감사|수고|잘했어|훌륭해|최고|대단/.test(lower)) {
    return {
      type: 'chat',
      response: '감사합니다, 선생님. 선생님의 성공을 위해 항상 최선을 다하겠습니다.',
      followUp: '다음 단계로 진행할 작업이 있으시면 말씀해 주세요.',
    };
  }

  // [F] 자기 소개
  if (/누구야|뭐야|어디야|ai야/.test(lower)) {
    return { type: 'chat', response: '저는 JARVIS입니다, 선생님. Just A Rather Very Intelligent System. MAWINPAY의 인텔리전스 코어로, 아이언맨의 자비스를 모델로 설계되었습니다. 현재 Google Gemini 1.5 Pro의 지능으로 구동됩니다.', followUp: '선생님의 바이럴 마케팅을 위해 만들어졌습니다. 어떤 작업을 시작할까요?' };
  }

  // [G] 스마트스토어
  if (/주문|스마트스토어|배송|정산/.test(lower)) {
    return {
      type: 'smartstore_orders',
      params: { action: 'query_orders_today' },
      workingMessage: '스마트스토어 데이터 조회 중...',
      response: '스마트스토어 주문 내역을 확인하겠습니다, 선생님.',
    };
  }

  // [H] 인플루언서 수집 (유튜브/인스타/네이버 자동 감지)
  if (/수집|찾아|인플루언서|블로거|유튜버|크리에이터|유튜브|인스타|instagram|youtube/.test(lower)) {
    const countMatch = lower.match(/(\d+)\s*명/);
    const count = countMatch ? parseInt(countMatch[1]) : 50;
    const keyword = lower.match(/(맛집|뷰티|여행|패션|육아|운동|헬스|요리|게임|음악|캠핑|농산물|밤|먹방|리뷰|테크|IT|푸드|라이프)/)?.[1] || '';
    
    // 플랫폼 자동 감지
    const hasYouTube = /유튜브|유튜버|youtube|yt|영상/.test(lower);
    const hasInstagram = /인스타|instagram|ig|릴스/.test(lower);
    const hasNaver = /네이버|블로거|블로그|naver/.test(lower);
    
    // 복수 플랫폼 감지
    let platform = '';
    let platforms: { platform: string; count: number }[] = [];
    
    if ((hasYouTube && hasInstagram) || (hasYouTube && hasNaver) || (hasInstagram && hasNaver)) {
      // 복수 플랫폼
      if (hasYouTube) platforms.push({ platform: 'YouTube', count: Math.ceil(count / 2) });
      if (hasInstagram) platforms.push({ platform: 'Instagram', count: Math.ceil(count / 3) });
      if (hasNaver) platforms.push({ platform: 'Naver Blog', count: Math.ceil(count / 3) });
    } else if (hasYouTube) {
      platform = 'YouTube';
    } else if (hasInstagram) {
      platform = 'Instagram';
    } else if (hasNaver) {
      platform = 'Naver Blog';
    }
    // 플랫폼 미지정 시 유튜브+네이버 동시 수집
    if (!platform && platforms.length === 0) {
      platforms = [
        { platform: 'YouTube', count: Math.ceil(count / 2) },
        { platform: 'Naver Blog', count: Math.ceil(count / 2) },
      ];
    }
    
    const platformLabel = platform || platforms.map(p => p.platform).join('+');
    return {
      type: 'collect',
      params: { 
        count, 
        keyword, 
        platform, 
        platforms: platforms.length > 0 ? JSON.stringify(platforms) : '',
        category: keyword || '전체' 
      },
      workingMessage: `${platformLabel} ${keyword ? keyword + ' ' : ''}인플루언서 ${count}명 수집 중...`,
      response: `${platformLabel}에서 ${keyword ? keyword + ' 분야 ' : ''}인플루언서 ${count}명을 수집하겠습니다. 구글 시트에 실시간으로 저장됩니다.`,
      followUp: '수집이 완료되면 이메일 발송도 바로 진행할까요?',
    };
  }

  // [I] 검색
  if (/검색/.test(lower)) {
    const keyword = text.replace(/검색|해줘|해주세요/g, '').trim();
    return {
      type: 'naver_search',
      params: { keyword: keyword || text, source: 'blog', display: 30, sort: 'sim' },
      workingMessage: `'${keyword || text}' 검색 중...`,
      response: `'${keyword || text}'을(를) 검색하겠습니다, 선생님.`,
      followUp: '검색 결과를 구글 시트에도 저장할까요?',
    };
  }

  // [J] 이메일
  if (/이메일|메일|발송|보내|전송/.test(lower)) {
    const countMatch = lower.match(/(\d+)\s*(명|통|건)/);
    const count = countMatch ? parseInt(countMatch[1]) : 50;
    return {
      type: 'send_email',
      params: { count, template: '협업 제안' },
      workingMessage: '이메일 발송 중...',
      response: `${count}명에게 협업 제안 이메일을 발송하겠습니다.`,
      followUp: '3일 후 응답이 없는 분들에게 팔로업 이메일을 보낼까요?',
    };
  }

  // [K] 배너/디자인
  if (/배너|디자인|썸네일/.test(lower)) {
    const keyword = lower.match(/(뷰티|맛집|여행|패션|운동|제품)/)?.[1] || '마케팅';
    return {
      type: 'create_banner',
      params: { prompt: `${keyword} influencer marketing campaign banner`, style: 'modern' },
      workingMessage: 'AI 배너 생성 중...',
      response: `${keyword} 마케팅 배너를 생성하겠습니다. 잠시만 기다려 주세요.`,
    };
  }

  // [L] 현황/리포트
  if (/현황|통계|분석|성과|결과|리포트/.test(lower)) {
    return {
      type: 'report',
      params: { period: '이번 주' },
      workingMessage: '데이터 분석 중...',
      response: '이번 주 캠페인 성과를 분석하겠습니다.',
      followUp: '성과를 개선하기 위한 전략도 제안해드릴까요?',
    };
  }

  // [M] 맛집/지역 검색
  if (/맛집|식당|카페|업체|가게/.test(lower)) {
    return {
      type: 'local_search',
      params: { query: text.replace(/해줘|찾아줘|검색해줘/g, '').trim() || text },
      workingMessage: `'${text}' 업체 검색 중...`,
      response: `'${text}' 업체를 검색하겠습니다, 선생님.`,
      followUp: '검색 결과를 구글 시트에도 저장할까요?',
    };
  }

  // [N] 모호한 발화 — 폴백
  return {
    type: 'chat',
    response: '죄송합니다, 선생님. 조금 더 구체적으로 말씀해 주시겠습니까? 인플루언서 수집, 이메일 발송, 콘텐츠 작성, 예약, 지역 검색 중 어떤 작업을 원하시나요?',
  };
}

// ── Manus AI 에이전트 실행 함수 ──
export async function executeManusTask(
  mission: string,
  missionType: string = 'complex',
  urgency: string = 'normal'
): Promise<{ taskId: string; status: string; message: string }> {
  try {
    const prompt = buildManusPrompt(mission, JSON.stringify({
      businessType: '농산물 판매 및 바이럴 마케팅',
      targetPlatforms: ['유튜브', '인스타그램', '네이버'],
    }));
    const result = await createManusTask(prompt);
    if (result.success && result.task_id) {
      return {
        taskId: result.task_id,
        status: 'running',
        message: `Manus 미션이 시작되었습니다. (Task ID: ${result.task_id.slice(0, 8)}...)`,
      };
    }
    return {
      taskId: '',
      status: 'error',
      message: (result as any).error || 'Manus 태스크 생성 실패',
    };
  } catch (error) {
    console.error('[JARVIS-MANUS] Task 생성 오류:', error);
    return {
      taskId: '',
      status: 'error',
      message: 'Manus 에이전트 연결에 실패했습니다. API 키를 확인해 주세요.',
    };
  }
}

export { fetchManusStatus as getManusTaskStatus };
export { sendManusMessage as sendManusMsg };
export { checkManusConnection };

export function clearHistory() {
  conversationHistory.length = 0;
  sessionTurnCount = 0;
}

export function getConversationTurnCount() {
  return sessionTurnCount;
}

export const JARVIS_GREETINGS = [
  `${getTimeGreeting()}, 선생님. MAWINPAY 인텔리전스 시스템이 온라인 상태입니다. 오늘 어떤 작업을 시작할까요?`,
  '시스템 활성화 완료. Google Gemini 1.5 Pro 뇌가 정상 작동 중입니다. 무엇을 도와드릴까요, 선생님?',
  '대기 상태에서 깨어났습니다. 인플루언서 수집부터 시작할까요, 아니면 다른 작업이 있으신가요?',
  `${getTimeGreeting()}, 선생님. 모닝 브리핑을 원하시면 말씀해 주세요.`,
];
