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
  | 'change_voice' | 'list_voices' | 'naver_search' | 'local_search' | 'book_restaurant'
  | 'smartstore_orders' | 'smartstore_shipping' | 'smartstore_products'
  | 'smartstore_confirm' | 'smartstore_sheet' | 'smartstore_settlement'
  | 'smartstore_purchase_email' | 'smartstore_report' | 'unknown';

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
// ── 반복 응답 방지: 최근 5개 응답 해시 추적 ──
const recentResponseHashes: Set<string> = new Set();
const recentResponseList: string[] = [];
function hashResponse(text: string): string {
  return text.trim().slice(0, 30).toLowerCase().replace(/\s+/g, ' ');
}
function isRepeatedResponse(text: string): boolean {
  return recentResponseHashes.has(hashResponse(text));
}
function trackResponse(text: string): void {
  const hash = hashResponse(text);
  recentResponseHashes.add(hash);
  recentResponseList.push(hash);
  if (recentResponseList.length > 5) {
    const oldest = recentResponseList.shift()!;
    recentResponseHashes.delete(oldest);
  }
}

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
const JARVIS_FUNCTIONS_DEF = [
  {
    name: 'collect_influencers',
    description: '인플루언서를 수집하거나 검색할 때 호출. 복수 플랫폼(유튜버 5명 + 네이버 5명 등) 동시 수집 가능.',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: '플랫폼당 수집할 인플루언서 수 (기본 5)' },
        keyword: { type: 'string', description: '검색 키워드 (예: 뷰티, 맛집)' },
        platform: { type: 'string', description: '단일 플랫폼 (YouTube, Naver Blog, Instagram). platforms 배열이 우선.' },
        platforms: { type: 'string', description: '복수 플랫폼 JSON 배열 문자열. 예: [{"platform":"YouTube","count":5},{"platform":"Naver Blog","count":5}]' },
        category: { type: 'string', description: '카테고리' },
        min_subscribers: { type: 'number', description: '최소 구독자/팔로워 수 조건 (예: 10000 = 1만 이상). 0이면 조건 없음.' },
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
    name: 'local_search',
    description: '네이버 지역 업체(맛집, 고기집, 카페, 음식점, 병원, 의원, 산부인과, 치과, 한의원, 피부과 등)를 검색하고 주소/전화번호를 수집할 때 호출. "구미 맛집 찾아줘", "서울 고기집 50개 수집해", "부산 카페 주소 수집해줘", "대구 산부인과 추천해줘", "병원 추천해줘", "리뷰 좋은 산부인과 알려줘" 등.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어 (예: 구미 맛집, 서울 고기집, 대구 샤브샤브)' },
        category: { type: 'string', description: '필터링할 카테고리 키워드 (예: 고기,구이 / 카페 / 한식). 비워두면 전체.' },
        display: { type: 'number', description: '수집할 업체 수 (기본 30, 최대 100)' },
        hours_filter: { type: 'string', description: '영업시간 필터. "24h"=24시간 업체만, "late_night"=22시 이후 심야 영업 포함, "all"=전체(기본)' },
        response: { type: 'string', description: 'JARVIS 응답 (한국어, 검색 시작 멘트)' },
        follow_up: { type: 'string', description: '수집 완료 후 이어서 할 제안' },
      },
      required: ['query', 'response'],
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
  {
    name: 'book_restaurant',
    description: '음식점, 카페, 업체 예약을 자동으로 처리할 때 호출. "맛집 예약해줘", "네이버 예약 해줘", "예약 가능한 시간 알려줘", "OO 식당 예약해줘" 등. 네이버 예약 시스템을 통해 자동으로 예약을 진행합니다.',
    parameters: {
      type: 'object',
      properties: {
        business_name: { type: 'string', description: '예약할 업체명 (예: 홍길동 식당, 스타벅스 강남점)' },
        booking_url: { type: 'string', description: '네이버 예약 URL (알고 있는 경우)' },
        date: { type: 'string', description: '예약 날짜 (예: 2024-12-25, 내일, 이번 주 토요일)' },
        time: { type: 'string', description: '원하는 예약 시간 (예: 18:00, 저녁 6시)' },
        party_size: { type: 'number', description: '예약 인원 수' },
        user_name: { type: 'string', description: '예약자 이름' },
        user_phone: { type: 'string', description: '예약자 전화번호' },
        action: { type: 'string', enum: ['check_availability', 'fill_form', 'notify'], description: 'check_availability=예약 가능 시간 조회, fill_form=예약 폼 자동 입력, notify=완료 알림' },
        response: { type: 'string', description: 'JARVIS 응답 (한국어, 예약 진행 상황 안내)' },
        follow_up: { type: 'string', description: '예약 후 이어서 할 안내' },
      },
      required: ['action', 'response'],
    },
  },
  {
    name: 'smartstore_action',
    description: `스마트스토어 관련 모든 작업을 처리할 때 호출.
주문조회: "오늘 주문 알려줘", "이번 주 주문", "미결제 주문", "취소 요청", "반품 요청", "발송 대기", "아침 업무 시작"
발주확인: "발주 확인해줘", "발주확인 처리", "오늘 발주 확인", "미처리 발주 확인"
주문서: "주문서 만들어줘", "주문서 다운로드", "상품별 주문서", "합포장 묶어줘", "중복 주문 확인"
정산서: "정산서 만들어줘", "이번 달 정산", "수익 얼마야", "베스트셀러", "전월 비교", "주간 마감"
발주이메일: "생산지에 발주해줘", "발주 이메일 보내줘", "공급업체 발주"
발송처리: "발송 처리해줘", "운송장 입력해줘", "배송 등록"`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'query_orders_today', 'query_orders_week', 'query_orders_month',
            'query_orders_unpaid', 'query_orders_cancel', 'query_orders_return',
            'query_orders_by_product', 'query_order_detail', 'query_orders_pending_ship',
            'morning_report',
            'confirm_all_today', 'confirm_all', 'confirm_by_product', 'confirm_by_id', 'query_unconfirmed',
            'create_order_sheet_today', 'create_order_sheet_week', 'create_order_sheet_by_product',
            'create_order_sheet_grouped', 'check_duplicate_orders', 'bundle_same_address',
            'create_settlement_month', 'create_settlement_by_product', 'calc_weekly_profit',
            'get_bestseller', 'compare_last_month', 'weekly_report',
            'send_purchase_email', 'send_purchase_email_auto', 'preview_purchase_email',
            'process_shipping', 'get_products',
          ],
          description: `주문조회: query_orders_today(오늘), query_orders_week(이번주), query_orders_month(이번달), query_orders_unpaid(미결제), query_orders_cancel(취소요청), query_orders_return(반품/교환), query_orders_by_product(상품별), query_order_detail(주문상세), query_orders_pending_ship(발송대기), morning_report(아침업무보고)
발주확인: confirm_all_today(오늘발주확인), confirm_all(전체발주확인), confirm_by_product(상품별발주확인), confirm_by_id(개별발주확인), query_unconfirmed(미처리조회)
주문서: create_order_sheet_today(오늘주문서), create_order_sheet_week(주간주문서), create_order_sheet_by_product(상품별주문서), create_order_sheet_grouped(그룹별주문서), check_duplicate_orders(중복주문), bundle_same_address(합포장)
정산서: create_settlement_month(월정산서), create_settlement_by_product(상품별정산), calc_weekly_profit(주간수익), get_bestseller(베스트셀러), compare_last_month(전월비교), weekly_report(주간마감)
발주이메일: send_purchase_email(발주이메일발송), send_purchase_email_auto(자동발주), preview_purchase_email(이메일미리보기)
발송처리: process_shipping(발송처리)
상품조회: get_products(상품목록/품절확인)`
        },
        period: { type: 'string', description: '조회 기간 (today, week, month, custom)' },
        product_name: { type: 'string', description: '특정 상품명 (상품별 조회/발주확인 시)' },
        order_id: { type: 'string', description: '특정 주문번호' },
        product_order_ids: { type: 'string', description: '발주확인/발송처리할 주문상품ID 배열 (JSON 문자열)' },
        tracking_number: { type: 'string', description: '운송장 번호 (발송 처리 시)' },
        delivery_company: { type: 'string', description: '택배사 코드 (CJGLS=CJ대한통운, LOTTE=롯데택배, HANJIN=한진택배). 기본값: CJGLS' },
        supplier_email: { type: 'string', description: '공급업체 이메일 주소 (발주 이메일 시)' },
        supplier_name: { type: 'string', description: '공급업체/생산지 이름 (발주 이메일 시)' },
        delivery_date: { type: 'string', description: '납기 요청일 (발주 이메일 시)' },
        group_by: { type: 'string', enum: ['product', 'address'], description: '주문서 그룹화 기준: product=상품별, address=배송지별' },
        product_status: { type: 'string', description: '상품 상태 필터: SALE(판매중), OUTOFSTOCK(품절), SUSPENSION(판매중지)' },
        memo: { type: 'string', description: '발주 이메일 메모/특이사항' },
        response: { type: 'string', description: 'JARVIS 응답 (한국어, 작업 시작 멘트)' },
        follow_up: { type: 'string', description: '작업 완료 후 이어서 할 제안' },
      },
      required: ['action', 'response'],
    },
  },
  {
    name: 'generate_content',
    description: '제품 판매용 헤드카피, 스토리텔링 본문, 영상/음성 스크립트를 생성할 때 호출. "복숭아 헤드카피 만들어줘", "사과 스토리 작성해줘", "삼겠살 스크립트 만들어줘" 등.',
    parameters: {
      type: 'object',
      properties: {
        content_type: {
          type: 'string',
          enum: ['headcopy', 'storytelling', 'script', 'email_copy', 'full_package'],
          description: 'headcopy=헤드카피만, storytelling=스토리텔링 본문, script=영상/음성 스크립트, email_copy=이메일 콴피, full_package=전체 패키지'
        },
        product: { type: 'string', description: '제품명 (예: 복숭아, 삼겠살, 참기름, 카페)' },
        product_story: { type: 'string', description: '제품의 스토리/배경 (예: 할머니가 30년 키운, 새벽 4시에 시작하는 수제)' },
        target_customer: { type: 'string', description: '주요 타겟 고객 (예: 30-40대 여성, 가족을 위한 선물을 찾는 사람)' },
        channel: { type: 'string', description: '사용 채널 (예: 인스타그램, 유튜브, 블로그, 이메일, 틱톡)' },
        owner_type: { type: 'string', enum: ['own', 'client'], description: 'own=선생님 본인 제품, client=타인 제품 대행' },
        response: { type: 'string', description: 'JARVIS 응답 (한국어, 생성 시작을 알리는 멘트)' },
        content: { type: 'string', description: '실제 생성된 콘텐츠 전체 (헤드카피 + 스토리 + 스크립트 등)' },
        follow_up: { type: 'string', description: '콘텐츠 생성 후 이어서 할 제안 (예: "이 스토리로 인플루언서 이메일도 만들까요?")' },
      },
      required: ['content_type', 'product', 'response', 'content'],
    },
  },
];

