/**
 * COPY-S.1 Step 6: Platform Intent Engine
 * 플랫폼별 카피 문법/규칙/톤/구조를 정의
 */
import type { PlatformCopyChannel, PlatformCopyRules } from './humanDesireTypes';

// ═══ 플랫폼별 카피 규칙 데이터베이스 ═══
const PLATFORM_RULES: Record<PlatformCopyChannel, PlatformCopyRules> = {
  threads: {
    platform: 'threads',
    maxLength: 500,
    structure: ['짧은 첫 줄 (후킹)', '2~3줄 본문 (공감/장면)', '마지막 줄 (여운/댓글유도)'],
    tone: '친구한테 말하듯 툭 던지는 톤. 광고 냄새 제로.',
    doRules: [
      '첫 줄은 짧고 툭 던진다 (10자 이내 권장)',
      '댓글이 갈릴 만한 취향/상황을 만든다',
      '직접 판매보다 공감/여운 중심',
      '2~5줄 리듬으로 줄바꿈',
      '마지막에 댓글 유도 가능 (질문형/선택형)',
      '줄바꿈으로 리듬감 만들기',
    ],
    dontRules: [
      '링크 직접 삽입 금지',
      '가격 직접 언급 금지',
      '"지금 만나보세요" 류 금지',
      '긴 설명문 금지',
      '해시태그 남발 금지 (최대 3개)',
      '광고임을 드러내는 표현 금지',
    ],
    hookStyle: '취향 대립형 / 고백형 / 계절 감성형',
    endingStyle: '여운형 또는 댓글 유도형 (둘 중 하나)',
  },
  youtube_thumbnail: {
    platform: 'youtube_thumbnail',
    maxLength: 12,
    structure: ['6~12자 핵심 문구 1줄'],
    tone: '궁금증 유발. 짧고 강렬.',
    doRules: [
      '6~12자 중심 (절대 15자 초과 금지)',
      '궁금증, 취향 대립, 계절 타이밍 활용',
      '명사형/짧은 경고형 가능',
      '숫자 활용 (당도 24도, 3일 한정 등)',
      '시각적으로 강렬한 단어 선택',
    ],
    dontRules: [
      '긴 문장 절대 금지',
      '설명형 문장 금지',
      '"~입니다" 체 금지',
      '가격 직접 노출 금지',
      '일반적인 형용사 나열 금지',
    ],
    hookStyle: '궁금증형 / 숫자형 / 대립형 / 경고형',
    endingStyle: '없음 (한 줄로 끝)',
  },
  youtube_shorts: {
    platform: 'youtube_shorts',
    maxLength: 300,
    structure: ['[0~3초] 후킹 (멈추게 하는 장면/말)', '[3~10초] 본문 (감각 장면)', '[10~15초] CTA (행동 유도)'],
    tone: '빠르고 감각적. 장면 중심.',
    doRules: [
      '0~3초 후킹이 생명 (장면 먼저)',
      '자막 리듬 중요 (짧은 문장 연속)',
      '15초/30초 구조 명확히',
      '먹는 소리/향/자르는 장면 등 시각화',
      '감각 자극 (ASMR적 요소)',
    ],
    dontRules: [
      '긴 설명 금지',
      '정적인 화면 금지',
      '광고 느낌 금지',
      '"안녕하세요" 시작 금지',
      '가격 직접 언급 금지',
    ],
    hookStyle: '장면 시작형 / 소리 시작형 / 질문형',
    endingStyle: 'CTA형 (팔로우/좋아요/댓글 유도)',
  },
  instagram_reels: {
    platform: 'instagram_reels',
    maxLength: 200,
    structure: ['감각적 한 문장 (후킹)', '영상 장면과 어울리는 짧은 자막 2~3개'],
    tone: '감성적이고 비주얼 중심. 짧은 임팩트.',
    doRules: [
      '감각적 한 문장으로 시작',
      '영상 장면과 어울리는 짧은 자막',
      '감정/장면 중심',
      '해시태그 5~10개 (캡션에)',
      '저장하고 싶은 정보성 포함 가능',
    ],
    dontRules: [
      '너무 설명적이면 실패',
      '텍스트 과다 금지',
      '직접적 판매 문구 금지',
      '긴 캡션 금지 (3줄 이내)',
    ],
    hookStyle: '감각형 / 감성형 / 비주얼 임팩트형',
    endingStyle: '여운형 (저장 유도)',
  },
  tiktok: {
    platform: 'tiktok',
    maxLength: 200,
    structure: ['[0~2초] 초강력 후킹', '[2~8초] 빠른 전개', '[8~15초] 반전/CTA'],
    tone: '더 빠르고 더 자극적. 리듬감 최우선.',
    doRules: [
      '더 빠른 후킹 (2초 안에 잡아야)',
      '리듬감 (짧은 문장 반복)',
      '광고 냄새 최소화',
      '트렌드 사운드 활용 가능',
      '반전 구조 효과적',
    ],
    dontRules: [
      '느린 시작 금지',
      '설명형 금지',
      '브랜드 강조 금지',
      '가격 직접 언급 금지',
    ],
    hookStyle: '반전형 / 리듬형 / 트렌드형',
    endingStyle: '반전형 또는 루프형',
  },
  naver_blog: {
    platform: 'naver_blog',
    maxLength: 2000,
    structure: ['검색형 제목 (키워드 포함)', '도입 3~5문장 (구매 전 고민 공감)', '본문 (정보/후기)', '마무리 (신뢰/CTA)'],
    tone: '정보형 + 공감형. 신뢰감 있는 톤.',
    doRules: [
      '검색형 제목 (키워드 자연스럽게 포함)',
      '구매 불안 해소 중심',
      '정보/후기형 구성',
      '신뢰 근거 제시 (산지, 경력, 후기)',
      '자연스러운 CTA',
    ],
    dontRules: [
      '너무 감성적이면 부족 (정보 필요)',
      '키워드 스팸 금지',
      '과장 표현 금지',
      '"최고" "역대급" 금지',
      '가격 비교 직접 금지',
    ],
    hookStyle: '검색형 / 후기형 / 비교형',
    endingStyle: '신뢰형 CTA (부드러운 구매 유도)',
  },
  outreach_email: {
    platform: 'outreach_email',
    maxLength: 500,
    structure: ['제목 (열게 만드는 한 줄)', '인사 (상대 채널 맥락 언급)', '제안 (왜 맞는지)', '마무리 (부담 없는 답장 유도)'],
    tone: '프로페셔널하지만 부담 없는 톤. 대량 발송 느낌 제거.',
    doRules: [
      '상대 채널 맥락 구체적 언급',
      '왜 이 상품과 맞는지 설명',
      '부담 없는 제안',
      '답장 유도 (질문형 마무리)',
      '개인화된 느낌',
    ],
    dontRules: [
      '대량 발송 느낌 금지',
      '"안녕하세요 저는~" 시작 금지',
      '일방적 제안 금지',
      '가격/조건 먼저 언급 금지',
      '너무 긴 메일 금지',
    ],
    hookStyle: '맥락형 / 칭찬형 / 질문형',
    endingStyle: '부담 없는 질문형 (답장 유도)',
  },
  smartstore_detail: {
    platform: 'smartstore_detail',
    maxLength: 3000,
    structure: ['상단 후킹 (왜 이 상품인지)', '중단 (감각/스토리/신뢰)', '하단 (불안 해소/구매 유도)'],
    tone: '신뢰감 + 감각. 구매 결정을 돕는 톤.',
    doRules: [
      '상단에서 바로 차별점 제시',
      '감각 묘사로 상상하게 만들기',
      '신뢰 시그널 (산지, 경력, 인증)',
      '불안 해소 (배송, 품질, 교환)',
      '자연스러운 구매 유도',
    ],
    dontRules: [
      '"최고" "역대급" 금지',
      '가격만 강조 금지',
      '텍스트만 나열 금지 (이미지와 조합)',
      '허위 효능 금지',
    ],
    hookStyle: '차별점형 / 스토리형 / 감각형',
    endingStyle: '신뢰형 + 행동 유도',
  },
};

/**
 * 플랫폼별 카피 규칙 반환
 */
export function getPlatformCopyRules(platform: PlatformCopyChannel, outputType?: string): PlatformCopyRules {
  return PLATFORM_RULES[platform] || PLATFORM_RULES.threads;
}

/**
 * 플랫폼 규칙을 프롬프트용 텍스트로 변환
 */
export function platformRulesToPromptText(rules: PlatformCopyRules): string {
  return `[플랫폼 규칙: ${rules.platform}]
최대 길이: ${rules.maxLength}자
구조: ${rules.structure.join(' → ')}
톤: ${rules.tone}
후킹 스타일: ${rules.hookStyle}
엔딩 스타일: ${rules.endingStyle}

DO:
${rules.doRules.map(r => `- ${r}`).join('\n')}

DON'T:
${rules.dontRules.map(r => `- ${r}`).join('\n')}`;
}
