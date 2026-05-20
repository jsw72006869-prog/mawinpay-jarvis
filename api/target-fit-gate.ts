// ══════════════════════════════════════════════════════════════
// OUTREACH-TARGET-FIT-A.1: Target Fit Gate
// 분야 적합도 hard gate - 요청한 분야와 실제 후보가 맞는지 검증
// ══════════════════════════════════════════════════════════════

export type OutreachTargetVertical =
  | 'beauty'
  | 'food'
  | 'cooking'
  | 'camping'
  | 'parenting'
  | 'lifestyle'
  | 'health'
  | 'travel'
  | 'naver_blog'
  | 'unknown';

export type TargetMatchStatus = 'qualified' | 'review' | 'excluded';

export type TargetFitResult = {
  requestedVertical: OutreachTargetVertical;
  targetMatchStatus: TargetMatchStatus;
  targetMatchScore: number;
  evidenceTerms: string[];
  evidenceFields: string[];
  excludeReason?: string;
};

// ── 분야별 키워드 사전 ──
const VERTICAL_KEYWORDS: Record<OutreachTargetVertical, { primary: string[]; secondary: string[] }> = {
  beauty: {
    primary: [
      '뷰티', '메이크업', '화장품', '스킨케어', '피부관리', '피부', '쿠션', '립', '틴트',
      '파운데이션', '클렌징', '선크림', '올리브영', '겟레디윗미', 'grwm', '데일리메이크업',
      '코덕', '향수', '헤어스타일링', '네일', '패션뷰티',
      'beauty', 'makeup', 'skincare', 'cosmetic', 'cosmetics', 'foundation', 'lipstick',
      'lip tint', 'sunscreen', 'cleansing', 'perfume', 'hair styling',
    ],
    secondary: ['패션', '라이프스타일', '브이로그', '데일리', '하울', '언박싱', '추천템', '꿀템'],
  },
  food: {
    primary: [
      '먹방', '맛집', '음식', '요리', '레시피', '집밥', '간식', '제철', '농산물', '산지직송',
      '과일', '채소', '공동구매', '공구', 'mukbang', '대식가', '푸드',
    ],
    secondary: ['캠핑요리', '간편식', '배달', '디저트', '베이킹', '카페'],
  },
  cooking: {
    primary: ['요리', '레시피', '집밥', '쿠킹', '자취요리', '간단요리', '베이킹', '홈쿡'],
    secondary: ['먹방', '간식', '디저트', '살림', '주부'],
  },
  camping: {
    primary: ['캠핑', '차박', '아웃도어', '바베큐', '캠핑장', '텐트', '캠핑요리', '백패킹'],
    secondary: ['여행', '자연', '등산', '낚시', '브이로그'],
  },
  parenting: {
    primary: ['육아', '아이', '엄마', '아빠', '유아', '초등', '키즈', '임신', '출산', '육아맘'],
    secondary: ['가족', '일상', '교육', '놀이', '간식'],
  },
  lifestyle: {
    primary: ['라이프스타일', '일상', '브이로그', '살림', '인테리어', '미니멀', '루틴'],
    secondary: ['쇼핑', '하울', '정리', '자취'],
  },
  health: {
    primary: ['건강', '운동', '다이어트', '피트니스', '홈트', '요가', '필라테스', '영양제'],
    secondary: ['식단', '클린이팅', '웰빙'],
  },
  travel: {
    primary: ['여행', '해외여행', '국내여행', '호텔', '맛집투어', '관광'],
    secondary: ['브이로그', '풍경', '힐링'],
  },
  naver_blog: {
    primary: ['블로그', '체험단', '리뷰', '포스팅'],
    secondary: ['맛집', '제품리뷰', '일상'],
  },
  unknown: { primary: [], secondary: [] },
};

// ── 분야별 YouTube 검색 쿼리 팩 ──
export const VERTICAL_QUERY_PACKS: Record<OutreachTargetVertical, string[]> = {
  beauty: [
    '뷰티 유튜버 메이크업',
    '스킨케어 루틴 유튜버',
    '올리브영 추천 유튜버',
    '겟레디윗미 GRWM 한국',
    '데일리 메이크업 유튜버',
    '화장품 리뷰 유튜버',
    '립 틴트 추천 유튜버',
    '쿠션 파운데이션 리뷰',
    '패션 뷰티 유튜버',
    '코덕 추천템',
  ],
  food: [
    '먹방 유튜버 리뷰',
    '농산물 공동구매 유튜버',
    '제철 과일 리뷰',
    '맛집 리뷰 유튜버',
    '간식 추천 유튜버',
    '산지직송 리뷰',
  ],
  cooking: [
    '요리 유튜버 레시피',
    '집밥 유튜버',
    '자취요리 유튜버',
    '간단 요리 레시피',
    '베이킹 유튜버',
  ],
  camping: [
    '캠핑 유튜버 브이로그',
    '차박 캠핑 유튜버',
    '캠핑 요리 유튜버',
    '캠핑장 추천 유튜버',
    '백패킹 유튜버',
  ],
  parenting: [
    '육아 유튜버 일상',
    '육아맘 브이로그',
    '키즈 유튜버',
    '아이 간식 추천',
  ],
  lifestyle: [
    '라이프스타일 유튜버',
    '일상 브이로그 유튜버',
    '살림 유튜버',
    '인테리어 유튜버',
  ],
  health: [
    '운동 유튜버 홈트',
    '다이어트 유튜버',
    '건강 식단 유튜버',
    '피트니스 유튜버',
  ],
  travel: [
    '여행 유튜버 브이로그',
    '국내여행 유튜버',
    '해외여행 유튜버',
    '맛집투어 유튜버',
  ],
  naver_blog: [],
  unknown: [],
};

