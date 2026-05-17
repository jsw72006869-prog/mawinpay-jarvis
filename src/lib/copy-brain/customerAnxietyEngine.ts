/**
 * COPY-S.1 Step 3: Customer Anxiety Engine
 * 고객 불안을 이해하고 해소하는 방향으로 카피에 반영
 * 불안을 직접 겁주는 것이 아니라, 이해하고 해소하는 방향
 */
import type { CustomerAnxiety, PlatformCopyChannel } from './humanDesireTypes';

// ═══ 상품별 기본 불안 매핑 ═══
const PRODUCT_ANXIETIES: Record<string, CustomerAnxiety[]> = {
  peach: ['bad_taste', 'damaged_delivery', 'different_from_photo', 'bad_gift_feedback'],
  복숭아: ['bad_taste', 'damaged_delivery', 'different_from_photo', 'bad_gift_feedback'],
  corn: ['bad_taste', 'ugly_or_small', 'family_rejects', 'overpriced'],
  옥수수: ['bad_taste', 'ugly_or_small', 'family_rejects', 'overpriced'],
  kimchi_cabbage: ['bad_taste', 'damaged_delivery', 'overpriced', 'different_from_photo', 'bad_gift_feedback'],
  절임배추: ['bad_taste', 'damaged_delivery', 'overpriced', 'different_from_photo', 'bad_gift_feedback'],
  고구마: ['ugly_or_small', 'bad_taste', 'overpriced', 'different_from_photo'],
  사과: ['damaged_delivery', 'bad_taste', 'ugly_or_small', 'bad_gift_feedback'],
  밤: ['ugly_or_small', 'bad_taste', 'overpriced', 'different_from_photo'],
};

// ═══ 플랫폼별 불안 강조 ═══
const PLATFORM_ANXIETY_FOCUS: Record<string, CustomerAnxiety[]> = {
  threads: ['bad_taste', 'family_rejects'],           // 공감형 불안 해소
  youtube_thumbnail: ['different_from_photo', 'bad_taste'],  // 궁금증 유발
  youtube_shorts: ['bad_taste', 'ugly_or_small'],     // 시각적 해소
  instagram_reels: ['different_from_photo', 'bad_gift_feedback'], // 비주얼 증명
  naver_blog: ['bad_taste', 'overpriced', 'damaged_delivery'], // 정보형 해소
  outreach_email: [],                                  // 불안 사용 안 함
  smartstore_detail: ['bad_taste', 'damaged_delivery', 'overpriced', 'different_from_photo'], // 전체 해소
};

/**
 * 상품에 대한 기본 고객 불안 반환
 */
export function getDefaultCustomerAnxieties(product: string, platform: PlatformCopyChannel): CustomerAnxiety[] {
  const normalizedProduct = product.toLowerCase().trim();
  
  let anxieties: CustomerAnxiety[] = [];
  for (const [key, values] of Object.entries(PRODUCT_ANXIETIES)) {
    if (normalizedProduct.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedProduct)) {
      anxieties = [...values];
      break;
    }
  }
  
  if (anxieties.length === 0) {
    anxieties = ['bad_taste', 'different_from_photo', 'overpriced', 'damaged_delivery'];
  }
  
  // 플랫폼별 포커스 적용
  const platformFocus = PLATFORM_ANXIETY_FOCUS[platform] || [];
  if (platformFocus.length > 0) {
    // 플랫폼 포커스에 해당하는 불안을 상위로
    const focused = anxieties.filter(a => platformFocus.includes(a));
    const rest = anxieties.filter(a => !platformFocus.includes(a));
    anxieties = [...focused, ...rest];
  }
  
  return anxieties.slice(0, 3);
}

/**
 * 상품 + 플랫폼 + 키워드 기반 불안 순위화
 */
export function rankCustomerAnxieties(input: {
  product: string;
  platform: PlatformCopyChannel;
  sourceKeyword?: string;
}): CustomerAnxiety[] {
  const { product, platform, sourceKeyword = '' } = input;
  
  const base = getDefaultCustomerAnxieties(product, platform);
  
  // 키워드에서 추가 불안 감지
  const keywordLower = sourceKeyword.toLowerCase();
  const extra: CustomerAnxiety[] = [];
  
  if (/선물|감사|부모님/.test(keywordLower)) extra.push('bad_gift_feedback');
  if (/배송|택배|파손/.test(keywordLower)) extra.push('damaged_delivery');
  if (/가격|비싼|비싸/.test(keywordLower)) extra.push('overpriced');
  if (/크기|사이즈|작은/.test(keywordLower)) extra.push('ugly_or_small');
  if (/아이|아기|가족/.test(keywordLower)) extra.push('family_rejects');
  
  const combined = [...extra, ...base];
  return [...new Set(combined)].slice(0, 3);
}

// ═══ 불안 라벨 (한국어) ═══
export const CUSTOMER_ANXIETY_LABELS: Record<CustomerAnxiety, string> = {
  bad_taste: '맛없으면 어떡하지',
  damaged_delivery: '배송 중 상하면 어떡하지',
  ugly_or_small: '작거나 못생기면 어떡하지',
  overpriced: '가격이 비싼 건 아닐까',
  different_from_photo: '사진이랑 다르면 어떡하지',
  family_rejects: '가족이 안 먹으면 어떡하지',
  bad_gift_feedback: '선물했는데 별로면 어떡하지',
};

// ═══ 불안 해소 방향 가이드 (프롬프트에 삽입) ═══
export const ANXIETY_RESOLUTION_GUIDE: Record<CustomerAnxiety, string> = {
  bad_taste: '맛에 대한 불안은 감각 묘사로 간접 해소. "달다"가 아니라 "한 입 베면 즙이 턱을 타고 흐른다"',
  damaged_delivery: '배송 불안은 포장 신뢰로 해소. "에어캡 3중 + 아이스팩 + 당일 발송"',
  ugly_or_small: '외형 불안은 선별 과정 언급으로 해소. "하나하나 손으로 골랐다"',
  overpriced: '가격 불안은 가치 비교로 해소. 직접 "싸다"라고 하지 말고 경험 가치를 느끼게',
  different_from_photo: '실물 불안은 있는 그대로의 사진/영상으로 해소. 보정 없는 실제 모습',
  family_rejects: '가족 거부 불안은 아이/어르신 반응 스토리로 해소',
  bad_gift_feedback: '선물 불안은 받는 사람 반응 장면으로 해소. "엄마가 전화해서 뭐냐고 물어봤다"',
};
