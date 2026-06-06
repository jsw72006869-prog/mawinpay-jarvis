export type CreativeContextGuard = {
  productKeyword: string;
  category: string;
  source: 'explicit_user_keyword' | 'last_youtube_collection' | 'selected_candidate' | 'business_memory' | 'fallback';
  confidence: number;
  forbiddenStaleKeywords: string[];
  basis: string;
};

export type JarvisCreativeCard = {
  id: string;
  productKeyword: string;
  title: string;
  hook: string;
  angle: string;
  script: string;
  shotList: string[];
  caption: string;
  cta: string;
  riskFlags: string[];
  score: number;
  sourceBasis: string;
};

const PRODUCT_KEYWORDS = [
  '매실',
  '복숭아',
  '옥수수',
  '밤',
  '알밤',
  '절임배추',
  '배추',
  '사과',
  '자두',
  '캠핑',
  '뷰티',
  '요리',
  '식품',
];

const STALE_KEYWORDS = ['커피', '카페', '디저트', '원두', '브런치'];

function readJsonStorage<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function findExplicitProduct(text: string): string {
  return PRODUCT_KEYWORDS.find(keyword => text.includes(keyword)) || '';
}

export function resolveCreativeContextGuard(input: {
  userText: string;
  selectedCandidate?: any;
}): CreativeContextGuard {
  const text = String(input.userText || '');
  const explicit = findExplicitProduct(text);
  if (explicit) {
    return {
      productKeyword: explicit,
      category: explicit === '뷰티' ? 'beauty' : explicit === '캠핑' ? 'camping' : 'agri_food',
      source: 'explicit_user_keyword',
      confidence: 0.96,
      forbiddenStaleKeywords: STALE_KEYWORDS,
      basis: `사용자 명령에서 "${explicit}" 키워드를 직접 확인했습니다.`,
    };
  }

  const lastCollection = readJsonStorage<any>('jarvis:last_youtube_collection');
  const lastKeyword = String(lastCollection?.keyword || lastCollection?.categoryLabel || '').trim();
  const fromMemory = findExplicitProduct(lastKeyword) || lastKeyword;
  if (fromMemory) {
    return {
      productKeyword: fromMemory,
      category: lastCollection?.categoryKey || 'youtube_collection',
      source: 'last_youtube_collection',
      confidence: 0.82,
      forbiddenStaleKeywords: STALE_KEYWORDS,
      basis: `최근 YouTube 수집 맥락 "${fromMemory}"을 기준으로 생성합니다.`,
    };
  }

  const selectedName = String(input.selectedCandidate?.matchedKeyword || input.selectedCandidate?.keyword || '').trim();
  if (selectedName) {
    return {
      productKeyword: selectedName,
      category: input.selectedCandidate?.matchedCategory || 'selected_candidate',
      source: 'selected_candidate',
      confidence: 0.7,
      forbiddenStaleKeywords: STALE_KEYWORDS,
      basis: `선택된 후보의 매칭 키워드 "${selectedName}"을 기준으로 생성합니다.`,
    };
  }

  return {
    productKeyword: '제철 상품',
    category: 'fallback',
    source: 'fallback',
    confidence: 0.45,
    forbiddenStaleKeywords: STALE_KEYWORDS,
    basis: '명시 키워드가 없어 안전한 제철 상품 맥락으로 생성합니다.',
  };
}

export function shouldUseDeterministicCreativeCards(text: string): boolean {
  return /(릴스|reels|숏폼|shorts|쇼츠|대본|스크립트|카피|후킹|헤드카피).*(만들|작성|생성|짜줘|뽑아|줘)|((만들|작성|생성|짜줘|뽑아).*(릴스|reels|숏폼|shorts|쇼츠|대본|스크립트|카피|후킹|헤드카피))/i
    .test(String(text || ''));
}

