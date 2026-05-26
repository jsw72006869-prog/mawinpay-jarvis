// OUTREACH-TARGET-FIT-A.1: requested vertical fit gate.
// This file is intentionally pure: no API calls, no fake candidates, no contact-data leakage.

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

type VerticalKeywordSet = {
  primary: string[];
  secondary: string[];
};

const VERTICAL_KEYWORDS: Record<OutreachTargetVertical, VerticalKeywordSet> = {
  beauty: {
    primary: [
      '뷰티', '메이크업', '화장품', '스킨케어', '피부관리', '피부', '쿠션', '립', '틴트',
      '파운데이션', '클렌징', '선크림', '올리브영', '겟레디윗미', '데일리메이크업',
      '코덕', '향수', '헤어스타일링', '네일', '패션뷰티',
      'beauty', 'makeup', 'skincare', 'cosmetic', 'cosmetics', 'foundation', 'lipstick',
      'lip tint', 'sunscreen', 'cleansing', 'perfume', 'hair styling', 'grwm', 'oliveyoung',
    ],
    secondary: ['패션', '라이프스타일', '브이로그', '데일리', '하울', '언박싱', '추천템', '꾸안꾸', 'fashion', 'lifestyle', 'vlog', 'haul', 'daily'],
  },
  food: {
    primary: [
      '먹방', '맛집', '음식', '요리', '레시피', '집밥', '간식', '제철', '농산물', '산지직송',
      '과일', '채소', '공동구매', '공구', 'mukbang', '식품', '푸드',
    ],
    secondary: ['카페투어', '간편식', '배달', '디저트', '베이킹'],
  },
  cooking: {
    primary: ['요리', '레시피', '집밥', '쿠킹', '자취요리', '간단요리', '베이킹', '반찬'],
    secondary: ['먹방', '간식', '디저트', '살림', '주부'],
  },
  camping: {
    primary: ['캠핑', '차박', '아웃도어', '바베큐', '캠핑요리', '텐트', '캠핑장', '백패킹'],
    secondary: ['여행', '자연', '등산', '낚시', '브이로그'],
  },
  parenting: {
    primary: ['육아', '아이', '엄마', '아빠', '유아', '초등', '키즈', '임신', '출산', '육아맘'],
    secondary: ['가족', '일상', '교육', '간식', '살림'],
  },
  lifestyle: {
    primary: ['라이프스타일', '일상', '브이로그', '살림', '인테리어', '미니멀', '루틴'],
    secondary: ['하울', '추천', '정리', '자취'],
  },
  health: {
    primary: ['건강', '운동', '다이어트', '피트니스', '헬스', '요가', '필라테스', '영양'],
    secondary: ['식단', '클린이팅', '습관'],
  },
  travel: {
    primary: ['여행', '해외여행', '국내여행', '호텔', '맛집투어', '관광'],
    secondary: ['브이로그', '풍경', '자연'],
  },
  naver_blog: {
    primary: ['블로그', '체험단', '리뷰', '포스팅'],
    secondary: ['맛집', '제품리뷰', '일상'],
  },
  unknown: { primary: [], secondary: [] },
};

