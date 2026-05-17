/**
 * COPY-S.1 Step 2: Human Desire Engine
 * 상품 + 플랫폼 + 키워드 기반으로 인간 욕구를 순위화하여 반환
 */
import type { HumanDesire, PlatformCopyChannel } from './humanDesireTypes';

// ═══ 상품별 기본 욕구 매핑 ═══
const PRODUCT_DESIRES: Record<string, HumanDesire[]> = {
  peach: ['not_miss_season', 'feed_family', 'gift_praise', 'avoid_regret', 'choose_good_quality'],
  복숭아: ['not_miss_season', 'feed_family', 'gift_praise', 'avoid_regret', 'choose_good_quality'],
  corn: ['feed_family', 'not_miss_season', 'buy_from_trusted_person', 'avoid_regret', 'choose_good_quality'],
  옥수수: ['feed_family', 'not_miss_season', 'buy_from_trusted_person', 'avoid_regret', 'choose_good_quality'],
  kimchi_cabbage: ['avoid_regret', 'feed_family', 'buy_from_trusted_person', 'choose_good_quality', 'not_miss_season'],
  절임배추: ['avoid_regret', 'feed_family', 'buy_from_trusted_person', 'choose_good_quality', 'not_miss_season'],
  고구마: ['feed_family', 'choose_good_quality', 'not_miss_season', 'save_money', 'buy_from_trusted_person'],
  사과: ['gift_praise', 'choose_good_quality', 'not_miss_season', 'feed_family', 'avoid_regret'],
  밤: ['not_miss_season', 'feed_family', 'gift_praise', 'choose_good_quality', 'buy_from_trusted_person'],
};

// ═══ 플랫폼별 욕구 보정 ═══
const PLATFORM_DESIRE_BOOST: Record<string, HumanDesire[]> = {
  threads: ['buy_before_others', 'not_miss_season'],           // 정체성/댓글 유도
  youtube_thumbnail: ['avoid_regret', 'choose_good_quality'],  // 궁금증/첫 클릭
  youtube_shorts: ['not_miss_season', 'feed_family'],          // 감각/장면
  instagram_reels: ['gift_praise', 'not_miss_season'],         // 감성/비주얼
  tiktok: ['buy_before_others', 'save_money'],                 // 빠른 후킹/트렌드
  naver_blog: ['avoid_regret', 'buy_from_trusted_person'],     // 신뢰/검색형
  outreach_email: ['buy_from_trusted_person', 'choose_good_quality'], // 협업 적합성
  smartstore_detail: ['avoid_regret', 'choose_good_quality'],  // 구매 결정
};

// ═══ 키워드 기반 욕구 감지 ═══
const KEYWORD_DESIRE_MAP: Array<{ keywords: RegExp; desire: HumanDesire }> = [
  { keywords: /선물|감사|부모님|어버이|추석|설날/, desire: 'gift_praise' },
  { keywords: /가족|아이|아기|엄마|아빠|집/, desire: 'feed_family' },
  { keywords: /제철|시즌|올해|이번|지금/, desire: 'not_miss_season' },
  { keywords: /실패|후회|걱정|불안/, desire: 'avoid_regret' },
  { keywords: /싸게|할인|가성비|저렴/, desire: 'save_money' },
  { keywords: /좋은|최고|프리미엄|특등/, desire: 'choose_good_quality' },
  { keywords: /한정|마감|품절|서둘러/, desire: 'buy_before_others' },
  { keywords: /산지|직송|농장|직접|믿을/, desire: 'buy_from_trusted_person' },
];

/**
 * 상품에 대한 기본 인간 욕구 반환
 */
export function getDefaultHumanDesires(product: string, platform: PlatformCopyChannel): HumanDesire[] {
  const normalizedProduct = product.toLowerCase().trim();
  
  // 상품 매칭
  let desires: HumanDesire[] = [];
  for (const [key, values] of Object.entries(PRODUCT_DESIRES)) {
    if (normalizedProduct.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedProduct)) {
      desires = [...values];
      break;
    }
  }
  
  // 매칭 안 되면 범용 욕구
  if (desires.length === 0) {
    desires = ['choose_good_quality', 'avoid_regret', 'feed_family', 'not_miss_season', 'buy_from_trusted_person'];
  }
  
  // 플랫폼 보정: 해당 플랫폼 우선 욕구를 상위로
  const platformBoost = PLATFORM_DESIRE_BOOST[platform] || [];
  const boosted = platformBoost.filter(d => !desires.includes(d));
  desires = [...desires.slice(0, 3), ...boosted.slice(0, 2), ...desires.slice(3)];
  
  // 중복 제거 후 상위 5개
  return [...new Set(desires)].slice(0, 5);
}

/**
 * 상품 + 플랫폼 + 키워드 + 시즌 기반 욕구 순위화
 * 상위 2~4개만 프롬프트에 강하게 넣기 위해 정렬
 */
export function rankHumanDesires(input: {
  product: string;
  platform: PlatformCopyChannel;
  sourceKeyword?: string;
  season?: string;
  useCase?: string;
}): HumanDesire[] {
  const { product, platform, sourceKeyword = '', season, useCase } = input;
  
  // 기본 욕구 가져오기
  const baseDesires = getDefaultHumanDesires(product, platform);
  
  // 키워드에서 추가 욕구 감지
  const keywordDesires: HumanDesire[] = [];
  for (const { keywords, desire } of KEYWORD_DESIRE_MAP) {
    if (keywords.test(sourceKeyword) || keywords.test(useCase || '')) {
      keywordDesires.push(desire);
    }
  }
  
  // 시즌 보정
  if (season) {
    const seasonLower = season.toLowerCase();
    if (/여름|summer|7월|8월/.test(seasonLower)) keywordDesires.push('not_miss_season');
    if (/겨울|winter|김장|11월|12월/.test(seasonLower)) keywordDesires.push('avoid_regret');
    if (/명절|추석|설/.test(seasonLower)) keywordDesires.push('gift_praise');
  }
  
  // 키워드 욕구를 상위로 끌어올리기
  const combined = [...keywordDesires, ...baseDesires];
  const unique = [...new Set(combined)];
  
  // 최종: 상위 4개 반환 (프롬프트에 강하게 넣을 수)
  return unique.slice(0, 4);
}

// ═══ 욕구 라벨 (한국어) ═══
export const HUMAN_DESIRE_LABELS: Record<HumanDesire, string> = {
  save_money: '싸게 사고 싶은 욕구',
  choose_good_quality: '좋은 걸 고르고 싶은 욕구',
  feed_family: '가족에게 먹이고 싶은 욕구',
  avoid_regret: '실패/후회 피하고 싶은 욕구',
  buy_before_others: '남들보다 먼저 사고 싶은 욕구',
  not_miss_season: '제철을 놓치고 싶지 않은 욕구',
  gift_praise: '선물로 칭찬받고 싶은 욕구',
  buy_from_trusted_person: '믿을 수 있는 사람에게 사고 싶은 욕구',
};
