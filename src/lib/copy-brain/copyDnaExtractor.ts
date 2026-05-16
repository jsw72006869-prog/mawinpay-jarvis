/**
 * COPY-BRAIN-A.1: Copy DNA Extractor
 * viral_content_swipe에서 반응 좋은 콘텐츠의 구조를 추출한다.
 * 원문을 베끼지 않고 구조만 추출한다.
 */
import type { CopyDNA, HookType, BuyerDesireType, ViralContentRef } from './copyBrainTypes';

// ═══ Hook Type 감지 패턴 ═══
const HOOK_PATTERNS: { type: HookType; patterns: RegExp[] }[] = [
  {
    type: 'conflict_hook',
    patterns: [/vs|대|파\s|팀\s|논쟁|싸움|대결/i, /딱복.*물복|찰옥.*단옥|꿀고구마.*밤고구마/],
  },
  {
    type: 'confession_hook',
    patterns: [/사실|고백|솔직히|비밀|몰랐|알고\s*보니/],
  },
  {
    type: 'seasonal_hook',
    patterns: [/여름|겨울|봄|가을|제철|이맘때|올해|시즌|수확/],
  },
  {
    type: 'sensory_hook',
    patterns: [/달콤|아삭|쫀득|바삭|촉촉|향|과즙|터지|물씬|식감|맛/],
  },
  {
    type: 'contrarian_hook',
    patterns: [/사실은|반대로|오히려|의외로|뒤집|거꾸로|아닌데/],
  },
  {
    type: 'local_trust_hook',
    patterns: [/산지|직송|농장|직접|해남|영주|청송|거창|고랭지|밭에서/],
  },
  {
    type: 'memory_hook',
    patterns: [/어릴\s*때|추억|그때|할머니|시골|옛날|기억|방학/],
  },
  {
    type: 'limited_timing_hook',
    patterns: [/한정|마감|지금|마지막|놓치|서두|예약|선착/],
  },
  {
    type: 'identity_hook',
    patterns: [/나는|우리는|진짜|찐|팬|마니아|덕후|파\b/],
  },
];

// ═══ Engagement 파싱 ═══
function parseEngagement(text: string): { views: number; likes: number; comments: number } {
  const views = parseInt((text.match(/조회\s*([\d,]+)/)?.[1] || '0').replace(/,/g, ''), 10);
  const likes = parseInt((text.match(/좋아요\s*([\d,]+)/)?.[1] || '0').replace(/,/g, ''), 10);
  const comments = parseInt((text.match(/댓글\s*([\d,]+)/)?.[1] || '0').replace(/,/g, ''), 10);
  return { views, likes, comments };
}

// ═══ Hook Type 감지 ═══
function detectHookType(text: string): HookType {
  for (const { type, patterns } of HOOK_PATTERNS) {
    if (patterns.some(p => p.test(text))) return type;
  }
  return 'sensory_hook'; // 기본값
}

// ═══ Buyer Desire 감지 ═══
function detectDesireFromText(text: string): BuyerDesireType {
  const lower = text.toLowerCase();
  if (/추억|어릴|할머니|시골|옛날/.test(lower)) return 'nostalgia';
  if (/여름|겨울|제철|시즌|수확/.test(lower)) return 'seasonal_craving';
  if (/아이|엄마|가족|부모/.test(lower)) return 'family_care';
  if (/선물|보내|감사|명절/.test(lower)) return 'gift';
  if (/한정|마감|지금|마지막/.test(lower)) return 'scarcity_timing';
  if (/달콤|아삭|쫀득|향|과즙|바삭/.test(lower)) return 'sensory_imagination';
  if (/직송|농장|산지|무농약/.test(lower)) return 'trust';
  if (/간편|바로|손질|배송/.test(lower)) return 'convenience';
  if (/파\b|팀|취향|나는/.test(lower)) return 'identity';
  if (/댓글|투표|공유|DM|알려/.test(lower)) return 'community_participation';
  return 'sensory_imagination';
}