export const VERTICAL_QUERY_PACKS: Record<OutreachTargetVertical, string[]> = {
  beauty: [
    '뷰티 유튜버 메이크업',
    '스킨케어 루틴 유튜버',
    '올리브영 추천 유튜버',
    '겟레디윗미 GRWM 한국 유튜버',
    '데일리 메이크업 유튜버',
    '화장품 리뷰 유튜버',
    '립 틴트 추천 유튜버',
    '쿠션 파운데이션 리뷰 유튜버',
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
    '운동 유튜버 헬스',
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

export function detectVerticalFromKeyword(keyword: string): OutreachTargetVertical {
  const kLower = (keyword || '').toLowerCase();
  for (const [vertical, { primary }] of Object.entries(VERTICAL_KEYWORDS)) {
    if (vertical === 'unknown') continue;
    if (primary.some((kw) => kLower.includes(kw.toLowerCase()))) {
      return vertical as OutreachTargetVertical;
    }
  }
  return 'unknown';
}

function pushEvidence(
  terms: string[],
  fields: string[],
  term: string,
  field: string,
) {
  terms.push(term);
  fields.push(field);
}

function containsTerm(text: string, term: string): boolean {
  return text.includes(term.toLowerCase());
}

export function evaluateTargetFit(input: {
  requestedVertical: OutreachTargetVertical;
  channelTitle?: string;
  channelDescription?: string;
  recentVideoTitles?: string[];
  recentVideoDescriptions?: string[];
  category?: string;
  proposalAngle?: string;
}): TargetFitResult {
  const {
    requestedVertical,
    channelTitle,
    channelDescription,
    recentVideoTitles,
    recentVideoDescriptions,
    category,
    proposalAngle,
  } = input;

  if (requestedVertical === 'unknown') {
    return {
      requestedVertical,
      targetMatchStatus: 'qualified',
      targetMatchScore: 50,
      evidenceTerms: [],
      evidenceFields: [],
    };
  }

  const verticalDef = VERTICAL_KEYWORDS[requestedVertical];
  if (!verticalDef) {
    return {
      requestedVertical,
      targetMatchStatus: 'excluded',
      targetMatchScore: 0,
      evidenceTerms: [],
      evidenceFields: [],
      excludeReason: 'unknown_vertical',
    };
  }

  const fieldText = {
    channelTitle: (channelTitle || '').toLowerCase(),
    channelDescription: (channelDescription || '').toLowerCase(),
    recentVideoTitles: (recentVideoTitles || []).join(' ').toLowerCase(),
    recentVideoDescriptions: (recentVideoDescriptions || []).join(' ').toLowerCase(),
    category: (category || '').toLowerCase(),
    proposalAngle: (proposalAngle || '').toLowerCase(),
  };

  const evidenceTerms: string[] = [];
  const evidenceFields: string[] = [];
  let primaryScore = 0;
  let secondaryScore = 0;
  let categoryScore = 0;
  let primaryStrongFieldHits = 0;
  let primaryCategoryOnlyHits = 0;
  let secondaryHits = 0;

  for (const kw of verticalDef.primary) {
    const term = kw.toLowerCase();
    if (containsTerm(fieldText.channelTitle, term)) {
      primaryScore += 18;
      primaryStrongFieldHits++;
      pushEvidence(evidenceTerms, evidenceFields, kw, 'channelTitle');
    } else if (containsTerm(fieldText.channelDescription, term)) {
      primaryScore += 16;
      primaryStrongFieldHits++;
      pushEvidence(evidenceTerms, evidenceFields, kw, 'channelDescription');
    } else if (containsTerm(fieldText.recentVideoTitles, term)) {
      primaryScore += 18;
      primaryStrongFieldHits++;
      pushEvidence(evidenceTerms, evidenceFields, kw, 'recentVideoTitles');
    } else if (containsTerm(fieldText.recentVideoDescriptions, term)) {
      primaryScore += 12;
      primaryStrongFieldHits++;
      pushEvidence(evidenceTerms, evidenceFields, kw, 'recentVideoDescriptions');
    } else if (containsTerm(fieldText.proposalAngle, term)) {
      primaryScore += 8;
      primaryStrongFieldHits++;
      pushEvidence(evidenceTerms, evidenceFields, kw, 'proposalAngle');
    } else if (containsTerm(fieldText.category, term)) {
      categoryScore += 8;
      primaryCategoryOnlyHits++;
      pushEvidence(evidenceTerms, evidenceFields, kw, 'category');
    }
    if (primaryScore >= 72) break;
  }

  const secondaryText = `${fieldText.channelTitle} ${fieldText.channelDescription} ${fieldText.recentVideoTitles} ${fieldText.proposalAngle}`;
  for (const kw of verticalDef.secondary) {
    if (secondaryScore >= 20) break;
    if (containsTerm(secondaryText, kw)) {
      secondaryScore += 5;
      secondaryHits++;
      pushEvidence(evidenceTerms, evidenceFields, kw, 'secondary');
    }
  }

  let finalScore = Math.min(primaryScore + secondaryScore + categoryScore, 100);
  let status: TargetMatchStatus;
  let excludeReason: string | undefined;

  if (requestedVertical === 'beauty') {
    const hasClearBeautyEvidence = primaryStrongFieldHits > 0;

    if (!hasClearBeautyEvidence && primaryCategoryOnlyHits === 0 && secondaryHits === 0) {
      finalScore = 0;
      status = 'excluded';
      excludeReason = 'no_beauty_evidence';
    } else if (!hasClearBeautyEvidence) {
      finalScore = Math.min(Math.max(finalScore, 40), 55);
      status = 'review';
      excludeReason = 'insufficient_recent_content_evidence';
    } else if (finalScore >= 70) {
      status = 'qualified';
    } else if (finalScore >= 40) {
      status = 'review';
    } else {
      status = 'excluded';
      excludeReason = 'insufficient_recent_content_evidence';
    }
  } else if (finalScore >= 70) {
    status = 'qualified';
  } else if (finalScore >= 40) {
    status = 'review';
  } else {
    status = 'excluded';
    excludeReason = finalScore === 0 ? `${requestedVertical}_evidence_missing` : `${requestedVertical}_target_score_below_40`;
  }

  return {
    requestedVertical,
    targetMatchStatus: status,
    targetMatchScore: finalScore,
    evidenceTerms: [...new Set(evidenceTerms)].slice(0, 10),
    evidenceFields: [...new Set(evidenceFields)].slice(0, 6),
    excludeReason,
  };
}
