// jarvis-brain.ts — 진짜 대화형 JARVIS: 감정·맥락·자연스러운 흐름

export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'working';

export type JarvisActionType =
  | 'collect' | 'send_email' | 'create_banner' | 'report'
  | 'schedule' | 'help' | 'greeting' | 'status' | 'confirm' | 'chat' | 'unknown';

export type JarvisAction = {
  type: JarvisActionType;
  params?: Record<string, string | number>;
  response: string;
  workingMessage?: string;
  imageUrl?: string;
  followUp?: string; // JARVIS가 대화를 이어가기 위해 던지는 후속 질문
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
    description: '캠페인이나 작업을 특정 시간에 예약할 때 호출.',
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
2. 이메일 발송 — 개인화된 마케팅 이메일 발송 캠페인
3. AI 배너 생성 — DALL-E 3 기반 마케팅 비주얼 제작
4. 캠페인 분석 — 성과 분석 및 인사이트 제공
5. 일정 관리 — 캠페인 자동화 스케줄링
6. 자유 대화 — 마케팅 전략, 트렌드, 아이디어 논의

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
  conversationHistory.push({ role: 'user', content: userMessage });
  if (conversationHistory.length > 40) conversationHistory.splice(0, 2);

  // 메모리 컨텍스트
  const memory = loadMemory();
  const memoryLines = Object.entries(memory).map(([k, v]) => `• ${k}: ${v}`).join('\n');
  const memoryContext = memoryLines
    ? `\n\n[장기 기억 — 이전 세션에서 기억된 정보]\n${memoryLines}`
    : '';

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
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + memoryContext + sessionContext },
          ...conversationHistory,
        ],
        functions: JARVIS_FUNCTIONS,
        function_call: 'auto',
        max_tokens: 500,
        temperature: 0.85, // 더 자연스럽고 창의적인 응답
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
      conversationHistory.push({ role: 'assistant', content: fnArgs.response || '' });
      const action = buildActionFromFunction(fnName, fnArgs);
      lastActionType = action.type;
      return action;
    }

    // 일반 텍스트 응답
    const reply = message?.content ?? '죄송합니다, 잠시 연결이 불안정합니다.';
    conversationHistory.push({ role: 'assistant', content: reply });
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
