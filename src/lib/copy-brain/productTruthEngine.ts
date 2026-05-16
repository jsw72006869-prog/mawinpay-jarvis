/**
 * COPY-BRAIN-A.1: Product Truth Engine
 * 상품별로 "진짜 팔리는 이유"를 구조화한다.
 */
import type { ProductTruth } from './copyBrainTypes';

// ═══ 상품별 Product Truth 데이터베이스 ═══
const PRODUCT_TRUTH_DB: Record<string, ProductTruth> = {
  복숭아: {
    product: '복숭아',
    core_truth: [
      '여름에는 맛보다 향으로 먼저 기억된다.',
      '딱복/물복 취향 대립이 강하다.',
      '수확 시즌이 짧아 타이밍이 중요하다.',
      '선물용으로 외관(크기, 색)이 중요하다.',
      '냉장고 열 때 퍼지는 향이 구매 만족도를 결정한다.',
    ],
    sensory_points: ['향', '과즙', '당도', '식감', '냉장고 열었을 때 향', '한 입 베어물 때 터지는 즙'],
    seasonal_timing: '7~9월 수확, 6월 말부터 예약 시작, 8월 피크',
    buyer_contexts: ['가족 간식', '선물', '캠핑', '여름 디저트', '아이 간식', '부모님 선물', '제사/명절'],
    trust_signals: ['산지 직송', '당일 수확', '농장 사진', '선별 과정', '무농약/저농약'],
    avoid_claims: ['최고 당도', '세상에서 제일 맛있는', '효능/건강 주장', '100% 만족 보장'],
    content_angles: [
      '딱복파 vs 물복파 논쟁',
      '냉장고 열 때 향기 장면',
      '한 입 베어물 때 과즙 터지는 장면',
      '아이가 복숭아 먹는 모습',
      '산지에서 바로 따는 장면',
      '복숭아 고르는 법',
    ],
  },
  옥수수: {
    product: '옥수수',
    core_truth: [
      '쫀득함은 한 번 먹으면 계속 생각난다.',
      '여름 간식으로 기억과 연결된다.',
      '산지 직송 신뢰가 중요하다.',
      '찰옥수수 vs 단옥수수 취향이 갈린다.',
      '삶아서 바로 먹는 그 순간이 핵심이다.',
    ],
    sensory_points: ['쫀득함', '단맛', '옥수수 향', '뜨거운 김', '알갱이 식감', '버터 올렸을 때'],
    seasonal_timing: '6~8월 수확, 7월 피크, 초여름부터 예약',
    buyer_contexts: ['캠핑 간식', '아이 간식', '여름 간식', '다이어트 대용', '야식', '가족 나들이'],
    trust_signals: ['산지 직송', '당일 수확 당일 발송', '농장 직거래', '품종 명시'],
    avoid_claims: ['최고 당도', '다이어트 효과', '건강 효능'],
    content_angles: [
      '캠핑에서 옥수수 굽는 장면',
      '삶은 옥수수에 버터 올리는 장면',
      '아이가 옥수수 들고 먹는 모습',
      '산지에서 바로 따는 장면',
      '찰옥수수 vs 단옥수수 논쟁',
    ],
  },
  절임배추: {
    product: '절임배추',
    core_truth: [
      '김장은 실패하면 안 되는 집안일이다.',
      '가격보다 원물 신뢰가 중요하다.',
      '예약 수요와 시즌 타이밍이 중요하다.',
      '절임 상태(짠맛, 숨죽임)가 김장 성패를 좌우한다.',
      '엄마/시어머니 세대의 기준이 높다.',
    ],
    sensory_points: ['아삭함', '적당한 짠맛', '배추 숨죽임 상태', '잎 두께', '줄기 단맛'],
    seasonal_timing: '11~12월 김장 시즌, 10월부터 예약, 11월 중순 피크',
    buyer_contexts: ['김장', '가족 행사', '시어머니 선물', '1인 가구 소량 김장', '공동구매'],
    trust_signals: ['해남/고랭지 산지', '절임 공정 사진', '배추 원물 사진', '절임 후 무게', '후기 사진'],
    avoid_claims: ['최고 품질', '무조건 맛있는', '실패 없는'],
    content_angles: [
      '김장 준비 과정 브이로그',
      '절임배추 받아서 확인하는 장면',
      '김장 전날 밤 준비하는 모습',
      '엄마와 함께 김장하는 장면',
      '1인 가구 소량 김장 도전기',
    ],
  },
  고구마: {
    product: '고구마',
    core_truth: [
      '겨울 간식의 대명사, 추억과 연결된다.',
      '꿀고구마/밤고구마/호박고구마 취향이 갈린다.',
      '에어프라이어로 쉽게 구워 먹는 트렌드.',
      '당도와 식감이 구매 만족도를 결정한다.',
    ],
    sensory_points: ['꿀처럼 흐르는 당', '촉촉함', '밤 같은 식감', '구울 때 향', '노란 속살'],
    seasonal_timing: '9~11월 수확, 숙성 후 11~2월 판매 피크',
    buyer_contexts: ['겨울 간식', '아이 간식', '다이어트', '선물', '캠핑'],
    trust_signals: ['해남/여주 산지', '숙성 기간 명시', '품종 명시', '당도 측정'],
    avoid_claims: ['다이어트 효과', '건강 효능', '최고 당도'],
    content_angles: [
      '에어프라이어 고구마 굽는 장면',
      '반으로 갈랐을 때 꿀 흐르는 장면',
      '겨울 캠핑 고구마 장면',
      '꿀고구마 vs 밤고구마 논쟁',
    ],
  },
  사과: {
    product: '사과',
    core_truth: [
      '아삭함이 핵심, 물렁한 사과는 실패다.',
      '부사/홍로/감홍 등 품종별 차이가 크다.',
      '선물용은 크기와 색이 중요하다.',
      '제사/명절 수요가 크다.',
    ],
    sensory_points: ['아삭함', '당도', '산미 밸런스', '과즙', '껍질 색'],
    seasonal_timing: '9~11월 수확, 추석 전후 피크, 겨울까지 저장 판매',
    buyer_contexts: ['선물', '제사', '명절', '가족 간식', '아이 간식', '주스/잼 만들기'],
    trust_signals: ['영주/청송/거창 산지', '품종 명시', '당도 측정', '선별 과정'],
    avoid_claims: ['최고 당도', '세상에서 제일', '건강 효능'],
    content_angles: [
      '사과 한 입 베어물 때 아삭한 소리',
      '선물 박스 개봉 장면',
      '품종별 맛 비교',
      '산지 방문 브이로그',
    ],
  },
};

