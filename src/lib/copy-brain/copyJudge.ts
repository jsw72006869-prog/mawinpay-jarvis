/**
 * COPY-BRAIN-A.1: Copy Judge / Ranker
 * 생성된 카피를 다차원으로 평가하고 순위를 매긴다.
 */
import type { CopyScore, PlatformType, ProductTruth, BuyerDesire, HookType } from './copyBrainTypes';
import { detectBoringCopy } from './antiBoringFilter';
import { scoreMawiVoice } from './mawiVoiceEngine';
import { scorePlatformFit } from './platformFormulaEngine';

// ═══ Risk Guard: 위험 카피 감지 ═══
function detectRiskFlags(text: string): string[] {
  const flags: string[] = [];
  // 허위 효능
  if (/효능|치료|예방|건강에\s*좋|면역|항산화|다이어트\s*효과/.test(text)) flags.push('health_claim');
  // 과장
  if (/최고|역대급|세상에서.*제일|보장|100%|완벽/.test(text)) flags.push('exaggeration');
  // 가격 스팸
  if (/할인|특가|파격|대박|최저가|무료/.test(text)) flags.push('price_spam');
  // 허위 재고/후기
  if (/품절\s*임박|마지막\s*기회|한정\s*\d+개|가짜\s*후기/.test(text)) flags.push('fake_scarcity');
  // 매출/성공 보장
  if (/매출\s*보장|성공\s*보장|수익\s*보장/.test(text)) flags.push('revenue_guarantee');
  // 원본 표절 의심 (너무 긴 인용)
  if (text.length > 500) flags.push('possible_plagiarism');
  return flags;
}

// ═══ Hook Score 계산 ═══
function scoreHook(text: string): { score: number; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];
  const firstLine = text.split('\n')[0]?.trim() || '';

  // 첫 줄 길이
  if (firstLine.length <= 7) { score += 20; reasons.push('첫 줄 매우 짧고 강렬'); }
  else if (firstLine.length <= 15) { score += 15; reasons.push('첫 줄 적정 길이'); }
  else if (firstLine.length <= 25) { score += 5; }
  else { score -= 10; reasons.push('첫 줄이 너무 길음'); }

  // 첫 줄 임팩트
  if (/\?/.test(firstLine)) { score += 5; reasons.push('질문형 후킹'); }
  if (/있잖아|솔직히|근데|사실|아\s/.test(firstLine)) { score += 5; reasons.push('구어체 시작'); }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// ═══ Sensory Score 계산 ═══
