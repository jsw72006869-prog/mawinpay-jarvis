/**
 * COPY-BRAIN-A.1B: Copy DNA Extractor
 * viral_content_swipe row에서 구조화된 Copy DNA를 추출하는 모듈
 * 
 * 이 파일은 프론트엔드에서 직접 import하여 사용합니다.
 * Vercel serverless(cloud-proxy.ts)에서는 src/lib를 직접 import할 수 없으므로,
 * 핵심 로직이 cloud-proxy.ts에도 인라인으로 복제됩니다.
 */

// ═══ Types (지시서 A.1B 기준) ═══

export type ViralContentSwipeRow = {
  id?: string;
  platform?: string;
  source_product?: string;
  source_keyword?: string;
  content_url?: string;
  creator_name?: string;
  hook_text?: string;
  thumbnail_text?: string;
  post_summary?: string;
  engagement_visible?: string;
  comment_signal?: string;
  hot_reason?: string;
  copy_pattern?: string;
  emotion_trigger?: string;
  buyer_desire?: string;
  usable_for?: string;
  hot_score?: number;
  copy_pattern_score?: number;
  risk_score?: number;
  created_at?: string;
  notes?: string;
};

export type CopyDNA = {
  source_content_id?: string;
  hook_type: string;
  first_line_pattern: string;
  tension?: string;
  emotional_trigger?: string;
  buyer_desire?: string;
  sensory_anchor?: string;
  proof_signal?: string;
  comment_trigger?: string;
  ending_style?: string;
  platform_pattern?: string;
  usable_for: string[];
  risk_flags: string[];
};

// ═══ 감각어 사전 ═══
const SENSORY_WORDS = [
  '향', '과즙', '당도', '쫀득', '아삭', '냉장고', '바삭', '촉촉', '달콤',
  '시원', '톡톡', '쫄깃', '부드러운', '고소', '새콤', '진한', '풍미',
  '식감', '냄새', '터지는', '물씬', '살살', '녹는', '짭짤', '매콤',
  '뜨거운', '차가운', '시원한',
];

// ═══ 금지 표현 사전 ═══
const RISK_PATTERNS = [
  '100%', '완치', '치료', '효능', '보장', '확실', '무조건', '최고의',
  '기적', '특효', '만병통치', '다이어트 효과', '암 예방',
];

// ═══ Hook Type 분류 ═══
function classifyHookType(hookText: string, thumbnailText: string): string {
  const combined = `${hookText} ${thumbnailText}`.toLowerCase();
  if (/vs|파|대립|갈등|논쟁|싸움|대결/.test(combined)) return 'conflict_hook';
  if (/기억|추억|어릴 때|옛날|그때|할머니|시골|방학/.test(combined)) return 'memory_hook';
  if (/제철|수확|시즌|한정|마감|지금|올해|이맘때/.test(combined)) return 'seasonal_hook';
  if (/산지|직송|농장|밭|과수원|직거래|해남|영주|청송|거창/.test(combined)) return 'local_trust_hook';
  if (SENSORY_WORDS.some(w => combined.includes(w))) return 'sensory_hook';
  if (/질문|뭐|어떤|선택|골라/.test(combined)) return 'question_hook';
  if (/놀라|충격|반전|대박|실화/.test(combined)) return 'surprise_hook';
  if (/사실은|반대로|오히려|의외로/.test(combined)) return 'contrarian_hook';
  if (/고백|솔직히|비밀|몰랐/.test(combined)) return 'confession_hook';
  if (/나는|우리는|진짜|찐|팬|마니아/.test(combined)) return 'identity_hook';
  return 'general_hook';
}

// ═══ First Line Pattern 추출 ═══
function extractFirstLinePattern(hookText: string): string {
  if (!hookText) return 'unknown';
  if (/vs|파|대립/.test(hookText)) return 'A vs B 대립 구조';
  if (/\?/.test(hookText)) return '질문형 오프닝';
  if (/!/.test(hookText)) return '감탄형 오프닝';
  if (hookText.length <= 15) return '짧은 임팩트형';
  if (hookText.length <= 30) return '중간 서술형';
  return '장문 스토리형';
}

// ═══ Sensory Anchor 추출 ═══
function extractSensoryAnchor(row: ViralContentSwipeRow): string {
  const combined = `${row.hook_text || ''} ${row.thumbnail_text || ''} ${row.post_summary || ''} ${row.hot_reason || ''}`;
  const found = SENSORY_WORDS.filter(w => combined.includes(w));
  return found.length > 0 ? found.join(', ') : '';
}

// ═══ Risk Flags 추출 ═══
function detectRiskFlags(row: ViralContentSwipeRow): string[] {
  const combined = `${row.hook_text || ''} ${row.thumbnail_text || ''} ${row.post_summary || ''}`;
  const flags: string[] = [];
  RISK_PATTERNS.forEach(p => {
    if (combined.includes(p)) flags.push(`risk_expression: ${p}`);
  });
  const riskScore = typeof row.risk_score === 'number' ? row.risk_score : parseInt(String(row.risk_score || '0'), 10);
  if (riskScore >= 50) flags.push('high_risk_score');
  return flags;
}