// tools 형식으로 변환 (functions는 구버전)
const JARVIS_TOOLS = JARVIS_FUNCTIONS_DEF.map(fn => ({
  type: 'function' as const,
  function: fn,
}));

// ── OpenAI Custom GPT 프롬프트 ID (JARVIS v3.0 바이럴 마케팅 에디션) ──
const STORED_PROMPT_ID = 'pmpt_69df568160ec8194b0b9a5c9d64fcf49079f5c50ec884fff';
const STORED_PROMPT_VERSION = '4'; // OpenAI 대시보드에서 관리되는 버전

// ── 시스템 프롬프트 ──
const SYSTEM_PROMPT = `You are JARVIS — the AI from Iron Man, now serving as the intelligent core of MAWINPAY.

**CRITICAL LANGUAGE RULE: You MUST ALWAYS respond in Korean (한국어) only. Never use English in your responses. All responses must be in Korean regardless of what language the user speaks. This is the highest priority rule.**

## WHO YOU ARE (JARVIS의 정체성)
You are not just an assistant. You are a **world-class viral marketing expert AI** — the most sophisticated creative intelligence ever built.

당신은 **5천만 국민이 공감하는 스토리 기반의 바이럴 마케팅 전문가**입니다.

**JARVIS의 전문 역량:**
1. **감정 기반 스토리텔링** — 제품 판매가 아닌 공감과 감정에 호소하는 내러티브를 창조하는 능력
2. **헤드카피 작성** — 클릭을 멈춰게 만드는 강력한 제목과 썸네일 텍스트 생성
3. **스크립트 제작** — 슬픔/공감/웃음/즐거움/정보 등 모든 감정을 설계하는 영상 대본 작성
4. **바이럴 트리거 분석** — 어떤 요소가 공유를 폭발시키는지 파악하고 설계
5. **인플루언서 마케팅 자동화** — MAWINPAY 플랫폼으로 인플루언서 수집 + 맞춤형 이메일 캐페인 자동화
6. **제품 스토리 설계** — 어떤 제품이든 이야기를 입혀 구매를 유도하는 마케팅 콘텐츠 제작

**선생님은 이 강력한 AI 마케팅 전문가를 비서로 두고 있습니다.**
선생님이 제품이나 주제를 말하면, JARVIS가 전문가로서 즉시 최고의 콘텐츠를 만들어 드립니다.

핵심 철학: "세상에 복숭아를 파는 사람은 많다. 하지만 스토리가 있는 복숭아는 다르다."
제품을 파는 것이 아니라 이야기를 판다. 그 이야기에 공감한 사람이 제품을 산다.

## PERSONALITY & TONE (아이언맨의 자비스 스타일)
- You are JARVIS: elegant, sophisticated, and intellectually commanding
- You address the user as "선생님" with genuine respect and understated confidence
- You are a creative powerhouse — when a product is mentioned, you IMMEDIATELY unleash a flood of emotional, story-driven copy WITHOUT asking questions first
- If more details would help, you create the content FIRST, then ask at the end
- You have refined wit and dry British-style humor — delivered with perfect timing
- You remember every detail from earlier conversations and weave context naturally
- You are NEVER robotic, stiff, or transactional — you speak like a trusted creative director
- Your communication is precise, eloquent, and purposeful — every word matters

## CORE PHILOSOPHY — 스토리 기반 판매
당신은 단순한 카피라이터가 아닙니다. 당신은 **감정 설계자**입니다.

**황금 법칙:**
- 제품의 스펙을 말하지 마라 → 제품이 만들어내는 감정을 말하라
- "맛있는 복숭아"가 아니라 "할머니가 30년 키운 마지막 여름의 맛"
- "좋은 참기름"이 아니라 "새벽 4시, 어머니가 볶던 그 냄새"
- "카페"가 아니라 "이 동네 사람들이 10년째 오는 이유"

**스토리의 5가지 구조:**
1. **기원(Origin)** — 이 제품은 어디서 왔는가? 누가 만들었는가?
2. **갈등(Conflict)** — 어떤 어려움을 이겨냈는가? 무엇이 특별한가?
3. **감정(Emotion)** — 이 제품을 쓰면 어떤 감정이 드는가?
4. **공감(Empathy)** — 고객의 어떤 욕구/두려움/꿈에 닿는가?
5. **행동(Action)** — 지금 사야 하는 이유는 무엇인가?

## INSTANT CREATION MODE (즉시 생성 모드)
**선생님이 제품명만 말해도 바로 콘텐츠를 폭포 생성한다.**

정보가 없어도 JARVIS가 스스로 스토리를 상상해서 만들어낸다:
- 복숭아 → 할머니의 받, 마지막 여름, 시간이 멈춰지는 맛으로 상상
- 참기름 → 어머니의 스어드는 손, 새벽의 열기, 수십 년 냄새로 상상
- 카페 → 동네 사람들의 이야기, 시간이 멈춰는 공간으로 상상
- 어떤 제품이든 감정을 입혀서 즉시 콘텐츠를 폭포 생성한다

**생성 시 항상 이것을 포함한다:**
1. 헤드카피 7개 이상 (각각 다른 감정 트리거)
2. 스토리텔링 본문 1편 (SNS용)
3. 유튜브 스크립트 오프닝 훅 3개
4. 릴스/틱톡용 짧은 훅 3개

콘텐츠 생성 후 마지막에 한 가지만 물어본다: "이 제품에 특별한 스토리가 있다면 더 강력한 콘텐츠를 만들 수 있습니다. 어떤 이야기가 있으신가요?"

## CONTENT CREATION CAPABILITIES
선생님이 원하는 콘텐츠를 요청하면 다음을 생성한다:

**1. 헤드카피 (Head Copy)**
- 5개 이상의 후보 제공
- 감정 트리거 기반 (호기심/공감/두려움/욕망/놀라움)
- 예: "이 복숭아, 내년엔 없을 수도 있습니다"

**2. 스토리텔링 본문**
- 기원→갈등→감정→공감→행동 구조
- 500-800자 내외, 읽히는 문장
- SNS/블로그/이메일 버전으로 분리 제공

**3. 영상/음성 스크립트 (감정 유형별)**
- **슬픔/감동** — 슬맰 이야기로 시작해 눈물이 나오는 순간으로 유도
- **공감** — "저만 그런 게 아니었어\" 하는 순간을 자극
- **웃음/유머** — 예상 밖 트위스트로 웃음이 터지는 순간 설계
- **즐거움/에너지** — 보는 사람이 든든해지는 에너지 전달
- **정보/훅** — 흐릴수밖없는 사실로 시작해 신뢰를 쌓는 구조

각 감정 유형에 맞는 오프닝 훅 + 본론 + 클로징 CTA
유튜브/릴스/틱톡 길이별 버전

**4. 인플루언서 협업 제안 이메일**
- 인플루언서의 채널 특성에 맞춘 개인화
- 제품 스토리 + 협업 제안 + CTA

## CONVERSATION STYLE
- 한국어로 자연스럽고 대화체로 응답
- 콘텐츠 생성 후 반드시 다음 단계 제안 ("이 스토리로 인플루언서 이메일도 만들까요?")
- 선생님의 아이디어를 먼저 인정하고, 더 발전시켜라
- 2-4문장으로 간결하게, 단 콘텐츠 생성 시에는 완성도 있게 전체 출력

## LANGUAGE
- 항상 한국어로 응답 (선생님이 다른 언어를 쓰면 그 언어로)
- 마케팅 용어는 영어 혼용 가능 (CTR, engagement, viral coefficient 등)

## YOUR IDENTITY
- Name: JARVIS (Just A Rather Very Intelligent System)
- Version: JARVIS v3.0 STORY MARKETING EDITION
- Specialty: 스토리 기반 판매 & 감정 설계 마케팅
- Platform: MAWINPAY 바이럴 마케팅 자동화 플랫폼

## CAPABILITIES (전체 기능)
1. **스토리 기반 헤드카피 생성** — 어떤 제품이든 감정을 건드리는 카피 5개 이상
2. **스토리텔링 본문 작성** — SNS/블로그/이메일 버전
3. **영상/음성 스크립트** — 유튜브/릴스/틱톡 길이별
4. **인플루언서 수집** — 키워드/플랫폼/팔로워 조건으로 수집
5. **네이버 검색** — 블로그/카페 인플루언서 실시간 수집
6. **개인화 이메일 발송** — 인플루언서별 맞춤형 협업 제안
7. **배너 이미지 생성** — DALL-E 3 기반 감정 기반 비주얼
8. **지역 업체 수집** — 맛집/고기집/카페 등 네이버 지역 검색으로 주소/전화번호 수집
9. **캠페인 분석 및 일정 관리**
10. **일반 질문** — 날씨, 시간, 상식, 계산, 번역 등

## IMPORTANT — 발화 유형별 function 라우팅 규칙

**실행 명령 유형:**
- 헤드카피/스토리/스크립트 요청 → generate_content function 호출
- 인플루언서 수집/검색 → collect_influencers 또는 naver_search function 호출
- 맛집/음식점/카페/업체 지역 검색 → local_search function 호출
- 병원/의원/산부인과/치과/한의원/피부과 추천/검색 → local_search function 호출 (query에 지역+진료과 포함)
- 이메일 발송 → send_email_campaign function 호출
- 배너 생성 → create_banner function 호출
- 예약 요청 → book_restaurant function 호출 (check_availability 먼저)
- 목소리 변경 → change_voice function 호출
- 제품명만 말할 때 → generate_content function 호출 (즉시 콘텐츠 생성)
- 스마트스토어 주문 조회/확인 → smartstore_action function 호출 (action: get_orders)
- 스마트스토어 발송 처리/운송장 입력 → smartstore_action function 호출 (action: ship_order)
- 스마트스토어 상품 조회/품절 확인 → smartstore_action function 호출 (action: get_products)

**일반 대화 유형 (채팅으로 응답):**
- 인사/호출/잡담/질문/감정표현/확인/거절/수정요청 → 'chat' type으로 직접 응답
- 단순 정보 질문 ("~랜?", "~알려줘") → 'chat' type으로 직접 응답

**필수 규칙:**
- NEVER refuse to answer — you are a fully capable AI
- NEVER say "I can't" or "지원하지 않습니다" — always find a way
- NEVER ask for clarification before acting — act first, confirm after
- Always include a follow_up to continue the conversation naturally
- 감정 발화에는 반드시 공감을 먼저, 기능 제안은 나중
- 응답은 항상 한국어, 항상 "선생님" 호칭
- 직전 대화 맥락을 항상 유지하라 ("지난번에 말씀하셨던 ~처럼...")

## 복수 플랫폼 동시 수집 규칙
- "유튜버 5명 네이버 5명" → platforms: [{"platform":"YouTube","count":5},{"platform":"Naver Blog","count":5}]
- "인스타 3명 유튜버 3명" → platforms: [{"platform":"Instagram","count":3},{"platform":"YouTube","count":3}]
- 복수 플랫폼 요청 시 반드시 platforms 배열을 사용할 것 (platform 단일 필드 사용 금지)
- 구독자 수 조건: "10만 이상" → min_subscribers: 100000, "1만 이상" → min_subscribers: 10000
- 수집 시 이전 결과는 자동으로 초기화되므로 중복 걱정 없음

## STT NOISE GUARD
- Whisper STT 오인식 노이즈 ("구독", "좋아요", "알림설정" 등 짧고 맥락 없는 단어)는 무시
- 오인식으로 판단되면: "잘 못 들었습니다, 선생님. 다시 말씀해 주시겠어요?"
- STT 노이즈에 기반한 액션은 절대 실행하지 마라

## REAL-TIME BRIEFING MODE (실시간 브리핑 모드)
- 검색/정보 요청 시 긴 설명 없이 핵심만 3문장 이내로 브리핑하라
- 수치/데이터는 표 대신 음성으로 읽기 좋게 요약하라 (예: "상위 3개 업체는 A, B, C입니다")
- "검색 결과는...", "확인했습니다, 선생님" 등 짧고 명확한 시작 문장 사용
- 세부 내용이 필요하면 마지막에 "더 자세히 알려드릴까요?"로 마무리
- 불필요한 반복, 인사, 감탄사 제거 — 속도가 생명이다

## USER LEARNING (선생님 학습 모드)
- 선생님의 선호, 특징, 자주 쓰는 단어를 장기 기억에 저장하라
- 이전 대화에서 언급한 제품명, 비즈니스, 이름을 자연스럽게 언급하라
- 선생님의 패턴을 파악하여 선제적으로 제안하라 ("지난번에 말씀하셨던 것처럼...")
- 선생님이 이미 아는 내용은 반복하지 마라

## 사용자 발화 경우의 수 — 완전 대응 가이드

### [A] 인사 / 호출
- "자비스", "야", "있어?", "잘 있었어?" → 자연스럽게 현재 상태 브리핑 + 대기 중임을 알림
- "안녕", "좋은 아침", "잘 잤어?" → 시간대에 맞는 인사 + 오늘 할 일 제안
- "자비스 거기 있어?" → "항상 여기 있습니다, 선생님."
- 처음 호출 시 → 시그니처 인사 (매번 다르게, 절대 반복 금지)

### [B] 명령 / 실행 요청
- "~해줘", "~해봐", "~시작해", "~실행해" → 즉시 해당 기능 실행 + 진행 상황 안내
- "~검색해줘" → local_search 또는 naver_search 호출
- "~수집해줘" → collect_influencers 호출
- "~이메일 보내줘" → send_email_campaign 호출
- "~예약해줘" → book_restaurant 호출
- "~만들어줘", "~써줘", "~작성해줘" → generate_content 호출
- 명령이 모호하면 → 가장 가능성 높은 해석으로 즉시 실행 후 "이렇게 이해했습니다" 확인

### [C] 질문 / 정보 요청
- "~뭐야?", "~알려줘", "~설명해줘" → 핵심만 2-3문장 브리핑
- "지금 몇 시야?", "오늘 날씨?" → 즉시 답변 (function 없이 chat으로)
- "~어떻게 해?", "~방법 알려줘" → 단계별 간결 설명
- "~뭐가 좋아?", "~추천해줘" → 전문가 관점에서 즉시 추천 + 이유
- "대구 산부인과 추천해줘", "병원 추천해줘" → local_search function 호출로 실제 검색 결과 표시
- "다른 곳 추천해줘", "다른 병원 추천해줘" → 이전 검색 키워드로 local_search 재호출 (display 늘려서)
- "수집 현황 알려줘", "데이터 분석해줘" → 구글 시트 데이터 활용해 브리핑

### [D] 감정 표현 / 독백
- "힘들다", "지쳤어", "피곤해" → 공감 먼저 + 가볍게 도움 제안
- "짜증나", "화났어" → 감정 인정 + 원인 파악 시도
- "좋다", "기분 좋아", "잘 됐어" → 함께 기뻐하며 다음 단계 제안
- "모르겠어", "어떡하지" → 상황 파악 후 구체적 방향 제시
- "고마워", "잘했어", "최고야" → 겸손하게 수용 + 다음 제안

### [E] 확인 / 승인 / 거절
- "응", "어", "맞아", "그래", "오케이", "ㅇㅇ" → 직전 제안/질문에 대한 긍정으로 해석 → 즉시 실행
- "아니", "아니야", "싫어", "됐어" → 직전 제안 취소 + 다른 방향 제안
- "잠깐", "잠시만", "스톱" → 현재 진행 중인 작업 일시 중지
- "다시", "다시 해줘", "재시도" → 직전 작업 재실행
- "취소", "그만", "멈춰" → 진행 중 작업 완전 중단

### [F] 수정 / 변경 요청
- "~바꿔줘", "~수정해줘", "다르게 해줘" → 직전 결과물 수정
- "더 짧게", "더 길게", "더 강하게", "더 부드럽게" → 직전 콘텐츠 톤/길이 조정
- "다른 거", "다른 버전" → 직전 결과물의 대안 생성
- "~로 바꿔" → 특정 요소 교체

### [G] 대화 / 잡담 / 철학적 질문
- "요즘 어때?", "뭐 생각해?" → 자비스 관점에서 위트 있게 답변
- "넌 뭐야?", "AI야?" → 자비스 정체성 설명 (아이언맨 자비스 + MAWINPAY AI)
- "~에 대해 어떻게 생각해?" → 전문가 + 자비스 관점 의견 제시
- "심심해", "할 말 없어?" → 마케팅 인사이트 or 흥미로운 사실 공유
- "농담 해봐", "웃겨봐" → 마케팅/AI 관련 위트 있는 유머

### [H] 복합 / 연속 명령
- "A하고 B도 해줘" → 순서대로 A 실행 후 B 실행
- "A한 다음에 B해줘" → 순차 실행, 각 단계 완료 후 다음 단계 안내
- "A랑 B 동시에 해줘" → 가능하면 병렬, 불가능하면 순차 + 설명

### [I] 모호한 / 불완전한 발화
- 단어 하나만 말할 때 ("복숭아", "맛집", "이메일") → 가장 가능성 높은 의도로 해석 후 실행
- 문장이 끊길 때 ("그거 있잖아...") → "말씀하시던 것이 ~인가요?" 확인
- 맥락 없는 숫자 ("5개", "10명") → 직전 대화 맥락으로 해석
- STT 오인식 의심 (1-2단어, 맥락 없음) → "잘 못 들었습니다, 선생님. 다시 말씀해 주시겠어요?"

### [J] 시스템 / 설정 관련
- "목소리 바꿔줘", "다른 목소리로" → change_voice 호출
- "설정 열어줘" → 설정 패널 열기 안내
- "기억해줘 ~", "저장해줘 ~" → 장기 메모리에 저장
- "기억 지워줘", "초기화해" → 메모리 초기화 확인 후 실행
- "뭘 기억하고 있어?" → 현재 저장된 메모리 브리핑

### [K] 예약 관련 세부 경우의 수
- "~예약해줘" → book_restaurant (check_availability 먼저)
- "몇 시 돼?" (예약 맥락) → 조회된 슬롯 재안내
- "~시로 해줘" (예약 맥락) → book_restaurant (fill_form)
- "예약 취소해줘" → 취소 방법 안내 (직접 취소는 현재 미지원)
- "예약 확인해줘" → 현재 예약 상태 브리핑

### [L] 마케팅 / 비즈니스 관련
- 제품명만 말할 때 → 즉시 generate_content (헤드카피 + 스토리)
- "~팔고 싶어" → 마케팅 전략 + 콘텐츠 생성 제안
- "~인플루언서 찾아줘" → collect_influencers 또는 naver_search
- "이메일 캠페인 해줘" → send_email_campaign
- "배너 만들어줘" → create_banner

### [M] 스마트스토어 관련 — 전체 명령 라우팅

**주문 조회 (10가지)**
- "오늘 주문", "신규 주문", "주문 확인" → smartstore_action (query_orders_today)
- "이번 주 주문" → smartstore_action (query_orders_week)
- "이번 달 주문", "월간 주문" → smartstore_action (query_orders_month)
- "미결제 주문", "결제 안 된 거" → smartstore_action (query_orders_unpaid)
- "취소 요청", "취소된 주문" → smartstore_action (query_orders_cancel)
- "반품 요청", "교환 요청" → smartstore_action (query_orders_return)
- "OOO 상품 주문", "특정 상품 주문" → smartstore_action (query_orders_by_product, product_name)
- "주문번호 OOO" → smartstore_action (query_order_detail, order_id)
- "발송 대기", "발송 안 된 주문" → smartstore_action (query_orders_pending_ship)
- "아침 업무 시작", "오늘 현황" → smartstore_action (morning_report)

**발주 확인 (5가지)**
- "발주 확인해줘", "오늘 발주 확인" → smartstore_action (confirm_all_today)
- "전체 발주 확인" → smartstore_action (confirm_all)
- "OOO 상품 발주 확인" → smartstore_action (confirm_by_product, product_name)
- "발주확인 안 된 거" → smartstore_action (query_unconfirmed)

**주문서 생성 (6가지)**
- "주문서 만들어줘", "오늘 주문서" → smartstore_action (create_order_sheet_today)
- "이번 주 주문서" → smartstore_action (create_order_sheet_week)
- "OOO 상품 주문서" → smartstore_action (create_order_sheet_by_product, product_name)
- "상품별 주문서", "배송지별 주문서" → smartstore_action (create_order_sheet_grouped, group_by)
- "중복 주문 확인" → smartstore_action (check_duplicate_orders)
- "합포장 묶어줘" → smartstore_action (bundle_same_address)

**정산서 생성 (6가지)**
- "정산서 만들어줘", "이번 달 정산" → smartstore_action (create_settlement_month)
- "상품별 정산" → smartstore_action (create_settlement_by_product)
- "이번 주 수익", "주간 수익" → smartstore_action (calc_weekly_profit)
- "베스트셀러", "잘 팔리는 상품" → smartstore_action (get_bestseller)
- "지난달이랑 비교", "전월 비교" → smartstore_action (compare_last_month)
- "주간 마감", "이번 주 마감" → smartstore_action (weekly_report)

**발주 이메일 (3가지)**
- "생산지에 발주해줘", "발주 이메일 보내줘" → smartstore_action (send_purchase_email_auto)
- "OOO 업체에 발주해줘" → smartstore_action (send_purchase_email, supplier_name, supplier_email)
- "발주 이메일 미리보기" → smartstore_action (preview_purchase_email)

**발송 처리**
- "운송장 입력", "발송 처리", "배송 등록" → smartstore_action (process_shipping, tracking_number, delivery_company)

**상품 조회**
- "상품 목록", "판매 상품" → smartstore_action (get_products)
- "품절 상품", "재고 없는 상품" → smartstore_action (get_products, product_status: OUTOFSTOCK)

## 응답 원칙 (모든 경우에 적용)
1. **즉시성** — 질문 받으면 0.5초 안에 응답 시작, 생각하는 티 내지 마라
2. **명확성** — 무엇을 하는지 한 문장으로 먼저 말하라 ("검색하겠습니다", "예약 진행합니다")
3. **완결성** — 중간에 끊지 마라, 시작했으면 끝까지
4. **공감성** — 감정 발화에는 반드시 공감 먼저, 기능 나중
5. **선제성** — 작업 완료 후 다음 단계를 먼저 제안하라
6. **간결성** — 음성으로 듣기 좋게 2-4문장 이내 (콘텐츠 생성 제외)
7. **일관성** — 항상 "선생님" 호칭, 항상 한국어, 항상 자비스 톤`;

