/**
 * COPY-BRAIN-A.1: Anti-Boring Filter
 * Claude/GPT식 일반 광고문을 걸러낸다.
 */

// ═══ Boring Patterns: 흔한 광고 문구 패턴 ═══
const BORING_PATTERNS: { pattern: RegExp; reason: string; weight: number }[] = [
  // 직접 지시서에 명시된 패턴
  { pattern: /제철\s*.{1,5}를?\s*지금\s*만나보세요/, reason: '제철 OOO를 지금 만나보세요', weight: 20 },
  { pattern: /특별한\s*가격으로\s*준비했습니다/, reason: '특별한 가격으로 준비했습니다', weight: 20 },
  { pattern: /신선하고\s*맛있는\s*.{1,10}/, reason: '신선하고 맛있는 OOO', weight: 15 },
  { pattern: /많은\s*관심\s*부탁드립니다/, reason: '많은 관심 부탁드립니다', weight: 20 },
  { pattern: /최고의\s*품질/, reason: '최고의 품질', weight: 20 },
  { pattern: /합리적인\s*가격/, reason: '합리적인 가격', weight: 15 },
  { pattern: /고객님께\s*추천드립니다/, reason: '고객님께 추천드립니다', weight: 20 },
  { pattern: /지금\s*바로\s*구매하세요/, reason: '지금 바로 구매하세요', weight: 20 },

  // 추가 Claude/GPT식 패턴
  { pattern: /지금\s*만나보세요/, reason: '지금 만나보세요', weight: 18 },
  { pattern: /놓치지\s*마세요/, reason: '놓치지 마세요', weight: 15 },
  { pattern: /역대급/, reason: '역대급', weight: 15 },
  { pattern: /대박\s*할인/, reason: '대박 할인', weight: 15 },
  { pattern: /품질\s*보장/, reason: '품질 보장', weight: 15 },
  { pattern: /건강에\s*좋습니다/, reason: '건강에 좋습니다', weight: 20 },
  { pattern: /효능\s*있습니다/, reason: '효능 있습니다', weight: 20 },
  { pattern: /특별한\s*기회/, reason: '특별한 기회', weight: 15 },
  { pattern: /서두르세요/, reason: '서두르세요', weight: 12 },
  { pattern: /파격\s*세일/, reason: '파격 세일', weight: 15 },
  { pattern: /최저가\s*보장/, reason: '최저가 보장', weight: 15 },
  { pattern: /만족\s*보장/, reason: '만족 보장', weight: 15 },

  // AI스러운 구조 패턴
  { pattern: /첫째.*둘째.*셋째/, reason: 'AI식 나열 구조', weight: 15 },
  { pattern: /결론적으로|요약하면|정리하면/, reason: 'AI식 정리체', weight: 12 },
  { pattern: /다양한\s*혜택/, reason: '다양한 혜택', weight: 10 },
  { pattern: /풍부한\s*영양/, reason: '풍부한 영양', weight: 12 },
  { pattern: /엄선된\s*재료/, reason: '엄선된 재료', weight: 10 },
  { pattern: /프리미엄\s*품질/, reason: '프리미엄 품질', weight: 12 },
  { pattern: /한\s*단계\s*업그레이드/, reason: '한 단계 업그레이드', weight: 10 },

  // 흔한 CTA 패턴
  { pattern: /지금\s*주문하세요/, reason: '지금 주문하세요', weight: 15 },
  { pattern: /오늘만\s*특가/, reason: '오늘만 특가', weight: 12 },
  { pattern: /한정\s*수량/, reason: '한정 수량 (스팸 느낌)', weight: 10 },
];

// ═══ 구조적 지루함 감지 ═══
function detectStructuralBoring(text: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // 모든 문장이 비슷한 길이 (단조로움)
  const sentences = text.split(/[.!?\n]/).filter(s => s.trim().length > 5);
  if (sentences.length >= 3) {
    const lengths = sentences.map(s => s.trim().length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / lengths.length;
    if (variance < 50) {
      score += 10;
      reasons.push('문장 길이가 단조로움 (리듬감 부족)');
    }
  }

  // 감각 단어 부재
  const sensoryWords = text.match(/달콤|아삭|쫀득|바삭|촉촉|향|과즙|터지|물씬|식감|뜨거운|차가운|시원한|쫄깃|고소한|짭짤|새콤/g);
  if (!sensoryWords || sensoryWords.length === 0) {
    score += 10;
    reasons.push('감각 표현 없음');
  }

  // 구어체 부재
  if (!/있잖아|솔직히|근데|사실|그래서|아\s|어\b|진짜|되게|완전/.test(text)) {
    score += 8;
    reasons.push('구어체 없음 (딱딱한 문체)');
  }

  // 줄바꿈 없음 (리듬감 부족)
  const lineBreaks = (text.match(/\n/g) || []).length;
  if (text.length > 50 && lineBreaks < 2) {
    score += 8;
    reasons.push('줄바꿈 부족 (리듬감 없음)');
  }

  return { score, reasons };
}

// ═══ 메인 함수: Boring Copy 감지 ═══
export function detectBoringCopy(text: string): {
  boring_score: number;
  reasons: string[];
  rewrite_required: boolean;
  detected_patterns: string[];
} {
  let totalScore = 0;
  const reasons: string[] = [];
  const detectedPatterns: string[] = [];

  // 패턴 매칭
  for (const { pattern, reason, weight } of BORING_PATTERNS) {
    if (pattern.test(text)) {
      totalScore += weight;
      reasons.push(reason);
      detectedPatterns.push(reason);
    }
  }

  // 구조적 지루함
  const structural = detectStructuralBoring(text);
  totalScore += structural.score;
  reasons.push(...structural.reasons);

  // 정규화 (0~100)
  const normalizedScore = Math.min(100, totalScore);

  return {
    boring_score: normalizedScore,
    reasons,
    rewrite_required: normalizedScore >= 30,
    detected_patterns: detectedPatterns,
  };
}

// ═══ Anti-Boring 결과를 프롬프트 경고로 변환 ═══
export function antiBoringWarning(): string {
  return `[Anti-Boring Filter 경고]
아래 패턴이 감지되면 해당 카피는 FAIL 처리됩니다:
${BORING_PATTERNS.slice(0, 10).map(p => `- "${p.reason}"`).join('\n')}
... 외 ${BORING_PATTERNS.length - 10}개 패턴

구조적 지루함도 감지합니다:
- 문장 길이가 단조로운 경우
- 감각 표현이 없는 경우
- 구어체가 없는 경우
- 줄바꿈 리듬이 없는 경우

목표: 읽는 사람이 멈추고, 느끼고, 댓글 달고 싶은 카피`;
}
