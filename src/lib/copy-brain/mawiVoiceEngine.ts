/**
 * COPY-BRAIN-A.1: Mawi Voice Engine
 * 대표님 말투와 바이럴 스타일을 코드화한다.
 */
import type { MawiVoiceRules } from './copyBrainTypes';

// ═══ Mawi Voice Rules ═══
export const MAWI_VOICE_RULES: MawiVoiceRules = {
  do_rules: [
    '첫 줄은 짧게 — 7자 이내 권장, 길어도 15자',
    '말하듯 시작 — "있잖아", "솔직히", "근데" 같은 구어체',
    '설명보다 장면 먼저 — "복숭아 향이 냉장고에서 퍼진다" > "복숭아는 향이 좋습니다"',
    '상품보다 감정 먼저 — 감정/장면 → 상품 순서',
    '계절감 — 여름/겨울/수확 시기를 자연스럽게 녹이기',
    '산지/현장감 — 밭, 농장, 수확, 포장 장면',
    '먹는 장면 — 한 입, 과즙, 식감, 소리',
    '댓글 달고 싶게 — 질문, 투표, 취향 대립',
    '마지막 여운 — 끝나고도 생각나는 문장',
    '줄바꿈 리듬 — 1~2문장 단위로 줄바꿈',
  ],
  dont_rules: [
    '광고문 금지 — "지금 만나보세요" 류',
    'AI스러운 정리체 금지 — "첫째, 둘째" 나열',
    '흔한 문장 금지 — 어디서든 볼 수 있는 문장',
    '설명 나열 금지 — 스펙 나열보다 장면',
    '과장 금지 — "역대급", "대박", "최고"',
    '허위 효능 금지 — 건강/다이어트 효과 주장',
    '스팸 느낌 금지 — 할인/특가/파격 강조',
  ],
  banned_phrases: [
    '지금 만나보세요',
    '특별한 가격',
    '놓치지 마세요',
    '최고의 품질',
    '역대급',
    '대박 할인',
    '품질 보장',
    '건강에 좋습니다',
    '효능 있습니다',
    '합리적인 가격',
    '고객님께 추천드립니다',
    '지금 바로 구매하세요',
    '많은 관심 부탁드립니다',
    '신선하고 맛있는',
    '특별한 기회',
    '한정 수량',
    '서두르세요',
    '파격 세일',
    '최저가 보장',
    '만족 보장',
  ],
  style_examples: [
    '딱복파랑 물복파는\n진짜 쉽게 화해 안 한다.\n\n근데 향 좋은 복숭아 앞에서는\n둘 다 조용해진다.',
    '냉장고 열었는데\n복숭아 향이 확 올라온 적 있어?\n\n그 순간이 여름이다.',
    '삶은 옥수수에\n버터 한 조각 올려본 사람은 안다.\n\n그게 여름 캠핑의 전부라는 걸.',
    '올해 첫 옥수수 삶았다.\n\n쫀득한 게\n한 입 베어무는 순간\n여름이 시작됐다는 걸 알았다.',
    '김장 실패하면\n일 년이 우울하다.\n\n그래서 절임배추는\n가격보다 믿을 수 있는 데서 사야 한다.',
  ],
};

// ═══ Mawi Voice를 프롬프트용 텍스트로 변환 ═══
export function mawiVoiceToPrompt(): string {
  return `[Mawi Voice 스타일 규칙]

반드시 지킬 것:
${MAWI_VOICE_RULES.do_rules.map(r => `- ${r}`).join('\n')}

절대 금지:
${MAWI_VOICE_RULES.dont_rules.map(r => `- ${r}`).join('\n')}

금지 표현 (이 표현이 들어가면 즉시 FAIL):
${MAWI_VOICE_RULES.banned_phrases.map(p => `"${p}"`).join(', ')}

목표 스타일 예시 (이 수준의 구조와 감성을 목표로 함):
${MAWI_VOICE_RULES.style_examples.map((e, i) => `예시${i + 1}:\n${e}`).join('\n\n')}`;
}

// ═══ 생성된 카피에서 금지 표현 검출 ═══
export function detectBannedPhrases(text: string): string[] {
  return MAWI_VOICE_RULES.banned_phrases.filter(phrase =>
    text.toLowerCase().includes(phrase.toLowerCase())
  );
}

// ═══ Mawi Voice 점수 계산 ═══
export function scoreMawiVoice(text: string): { score: number; reasons: string[] } {
  let score = 70; // 기본 점수
  const reasons: string[] = [];

  // 금지 표현 감점
  const banned = detectBannedPhrases(text);
  if (banned.length > 0) {
    score -= banned.length * 15;
    reasons.push(`금지 표현 ${banned.length}개: ${banned.join(', ')}`);
  }

  // 첫 줄 길이 체크
  const firstLine = text.split('\n')[0]?.trim() || '';
  if (firstLine.length <= 7) { score += 10; reasons.push('첫 줄 짧고 임팩트 있음'); }
  else if (firstLine.length <= 15) { score += 5; }
  else if (firstLine.length > 30) { score -= 10; reasons.push('첫 줄이 너무 길음'); }

  // 줄바꿈 리듬 체크
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length >= 3) { score += 5; reasons.push('줄바꿈 리듬 있음'); }

  // 감각 단어 체크
  const sensoryWords = text.match(/달콤|아삭|쫀득|바삭|촉촉|향|과즙|터지|물씬|식감|뜨거운|차가운|시원한|쫄깃|고소한/g);
  if (sensoryWords && sensoryWords.length >= 2) { score += 10; reasons.push('감각 표현 풍부'); }
  else if (!sensoryWords || sensoryWords.length === 0) { score -= 5; reasons.push('감각 표현 부족'); }

  // 구어체 체크
  if (/있잖아|솔직히|근데|사실|그래서|아 진짜|어\b/.test(text)) { score += 5; reasons.push('구어체 사용'); }

  // AI스러운 정리체 감점
  if (/첫째|둘째|셋째|마지막으로|결론적으로|요약하면/.test(text)) { score -= 15; reasons.push('AI스러운 정리체'); }

  // 광고 냄새 감점
  if (/구매하세요|주문하세요|클릭하세요|방문하세요/.test(text)) { score -= 10; reasons.push('직접 판매 문구'); }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}
