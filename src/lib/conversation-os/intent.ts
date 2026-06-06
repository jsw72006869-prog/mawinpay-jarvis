import type {
  JarvisConversationContext,
  JarvisIntentResult,
  JarvisUserIntent,
  YouTubeCollectionIntent,
  YouTubeCollectionMode,
  YouTubeCollectionTargetType,
} from './types';

export function normalizeKoreanText(text: string): string {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function result(
  intent: JarvisUserIntent,
  confidence: number,
  reason: string,
  responseMode?: JarvisIntentResult['responseMode'],
): JarvisIntentResult {
  return {
    intent,
    confidence,
    reason,
    responseMode: responseMode || (intent.endsWith('_command') ? 'execute' : 'answer'),
  };
}

export const YOUTUBE_CATEGORY_ALIASES: Record<string, {
  label: string;
  aliases: string[];
  searchTerms: string[];
}> = {
  beauty: {
    label: '뷰티',
    aliases: ['뷰티', '화장품', '메이크업', '스킨케어', '피부관리', '미용', '코덕', '올리브영', 'grwm'],
    searchTerms: ['뷰티 유튜버', '메이크업', '스킨케어', '화장품 리뷰', '올리브영 추천'],
  },
  camping: {
    label: '캠핑',
    aliases: ['캠핑', '캠퍼', '차박', '아웃도어', '텐트', '백패킹', '캠핑용품', '캠핑요리'],
    searchTerms: ['캠핑 유튜버', '차박', '캠핑용품', '캠핑요리', '백패킹'],
  },
  entertainment: {
    label: '엔터테인먼트',
    aliases: ['엔터', '엔터테인먼트', '예능', '연예', '방송', '코미디', '개그'],
    searchTerms: ['예능 채널', '엔터테인먼트 채널', '코미디 유튜버', '연예 채널'],
  },
  restaurant: {
    label: '맛집',
    aliases: ['맛집', '식당', '로컬맛집', '맛집투어', '맛집탐방'],
    searchTerms: ['맛집 유튜버', '맛집투어', '식당 추천', '로컬 맛집'],
  },
  mukbang: {
    label: '먹방',
    aliases: ['먹방', '대식', '푸드리뷰', '리뷰먹방', '요리먹방'],
    searchTerms: ['먹방 채널', '대식 먹방', '푸드 리뷰', '요리 먹방'],
  },
  food: {
    label: '식품/요리',
    aliases: ['식품', '요리', '레시피', '반찬', '집밥', '농산물', '과일', '배추', '절임배추', '김치', '옥수수', '매실', '복숭아', '밤'],
    searchTerms: ['식품 리뷰', '요리 유튜버', '레시피', '농산물 리뷰', '집밥'],
  },
  cooking: {
    label: '요리',
    aliases: ['요리', '레시피', '쿠킹', '집밥', '반찬', '베이킹'],
    searchTerms: ['요리 유튜버', '레시피', '집밥', '쿠킹 채널'],
  },
  parenting: {
    label: '육아',
    aliases: ['육아', '아이', '엄마', '맘', '키즈', '주부'],
    searchTerms: ['육아 유튜버', '육아맘', '아이 교육', '키즈'],
  },
  travel: {
    label: '여행',
    aliases: ['여행', '국내여행', '해외여행', '여행유튜버', '숙소'],
    searchTerms: ['여행 유튜버', '국내여행', '여행 브이로그', '숙소 리뷰'],
  },
  fashion: {
    label: '패션',
    aliases: ['패션', '옷', '코디', '스타일', '의류'],
    searchTerms: ['패션 유튜버', '코디', '스타일링', '의류 리뷰'],
  },
  fitness: {
    label: '운동/피트니스',
    aliases: ['운동', '헬스', '피트니스', '다이어트', '홈트'],
    searchTerms: ['운동 유튜버', '헬스', '피트니스', '홈트'],
  },
  tech: {
    label: 'IT/테크',
    aliases: ['it', 'IT', '테크', '전자제품', '가전', '앱', 'AI'],
    searchTerms: ['IT 유튜버', '테크 리뷰', '전자제품 리뷰', 'AI'],
  },
  auto: {
    label: '자동차',
    aliases: ['자동차', '차량', '차 리뷰', '오토', '전기차'],
    searchTerms: ['자동차 유튜버', '차 리뷰', '전기차', '자동차 리뷰'],
  },
  pets: {
    label: '반려동물',
    aliases: ['반려동물', '강아지', '고양이', '펫', '애견', '애묘'],
    searchTerms: ['반려동물 유튜버', '강아지', '고양이', '펫 리뷰'],
  },
  health: {
    label: '건강',
    aliases: ['건강', '웰니스', '영양', '건강식품', '헬스케어'],
    searchTerms: ['건강 유튜버', '웰니스', '영양', '건강식품 리뷰'],
  },
  business: {
    label: '비즈니스',
    aliases: ['비즈니스', '창업', '마케팅', '경제', '재테크', '사업'],
    searchTerms: ['비즈니스 유튜버', '창업', '마케팅', '경제'],
  },
  education: {
    label: '교육',
    aliases: ['교육', '공부', '학습', '입시', '강의', '자기계발'],
    searchTerms: ['교육 유튜버', '공부', '학습', '강의'],
  },
};

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

function findCategory(text: string) {
  const normalized = text.toLowerCase();
  return Object.entries(YOUTUBE_CATEGORY_ALIASES).find(([, category]) =>
    category.aliases.some(alias => normalized.includes(alias.toLowerCase())),
  );
}

function extractTargetCount(text: string, fallback = 20): number {
  const match = text.match(/(\d+)\s*(명|개|채널|후보|사람)?/);
  return match ? Math.max(1, Number(match[1])) : fallback;
}

function stripKeywordNoise(text: string): string {
  return normalizeKoreanText(text)
    .replace(/\d+\s*(명|개|채널|후보|사람)/g, ' ')
    .replace(/(유튜브|youtube|YouTube|영상|동영상|채널|유튜버|인플루언서|관련|키워드|전부|전체|모두|불러와|찾아줘|수집해|모아줘|보여줘|추천해|검색해|가능한지|확인해|미리보기|테스트|dry\s*run|count|카운트|몇\s*개|몇\s*명)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseYouTubeCollectionIntent(text: string): YouTubeCollectionIntent | null {
  const raw = normalizeKoreanText(text);
  if (!raw) return null;

  const hasCollectVerb = hasAny(raw, [
    /수집|찾아줘|찾아|모아줘|모아|불러와|보여줘|검색|추천|미리보기|테스트|가능한지|확인/i,
    /collect|preview|search|find|count/i,
  ]);
  const hasYoutubeSignal = hasAny(raw, [
    /유튜브|youtube|유튜버|인플루언서|채널|영상|동영상/i,
  ]);
  const countOnly = hasAny(raw, [/가능한지|몇\s*(명|개)|카운트|숫자|count|확인만|규모만/i]);
  const isVideoRequest = hasAny(raw, [/영상|동영상|video|유튜브\s*영상/i]);
  const isChannelRequest = hasAny(raw, [/채널|유튜버|인플루언서|후보|사람/i]);

  if (!hasCollectVerb || !hasYoutubeSignal) return null;

  const categoryEntry = findCategory(raw);
  const targetCount = extractTargetCount(raw, isVideoRequest ? 50 : 20);
  const targetType: YouTubeCollectionTargetType = isVideoRequest ? 'video' : (isChannelRequest ? 'channel' : 'mixed');
  let mode: YouTubeCollectionMode = 'category_channel_collect';
  let keyword = stripKeywordNoise(raw);
  let categoryKey: string | undefined;
  let categoryLabel: string | undefined;

  if (isVideoRequest && keyword) {
    if (categoryEntry) {
      categoryKey = categoryEntry[0];
      categoryLabel = categoryEntry[1].label;
    }
    mode = 'keyword_video_collect';
  } else if (categoryEntry) {
    categoryKey = categoryEntry[0];
    categoryLabel = categoryEntry[1].label;
    if (!keyword || keyword === categoryLabel) keyword = categoryEntry[1].searchTerms[0] || categoryLabel;
    mode = isVideoRequest ? 'category_video_collect' : 'category_channel_collect';
  } else if (keyword) {
    mode = isVideoRequest ? 'keyword_video_collect' : 'keyword_channel_collect';
  } else {
    return null;
  }

  if (countOnly) mode = 'count_only';

  return {
    intent: 'collect_youtube',
    mode,
    targetType,
    categoryKey,
    categoryLabel,
    keyword: keyword || categoryLabel,
    targetCount,
    maxVideos: isVideoRequest ? 150 : undefined,
    maxChannels: 100,
    maxPages: 3,
    dryRun: true,
    countOnly,
    requiresApproval: false,
    actualExecution: false,
    originalUserText: raw,
  };
}

function hasQuestionSignal(text: string): boolean {
  return /(\?|뭐야|무엇|어떻게|가능해|맞아|아니야|필요하지|알려줘|설명해줘|언제 완료|차이가|어디서|왜|실패)/i.test(text);
}

export function inferIntentFromUserText(text: string, context: JarvisConversationContext = {}): JarvisIntentResult {
  const raw = normalizeKoreanText(text);
  if (!raw) return result('unknown', 0.1, 'empty input');

  if (/^(응|그래|진행해|승인|해줘|보내|전송해|좋아|확인|ok|yes)$/i.test(raw)) {
    return result(
      'approval_yes',
      0.98,
      context.pendingActionType ? 'pending action approval' : 'approval word without pending action',
      'approval_required',
    );
  }

  if (/^(취소|아니|보류|하지마|멈춰|나중에|no|cancel)$/i.test(raw)) {
    return result('approval_no', 0.98, 'approval cancellation phrase', 'approval_required');
  }

  if (/^(계속\s*수집(?:해|해줘)?|이어\s*수집(?:해|해줘)?|이어서\s*수집(?:해|해줘)?|추가\s*수집(?:해|해줘)?|더\s*찾아줘|부족한\s*만큼|continue\s*(collect|outreach)?)$/i.test(raw)) {
    return result('outreach_goal_continue_command', 0.98, 'short outreach continuation command', 'execute');
  }

  if (/(2번\s*모니터|두\s*번째\s*모니터|미션\s*디스플레이|데이터월|후보\s*화면|메일\s*미리보기\s*크게|승인\s*카드\s*보여|보안\s*상태\s*보여)/i.test(raw)) {
    return result('show_mission_display_command', 0.9, 'mission display command', 'execute');
  }

  const youtubeIntent = parseYouTubeCollectionIntent(raw);
  if (youtubeIntent) {
    return result(
      /계속|이어|추가|더\s*찾/i.test(raw) ? 'outreach_goal_continue_command' : 'outreach_goal_collect_command',
      0.96,
      youtubeIntent.countOnly ? 'youtube count-only command' : 'youtube preview collection command',
      'execute',
    );
  }

  if (/(후보\s*보여줘|후보\s*리스트|수집한\s*후보|상위\s*후보|최근\s*후보|영상\s*리스트|채널\s*후보)/i.test(raw)) {
    return result('review_candidates_command', 0.9, 'review latest outreach candidates', 'preview');
  }

  if (/(상위\s*\d*\s*명?\s*메일\s*미리보기|후보.*메일\s*초안|개인화\s*메일|제안\s*메일\s*미리보기)/i.test(raw)) {
    return result('generate_email_preview_command', 0.9, 'candidate email preview command', 'preview');
  }

  if (/(오늘\s*(업무\s*)?브리핑|지금\s*뭐부터|자비스\s*오늘\s*상황|우선순위|다음\s*행동)/i.test(raw)) {
    return result(/뭐부터|우선순위|다음\s*행동/i.test(raw) ? 'priority_question' : 'briefing_question', 0.92, 'conversation OS briefing request', 'preview');
  }

  if (/(전체\s*주문\s*현황|전체주문현황|주문\s*현황.*전체|오늘\s*주문\s*현황)/i.test(raw)) {
    return result('purchase_order_summary_command', 0.95, 'smartstore full order summary command', 'execute');
  }

  if (/발주서/i.test(raw) && /(정리|작성|만들|생성|초안)/i.test(raw) && !/(이메일|메일|gmail)/i.test(raw)) {
    return result('purchase_order_preview_command', 0.9, 'purchase order preview command', 'preview');
  }

  if (/(개인정보\s*포함|원본|실제\s*배송용|이름.*주소.*연락처|마스킹\s*말고)/i.test(raw) && /(발주서|파일)/i.test(raw) && /(다운로드|만들|생성)/i.test(raw)) {
    return result('private_export_command', 0.95, 'private purchase order export command', 'approval_required');
  }

  if (/마스킹/i.test(raw) && /(발주서|파일)/i.test(raw) && /다운로드/i.test(raw)) {
    return result('masked_export_command', 0.88, 'masked purchase order export command', 'execute');
  }

  if (/발주서/i.test(raw) && /(이메일|메일|gmail)/i.test(raw) && /(초안|미리보기|양식|보여줘|preview)/i.test(raw)) {
    return result('purchase_order_email_draft_command', 0.93, 'purchase order email draft preview command', 'preview');
  }

  if (/(발주서\s*이메일|발주서\s*메일|gmail)/i.test(raw) && /(보내|전송|발송)/i.test(raw)) {
    return result('purchase_order_email_send_command', 0.9, 'purchase order email send command', 'approval_required');
  }

  if (hasQuestionSignal(raw)) {
    if (/발주서|배송|발주처/i.test(raw) && /(이름|주소|연락처|개인정보|마스킹)/i.test(raw)) {
      return result('privacy_export_question', 0.9, 'privacy/export question');
    }
    if (/마스킹/i.test(raw)) return result('masked_file_question', 0.85, 'masked file question');
    if (/발주처\s*이메일|이메일\s*저장/i.test(raw)) return result('supplier_email_question', 0.85, 'supplier email question');
    if (/(gmail|이메일|메일)/i.test(raw) && /(어디서|가능|보내면|발송)/i.test(raw)) return result('gmail_send_question', 0.85, 'gmail send question');
    if (/(텔레그램|telegram)/i.test(raw)) return result('telegram_approval_question', 0.85, 'telegram approval question');
    if (/(인플루언서|유튜버|후보|캠핑|뷰티|요리|식품|육아|여행|먹방|채널|영상)/i.test(raw)) return result('outreach_goal_question', 0.85, 'outreach goal question');
    if (/(테스트\s*명령|명령어\s*알려|뭘\s*해볼|어떤\s*명령)/i.test(raw)) return result('command_help_question', 0.85, 'command help question', 'help');
    return result('unknown_ops_question', 0.55, 'generic operational question');
  }

  return result('unknown', 0.2, 'no deterministic intent match');
}
