/**
 * COPY-BRAIN-A.1: Platform Formula Engine
 * 플랫폼별 카피 공식을 코드화한다.
 */
import type { PlatformFormula, PlatformType, CopyOutputType } from './copyBrainTypes';

// ═══ 플랫폼별 공식 데이터베이스 ═══
const PLATFORM_FORMULAS: Record<PlatformType, PlatformFormula> = {
  threads: {
    platform: 'threads',
    structure: [
      '1문장 또는 2문장 첫 줄 (짧고 강렬하게)',
      '줄바꿈 리듬 (1~2문장 단위)',
      '중간에 감각/장면 묘사',
      '댓글 유도 (질문, 투표, 취향 대립)',
      '여운 있는 마무리',
    ],
    tone: '친근한 대화체, 툭 던지는 말투, 생각을 나누는 느낌',
    length_guide: '3~5문장, 줄바꿈 포함 5~8줄',
    do_rules: [
      '첫 줄에서 멈추게 만들기',
      '줄바꿈으로 리듬감 주기',
      '마지막에 댓글/DM 유도',
      '여운 남기기',
      '취향 대립 활용 (딱복파/물복파)',
    ],
    dont_rules: [
      '직접 판매 최소화',
      '링크 남발 금지',
      '해시태그 남발 금지',
      '장문 설명 금지',
      '광고 냄새 금지',
    ],
  },
  instagram: {
    platform: 'instagram',
    structure: [
      '감각 장면으로 시작',
      '짧은 캡션 (2~3문장)',
      '시각적 문장 (사진/영상과 연결)',
      '해시태그 3~5개 (남발 금지)',
    ],
    tone: '감각적, 시각적, 짧고 임팩트 있는',
    length_guide: '2~3문장 캡션 + 해시태그 3~5개',
    do_rules: [
      '사진/영상과 연결되는 문장',
      '감각 묘사 중심',
      '짧고 강렬한 첫 줄',
    ],
    dont_rules: [
      '해시태그 10개 이상 금지',
      '장문 설명 금지',
      '스펙 나열 금지',
    ],
  },
  youtube_shorts: {
    platform: 'youtube_shorts',
    structure: [
      '0~3초: 후킹 (강렬한 첫 마디)',
      '3~10초: 장면/스토리 (감각, 먹는 장면, 현장)',
      '10~15초: 행동 유도 (좋아요, 구독, 댓글)',
    ],
    tone: '빠르고 임팩트 있는, 자막과 음성 분리',
    length_guide: '15초 분량, 자막 기준 3~5문장',
    do_rules: [
      '0~3초에 시선 잡기',
      '자막과 썸네일 분리 설계',
      '먹는 장면/감각 장면 포함',
      '마지막에 행동 유도',
    ],
    dont_rules: [
      '느린 시작 금지',
      '설명 나열 금지',
      '광고 느낌 금지',
    ],
  },
  tiktok: {
    platform: 'tiktok',
    structure: [
      '빠른 후킹 (1~2초)',
      '리듬감 있는 전개',
      '장면 중심 (텍스트보다 비주얼)',
      '광고 냄새 최소화',
    ],
    tone: '빠르고 리듬감 있는, 트렌디한',
    length_guide: '15~30초 분량, 자막 기준 3~6문장',
    do_rules: [
      '첫 1~2초에 시선 잡기',
      '리듬감 있는 편집 고려',
      '트렌드 사운드 활용 가능',
    ],
    dont_rules: [
      '광고 냄새 금지',
      '느린 전개 금지',
      '설명체 금지',
    ],
  },
  naver_blog: {
    platform: 'naver_blog',
    structure: [
      '검색형 제목 (키워드 포함)',
      '도입: 구매 전 고민/상황 공감',
      '중간: 신뢰 근거 (산지, 후기, 사진)',
      '후기형 구조 (실제 경험 느낌)',
      '마무리: 구매 전 고민 해결',
    ],
    tone: '신뢰감 있는, 후기/경험 공유 느낌',
    length_guide: '제목 + 도입 3~5문장',
    do_rules: [
      '검색 키워드 자연스럽게 포함',
      '실제 경험/후기 느낌',
      '사진 설명 포함',
      '구매 전 고민 해결',
    ],
    dont_rules: [
      '키워드 스터핑 금지',
      '과장 후기 금지',
      '허위 효능 금지',
    ],
  },
  outreach_email: {
    platform: 'outreach_email',
    structure: [
      '제목: 상대 채널 맥락 반영',
      '인사: 상대 채널/콘텐츠 언급',
      '제안: 왜 이 상품과 맞는지',
      '조건: 공동구매 제안 이유',
      '마무리: 부담 없는 답장 유도',
    ],
    tone: '정중하지만 친근한, 비즈니스 제안',
    length_guide: '제목 1줄 + 본문 5~8문장',
    do_rules: [
      '상대 채널 맥락 반영',
      '왜 이 상품과 맞는지 설명',
      '부담 없는 답장 유도',
      '구체적 제안 포함',
    ],
    dont_rules: [
      '스팸 느낌 금지',
      '일방적 홍보 금지',
      '과장된 수익 약속 금지',
      '복붙 느낌 금지',
    ],
  },
};

