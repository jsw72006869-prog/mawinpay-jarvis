/**
 * COPY-S.1 Step 5: Agri Sensory Engine
 * 농산물별 감각 데이터 (식감, 향, 장면, 타이밍, 감정 이미지)
 */
import type { AgriSensoryProfile } from './humanDesireTypes';

// ═══ 농산물별 감각 프로필 데이터베이스 ═══
const SENSORY_DATABASE: Record<string, AgriSensoryProfile> = {
  peach: {
    product: '복숭아',
    texture: ['말랑함', '아삭함', '과즙', '달큰함', '탱글한 과육', '이 사이로 터지는 즙'],
    aroma: ['복숭아 향', '냉장고 문 열 때 퍼지는 향', '여름 과일 향', '코끝에 먼저 닿는 달콤함'],
    scene: ['밥상 위 디저트', '아이 간식', '선물 박스', '여름 냉장고', '캠핑 과일', '할머니 댁 과일 바구니'],
    timing: ['제철 초입', '수확 직후', '끝물', '비 오기 전후', '한여름 2주'],
    emotionalImages: ['향으로 먼저 들키는 과일', '여름이 냉장고에 들어온 느낌', '한 입 베면 여름이 입 안에 터지는 순간', '복숭아 향 나는 집'],
  },
  corn: {
    product: '옥수수',
    texture: ['쫀득함', '탱글함', '알알이 씹히는 식감', '찰기', '톡톡 터지는 알갱이'],
    aroma: ['옥수수 찐 냄새', '여름 간식 냄새', '찜기에서 올라오는 김', '고소한 단내'],
    scene: ['아이 간식', '캠핑', '가족 간식', '찜기', '시골집', '주말 오후', '비 오는 날 간식'],
    timing: ['여름 제철', '수확 직후', '주말 캠핑 전', '장마 끝나고'],
    emotionalImages: ['집 안 공기가 여름이 되는 냄새', '손에 들고 먹는 제철 간식', '찜기 뚜껑 열 때 퍼지는 김', '아이가 양손에 하나씩 들고 먹는 모습'],
  },
  kimchi_cabbage: {
    product: '절임배추',
    texture: ['아삭함', '속이 찬 느낌', '절임 정도가 딱 맞는 식감', '양념이 잘 배는 결'],
    aroma: ['김장 양념 냄새', '겨울 밥상 냄새', '소금물에 절여진 배추 향'],
    scene: ['김장날', '가족 겨울 준비', '김치통', '겨울 밥상', '엄마 집 김장', '아파트 베란다'],
    timing: ['김장철', '예약 시즌', '겨울 전', '11월 초'],
    emotionalImages: ['실패하면 안 되는 겨울 준비', '집안의 겨울을 준비하는 일', '올해도 무사히 김장 끝냈다는 안도감', '엄마가 보내준 김치 맛'],
  },
  sweet_potato: {
    product: '고구마',
    texture: ['꿀처럼 흐르는 속', '촉촉함', '밤고구마 포슬포슬', '호박고구마 쫀득함'],
    aroma: ['군고구마 냄새', '겨울 간식 냄새', '오븐에서 나는 달콤한 향'],
    scene: ['겨울 간식', '다이어트 식단', '아이 간식', '캠핑 화로', '편의점 앞 군고구마'],
    timing: ['가을~겨울', '수확 후 숙성', '해풍 맞은 후'],
    emotionalImages: ['반으로 갈랐을 때 속이 노란 순간', '호호 불며 먹는 겨울 간식', '꿀이 흐르는 단면'],
  },
  apple: {
    product: '사과',
    texture: ['아삭함', '과즙', '단단한 과육', '씹을 때 소리'],
    aroma: ['사과 향', '가을 과일 향', '깎을 때 퍼지는 향'],
    scene: ['명절 선물', '아침 과일', '도시락 간식', '가을 소풍'],
    timing: ['가을 제철', '추석 전', '첫 수확', '저장 후 당도 오른 시점'],
    emotionalImages: ['깎아서 접시에 올린 사과', '아삭 소리가 들리는 한 입', '선물 박스 열었을 때 빨간 사과'],
  },
  chestnut: {
    product: '밤',
    texture: ['포슬포슬', '달큰함', '밤 특유의 식감', '군밤의 부드러움'],
    aroma: ['군밤 냄새', '가을 냄새', '밤 삶는 냄새'],
    scene: ['가을 간식', '명절 음식', '캠핑', '밤줍기', '할머니 댁'],
    timing: ['가을 제철', '추석', '서리 내리기 전'],
    emotionalImages: ['주머니에 넣고 호호 불며 까먹는 군밤', '가을이 손에 잡히는 느낌'],
  },
};

// ═══ 별칭 매핑 ═══
const PRODUCT_ALIAS_MAP: Record<string, string> = {
  '복숭아': 'peach', 'peach': 'peach', '황도': 'peach', '백도': 'peach', '천도': 'peach',
  '옥수수': 'corn', 'corn': 'corn', '찰옥수수': 'corn', '초당옥수수': 'corn',
  '절임배추': 'kimchi_cabbage', 'kimchi_cabbage': 'kimchi_cabbage', '배추': 'kimchi_cabbage', '김장배추': 'kimchi_cabbage',
  '고구마': 'sweet_potato', 'sweet_potato': 'sweet_potato',
  '사과': 'apple', 'apple': 'apple',
  '밤': 'chestnut', 'chestnut': 'chestnut', '알밤': 'chestnut', '공주밤': 'chestnut',
};

/**
 * 상품명으로 감각 프로필 반환
 */
export function getAgriSensoryProfile(product: string): AgriSensoryProfile {
  const normalizedProduct = product.toLowerCase().trim();
  
  // 직접 매칭
  if (SENSORY_DATABASE[normalizedProduct]) {
    return SENSORY_DATABASE[normalizedProduct];
  }
  
  // 별칭 매칭
  for (const [alias, key] of Object.entries(PRODUCT_ALIAS_MAP)) {
    if (normalizedProduct.includes(alias.toLowerCase()) || alias.toLowerCase().includes(normalizedProduct)) {
      if (SENSORY_DATABASE[key]) return SENSORY_DATABASE[key];
    }
  }
  
  // 매칭 안 되면 범용 프로필
  return {
    product: product,
    texture: ['신선함', '자연 그대로의 식감'],
    aroma: ['자연의 향', '제철의 향'],
    scene: ['가족 식탁', '간식 시간', '선물'],
    timing: ['제철', '수확 직후'],
    emotionalImages: ['자연에서 온 먹거리', '정성이 담긴 한 상자'],
  };
}

/**
 * 감각 프로필을 프롬프트용 텍스트로 변환
 */
export function sensoryProfileToPromptText(profile: AgriSensoryProfile): string {
  return `[농산물 감각 데이터: ${profile.product}]
식감: ${profile.texture.join(', ')}
향: ${profile.aroma.join(', ')}
장면: ${profile.scene.join(', ')}
타이밍: ${profile.timing.join(', ')}
감정 이미지: ${profile.emotionalImages.join(' / ')}`;
}
