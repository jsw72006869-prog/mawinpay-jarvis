/**
 * COPY-BRAIN-A.1: Buyer Desire Engine
 * 고객이 실제로 왜 멈추고, 댓글 달고, 사는지 욕망을 분류한다.
 */
import type { BuyerDesire, BuyerDesireType, PlatformType, ViralContentRef } from './copyBrainTypes';

// ═══ Buyer Desire 정의 ═══
const DESIRE_DB: Record<BuyerDesireType, BuyerDesire> = {
  nostalgia: {
    type: 'nostalgia',
    label: '추억/향수',
    description: '어릴 때 먹던 맛, 시골 할머니 집, 여름방학 기억',
    trigger_keywords: ['어릴 때', '추억', '그때 그 맛', '할머니', '시골', '옛날', '기억'],
  },
  seasonal_craving: {
    type: 'seasonal_craving',
    label: '계절 갈망',
    description: '이 계절에만 먹을 수 있는 것에 대한 갈망',
    trigger_keywords: ['여름', '겨울', '제철', '지금 아니면', '이맘때', '시즌', '올해'],
  },
  family_care: {
    type: 'family_care',
    label: '가족 돌봄',
    description: '아이, 부모님, 가족에게 좋은 것을 주고 싶은 마음',
    trigger_keywords: ['아이', '엄마', '부모님', '가족', '아기', '우리 집', '식구'],
  },
  gift: {
    type: 'gift',
    label: '선물',
    description: '누군가에게 주고 싶은 마음, 체면, 정성',
    trigger_keywords: ['선물', '보내드리', '감사', '명절', '추석', '설날', '답례'],
  },
  scarcity_timing: {
    type: 'scarcity_timing',
    label: '희소성/타이밍',
    description: '지금 안 사면 못 사는 긴급함',
    trigger_keywords: ['한정', '마감', '수확', '올해', '지금', '마지막', '예약', '선착순'],
  },
  sensory_imagination: {
    type: 'sensory_imagination',
    label: '감각 상상',
    description: '읽기만 해도 맛/향/식감이 느껴지는 자극',
    trigger_keywords: ['달콤', '아삭', '쫀득', '향', '과즙', '바삭', '촉촉', '터지는'],
  },
  trust: {
    type: 'trust',
    label: '신뢰',
    description: '산지, 농부, 과정을 보고 믿을 수 있는 안심',
    trigger_keywords: ['직송', '농장', '직접', '산지', '무농약', '친환경', '인증', '후기'],
  },
  convenience: {
    type: 'convenience',
    label: '편리함',
    description: '귀찮은 과정 없이 바로 먹을 수 있는 편리함',
    trigger_keywords: ['바로', '간편', '손질', '세척', '포장', '배송', '냉동', '해동'],
  },
  identity: {
    type: 'identity',
    label: '정체성/소속감',
    description: '딱복파/물복파처럼 취향으로 자기를 표현',
    trigger_keywords: ['파', '팀', '취향', '나는', '우리는', '진짜', '찐'],
  },
  community_participation: {
    type: 'community_participation',
    label: '참여/소통',
    description: '댓글 달고, 투표하고, 공유하고 싶은 욕구',
    trigger_keywords: ['댓글', '투표', '공유', 'DM', '알려줘', '어떻게', '추천'],
  },
};

