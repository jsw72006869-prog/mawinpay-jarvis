/**
 * COPY-S.1 Step 4: Purchase Trigger Engine
 * 구매 트리거를 검증된 시그널 기반으로 판단
 * verified=true일 때만 강한 단정형 사용, 없으면 감정형/계절형 표현만
 */
import type { PurchaseTrigger, PlatformCopyChannel, VerifiedSignals } from './humanDesireTypes';

// ═══ 상품별 기본 트리거 ═══
const PRODUCT_TRIGGERS: Record<string, PurchaseTrigger[]> = {
  peach: ['seasonal_peak', 'direct_from_farm', 'harvested_today', 'sold_out_risk', 'kids_snack'],
  복숭아: ['seasonal_peak', 'direct_from_farm', 'harvested_today', 'sold_out_risk', 'kids_snack'],
  corn: ['seasonal_peak', 'direct_from_farm', 'camping', 'kids_snack', 'harvested_today'],
  옥수수: ['seasonal_peak', 'direct_from_farm', 'camping', 'kids_snack', 'harvested_today'],
  kimchi_cabbage: ['kimjang', 'seasonal_peak', 'limited_quantity', 'group_buy_deadline', 'direct_from_farm'],
  절임배추: ['kimjang', 'seasonal_peak', 'limited_quantity', 'group_buy_deadline', 'direct_from_farm'],
  고구마: ['seasonal_peak', 'direct_from_farm', 'kids_snack', 'camping', 'repurchase'],
  사과: ['seasonal_peak', 'holiday', 'gift_praise', 'direct_from_farm', 'limited_quantity'],
  밤: ['seasonal_peak', 'holiday', 'direct_from_farm', 'camping', 'kids_snack'],
};

// ═══ 플랫폼별 트리거 강조 ═══
const PLATFORM_TRIGGER_BOOST: Record<string, PurchaseTrigger[]> = {
  threads: ['seasonal_peak', 'sold_out_risk'],
  youtube_thumbnail: ['limited_quantity', 'seasonal_peak'],
  youtube_shorts: ['harvested_today', 'direct_from_farm'],
  instagram_reels: ['seasonal_peak', 'direct_from_farm'],
  naver_blog: ['repurchase', 'direct_from_farm'],
  outreach_email: ['seasonal_peak', 'group_buy_deadline'],
  smartstore_detail: ['limited_quantity', 'sold_out_risk', 'harvested_today'],
};

/**
 * 구매 트리거 반환 (verified signals 기반)
 */
export function getPurchaseTriggers(input: {
  product: string;
  platform: PlatformCopyChannel;
  sourceKeyword?: string;
  verifiedSignals?: VerifiedSignals;
}): { triggers: PurchaseTrigger[]; verified: PurchaseTrigger[]; unverified: PurchaseTrigger[] } {
  const { product, platform, sourceKeyword = '', verifiedSignals } = input;
  const normalizedProduct = product.toLowerCase().trim();
  
  // 상품 매칭
  let baseTriggers: PurchaseTrigger[] = [];
  for (const [key, values] of Object.entries(PRODUCT_TRIGGERS)) {
    if (normalizedProduct.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedProduct)) {
      baseTriggers = [...values];
      break;
    }
  }
  if (baseTriggers.length === 0) {
    baseTriggers = ['seasonal_peak', 'direct_from_farm', 'repurchase'];
  }
  
  // 플랫폼 보정
  const platformBoost = PLATFORM_TRIGGER_BOOST[platform] || [];
  const combined = [...new Set([...platformBoost.filter(t => baseTriggers.includes(t)), ...baseTriggers])];
  
  // 키워드 기반 추가
  const keywordLower = sourceKeyword.toLowerCase();
  if (/공구|마감|데드라인/.test(keywordLower) && !combined.includes('group_buy_deadline')) {
    combined.unshift('group_buy_deadline');
  }
  if (/김장/.test(keywordLower) && !combined.includes('kimjang')) {
    combined.unshift('kimjang');
  }
  if (/캠핑/.test(keywordLower) && !combined.includes('camping')) {
    combined.unshift('camping');
  }
  
  // verified/unverified 분류
  const verified: PurchaseTrigger[] = [];
  const unverified: PurchaseTrigger[] = [];
  
  for (const trigger of combined.slice(0, 5)) {
    if (verifiedSignals) {
      const isVerified = 
        (trigger === 'seasonal_peak' && verifiedSignals.seasonalPeak) ||
        (trigger === 'limited_quantity' && verifiedSignals.limitedQuantity) ||
        (trigger === 'harvested_today' && verifiedSignals.harvestedToday) ||
        (trigger === 'repurchase' && verifiedSignals.repurchase) ||
        (trigger === 'sold_out_risk' && verifiedSignals.soldOutRisk) ||
        (trigger === 'group_buy_deadline' && verifiedSignals.deadline);
      
      if (isVerified) verified.push(trigger);
      else unverified.push(trigger);
    } else {
      unverified.push(trigger);
    }
  }
  
  return { triggers: combined.slice(0, 5), verified, unverified };
}

// ═══ 트리거 라벨 ═══
export const PURCHASE_TRIGGER_LABELS: Record<PurchaseTrigger, string> = {
  seasonal_peak: '제철 피크',
  limited_quantity: '한정 수량',
  direct_from_farm: '산지 직송',
  harvested_today: '오늘 수확',
  repurchase: '재구매',
  sold_out_risk: '품절 위험',
  holiday: '명절',
  kimjang: '김장철',
  camping: '캠핑',
  kids_snack: '아이 간식',
  group_buy_deadline: '공구 마감',
};

// ═══ 트리거 사용 가이드 (verified vs unverified) ═══
export const TRIGGER_USAGE_GUIDE: Record<string, { verified: string; unverified: string }> = {
  seasonal_peak: {
    verified: '"지금이 딱 제철 피크입니다" — 강한 단정형 가능',
    unverified: '"제철 복숭아는 오래 기다려주지 않는다" — 감정형만 가능',
  },
  limited_quantity: {
    verified: '"300박스 한정, 지금 87% 소진" — 구체적 수치 가능',
    unverified: '"많이 남지 않았을 거예요" — 부드러운 암시만 가능',
  },
  harvested_today: {
    verified: '"오늘 딴 복숭아는 말보다 향이 먼저 도착한다" — 오늘 수확 명시 가능',
    unverified: '"수확 직후의 신선함" — 일반적 표현만 가능',
  },
  sold_out_risk: {
    verified: '"어제 200박스 완판, 오늘 마지막 물량" — 구체적 완판 데이터 가능',
    unverified: '"인기 상품이라 빨리 없어질 수 있어요" — 부드러운 표현만',
  },
  repurchase: {
    verified: '"재구매율 78%" — 구체적 수치 가능',
    unverified: '"한 번 먹어본 사람은 또 찾는다" — 스토리형만',
  },
  group_buy_deadline: {
    verified: '"오늘 밤 11시 마감" — 정확한 시간 명시 가능',
    unverified: '"공구 마감이 다가오고 있어요" — 부드러운 표현만',
  },
};