function scoreSensory(text: string): { score: number; reasons: string[] } {
  let score = 40;
  const reasons: string[] = [];
  const sensoryWords = text.match(/달콤|아삭|쫀득|바삭|촉촉|향|과즙|터지|물씬|식감|뜨거운|차가운|시원한|쫄깃|고소한|짭짤|새콤|톡톡|사각사각/g) || [];

  if (sensoryWords.length >= 3) { score += 30; reasons.push(`감각 표현 풍부 (${sensoryWords.length}개)`); }
  else if (sensoryWords.length >= 1) { score += 15; reasons.push(`감각 표현 있음 (${sensoryWords.length}개)`); }
  else { score -= 10; reasons.push('감각 표현 없음'); }

  // 장면 묘사 체크
  if (/열었|베어물|올려|삶|구워|갈랐|터지|흐르|퍼지|올라/.test(text)) {
    score += 15; reasons.push('장면 묘사 포함');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// ═══ Buyer Desire Score 계산 ═══
function scoreBuyerDesire(text: string, desires: BuyerDesire[]): { score: number; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];
  let matched = 0;

  for (const desire of desires) {
    const hasKeyword = desire.trigger_keywords.some(kw => text.includes(kw));
    if (hasKeyword) matched++;
  }

  if (matched >= 2) { score += 25; reasons.push(`구매 욕망 ${matched}개 반영`); }
  else if (matched >= 1) { score += 10; reasons.push(`구매 욕망 ${matched}개 반영`); }
  else { score -= 10; reasons.push('구매 욕망 미반영'); }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// ═══ Product Truth Score 계산 ═══
function scoreProductTruth(text: string, truth: ProductTruth): { score: number; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];

  // 감각 포인트 반영 여부
  const sensoryMatched = truth.sensory_points.filter(sp => text.includes(sp));
  if (sensoryMatched.length >= 2) { score += 20; reasons.push(`상품 감각 포인트 ${sensoryMatched.length}개 반영`); }
  else if (sensoryMatched.length >= 1) { score += 10; }

  // 금지 주장 위반
  const avoidViolated = truth.avoid_claims.filter(ac => text.includes(ac));
  if (avoidViolated.length > 0) { score -= 20; reasons.push(`금지 주장 위반: ${avoidViolated.join(', ')}`); }

  // 구매 맥락 반영
  const contextMatched = truth.buyer_contexts.filter(bc => text.includes(bc));
  if (contextMatched.length >= 1) { score += 10; reasons.push(`구매 맥락 반영: ${contextMatched.join(', ')}`); }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// ═══ Originality Score 계산 ═══
function scoreOriginality(text: string): { score: number; reasons: string[] } {
  let score = 60;
  const reasons: string[] = [];

  // 흔한 패턴 감지
  const boringResult = detectBoringCopy(text);
  if (boringResult.detected_patterns.length === 0) { score += 20; reasons.push('흔한 패턴 없음'); }
  else { score -= boringResult.detected_patterns.length * 5; reasons.push(`흔한 패턴 ${boringResult.detected_patterns.length}개`); }

  // 줄바꿈 리듬
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length >= 3) { score += 10; reasons.push('리듬감 있는 구조'); }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// ═══ Action Score 계산 (행동 유도) ═══
function scoreAction(text: string): { score: number; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];

  if (/\?/.test(text)) { score += 10; reasons.push('질문 포함'); }
  if (/댓글|DM|알려|어떻게|추천/.test(text)) { score += 15; reasons.push('댓글/소통 유도'); }
  if (/vs|대|파\b|팀/.test(text)) { score += 10; reasons.push('투표/선택 유도'); }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// ═══ 메인 함수: 종합 점수 계산 ═══
export function judgeCopy(
  text: string,
  platform: PlatformType,
  productTruth: ProductTruth,
  buyerDesires: BuyerDesire[]
): CopyScore {
  const hookResult = scoreHook(text);
  const sensoryResult = scoreSensory(text);
  const buyerDesireResult = scoreBuyerDesire(text, buyerDesires);
  const productTruthResult = scoreProductTruth(text, productTruth);
  const platformFitResult = scorePlatformFit(text, platform);
  const mawiVoiceResult = scoreMawiVoice(text);
  const originalityResult = scoreOriginality(text);
  const actionResult = scoreAction(text);
  const riskFlags = detectRiskFlags(text);
  const boringResult = detectBoringCopy(text);

  const riskScore = riskFlags.length * 20;
  const boringScore = boringResult.boring_score;

  // 가중 평균 final_score
  const weights = {
    hook: 0.15,
    sensory: 0.12,
    buyer_desire: 0.12,
    product_truth: 0.12,
    platform_fit: 0.10,
    mawi_voice: 0.15,
    originality: 0.10,
    action: 0.08,
    risk_penalty: -0.08,
    boring_penalty: -0.08,
  };

  const rawScore =
    hookResult.score * weights.hook +
    sensoryResult.score * weights.sensory +
    buyerDesireResult.score * weights.buyer_desire +
    productTruthResult.score * weights.product_truth +
    platformFitResult.score * weights.platform_fit +
    mawiVoiceResult.score * weights.mawi_voice +
    originalityResult.score * weights.originality +
    actionResult.score * weights.action +
    riskScore * weights.risk_penalty +
    boringScore * weights.boring_penalty;

  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  // recommended 판정
  const recommended = finalScore >= 60 && riskScore < 40 && boringScore < 30;

  // rewrite_required 판정
  const rewriteRequired = !recommended || boringScore >= 30 || riskScore >= 40;

  // rewrite_reason
  let rewriteReason = '';
  if (boringScore >= 30) rewriteReason = 'generic_ad_copy';
  else if (riskScore >= 40) rewriteReason = 'risk_violation';
  else if (finalScore < 60) rewriteReason = 'low_quality';

  return {
    hook_score: hookResult.score,
    sensory_score: sensoryResult.score,
    buyer_desire_score: buyerDesireResult.score,
    product_truth_score: productTruthResult.score,
    platform_fit_score: platformFitResult.score,
    mawi_voice_score: mawiVoiceResult.score,
    originality_score: originalityResult.score,
    action_score: actionResult.score,
    risk_score: riskScore,
    boring_score: boringScore,
    final_score: finalScore,
    recommended,
    rewrite_required: rewriteRequired,
    risk_flags: riskFlags,
    rewrite_reason: rewriteReason,
  };
}