// ═══ 상품 × 플랫폼별 기본 욕망 매핑 ═══
const PRODUCT_PLATFORM_DESIRES: Record<string, Record<string, BuyerDesireType[]>> = {
  복숭아: {
    threads: ['seasonal_craving', 'sensory_imagination', 'identity', 'community_participation'],
    instagram: ['sensory_imagination', 'gift', 'family_care', 'seasonal_craving'],
    youtube_shorts: ['sensory_imagination', 'seasonal_craving', 'nostalgia'],
    tiktok: ['sensory_imagination', 'identity', 'community_participation'],
    naver_blog: ['trust', 'family_care', 'seasonal_craving', 'sensory_imagination'],
    outreach_email: ['seasonal_craving', 'trust', 'community_participation'],
  },
  옥수수: {
    threads: ['nostalgia', 'seasonal_craving', 'sensory_imagination', 'community_participation'],
    instagram: ['sensory_imagination', 'family_care', 'convenience'],
    youtube_shorts: ['sensory_imagination', 'nostalgia', 'seasonal_craving'],
    tiktok: ['sensory_imagination', 'community_participation', 'identity'],
    naver_blog: ['trust', 'convenience', 'family_care'],
    outreach_email: ['seasonal_craving', 'trust', 'sensory_imagination'],
  },
  절임배추: {
    threads: ['trust', 'family_care', 'scarcity_timing', 'community_participation'],
    instagram: ['family_care', 'trust', 'convenience'],
    youtube_shorts: ['trust', 'family_care', 'nostalgia'],
    tiktok: ['convenience', 'community_participation', 'trust'],
    naver_blog: ['trust', 'family_care', 'convenience', 'scarcity_timing'],
    outreach_email: ['scarcity_timing', 'trust', 'family_care'],
  },
  고구마: {
    threads: ['nostalgia', 'sensory_imagination', 'seasonal_craving', 'identity'],
    instagram: ['sensory_imagination', 'convenience', 'family_care'],
    youtube_shorts: ['sensory_imagination', 'nostalgia', 'convenience'],
    tiktok: ['sensory_imagination', 'community_participation', 'convenience'],
    naver_blog: ['trust', 'convenience', 'sensory_imagination'],
    outreach_email: ['seasonal_craving', 'trust', 'sensory_imagination'],
  },
  사과: {
    threads: ['sensory_imagination', 'gift', 'seasonal_craving', 'identity'],
    instagram: ['gift', 'sensory_imagination', 'family_care'],
    youtube_shorts: ['sensory_imagination', 'seasonal_craving', 'trust'],
    tiktok: ['sensory_imagination', 'community_participation', 'identity'],
    naver_blog: ['trust', 'gift', 'family_care', 'sensory_imagination'],
    outreach_email: ['seasonal_craving', 'gift', 'trust'],
  },
};

// ═══ Viral Content에서 욕망 감지 ═══
function detectDesiresFromContent(content: ViralContentRef): BuyerDesireType[] {
  const detected: BuyerDesireType[] = [];
  const text = `${content.hook_text || ''} ${content.hot_reason || ''} ${content.emotion_trigger || ''}`.toLowerCase();

  for (const [type, desire] of Object.entries(DESIRE_DB)) {
    if (desire.trigger_keywords.some(kw => text.includes(kw))) {
      detected.push(type as BuyerDesireType);
    }
  }
  return detected;
}

// ═══ 메인 함수: 상품 × 플랫폼 × Viral Content 기반 욕망 추출 ═══
export function detectBuyerDesires(
  product: string,
  platform: PlatformType,
  viralContents: ViralContentRef[] = []
): BuyerDesire[] {
  const productKey = resolveProductKey(product);
  const platformDesires = PRODUCT_PLATFORM_DESIRES[productKey]?.[platform] || ['sensory_imagination', 'trust', 'seasonal_craving'];

  // Viral Content에서 추가 욕망 감지
  const contentDesires = viralContents.flatMap(detectDesiresFromContent);

  // 중복 제거 후 합치기 (기본 매핑 + 콘텐츠 감지)
  const allDesireTypes = [...new Set([...platformDesires, ...contentDesires])];

  return allDesireTypes
    .filter(t => DESIRE_DB[t])
    .map(t => DESIRE_DB[t]);
}

// ═══ Buyer Desires를 프롬프트용 텍스트로 변환 ═══
export function buyerDesiresToPrompt(desires: BuyerDesire[]): string {
  return `[구매 욕망 분석]
${desires.map(d => `- ${d.label}(${d.type}): ${d.description}`).join('\n')}`;
}

// ═══ 상품명 정규화 ═══
function resolveProductKey(product: string): string {
  const aliases: Record<string, string> = {
    peach: '복숭아', 복숭아: '복숭아', 황도: '복숭아', 백도: '복숭아',
    corn: '옥수수', 옥수수: '옥수수', 찰옥수수: '옥수수', 단옥수수: '옥수수',
    kimchi_cabbage: '절임배추', 절임배추: '절임배추', 배추: '절임배추', 김장배추: '절임배추',
    sweet_potato: '고구마', 고구마: '고구마', 꿀고구마: '고구마',
    apple: '사과', 사과: '사과',
  };
  return aliases[product.toLowerCase()] || aliases[product] || product;
}

export { DESIRE_DB };