// ═══ 메인 함수: Viral Content에서 Copy DNA 추출 ═══
export function extractCopyDNA(content: ViralContentRef): CopyDNA {
  const hookText = content.hook_text || '';
  const engagement = parseEngagement(content.engagement_visible || '');
  const hookType = detectHookType(hookText);
  const buyerDesire = detectDesireFromText(hookText);

  // 첫 줄 패턴 추출 (구조만, 원문 아님)
  const firstLine = hookText.split(/[.!?\n]/)[0]?.trim() || '';
  const firstLinePattern = firstLine.length <= 15 ? '짧은 임팩트형' :
    firstLine.length <= 30 ? '중간 서술형' : '장문 스토리형';

  // 감각 앵커 추출
  const sensoryWords = hookText.match(/달콤|아삭|쫀득|바삭|촉촉|향|과즙|터지|물씬|식감|뜨거운|차가운|시원한/g) || [];
  const sensoryAnchor = sensoryWords.length > 0 ? sensoryWords.join(', ') : 'none';

  // 댓글 트리거 분석
  const hasQuestion = /\?|어떻게|뭐|알려|추천/.test(hookText);
  const hasVote = /vs|대|파\s|팀/.test(hookText);
  const commentTrigger = hasVote ? 'vote_trigger' : hasQuestion ? 'question_trigger' : engagement.comments > 100 ? 'high_engagement' : 'passive';

  // 리스크 플래그
  const riskFlags: string[] = [];
  if (/효능|건강에|다이어트.*효과|치료/.test(hookText)) riskFlags.push('health_claim');
  if (/최고|역대급|세상에서.*제일|보장/.test(hookText)) riskFlags.push('exaggeration');
  if (/할인|특가|파격|대박/.test(hookText)) riskFlags.push('price_spam');

  return {
    hook_type: hookType,
    first_line_pattern: firstLinePattern,
    tension: hookType === 'conflict_hook' ? 'high' : hookType === 'confession_hook' ? 'medium' : 'low',
    emotional_trigger: content.emotion_trigger || (hookType === 'memory_hook' ? 'nostalgia' : hookType === 'sensory_hook' ? 'craving' : 'curiosity'),
    buyer_desire: buyerDesire,
    sensory_anchor: sensoryAnchor,
    proof_signal: /직송|농장|산지|수확|인증/.test(hookText) ? 'origin_proof' : 'none',
    comment_trigger: commentTrigger,
    ending_style: /DM|댓글|알려|공유/.test(hookText) ? 'cta_ending' : '여운형',
    platform_pattern: content.platform || 'unknown',
    usable_for: detectUsableFor(hookType, content.platform || ''),
    risk_flags: riskFlags,
  };
}

// ═══ 복수 콘텐츠에서 DNA 추출 ═══
export function extractMultipleCopyDNA(contents: ViralContentRef[]): CopyDNA[] {
  return contents.map(extractCopyDNA);
}

// ═══ Copy DNA를 프롬프트용 텍스트로 변환 ═══
export function copyDNAToPrompt(dnas: CopyDNA[]): string {
  if (dnas.length === 0) return '[Copy DNA] 아직 분석된 바이럴 콘텐츠 없음';

  const hookTypes = [...new Set(dnas.map(d => d.hook_type))];
  const desires = [...new Set(dnas.map(d => d.buyer_desire))];
  const sensoryAnchors = [...new Set(dnas.flatMap(d => d.sensory_anchor.split(', ')).filter(s => s !== 'none'))];
  const commentTriggers = [...new Set(dnas.map(d => d.comment_trigger))];

  return `[Copy DNA 분석 결과]
반응 좋은 후킹 유형: ${hookTypes.join(', ')}
주요 구매 욕망: ${desires.join(', ')}
감각 앵커: ${sensoryAnchors.join(', ') || 'none'}
댓글 트리거: ${commentTriggers.join(', ')}
첫 줄 패턴: ${[...new Set(dnas.map(d => d.first_line_pattern))].join(', ')}
엔딩 스타일: ${[...new Set(dnas.map(d => d.ending_style))].join(', ')}`;
}

// ═══ 활용 가능 플랫폼 추론 ═══
function detectUsableFor(hookType: HookType, platform: string): string[] {
  const usable: string[] = [platform];
  if (hookType === 'conflict_hook' || hookType === 'identity_hook') usable.push('threads', 'tiktok');
  if (hookType === 'sensory_hook') usable.push('instagram', 'youtube_shorts');
  if (hookType === 'local_trust_hook') usable.push('naver_blog');
  if (hookType === 'memory_hook') usable.push('threads', 'naver_blog');
  return [...new Set(usable)];
}
