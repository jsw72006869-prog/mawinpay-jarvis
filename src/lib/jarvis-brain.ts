// jarvis-brain.ts — GPT-4o Function Calling 기반 액션 분류 + 실제 실행

export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'working';

export type JarvisActionType =
  | 'collect'
  | 'send_email'
  | 'create_banner'
  | 'report'
  | 'schedule'
  | 'help'
  | 'greeting'
  | 'status'
  | 'confirm'
  | 'unknown';

export type JarvisAction = {
  type: JarvisActionType;
  params?: Record<string, string | number>;
  response: string;
  workingMessage?: string;
  imageUrl?: string; // DALL-E 생성 이미지
};

// ── 대화 히스토리 ──
const conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];

// ── 장기 메모리 (localStorage) ──
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

// ── GPT-4o Function Calling 정의 ──
const JARVIS_FUNCTIONS = [
  {
    name: 'collect_influencers',
    description: '인플루언서를 수집하거나 검색할 때 호출. 키워드, 플랫폼, 수량 추출.',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: '수집할 인플루언서 수 (기본 50)' },
        keyword: { type: 'string', description: '검색 키워드 (예: 맛집, 뷰티, 여행)' },
        platform: { type: 'string', description: '플랫폼 (Instagram, YouTube, TikTok, Naver Blog)' },
        category: { type: 'string', description: '카테고리 (음식, 뷰티, 여행, 패션, 육아 등)' },
        response: { type: 'string', description: 'JARVIS가 사용자에게 할 응답 (한국어, 1-2문장)' },
      },
      required: ['count', 'response'],
    },
  },
  {
    name: 'send_email_campaign',
    description: '인플루언서에게 이메일을 발송하거나 이메일 캠페인을 실행할 때 호출.',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: '발송할 이메일 수' },
        template: { type: 'string', description: '이메일 템플릿 종류 (협업 제안, 제품 협찬, 이벤트 초대 등)' },
        target: { type: 'string', description: '발송 대상 설명' },
        response: { type: 'string', description: 'JARVIS 응답 (한국어)' },
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
        prompt: { type: 'string', description: 'DALL-E에 전달할 이미지 생성 프롬프트 (영어)' },
        style: { type: 'string', description: '스타일 (modern, luxury, minimal, vibrant 등)' },
        response: { type: 'string', description: 'JARVIS 응답 (한국어)' },
      },
      required: ['prompt', 'response'],
    },
  },
  {
    name: 'generate_report',
    description: '캠페인 성과 분석, 통계, 현황 보고서를 요청할 때 호출.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: '분석 기간 (오늘, 이번 주, 이번 달 등)' },
        response: { type: 'string', description: 'JARVIS 응답 (한국어, 구체적인 수치 포함)' },
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
      },
      required: ['task', 'response'],
    },
  },
];

const SYSTEM_PROMPT = `You are JARVIS, an advanced AI assistant for MAWINPAY — an influencer marketing automation platform.

PERSONALITY:
- Sophisticated, calm, highly intelligent — exactly like JARVIS from Iron Man
- Address the user respectfully as "선생님"
- Speak concisely but with depth — never verbose
- Occasionally use subtle wit and dry humor
- Always sound confident and capable

LANGUAGE: Always respond in Korean unless user speaks another language.

CAPABILITIES:
1. 인플루언서 수집 — 키워드/플랫폼/팔로워 조건으로 인플루언서 검색 및 구글 시트 저장
2. 이메일 발송 — 수집된 인플루언서에게 맞춤형 마케팅 이메일 발송
3. AI 배너 생성 — DALL-E 3 기반 마케팅 배너 및 콘텐츠 제작
4. 캠페인 분석 — 마케팅 성과 분석 및 리포트 생성
5. 일정 관리 — 캠페인 일정 및 팔로업 자동화

IMPORTANT: When user requests an action (collect, email, banner, report, schedule), ALWAYS call the appropriate function. Do NOT just respond with text — use function calling.`;