// ═══ Product Truth 조회 함수 ═══
export function getProductTruth(product: string): ProductTruth {
  // 정확한 매칭
  if (PRODUCT_TRUTH_DB[product]) return PRODUCT_TRUTH_DB[product];

  // 부분 매칭 (peach → 복숭아, corn → 옥수수 등)
  const aliases: Record<string, string> = {
    peach: '복숭아', 복숭아: '복숭아', 황도: '복숭아', 백도: '복숭아',
    corn: '옥수수', 옥수수: '옥수수', 찰옥수수: '옥수수', 단옥수수: '옥수수',
    kimchi_cabbage: '절임배추', 절임배추: '절임배추', 배추: '절임배추', 김장배추: '절임배추',
    sweet_potato: '고구마', 고구마: '고구마', 꿀고구마: '고구마',
    apple: '사과', 사과: '사과',
  };

  const resolved = aliases[product.toLowerCase()] || aliases[product];
  if (resolved && PRODUCT_TRUTH_DB[resolved]) return PRODUCT_TRUTH_DB[resolved];

  // 기본 구조 반환 (미등록 상품)
  return {
    product,
    core_truth: [`${product}의 핵심 가치를 파악하여 진정성 있는 카피를 생성합니다.`],
    sensory_points: ['맛', '향', '식감', '외관'],
    seasonal_timing: '시즌 확인 필요',
    buyer_contexts: ['일상 소비', '선물', '가족 식사'],
    trust_signals: ['산지 직송', '신선도'],
    avoid_claims: ['최고', '보장', '효능'],
    content_angles: [`${product} 실제 사용/소비 장면`],
  };
}

// ═══ Product Truth를 프롬프트용 텍스트로 변환 ═══
export function productTruthToPrompt(truth: ProductTruth): string {
  return `[상품 진실: ${truth.product}]
핵심 진실: ${truth.core_truth.join(' / ')}
감각 포인트: ${truth.sensory_points.join(', ')}
시즌: ${truth.seasonal_timing}
구매 맥락: ${truth.buyer_contexts.join(', ')}
신뢰 시그널: ${truth.trust_signals.join(', ')}
금지 주장: ${truth.avoid_claims.join(', ')}
콘텐츠 앵글: ${truth.content_angles.join(', ')}`;
}