// ── 키워드 → vertical 자동 감지 ──
export function detectVerticalFromKeyword(keyword: string): OutreachTargetVertical {
  const kLower = keyword.toLowerCase();
  for (const [vertical, { primary }] of Object.entries(VERTICAL_KEYWORDS)) {
    if (vertical === 'unknown') continue;
    if (primary.some(kw => kLower.includes(kw.toLowerCase()))) {
      return vertical as OutreachTargetVertical;
    }
  }
  return 'unknown';
}

// ── Target Fit 평가 함수 ──
export function evaluateTargetFit(input: {
  requestedVertical: OutreachTargetVertical;
  channelTitle?: string;
  channelDescription?: string;
  recentVideoTitles?: string[];
  recentVideoDescriptions?: string[];
  category?: string;
  proposalAngle?: string;
}): TargetFitResult {
  const { requestedVertical, channelTitle, channelDescription, recentVideoTitles, recentVideoDescriptions, category, proposalAngle } = input;

  if (requestedVertical === 'unknown') {
    return { requestedVertical, targetMatchStatus: 'qualified', targetMatchScore: 50, evidenceTerms: [], evidenceFields: [] };
  }

  const verticalDef = VERTICAL_KEYWORDS[requestedVertical];
  if (!verticalDef) {
    return { requestedVertical, targetMatchStatus: 'qualified', targetMatchScore: 50, evidenceTerms: [], evidenceFields: [] };
  }

  const evidenceTerms: string[] = [];
  const evidenceFields: string[] = [];
  let score = 0;

  // 검사 대상 텍스트 준비
  const titleText = (channelTitle || '').toLowerCase();
  const descText = (channelDescription || '').toLowerCase();
  const videoTitlesText = (recentVideoTitles || []).join(' ').toLowerCase();
  const videoDescsText = (recentVideoDescriptions || []).join(' ').toLowerCase();
  const categoryText = (category || '').toLowerCase();
  const proposalText = (proposalAngle || '').toLowerCase();

  // Primary 키워드 매칭 (각 +12점, 최대 60점)
  for (const kw of verticalDef.primary) {
    const kwLower = kw.toLowerCase();
    if (titleText.includes(kwLower)) {
      score += 12; evidenceTerms.push(kw); evidenceFields.push('channelTitle');
    } else if (descText.includes(kwLower)) {
      score += 12; evidenceTerms.push(kw); evidenceFields.push('channelDescription');
    } else if (videoTitlesText.includes(kwLower)) {
      score += 12; evidenceTerms.push(kw); evidenceFields.push('recentVideoTitles');
    } else if (videoDescsText.includes(kwLower)) {
      score += 8; evidenceTerms.push(kw); evidenceFields.push('recentVideoDescriptions');
    }
    if (score >= 60) break; // cap primary contribution
  }

  // Secondary 키워드 매칭 (각 +5점, 최대 20점)
  let secondaryScore = 0;
  for (const kw of verticalDef.secondary) {
    if (secondaryScore >= 20) break;
    const kwLower = kw.toLowerCase();
    const allText = `${titleText} ${descText} ${videoTitlesText}`;
    if (allText.includes(kwLower)) {
      secondaryScore += 5; evidenceTerms.push(kw); evidenceFields.push('secondary');
    }
  }
  score += secondaryScore;

  // Category 보너스 (카테고리가 명시적으로 일치하면 +10)
  if (categoryText && verticalDef.primary.some(kw => categoryText.includes(kw.toLowerCase()))) {
    score += 10; evidenceFields.push('category');
  }

  // 최종 점수 cap
  const finalScore = Math.min(score, 100);

  // 판정
  let status: TargetMatchStatus;
  let excludeReason: string | undefined;

  if (finalScore >= 70) {
    status = 'qualified';
  } else if (finalScore >= 40) {
    status = 'review';
  } else {
    status = 'excluded';
    if (finalScore === 0) {
      excludeReason = `${requestedVertical} 분야 근거 키워드 없음 (채널명/설명/영상 제목에서 관련 키워드 미발견)`;
    } else {
      excludeReason = `${requestedVertical} 분야 적합도 부족 (targetMatchScore=${finalScore}, 기준 40 미만)`;
    }
  }

  // Dedupe evidenceTerms
  const uniqueTerms = [...new Set(evidenceTerms)];
  const uniqueFields = [...new Set(evidenceFields)];

  return {
    requestedVertical,
    targetMatchStatus: status,
    targetMatchScore: finalScore,
    evidenceTerms: uniqueTerms.slice(0, 10),
    evidenceFields: uniqueFields.slice(0, 5),
    excludeReason,
  };
}
