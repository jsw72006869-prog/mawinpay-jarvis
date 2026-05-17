/**
 * COPY-S.1 Step 7: Human Desire Prompt Compiler
 * 모든 엔진의 출력을 하나의 프롬프트로 조합
 * + Comment Prediction Engine
 * + Timing Optimizer Engine
 * + A/B Test Designer
 * + Competitor Copy Radar (placeholder)
 */
import type {
  HumanDesire, CustomerAnxiety, PurchaseTrigger,
  PlatformCopyChannel, AgriSensoryProfile, PlatformCopyRules,
  CopyPerformanceMemory, HumanDesireCopyContext,
} from './humanDesireTypes';
import { HUMAN_DESIRE_LABELS } from './humanDesireEngine';
import { CUSTOMER_ANXIETY_LABELS, ANXIETY_RESOLUTION_GUIDE } from './customerAnxietyEngine';
import { PURCHASE_TRIGGER_LABELS, TRIGGER_USAGE_GUIDE } from './purchaseTriggerEngine';
import { sensoryProfileToPromptText } from './agriSensoryEngine';
import { platformRulesToPromptText } from './platformIntentEngine';

// ═══ Mawin Voice Rules (대표님 스타일) ═══
const MAWIN_VOICE_RULES = [
  '친근하고 말하듯 툭 던지는 문장',
  '강한 첫 문장 (멈추게 만드는 한 줄)',
  '계절감, 식감, 수확 타이밍, 스토리 중심',
  '댓글/DM 유도 구조',
  '여운 있는 마무리',
  '과장 광고, 허위 효능, 매출 보장, 성공 보장 표현 절대 금지',
  '"신선한 OOO를 지금 만나보세요" 류의 일반 광고문 금지',
  '"특별한 가격으로 준비했습니다" 류 금지',
  '"최고의 품질" "역대급" 류 금지',
  '실제 바이럴에 쓸 수 있는 수준이어야 함',
];

// ═══ Comment Prediction Engine ═══
const COMMENT_TRIGGER_PATTERNS: Record<string, { pattern: string; exampleComments: string[] }> = {
  taste_debate: {
    pattern: '취향 대립 구조 (A vs B)',
    exampleComments: ['A파인데요?', 'B가 진리지', '둘 다 맛있는데...', '이건 싸울 수밖에 없다'],
  },
  nostalgia_share: {
    pattern: '추억 공유 유도',
    exampleComments: ['나도 어릴 때...', '할머니 생각난다', '우리 엄마도 이렇게...', '시골 생각나네'],
  },
  curiosity_question: {
    pattern: '궁금증 유발 → 질문 유도',
    exampleComments: ['이거 어디서 사요?', '가격이 얼마예요?', 'DM 주세요', '링크 알려주세요'],
  },
  experience_share: {
    pattern: '경험 공유 유도',
    exampleComments: ['나도 먹어봤는데 진짜...', '작년에 샀는데 대박', '우리 집도 매년 시킴'],
  },
  surprise_reaction: {
    pattern: '놀라움/반전 반응',
    exampleComments: ['헐 진짜?', '이거 실화?', '대박...', '몰랐는데'],
  },
  tag_someone: {
    pattern: '누군가를 태그하고 싶게 만드는 구조',
    exampleComments: ['@친구 이거 봐', '@엄마 사주세요', '남편한테 보여줘야지'],
  },
};

// ═══ Timing Optimizer Engine ═══
const PLATFORM_GOLDEN_TIMES: Record<PlatformCopyChannel, { times: string[]; reason: string }> = {
  threads: { times: ['07:00~08:30', '21:30~23:00'], reason: '출근 전 스크롤 + 잠자기 전 스크롤' },
  youtube_shorts: { times: ['12:00~13:00', '18:00~19:30'], reason: '점심시간 + 퇴근 후 (식품은 배고플 때 효과적)' },
  youtube_thumbnail: { times: ['12:00~13:00', '18:00~19:30'], reason: '점심시간 + 퇴근 후' },
  instagram_reels: { times: ['12:00~13:00', '19:00~21:00'], reason: '점심 + 저녁 이후 여유시간' },
  tiktok: { times: ['11:00~13:00', '19:00~22:00'], reason: '점심 + 저녁~밤 (가장 활발)' },
  naver_blog: { times: ['09:00~11:00 (화~목)'], reason: '검색 트래픽 피크 (평일 오전)' },
  outreach_email: { times: ['10:00~11:00 (화~목)'], reason: '업무 시작 후 메일 확인 시간' },
  smartstore_detail: { times: ['항상'], reason: '상세페이지는 시간 무관' },
};