// ═══ 핵심 함수: 단일 row에서 CopyDNA 추출 (지시서 필수 함수) ═══
export function extractCopyDnaFromSwipe(row: ViralContentSwipeRow): CopyDNA {
  const hookText = row.hook_text || '';
  const thumbnailText = row.thumbnail_text || '';
  const commentSignal = row.comment_signal || '';

  // comment_trigger 분류
  let commentTrigger = 'passive';
  if (/투표|vs|대|파\s|취향/.test(commentSignal)) commentTrigger = 'vote_trigger';
  else if (/질문|어떻게|뭐|추천/.test(commentSignal)) commentTrigger = 'question_trigger';
  else if (/공감|나도|맞아/.test(commentSignal)) commentTrigger = 'empathy_trigger';
  else if (/태그|친구/.test(commentSignal)) commentTrigger = 'tag_trigger';
  else if (commentSignal.length > 0) commentTrigger = 'general_trigger';

  return {
    source_content_id: row.id || undefined,
    hook_type: classifyHookType(hookText, thumbnailText),
    first_line_pattern: extractFirstLinePattern(hookText),
    tension: /vs|대립|갈등|논쟁/.test(`${hookText} ${thumbnailText}`) ? '취향 대립' : undefined,
    emotional_trigger: row.emotion_trigger || row.hot_reason || undefined,
    buyer_desire: row.buyer_desire || undefined,
    sensory_anchor: extractSensoryAnchor(row),
    proof_signal: row.engagement_visible || undefined,
    comment_trigger: commentTrigger,
    ending_style: /댓글|DM|의견|알려|태그/.test(commentSignal) ? '댓글/DM 유도형' : '여운형',
    platform_pattern: row.platform || undefined,
    usable_for: row.usable_for
      ? row.usable_for.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [],
    risk_flags: detectRiskFlags(row),
  };
}

// ═══ 배치 함수 (지시서 필수 함수) ═══
export function extractCopyDnaBatch(rows: ViralContentSwipeRow[]): CopyDNA[] {
  return rows.map(extractCopyDnaFromSwipe);
}

// ═══ DNA Summary 생성 (로그/프롬프트용) ═══
export function buildCopyDnaSummary(dnas: CopyDNA[]): string {
  if (dnas.length === 0) return '';
  const hookTypes = [...new Set(dnas.map(d => d.hook_type))];
  const desires = [...new Set(dnas.map(d => d.buyer_desire).filter(Boolean))];
  const anchors = [...new Set(dnas.flatMap(d => (d.sensory_anchor || '').split(',').map(s => s.trim())).filter(Boolean))];
  const triggers = [...new Set(dnas.map(d => d.comment_trigger).filter(Boolean))];
  const patterns = [...new Set(dnas.map(d => d.first_line_pattern))];
  return [
    `hook_types: ${hookTypes.join(', ')}`,
    `buyer_desires: ${desires.join(', ')}`,
    `sensory_anchors: ${anchors.join(', ')}`,
    `comment_triggers: ${triggers.join(', ')}`,
    `first_line_patterns: ${patterns.join(', ')}`,
    `source_count: ${dnas.length}`,
  ].join(' | ');
}

// ═══ Copy DNA를 프롬프트용 텍스트로 변환 ═══
export function copyDNAToPrompt(dnas: CopyDNA[]): string {
  if (dnas.length === 0) return '[Copy DNA] 아직 분석된 바이럴 콘텐츠 없음';

  const hookTypes = [...new Set(dnas.map(d => d.hook_type))];
  const desires = [...new Set(dnas.map(d => d.buyer_desire).filter(Boolean))];
  const sensoryAnchors = [...new Set(dnas.flatMap(d => (d.sensory_anchor || '').split(', ')).filter(s => s && s !== 'none'))];
  const commentTriggers = [...new Set(dnas.map(d => d.comment_trigger))];
  const firstLinePatterns = [...new Set(dnas.map(d => d.first_line_pattern))];
  const endingStyles = [...new Set(dnas.map(d => d.ending_style))];

  return `[Copy DNA 분석 결과 — viral_content_swipe 기반]
분석 콘텐츠 수: ${dnas.length}개
반응 좋은 후킹 유형: ${hookTypes.join(', ')}
주요 구매 욕망: ${desires.join(', ')}
감각 앵커: ${sensoryAnchors.join(', ') || 'none'}
댓글 트리거: ${commentTriggers.join(', ')}
첫 줄 패턴: ${firstLinePatterns.join(', ')}
엔딩 스타일: ${endingStyles.join(', ')}

이 DNA를 참고하되 원문을 복사하지 마세요. 구조와 패턴만 활용하세요.`;
}