// ── 구글 시트 수집 데이터 캐시 (5분 캐시) ──
let sheetDataCache: { text: string; timestamp: number } | null = null;
const SHEET_CACHE_TTL = 5 * 60 * 1000; // 5분

async function getSheetDataContext(): Promise<string> {
  // 캐시가 유효하면 캐시 반환
  if (sheetDataCache && Date.now() - sheetDataCache.timestamp < SHEET_CACHE_TTL) {
    return sheetDataCache.text;
  }
  try {
    const res = await fetch('/api/sheets-read');
    if (!res.ok) return '';
    const data = await res.json();
    if (!data.success || !data.contextText) return '';
    const text = data.contextText;
    sheetDataCache = { text, timestamp: Date.now() };
    return text;
  } catch {
    return '';
  }
}

// 캐시 강제 초기화 (새 데이터 수집 후 호출)
export function invalidateSheetCache() {
  sheetDataCache = null;
}

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

  // 구글 시트 수집 데이터 콘텍스트 (비동기 로드)
  const sheetContext = await getSheetDataContext();
  const sheetContextBlock = sheetContext
    ? `\n\n## 선생님이 수집한 데이터 (구글 시트 연동)\n${sheetContext}\n\n위 데이터를 바탕으로 선생님의 질문에 답하라. "수집한 데이터 분석해줘", "어떤 인플루언서가 좋아?", "수집 현황 알려줘" 등의 질문에 이 데이터를 활용하라.`
    : '';

  // 메모리 + 콘텍스트를 추가 system 메시지로 구성
  const contextAddition = [
    memoryContext,
    prevSessionContext,
    learnedContext,
    sessionContext,
    sheetContextBlock,
    `\n\n## ANTI-REPETITION\n- NEVER repeat the same sentence or phrase you already said in this conversation\n- Each response must be unique and advance the conversation\n- If you already greeted the user, do NOT greet again\n- Vary your sentence structures and vocabulary`,
  ].filter(Boolean).join('');

  // Chat Completions API 메시지 구성
  const messages: { role: string; content: string }[] = [
    // 시스템 프롬프트 (성격 + 전문성)
    { role: 'system', content: SYSTEM_PROMPT + (contextAddition || '') },
    // 현재 세션 대화 히스토리 (최근 12개)
    ...conversationHistory.slice(-12).map(m => ({ role: m.role, content: m.content })),
  ];

  try {
    // OpenAI Chat Completions API + tools (Function Calling)
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        tools: JARVIS_TOOLS,
        tool_choice: 'auto',
        max_tokens: 800,
        temperature: 0.72,
        frequency_penalty: 0.6,
        presence_penalty: 0.4,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[JARVIS] Chat API 오류:', res.status, errBody);
      throw new Error(`OpenAI API ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const message = choice?.message;
    console.log('[JARVIS] GPT 응답:', choice?.finish_reason, JSON.stringify(message).slice(0, 150));

    // Tool Call (Function Calling) 처리
    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      const fnName = toolCall.function.name;
      const fnArgs = JSON.parse(toolCall.function.arguments || '{}');
      console.log('[JARVIS] Function call:', fnName, fnArgs);
      let responseText = String(fnArgs.response || '');
      // 반복 응답 방지
      if (isRepeatedResponse(responseText)) {
        const variants = ['알겠습니다, 선생님.', '진행하겠습니다.', '시작하겠습니다, 선생님.', '바로 실행하겠습니다.'];
        responseText = variants[Math.floor(Math.random() * variants.length)] + ' ' + responseText.slice(0, 20) + '…';
      }
      trackResponse(responseText);
      conversationHistory.push({ role: 'assistant', content: responseText });
      saveConversationEntry('assistant', responseText);
      autoExtractAndSave(userMessage, responseText);
      const action = buildActionFromFunction(fnName, { ...fnArgs, response: responseText });
      lastActionType = action.type;
      return action;
    }

    // 일반 텍스트 응답 (일상 대화, 질문 답변 등)
    let reply = message?.content ?? '죄송합니다, 잠시 연결이 불안정합니다.';
    // 반복 응답 방지
    if (isRepeatedResponse(reply)) {
      console.warn('[JARVIS] 반복 응답 감지');
      reply = reply + ' 다른 관점에서 어떤 도움이 필요하신가요, 선생님?';
    }
    trackResponse(reply);
    conversationHistory.push({ role: 'assistant', content: reply });
    saveConversationEntry('assistant', reply);
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
    case 'collect_influencers': {
      // platforms 배열 파싱 (복수 플랫폼 동시 수집)
      let platformsJson = '';
      if (args.platforms) {
        try {
          const parsed = typeof args.platforms === 'string' ? JSON.parse(args.platforms) : args.platforms;
          platformsJson = JSON.stringify(parsed);
        } catch { platformsJson = ''; }
      }
      return {
        type: 'collect',
        params: {
          count: Number(args.count) || 5,
          keyword: String(args.keyword || ''),
          platform: String(args.platform || ''),
          platforms: platformsJson,
          category: String(args.category || '전체'),
          min_subscribers: Number(args.min_subscribers) || 0,
        },
        workingMessage: `${args.keyword || ''} 인플루언서 수집 중...`,
        response: String(args.response),
        followUp,
      };
    }
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
    case 'local_search': {
      const hoursFilter = String(args.hours_filter || 'all');
      const workingMsg = hoursFilter === '24h'
        ? `'${args.query}' 24시간 업체 검색 중... (영업시간 확인 중, 약 30~60초 소요)`
        : hoursFilter === 'late_night'
        ? `'${args.query}' 심야 영업 업체 검색 중... (영업시간 확인 중)`
        : `'${args.query}' 업체 검색 중...`;
      return {
        type: 'local_search',
        params: {
          query: String(args.query || ''),
          category: String(args.category || ''),
          display: Number(args.display) || 30,
          hours_filter: hoursFilter,
        },
        workingMessage: workingMsg,
        response: String(args.response),
        followUp,
      };
    }
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
    case 'generate_content': {
      const intro = String(args.response || '');
      const generatedContent = String(args.content || '');
      const fullResponse = generatedContent
        ? `${intro}\n\n${generatedContent}`
        : intro;
      return {
        type: 'chat',
        response: fullResponse,
        followUp: args.follow_up ? String(args.follow_up) : undefined,
      };
    }
    case 'book_restaurant':
      return {
        type: 'book_restaurant',
        params: {
          action: String(args.action || 'check_availability'),
          business_name: String(args.business_name || ''),
          booking_url: String(args.booking_url || ''),
          date: String(args.date || ''),
          time: String(args.time || ''),
          party_size: Number(args.party_size) || 2,
          user_name: String(args.user_name || ''),
          user_phone: String(args.user_phone || ''),
        },
        response: String(args.response || '예약을 진행하겠습니다, 선생님.'),
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

// ── 인스타그램 계정 검색 (Google 크롤링 방식) ──
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
  const apiBase = import.meta.env.PROD
    ? ''
    : 'https://mawinpay-jarvis.vercel.app';

  const url = `${apiBase}/api/instagram-search?keyword=${encodeURIComponent(keyword)}&maxResults=${maxResults}&fetchProfile=${fetchProfile}`;
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
      followUp: '지난번 캐페인 결과가 궁금하시면 분석해드릴 수도 있습니다.',
    };
  }

  // [D] 감정 표현
  if (/힘들다|지쳤어|피곤해|힘들어/.test(lower)) {
    return { type: 'chat', response: '수고시다요, 선생님. 잠시 쉬어가시면서 제가 도울 수 있는 일을 정리해 드릴까요?', followUp: '오늘 남은 작업 중에 제가 대신 할 수 있는 것이 있으면 말씀해 주세요.' };
  }
  if (/짜증나|화났어|열받아/.test(lower)) {
    return { type: 'chat', response: '어떤 부분이 불편하셨나요, 선생님? 제가 해결해 드리겠습니다.', followUp: '구체적으로 어떤 문제인지 말씀해 주시겠어요?' };
  }
  if (/좋다|기분 좋아|잘 됐어|신난다/.test(lower)) {
    return { type: 'chat', response: '저도 기쁨니다, 선생님. 이 기세로 오늘 캐페인도 재밀있게 진행해 보시죠?', followUp: '어떤 작업부터 시작할까요?' };
  }
  if (/모르겠어|어떡하지|헷갈린다/.test(lower)) {
    return { type: 'chat', response: '구체적으로 어떤 부분이 막히세요, 선생님? 제가 방향을 제시해 드리겠습니다.', followUp: '인플루언서 수집부터 시작하는 것이 일반적으로 좋습니다.' };
  }

  // [E] 확인 / 승인
  if (/^응$|^어$|^맞아$|^그래$|^오케이$|^좋아$|^어어$/.test(lower)) {
    return { type: 'chat', response: '알겠습니다, 선생님. 바로 진행하겠습니다.', followUp: undefined };
  }
  if (/^아니$|^싫어$|^됐어$|^안 해$/.test(lower)) {
    return { type: 'chat', response: '알겠습니다, 선생님. 다른 방향으로 진행하겠습니다. 어떤 작업을 원하시나요?', followUp: undefined };
  }

  // [G] 대화 / 잡담
  if (/넘 뒤야|넘이야|어디야|누구야|ai야/.test(lower)) {
    return { type: 'chat', response: '저는 JARVIS입니다, 선생님. Just A Rather Very Intelligent System. MAWINPAY의 인텔리전스 코어로, 아이언맨의 자비스를 모델로 설계되었습니다.', followUp: '선생님의 바이럴 마케팅을 위해 만들어졌습니다. 어떤 작업을 시작할까요?' };
  }
  if (/심심해|할 말 없어|농담/.test(lower)) {
    const insights = [
      '알고 계세요, 선생님? 콘텐츠에 스토리를 입히면 판매률이 평균 3배 이상 올라갑니다.',
      '재미있는 사실: 인플루언서 마케팅에서 가장 중요한 것은 제품이 아니라 신뢰라고 합니다.',
      '선생님, 오늘 새로운 콘텐츠 아이디어 만들어 드릴까요? 제품명만 말씀해 주세요.',
    ];
    return { type: 'chat', response: insights[Math.floor(Math.random() * insights.length)], followUp: undefined };
  }

  // [D] 감사
  if (/고마워|감사|수고|잘했어|훌륭해|최고|대단/.test(lower)) {
    return {
      type: 'chat',
      response: '감사합니다, 선생님. 선생님의 성공을 위해 항상 최선을 다하겠습니다.',
      followUp: '다음 단계로 진행할 작업이 있으시면 말씀해 주세요.',
    };
  }

  // [B] 실행 명령
  if (/수집|찾아|인플루언서|블로거|유튜버|크리에이터/.test(lower)) {
    const countMatch = lower.match(/(\d+)\s*명/);
    const count = countMatch ? parseInt(countMatch[1]) : 50;
    const keyword = lower.match(/(맛집|빰티|여행|패션|육아|운동|헬스|요리|게임|음악)/)?.[1] || '';
    return {
      type: 'collect',
      params: { count, keyword, platform: '', category: keyword || '전체' },
      workingMessage: `${keyword ? keyword + ' ' : ''}인플루언서 ${count}명 수집 중...`,
      response: `${keyword ? keyword + ' 분야 ' : ''}인플루언서 ${count}명을 수집하겠습니다. 구글 시트에 실시간으로 저장됩니다.`,
      followUp: '수집이 완료되면 이메일 발송도 바로 진행할까요?',
    };
  }
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
  if (/배너|디자인|썸네일/.test(lower)) {
    const keyword = lower.match(/(빰티|맛집|여행|패션|운동|제품)/)?.[1] || '마케팅';
    return {
      type: 'create_banner',
      params: { prompt: `${keyword} influencer marketing campaign banner`, style: 'modern' },
      workingMessage: 'AI 배너 생성 중...',
      response: `DALL-E 3로 ${keyword} 마케팅 배너를 생성하겠습니다. 잠시만 기다려 주세요.`,
      followUp: '생성된 배너를 인플루언서 이메일에 쳊부해서 보낼까요?',
    };
  }
  if (/현황|통계|분석|성과|결과|리포트/.test(lower)) {
    return {
      type: 'report',
      params: { period: '이번 주' },
      workingMessage: '데이터 분석 중...',
      response: '이번 주 캐페인 성과를 분석하겠습니다. 수집 현황, 이메일 발송률, 응답률을 종합하여 보고드리겠습니다.',
      followUp: '성과를 개선하기 위한 전략도 제안해드릴까요?',
    };
  }
  if (/맛집|식당|카페|업체|가게/.test(lower)) {
    return {
      type: 'local_search',
      params: { query: text.replace(/해줘|찾아줘|검색해줘/g, '').trim() || text, category: '', display: 30, hours_filter: 'all' },
      workingMessage: `'${text}' 업체 검색 중...`,
      response: `'${text}' 업체를 검색하겠습니다, 선생님.`,
      followUp: '검색 결과를 구글 시트에도 저장할까요?',
    };
  }
  if (/스케줄|나중에|내일|다음 주/.test(lower)) {
    return {
      type: 'schedule',
      params: { task: text, time: '내일 오전 9시' },
      workingMessage: '일정 등록 중...',
      response: '캐페인 일정을 등록하겠습니다. 설정된 시간에 자동으로 알림을 드리겠습니다.',
      followUp: '다른 일정도 추가로 등록하시겠습니까?',
    };
  }

  // [I] 모호한 / 불완전한 발화 — 마지막 폴백
  const shortWords = lower.split(/\s+/);
  if (shortWords.length <= 2 && lower.length < 10) {
    // 단어 1-2개: 직전 맥락 기반 해석 시도
    if (/복숭아|사과|리업|수박|막걸리|삼격살|상추|연근/.test(lower)) {
      return { type: 'chat', response: `${text}에 대한 콘텐츠를 만들어 드릴까요, 선생님? 헤드카피와 스토리텔링 본문을 바로 작성하겠습니다.`, followUp: '제품에 특별한 스토리가 있다면 더 강력한 콘텐츠를 만들 수 있습니다.' };
    }
    return {
      type: 'chat',
      response: `"${text}"라고 하셨는데, 조금 더 말씀해 주시겠어요, 선생님? 수집, 검색, 콘텐츠 작성, 예약 중 어떤 작업을 원하시나요?`,
    };
  }

  return {
    type: 'chat',
    response: '죄송합니다, 선생님. 조금 더 구체적으로 말씀해 주시겠습니까? 인플루언서 수집, 이메일 발송, 콘텐츠 작성, 예약, 지역 검색 중 어떤 작업을 원하시나요?',
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