// ═══ A/B Test Designer ═══
function designABTest(copies: number): { groupA: string; groupB: string; testVariable: string } {
  const testVariables = [
    { groupA: '감각형 후킹 (식감/향 강조)', groupB: '감정형 후킹 (추억/불안 강조)', testVariable: '후킹 유형' },
    { groupA: '짧은 카피 (3줄 이내)', groupB: '긴 카피 (5줄 이상)', testVariable: '카피 길이' },
    { groupA: '질문형 엔딩', groupB: '여운형 엔딩', testVariable: '엔딩 스타일' },
    { groupA: '제철 타이밍 강조', groupB: '품질/신뢰 강조', testVariable: '핵심 메시지' },
    { groupA: '댓글 유도형', groupB: '저장 유도형', testVariable: '행동 유도 방향' },
  ];
  return testVariables[Math.floor(Math.random() * testVariables.length)];
}

// ═══ 메인 Prompt Compiler ═══
export function compileHumanDesirePrompt(context: HumanDesireCopyContext): {
  systemPrompt: string;
  userPrompt: string;
  metadata: {
    desires: string[];
    anxieties: string[];
    triggers: string[];
    platform: string;
    commentPrediction: boolean;
    timingOptimization: boolean;
    abTest?: { groupA: string; groupB: string; testVariable: string };
    goldenTime?: { times: string[]; reason: string };
  };
} {
  const {
    product, platform, outputType, sourceKeyword,
    desires, anxieties, triggers, sensoryProfile,
    mawinVoiceRules = MAWIN_VOICE_RULES,
    performanceMemory = [],
    platformRules,
    commentPrediction = true,
    timingOptimization = true,
  } = context;

  // ═══ System Prompt ═══
  const systemPrompt = `당신은 "Mawin Agricultural Human Desire Copy Engine"입니다.
농산물/식품 바이럴 마케팅 전문 카피 엔진으로, 인간의 욕구와 불안을 깊이 이해하고 이를 카피에 반영합니다.

[핵심 원칙]
1. 상품명만 보고 카피 쓰기 금지 — 반드시 인간 욕구 + 고객 불안 + 구매 트리거 + 감각 데이터를 기반으로 생성
2. 일반 광고문 자동 FAIL — "신선한 OOO를 만나보세요", "특별한 가격", "최고의 품질" 등 감지 시 즉시 재작성
3. 플랫폼별 문법 엄수 — 스레드≠블로그≠썸네일, 각각 완전히 다른 문법으로 작성
4. 검증되지 않은 시그널은 단정형 금지 — verified=false면 감정형/계절형만 사용

[Mawin Voice Rules]
${mawinVoiceRules.map(r => `- ${r}`).join('\n')}

[Copy Risk Guard]
절대 금지: 허위 효능, 과장 표현, 가격 스팸, 허위 재고, 매출/성공 보장, 원본 장문 복사
"제철 OOO를 지금 만나보세요" → FAIL
"특별한 가격으로 준비했습니다" → FAIL
"신선하고 맛있는" → FAIL
"최고의 품질" → FAIL
"역대급" → FAIL
"지금 바로 구매하세요" → FAIL

[Anti-Boring Filter]
위 패턴이 감지되면 즉시 FAIL 처리하고 재작성하세요.
카피는 실제 바이럴에서 터질 수 있는 수준이어야 합니다.
광고 냄새가 나면 실패입니다.`;

  // ═══ User Prompt ═══
  // 1. 인간 욕구
  const desireSection = desires.map(d => `- ${d}: ${HUMAN_DESIRE_LABELS[d] || d}`).join('\n');
  
  // 2. 고객 불안 + 해소 방향
  const anxietySection = anxieties.map(a => 
    `- ${a}: ${CUSTOMER_ANXIETY_LABELS[a] || a}\n  해소 방향: ${ANXIETY_RESOLUTION_GUIDE[a] || '자연스럽게 해소'}`
  ).join('\n');
  
  // 3. 구매 트리거
  const triggerSection = triggers.map(t => `- ${t}: ${PURCHASE_TRIGGER_LABELS[t] || t}`).join('\n');
  
  // 4. 감각 데이터
  const sensorySection = sensoryProfileToPromptText(sensoryProfile);
  
  // 5. 플랫폼 규칙
  const platformSection = platformRules ? platformRulesToPromptText(platformRules) : '';
  
  // 6. Performance Memory (과거 성과 데이터)
  let performanceSection = '';
  if (performanceMemory.length > 0) {
    const won = performanceMemory.filter(p => p.resultLabel === 'won');
    const lost = performanceMemory.filter(p => p.resultLabel === 'lost');
    performanceSection = `\n[Performance Memory — 과거 성과 데이터]
성공 카피 (${won.length}개): ${won.slice(0, 3).map(w => `"${w.copyText.substring(0, 50)}..." (${w.whyWorked || '성공'})`).join(' / ')}
실패 카피 (${lost.length}개): ${lost.slice(0, 3).map(l => `"${l.copyText.substring(0, 50)}..." (${l.whyFailed || '실패'})`).join(' / ')}
→ 성공 패턴을 강화하고 실패 패턴을 피하세요.`;
  }
  
  // 7. 댓글 예측 지시
  let commentSection = '';
  if (commentPrediction) {
    commentSection = `\n[Comment Prediction — 댓글 예측]
각 카피에 대해 예상되는 댓글 3개를 생성하세요.
댓글이 많이 달릴수록 좋은 카피입니다.
댓글 유도 패턴: ${Object.entries(COMMENT_TRIGGER_PATTERNS).map(([k, v]) => `${v.pattern}`).join(', ')}`;
  }
  
  // 8. 시간대 최적화
  const goldenTime = PLATFORM_GOLDEN_TIMES[platform];
  let timingSection = '';
  if (timingOptimization && goldenTime) {
    timingSection = `\n[Timing Optimization — 최적 발행 시간]
이 플랫폼의 골든타임: ${goldenTime.times.join(', ')}
이유: ${goldenTime.reason}
각 카피에 최적 발행 시간을 추천하세요.`;
  }
  
  // 9. A/B 테스트 설계
  const abTest = designABTest(1);
  const abSection = `\n[A/B Test Design]
테스트 변수: ${abTest.testVariable}
Group A: ${abTest.groupA}
Group B: ${abTest.groupB}
→ 생성되는 카피 중 절반은 Group A 스타일, 절반은 Group B 스타일로 만드세요.`;

  const userPrompt = `상품: ${product}
플랫폼: ${platform}
출력 타입: ${outputType}
키워드: ${sourceKeyword || '없음'}

[인간 욕구 — 이 카피가 건드려야 할 욕구]
${desireSection}
→ 상위 2개 욕구를 핵심으로, 나머지는 보조로 활용하세요.

[고객 불안 — 이 카피가 해소해야 할 불안]
${anxietySection}
→ 불안을 직접 겁주지 말고, 이해하고 해소하는 방향으로 카피에 녹이세요.

[구매 트리거 — 행동을 유발하는 시그널]
${triggerSection}

${sensorySection}

${platformSection}
${performanceSection}
${commentSection}
${timingSection}
${abSection}

[응답 형식 — 반드시 JSON]
{
  "copies": [
    {
      "text": "생성된 카피 전문",
      "hook_type": "사용한 후킹 유형",
      "desires_used": ["건드린 인간 욕구 목록"],
      "anxiety_resolved": "해소한 고객 불안",
      "trigger_used": "활용한 구매 트리거",
      "sensory_words": ["사용한 감각 단어"],
      "platform_fit_reason": "이 플랫폼에 맞는 이유",
      "why_this_works": "이 카피가 왜 터질 수 있는지 한 줄 설명",
      "predicted_comments": ["예상 댓글 1", "예상 댓글 2", "예상 댓글 3"],
      "comment_engagement_score": 85,
      "best_posting_time": "21:30",
      "best_posting_reason": "잠자기 전 스크롤 시간대",
      "ab_group": "A 또는 B"
    }
  ]
}`;

  return {
    systemPrompt,
    userPrompt,
    metadata: {
      desires: desires.map(d => HUMAN_DESIRE_LABELS[d] || d),
      anxieties: anxieties.map(a => CUSTOMER_ANXIETY_LABELS[a] || a),
      triggers: triggers.map(t => PURCHASE_TRIGGER_LABELS[t] || t),
      platform,
      commentPrediction,
      timingOptimization,
      abTest,
      goldenTime,
    },
  };
}
