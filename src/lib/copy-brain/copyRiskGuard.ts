/**
 * COPY-BRAIN-A.1: Copy Risk Guard
 * 위험한 카피를 사전에 감지하고 차단한다.
 */

export interface RiskCheckResult {
  risk_score: number;
  risk_flags: string[];
  safe: boolean;
  warnings: string[];
}

// ═══ 위험 패턴 정의 ═══
const RISK_PATTERNS: { pattern: RegExp; flag: string; weight: number; warning: string }[] = [
  // 허위 효능
  { pattern: /효능\s*(이|가|을|를)?/, flag: 'health_claim', weight: 25, warning: '효능 주장 감지' },
  { pattern: /치료|예방|면역\s*강화|항산화|항암/, flag: 'health_claim', weight: 30, warning: '의약품 수준 효능 주장' },
  { pattern: /다이어트\s*효과|살\s*빠지|체중\s*감량/, flag: 'health_claim', weight: 25, warning: '다이어트 효과 주장' },
  { pattern: /건강에\s*좋/, flag: 'health_claim', weight: 20, warning: '건강 효능 주장' },

  // 과장 광고
  { pattern: /최고|역대급|세상에서.*제일/, flag: 'exaggeration', weight: 20, warning: '과장 표현' },
  { pattern: /100%\s*(만족|보장|천연)/, flag: 'exaggeration', weight: 20, warning: '100% 보장 표현' },
  { pattern: /완벽한|최상의|최대의/, flag: 'exaggeration', weight: 15, warning: '과장 형용사' },

  // 가격 스팸
  { pattern: /대박\s*할인|파격\s*세일|최저가/, flag: 'price_spam', weight: 15, warning: '가격 스팸 표현' },
  { pattern: /무료\s*배송.*한정|특가.*마감/, flag: 'price_spam', weight: 12, warning: '긴급 가격 유도' },

  // 허위 재고/후기
  { pattern: /품절\s*임박|마지막\s*\d+개/, flag: 'fake_scarcity', weight: 20, warning: '허위 재고 표현' },
  { pattern: /가짜\s*후기|조작/, flag: 'fake_review', weight: 30, warning: '허위 후기 관련' },

  // 매출/성공 보장
  { pattern: /매출\s*보장|성공\s*보장|수익\s*보장/, flag: 'revenue_guarantee', weight: 25, warning: '매출/성공 보장 표현' },

  // 원본 표절 의심
  { pattern: /출처\s*:\s*|원문\s*:\s*|복사\s*:\s*/, flag: 'possible_plagiarism', weight: 15, warning: '원문 복사 의심' },
];

// ═══ 메인 함수: 위험 카피 검사 ═══
export function checkCopyRisk(text: string): RiskCheckResult {
  let totalScore = 0;
  const flags: string[] = [];
  const warnings: string[] = [];

  for (const { pattern, flag, weight, warning } of RISK_PATTERNS) {
    if (pattern.test(text)) {
      totalScore += weight;
      if (!flags.includes(flag)) flags.push(flag);
      warnings.push(warning);
    }
  }

  // 텍스트 길이 기반 표절 의심
  if (text.length > 500) {
    totalScore += 10;
    warnings.push('텍스트가 매우 길어 원문 복사 의심');
    if (!flags.includes('possible_plagiarism')) flags.push('possible_plagiarism');
  }

  const normalizedScore = Math.min(100, totalScore);

  return {
    risk_score: normalizedScore,
    risk_flags: flags,
    safe: normalizedScore < 30,
    warnings,
  };
}

// ═══ Risk Guard를 프롬프트 경고로 변환 ═══
export function riskGuardPromptWarning(): string {
  return `[Copy Risk Guard 규칙]
절대 금지:
- 허위 효능/건강 주장 (효능, 치료, 예방, 면역, 항산화, 다이어트 효과)
- 과장 표현 (최고, 역대급, 세상에서 제일, 100% 보장, 완벽)
- 가격 스팸 (대박 할인, 파격 세일, 최저가)
- 허위 재고 (품절 임박, 마지막 N개)
- 매출/성공 보장
- 원본 콘텐츠 장문 복사/표절
- fake 조회수/댓글/성과 데이터

위반 시 해당 카피는 recommended=false, risk_flags 표시됩니다.`;
}