// ═══ 플랫폼 공식 조회 ═══
export function getPlatformFormula(platform: PlatformType): PlatformFormula {
  return PLATFORM_FORMULAS[platform] || PLATFORM_FORMULAS.threads;
}

// ═══ 출력 타입에 맞는 플랫폼 추론 ═══
export function inferPlatformFromOutputType(outputType: CopyOutputType): PlatformType {
  const map: Record<CopyOutputType, PlatformType> = {
    headline_copy: 'threads',
    thumbnail_copy: 'youtube_shorts',
    threads_post: 'threads',
    shorts_script_15s: 'youtube_shorts',
    instagram_caption: 'instagram',
    tiktok_script: 'tiktok',
    naver_blog_intro: 'naver_blog',
    outreach_email_draft: 'outreach_email',
  };
  return map[outputType] || 'threads';
}

// ═══ Platform Formula를 프롬프트용 텍스트로 변환 ═══
export function platformFormulaToPrompt(formula: PlatformFormula): string {
  return `[플랫폼 공식: ${formula.platform}]
구조: ${formula.structure.join(' → ')}
톤: ${formula.tone}
길이: ${formula.length_guide}
필수: ${formula.do_rules.join(', ')}
금지: ${formula.dont_rules.join(', ')}`;
}

// ═══ 플랫폼 적합도 점수 ═══
export function scorePlatformFit(text: string, platform: PlatformType): { score: number; reasons: string[] } {
  const formula = getPlatformFormula(platform);
  let score = 60;
  const reasons: string[] = [];

  // 길이 체크
  const lines = text.split('\n').filter(l => l.trim());
  if (platform === 'threads') {
    if (lines.length >= 3 && lines.length <= 8) { score += 15; reasons.push('스레드 적정 길이'); }
    else if (lines.length > 10) { score -= 10; reasons.push('스레드에 너무 김'); }
  }
  if (platform === 'instagram') {
    if (text.length <= 150) { score += 10; reasons.push('인스타 적정 길이'); }
    else if (text.length > 300) { score -= 10; reasons.push('인스타에 너무 김'); }
  }
  if (platform === 'youtube_shorts') {
    if (/후킹|0~3초|첫\s*마디/.test(text) || lines.length <= 5) { score += 10; }
  }

  // 금지 규칙 위반 체크
  for (const rule of formula.dont_rules) {
    if (rule.includes('해시태그 남발') && (text.match(/#/g) || []).length > 7) {
      score -= 10; reasons.push('해시태그 남발');
    }
    if (rule.includes('광고 냄새') && /구매하세요|주문하세요|할인|특가/.test(text)) {
      score -= 15; reasons.push('광고 냄새');
    }
  }

  // 필수 규칙 충족 체크
  if (formula.do_rules.some(r => r.includes('댓글')) && /\?|댓글|알려|어떻게|DM/.test(text)) {
    score += 10; reasons.push('댓글 유도 포함');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}