export function buildDeterministicCreativeCards(context: CreativeContextGuard, count = 5): JarvisCreativeCard[] {
  const product = context.productKeyword || '제철 상품';
  const angles = [
    {
      angle: '첫입 반응',
      hook: `첫입에 표정이 바뀌는 ${product}, 그 장면만 잡으세요.`,
      title: `${product} 첫입 반응 릴스`,
      desire: '먹자마자 좋은 걸 골랐다는 확신',
      fear: '이번 계절을 그냥 지나칠까 봐 드는 아쉬움',
    },
    {
      angle: '놓치면 끝나는 계절감',
      hook: `${product}는 길게 설득하지 말고, 지금 아니면 어렵다는 장면으로 시작하세요.`,
      title: `지금 아니면 늦는 ${product}`,
      desire: '제철 타이밍을 놓치지 않는 사람이라는 만족감',
      fear: '좋은 물량이 빠진 뒤 후회할 가능성',
    },
    {
      angle: '가족 간식 장면',
      hook: `아이 손이 먼저 가는 ${product}, 설명보다 식탁 장면이 강합니다.`,
      title: `식탁에서 먼저 사라지는 ${product}`,
      desire: '가족에게 좋은 걸 챙겼다는 안도감',
      fear: '맛없는 간식으로 남길까 봐 드는 걱정',
    },
    {
      angle: '비교 선택',
      hook: `${product}는 싸다는 말보다, 왜 이걸 골라야 하는지 한 장면으로 보여주세요.`,
      title: `${product} 고르는 기준`,
      desire: '실패 없이 고르는 기준을 얻는 느낌',
      fear: '가격만 보고 골랐다가 실망할 가능성',
    },
    {
      angle: '공동구매 명분',
      hook: `${product} 공동구매는 혜택보다 “같이 살 이유”가 먼저입니다.`,
      title: `${product} 같이 사는 이유`,
      desire: '좋은 가격과 좋은 선택을 동시에 잡는 만족감',
      fear: '나만 늦게 알고 놓칠 수 있다는 긴장감',
    },
  ];

  return angles.slice(0, Math.max(1, count)).map((item, index) => {
    const shotList = [
      `0~1초: ${item.hook}`,
      `1~3초: ${product} 실물 클로즈업, 손으로 집는 장면`,
      `3~7초: 먹거나 사용하는 장면과 표정 반응`,
      `7~12초: ${item.desire}를 짧은 자막으로 표시`,
      `마지막: 댓글/DM/구매 문의 CTA`,
    ];
    const script = [
      item.hook,
      `“이건 그냥 ${product}가 아니라, 이번 타이밍에 잡아야 하는 이유가 있는 상품입니다.”`,
      `보는 사람은 맛보다 먼저 ${item.fear}을 떠올립니다.`,
      `그래서 영상은 설명을 줄이고, 실물과 첫 반응을 빠르게 보여줘야 합니다.`,
      `마지막은 “필요하신 분은 댓글 남겨주세요”로 가볍게 닫습니다.`,
    ].join('\n');

    return {
      id: `creative-context-${Date.now()}-${index}`,
      productKeyword: product,
      title: item.title,
      hook: item.hook,
      angle: item.angle,
      script,
      shotList,
      caption: `${product}는 설명보다 장면이 먼저입니다. 이번 제철 타이밍에 맞춰 필요한 분들께만 안내드릴게요.`,
      cta: `${product} 필요하시면 댓글이나 DM으로 “${product}” 남겨주세요.`,
      riskFlags: context.forbiddenStaleKeywords.some(stale => product.includes(stale))
        ? ['stale_context_risk']
        : [],
      score: Math.min(96, 82 + index * 2),
      sourceBasis: context.basis,
    };
  });
}

export function cardsToCreativeStudioCopies(cards: JarvisCreativeCard[]) {
  return cards.map(card => ({
    id: card.id,
    headline: card.title,
    body: [
      `후킹: ${card.hook}`,
      `각도: ${card.angle}`,
      '',
      '대본',
      card.script,
      '',
      '샷 리스트',
      ...card.shotList.map(shot => `- ${shot}`),
      '',
      `캡션: ${card.caption}`,
      `CTA: ${card.cta}`,
      `근거: ${card.sourceBasis}`,
    ].join('\n'),
    text: card.script,
    platform: 'Instagram Reels',
    outputType: 'reels_script',
    hookType: card.angle,
    emotionTrigger: card.hook,
    referenceNote: card.sourceBasis,
    tags: [card.productKeyword, card.angle, 'shortform'],
    viralScore: card.score,
    finalScore: card.score,
    recommended: card.score >= 86,
    riskScore: card.riskFlags.length ? 35 : 8,
    desires: [card.cta],
    anxieties: card.riskFlags,
    triggers: [card.hook],
    whyRecommended: card.sourceBasis,
    platformVersions: {
      reels: card.script,
      threads: `${card.hook}\n\n${card.caption}\n\n${card.cta}`,
      kakao: `${card.title}\n${card.cta}`,
    },
  }));
}