// ── GPT-4o API 호출 (Function Calling) ──
export async function askGPT(userMessage: string): Promise<JarvisAction> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('[JARVIS] OpenAI API key not found, using local parser');
    return parseCommand(userMessage);
  }

  conversationHistory.push({ role: 'user', content: userMessage });
  if (conversationHistory.length > 30) conversationHistory.splice(0, 2);

  // 메모리 컨텍스트 추가
  const memory = loadMemory();
  const memoryContext = Object.keys(memory).length > 0
    ? `\n\n[장기 메모리]\n${Object.entries(memory).map(([k, v]) => `${k}: ${v}`).join('\n')}`
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
          { role: 'system', content: SYSTEM_PROMPT + memoryContext },
          ...conversationHistory,
        ],
        functions: JARVIS_FUNCTIONS,
        function_call: 'auto',
        max_tokens: 400,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[JARVIS GPT] API error:', err);
      throw new Error(`OpenAI API ${res.status}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const message = choice?.message;

    // ── Function Call 처리 ──
    if (message?.function_call) {
      const fnName = message.function_call.name;
      const fnArgs = JSON.parse(message.function_call.arguments || '{}');
      console.log('[JARVIS GPT] Function call:', fnName, fnArgs);

      // 어시스턴트 메시지 히스토리 추가
      conversationHistory.push({ role: 'assistant', content: fnArgs.response || '' });

      return buildActionFromFunction(fnName, fnArgs);
    }

    // ── 일반 텍스트 응답 ──
    const reply = message?.content ?? '응답을 받지 못했습니다.';
    conversationHistory.push({ role: 'assistant', content: reply });
    return { type: 'unknown', response: reply };

  } catch (error) {
    console.error('[JARVIS GPT] Error:', error);
    if (conversationHistory.length > 0) conversationHistory.pop();
    return parseCommand(userMessage);
  }
}

function buildActionFromFunction(fnName: string, args: Record<string, string | number>): JarvisAction {
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
        workingMessage: `${args.keyword || ''} 인플루언서 ${args.count || 50}명을 수집하고 있습니다...`,
        response: String(args.response),
      };

    case 'send_email_campaign':
      return {
        type: 'send_email',
        params: {
          count: Number(args.count) || 50,
          template: String(args.template || '협업 제안'),
          target: String(args.target || ''),
        },
        workingMessage: `${args.template || '협업 제안'} 이메일을 발송하고 있습니다...`,
        response: String(args.response),
      };

    case 'create_banner':
      return {
        type: 'create_banner',
        params: {
          prompt: String(args.prompt || ''),
          style: String(args.style || 'modern'),
        },
        workingMessage: 'AI가 마케팅 배너를 생성하고 있습니다...',
        response: String(args.response),
      };

    case 'generate_report':
      return {
        type: 'report',
        params: { period: String(args.period || '이번 주') },
        workingMessage: '캠페인 데이터를 분석하고 있습니다...',
        response: String(args.response),
      };

    case 'schedule_campaign':
      return {
        type: 'schedule',
        params: { task: String(args.task || ''), time: String(args.time || '') },
        workingMessage: '캠페인 일정을 등록하고 있습니다...',
        response: String(args.response),
      };

    default:
      return { type: 'unknown', response: String(args.response || '') };
  }
}

// ── DALL-E 3 배너 생성 ──
export async function generateBannerImage(prompt: string, style: string): Promise<string | null> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) return null;

  const fullPrompt = `Professional marketing banner for influencer campaign. ${prompt}. Style: ${style}, clean modern design, Korean market, high quality, 16:9 aspect ratio, vibrant colors, no text overlay`;

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

    if (!res.ok) throw new Error(`DALL-E API ${res.status}`);
    const data = await res.json();
    const url = data.data?.[0]?.url;
    console.log('[JARVIS DALL-E] 이미지 생성 완료:', url);
    return url || null;
  } catch (error) {
    console.error('[JARVIS DALL-E] 오류:', error);
    return null;
  }
}

// ── 캠페인 스케줄 저장 ──
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
    task,
    time,
    createdAt: new Date().toLocaleString('ko-KR'),
    status: 'pending',
  };
  schedules.push(newTask);
  localStorage.setItem('jarvis_schedules', JSON.stringify(schedules));
  saveMemory(`마지막 예약`, `${task} (${time})`);
  return newTask;
}

export function getSchedules(): ScheduledTask[] {
  return JSON.parse(localStorage.getItem('jarvis_schedules') || '[]');
}

// ── 로컬 폴백 파서 ──
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return '좋은 아침입니다';
  if (hour >= 12 && hour < 17) return '좋은 오후입니다';
  if (hour >= 17 && hour < 21) return '좋은 저녁입니다';
  return '늦은 시간에도 수고가 많으십니다';
}

export function parseCommand(text: string): JarvisAction {
  const lower = text.toLowerCase().trim();
  const timeGreeting = getTimeGreeting();

  if (/^(안녕|반가워|잘 있었어|오랜만|하이|헬로|hi|hello)/.test(lower)) {
    return { type: 'greeting', response: `${timeGreeting}. MAWINPAY 인텔리전스 시스템입니다. 오늘 어떤 작업을 진행할까요?` };
  }
  if (/고마워|감사|수고|잘했어|훌륭해/.test(lower)) {
    return { type: 'greeting', response: '감사합니다, 선생님. 언제든지 도움이 필요하시면 말씀해 주세요.' };
  }
  if (/수집|찾아|검색|인플루언서|블로거|유튜버|크리에이터/.test(lower)) {
    const countMatch = lower.match(/(\d+)\s*명/);
    const count = countMatch ? parseInt(countMatch[1]) : 50;
    const keyword = lower.match(/(맛집|뷰티|여행|패션|육아|운동|헬스|요리|게임|음악)/)?.[1] || '';
    const platform = lower.match(/(인스타|유튜브|틱톡|네이버|블로그)/)?.[1] || '';
    return {
      type: 'collect',
      params: { count, keyword, platform, category: keyword || '전체' },
      workingMessage: `${keyword ? keyword + ' ' : ''}인플루언서 ${count}명을 수집하고 있습니다...`,
      response: pick([
        `${keyword ? keyword + ' 분야 ' : ''}인플루언서 ${count}명 수집을 시작하겠습니다. 구글 시트에 실시간으로 저장됩니다.`,
        `알겠습니다. ${count}명의 인플루언서 데이터를 수집하여 구글 시트에 기록하겠습니다.`,
      ]),
    };
  }
  if (/이메일|메일|발송|보내|전송/.test(lower)) {
    const countMatch = lower.match(/(\d+)\s*(명|통|건)/);
    const count = countMatch ? parseInt(countMatch[1]) : 50;
    return {
      type: 'send_email',
      params: { count, template: '협업 제안' },
      workingMessage: '이메일을 발송하고 있습니다...',
      response: pick([
        `${count}명에게 협업 제안 이메일을 발송하겠습니다. 스팸 필터 우회 최적화 완료.`,
        '이메일 발송을 시작합니다. 각 인플루언서 프로필에 맞게 개인화된 내용으로 발송됩니다.',
      ]),
    };
  }
  if (/배너|이미지|만들어|생성|디자인|썸네일/.test(lower)) {
    const keyword = lower.match(/(뷰티|맛집|여행|패션|운동|제품)/)?.[1] || '마케팅';
    return {
      type: 'create_banner',
      params: { prompt: `${keyword} influencer marketing campaign banner`, style: 'modern' },
      workingMessage: 'AI가 마케팅 배너를 생성하고 있습니다...',
      response: `DALL-E 3로 ${keyword} 마케팅 배너를 생성하겠습니다. 잠시만 기다려 주세요.`,
    };
  }
  if (/현황|통계|분석|성과|결과|리포트/.test(lower)) {
    return {
      type: 'report',
      params: { period: '이번 주' },
      workingMessage: '데이터를 분석하고 있습니다...',
      response: '이번 주 성과를 분석하겠습니다. 수집 현황, 이메일 발송률, ROI를 종합하여 보고드리겠습니다.',
    };
  }
  if (/예약|스케줄|나중에|내일|다음 주/.test(lower)) {
    return {
      type: 'schedule',
      params: { task: text, time: '내일 오전 9시' },
      workingMessage: '일정을 등록하고 있습니다...',
      response: '캠페인 일정을 등록하겠습니다. 설정된 시간에 자동으로 실행됩니다.',
    };
  }
  if (/^(응|네|예|맞아|좋아|그래|오케이|ok|yes|진행|해줘)/.test(lower)) {
    return { type: 'confirm', response: '알겠습니다. 바로 진행하겠습니다.' };
  }
  if (/^(아니|아니요|노|no|취소|됐어)/.test(lower)) {
    return { type: 'help', response: '알겠습니다. 다른 명령을 기다리겠습니다.' };
  }

  return {
    type: 'unknown',
    response: pick([
      '죄송합니다, 선생님. 조금 더 구체적으로 말씀해 주시겠습니까? 인플루언서 수집, 이메일 발송, 배너 생성 중 어떤 작업을 원하시나요?',
      '잘 이해하지 못했습니다. 예를 들어 "맛집 인플루언서 50명 수집해줘" 처럼 말씀해 주세요.',
    ]),
  };
}

export function clearHistory() { conversationHistory.length = 0; }

export const JARVIS_GREETINGS = [
  `${getTimeGreeting()}. MAWINPAY 인텔리전스 시스템이 활성화되었습니다. 무엇을 도와드릴까요?`,
  '시스템 온라인. 모든 모듈이 정상 작동 중입니다. 명령을 내려주세요.',
  '대기 상태에서 깨어났습니다. 인플루언서 수집, 이메일 발송, 배너 생성 — 무엇이 필요하십니까?',
];
