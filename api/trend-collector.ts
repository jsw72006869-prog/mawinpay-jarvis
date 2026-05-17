/**
 * TREND-COLLECTOR API — 자비스 카피 엔진 강화용 트렌드 수집기
 * 
 * 기능:
 * 1. YouTube 인기 영상 썸네일/제목/패턴 자동 수집
 * 2. 수집된 데이터를 Google Sheets에 저장 (Success Library)
 * 3. 저장된 트렌드 데이터를 RAG처럼 활용하여 카피 생성 품질 향상
 * 4. 카피 생성 시 레퍼런스 근거 제시
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  maxDuration: 60,
  runtime: 'nodejs',
};

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GOOGLE_SHEETS_CREDENTIALS = process.env.GOOGLE_SHEETS_CREDENTIALS || '';
const WORKSPACE_SHEET_ID = process.env.JARVIS_WORKSPACE_SHEET_ID || '';

// ═══ 타입 정의 ═══
interface TrendVideo {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  viewCount: number;
  viewCountFormatted: string;
  likeCount: number;
  commentCount: number;
  engagementRate: string;
  publishedAt: string;
  description: string;
  url: string;
}

interface TrendPattern {
  hookType: string;
  hookText: string;
  thumbnailPattern: string;
  emotionTrigger: string;
  contentStructure: string;
  targetAudience: string;
  viralFactor: string;
  sensoryKeywords: string[];
  ctaPattern: string;
  score: number;
}

interface TrendCollectionResult {
  success: boolean;
  product: string;
  videosCollected: number;
  patternsExtracted: number;
  patterns: TrendPattern[];
  topVideos: TrendVideo[];
  savedToSheets: boolean;
  collectedAt: string;
}

// ═══ Google Sheets 인증 ═══
async function getGoogleSheetsToken(): Promise<string> {
  if (!GOOGLE_SHEETS_CREDENTIALS) throw new Error('GOOGLE_SHEETS_CREDENTIALS not configured');
  const crypto = await import('crypto');
  const credentials = JSON.parse(GOOGLE_SHEETS_CREDENTIALS);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(credentials.private_key, 'base64url');
  const jwt = `${header}.${payload}.${signature}`;
  const tokenRes: any = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json() as any;
  if (!tokenData.access_token) throw new Error('Google Sheets token failed');
  return tokenData.access_token;
}

// ═══ Sheets에 트렌드 데이터 저장 ═══
async function saveTrendToSheets(product: string, patterns: TrendPattern[], videos: TrendVideo[]): Promise<boolean> {
  try {
    if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) return false;
    const token = await getGoogleSheetsToken();
    const now = new Date().toISOString();
    
    // 트렌드 패턴 저장 (TrendLibrary 탭)
    const patternRows = patterns.map(p => [
      now,
      product,
      p.hookType,
      p.hookText,
      p.thumbnailPattern,
      p.emotionTrigger,
      p.contentStructure,
      p.targetAudience,
      p.viralFactor,
      p.sensoryKeywords.join(', '),
      p.ctaPattern,
      String(p.score),
    ]);

    if (patternRows.length > 0) {
      const range = encodeURIComponent('TrendLibrary!A1');
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
      await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: patternRows }),
      });
    }

    // 인기 영상 레퍼런스 저장 (VideoReference 탭)
    const videoRows = videos.slice(0, 10).map(v => [
      now,
      product,
      v.title,
      v.channelName,
      v.thumbnailUrl,
      String(v.viewCount),
      v.engagementRate,
      v.url,
      v.publishedAt,
    ]);

    if (videoRows.length > 0) {
      const range = encodeURIComponent('VideoReference!A1');
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
      await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: videoRows }),
      });
    }

    return true;
  } catch (e) {
    console.error('[trend-collector] Sheets save error:', e);
    return false;
  }
}

// ═══ Sheets에서 저장된 트렌드 패턴 읽기 ═══
async function loadTrendLibrary(product: string): Promise<TrendPattern[]> {
  try {
    if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) return [];
    const token = await getGoogleSheetsToken();
    const range = encodeURIComponent('TrendLibrary!A:L');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?majorDimension=ROWS`;
    const res: any = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rows = data.values || [];
    
    // 해당 제품 관련 패턴만 필터 (최근 30일)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const filtered = rows
      .filter((row: string[]) => {
        const rowDate = row[0] || '';
        const rowProduct = (row[1] || '').toLowerCase();
        const productLower = product.toLowerCase();
        return rowDate >= thirtyDaysAgo && (
          rowProduct.includes(productLower) || 
          productLower.includes(rowProduct) ||
          rowProduct === '농산물' // 범용 패턴
        );
      })
      .map((row: string[]) => ({
        hookType: row[2] || '',
        hookText: row[3] || '',
        thumbnailPattern: row[4] || '',
        emotionTrigger: row[5] || '',
        contentStructure: row[6] || '',
        targetAudience: row[7] || '',
        viralFactor: row[8] || '',
        sensoryKeywords: (row[9] || '').split(', ').filter(Boolean),
        ctaPattern: row[10] || '',
        score: parseInt(row[11] || '0', 10),
      }))
      .sort((a: TrendPattern, b: TrendPattern) => b.score - a.score)
      .slice(0, 10);

    return filtered;
  } catch (e) {
    console.error('[trend-collector] Sheets read error:', e);
    return [];
  }
}

// ═══ YouTube 인기 영상 수집 ═══
async function collectTrendingVideos(product: string, keywords: string[]): Promise<TrendVideo[]> {
  if (!YOUTUBE_API_KEY) return [];
  
  const allVideos: TrendVideo[] = [];
  const searchQueries = [
    product,
    `${product} 먹방`,
    `${product} 리뷰`,
    ...keywords.slice(0, 2),
  ];

  for (const query of searchQueries.slice(0, 3)) {
    try {
      // 최근 1주일 인기 영상 검색
      const publishedAfter = new Date(Date.now() - 7 * 86400000).toISOString();
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&order=viewCount&maxResults=10&regionCode=KR&hl=ko&publishedAfter=${publishedAfter}&key=${YOUTUBE_API_KEY}`;
      
      const searchRes: any = await fetch(searchUrl);
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json();
      if (!searchData.items?.length) continue;

      const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');
      const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
      const videosRes: any = await fetch(videosUrl);
      if (!videosRes.ok) continue;
      const videosData = await videosRes.json();

      for (const v of (videosData.items || [])) {
        const stats = v.statistics || {};
        const viewCount = parseInt(stats.viewCount || '0', 10);
        const likeCount = parseInt(stats.likeCount || '0', 10);
        const commentCount = parseInt(stats.commentCount || '0', 10);
        
        allVideos.push({
          videoId: v.id,
          title: v.snippet.title,
          channelName: v.snippet.channelTitle,
          thumbnailUrl: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url || '',
          viewCount,
          viewCountFormatted: viewCount >= 10000 ? `${(viewCount / 10000).toFixed(1)}만` : viewCount.toLocaleString(),
          likeCount,
          commentCount,
          engagementRate: viewCount > 0 ? ((likeCount + commentCount) / viewCount * 100).toFixed(2) + '%' : '0%',
          publishedAt: v.snippet.publishedAt,
          description: (v.snippet.description || '').substring(0, 300),
          url: `https://www.youtube.com/watch?v=${v.id}`,
        });
      }
    } catch (e) {
      console.error(`[trend-collector] YouTube search error for "${query}":`, e);
    }
  }

  // 중복 제거 + 조회수 순 정렬
  const unique = Array.from(new Map(allVideos.map(v => [v.videoId, v])).values());
  return unique.sort((a, b) => b.viewCount - a.viewCount).slice(0, 15);
}

// ═══ GPT로 패턴 분석 ═══
async function analyzePatterns(product: string, videos: TrendVideo[]): Promise<TrendPattern[]> {
  if (!OPENAI_API_KEY || videos.length === 0) return [];

  const videoSummaries = videos.slice(0, 8).map((v, i) => 
    `${i + 1}. "${v.title}" (${v.viewCountFormatted}회, 참여율 ${v.engagementRate}) - ${v.channelName}`
  ).join('\n');

  const prompt = `당신은 농산물/식품 바이럴 콘텐츠 패턴 분석 전문가입니다.

아래 "${product}" 관련 YouTube 인기 영상들의 제목과 데이터를 분석하여, 바이럴 성공 패턴을 추출해 주세요.

[분석 대상 영상]
${videoSummaries}

[추출 항목]
각 영상에서 다음 패턴을 추출하세요:
1. hookType: 후킹 유형 (sensory_hook/conflict_hook/confession_hook/seasonal_hook/contrarian_hook/local_trust_hook/memory_hook/limited_timing_hook/identity_hook/question_hook/surprise_hook)
2. hookText: 해당 영상의 후킹 문구 (제목에서 추출 또는 추정)
3. thumbnailPattern: 썸네일 패턴 추정 (클로즈업/반응샷/텍스트강조/비포애프터/숫자강조)
4. emotionTrigger: 감정 자극 포인트 (호기심/공감/놀라움/갈망/불안해소)
5. contentStructure: 콘텐츠 구조 (후킹→체험→CTA / 문제→해결→추천 / 일상→발견→공유)
6. targetAudience: 타깃 (30대주부/20대여성/가족/직장인/건강관심층)
7. viralFactor: 바이럴 요인 (시즌감/식감묘사/가격충격/희소성/공감대)
8. sensoryKeywords: 감각 키워드 배열 (아삭/달콤/즙/향/물컹/차가운 등)
9. ctaPattern: CTA 패턴 (댓글유도/DM유도/저장유도/공유유도/링크유도)
10. score: 바이럴 잠재력 점수 (0~100)

[응답 형식 — 반드시 JSON]
{
  "patterns": [
    {
      "hookType": "...",
      "hookText": "...",
      "thumbnailPattern": "...",
      "emotionTrigger": "...",
      "contentStructure": "...",
      "targetAudience": "...",
      "viralFactor": "...",
      "sensoryKeywords": ["...", "..."],
      "ctaPattern": "...",
      "score": 85
    }
  ],
  "summary": {
    "dominantHookType": "가장 많이 사용된 후킹 유형",
    "topSensoryKeywords": ["가장 많이 등장하는 감각 키워드 3개"],
    "recommendedAngle": "이 데이터 기반 추천 카피 방향 1줄"
  }
}`;

  try {
    const res: any = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2500,
        temperature: 0.4,
      }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    
    const parsed = JSON.parse(jsonMatch[0]);
    return (parsed.patterns || []).map((p: any) => ({
      hookType: p.hookType || 'general_hook',
      hookText: p.hookText || '',
      thumbnailPattern: p.thumbnailPattern || '',
      emotionTrigger: p.emotionTrigger || '',
      contentStructure: p.contentStructure || '',
      targetAudience: p.targetAudience || '',
      viralFactor: p.viralFactor || '',
      sensoryKeywords: Array.isArray(p.sensoryKeywords) ? p.sensoryKeywords : [],
      ctaPattern: p.ctaPattern || '',
      score: typeof p.score === 'number' ? p.score : 50,
    }));
  } catch (e) {
    console.error('[trend-collector] Pattern analysis error:', e);
    return [];
  }
}


// ═══ COPY-S.1: Human Desire Copy Engine — 강화된 카피 생성 ═══

// ── 인간 욕구 데이터 ──
const HUMAN_DESIRE_MAP: Record<string, string[]> = {
  '복숭아': ['not_miss_season', 'feed_family', 'gift_praise', 'avoid_regret'],
  '옥수수': ['feed_family', 'not_miss_season', 'buy_from_trusted_person', 'avoid_regret'],
  '절임배추': ['avoid_regret', 'feed_family', 'buy_from_trusted_person', 'choose_good_quality'],
  '고구마': ['feed_family', 'choose_good_quality', 'not_miss_season', 'save_money'],
  '사과': ['gift_praise', 'choose_good_quality', 'not_miss_season', 'feed_family'],
  '밤': ['not_miss_season', 'feed_family', 'gift_praise', 'choose_good_quality'],
};
const DESIRE_LABEL: Record<string, string> = {
  save_money: '싸게 사고 싶은 욕구', choose_good_quality: '좋은 걸 고르고 싶은 욕구',
  feed_family: '가족에게 먹이고 싶은 욕구', avoid_regret: '실패/후회 피하고 싶은 욕구',
  buy_before_others: '남들보다 먼저 사고 싶은 욕구', not_miss_season: '제철을 놓치고 싶지 않은 욕구',
  gift_praise: '선물로 칭찬받고 싶은 욕구', buy_from_trusted_person: '믿을 수 있는 사람에게 사고 싶은 욕구',
};

// ── 고객 불안 데이터 ──
const ANXIETY_MAP: Record<string, string[]> = {
  '복숭아': ['bad_taste', 'damaged_delivery', 'different_from_photo'],
  '옥수수': ['bad_taste', 'ugly_or_small', 'family_rejects'],
  '절임배추': ['bad_taste', 'damaged_delivery', 'overpriced'],
  '고구마': ['ugly_or_small', 'bad_taste', 'overpriced'],
  '사과': ['damaged_delivery', 'bad_taste', 'bad_gift_feedback'],
  '밤': ['ugly_or_small', 'bad_taste', 'overpriced'],
};
const ANXIETY_LABEL: Record<string, string> = {
  bad_taste: '맛없으면 어떡하지', damaged_delivery: '배송 중 상하면 어떡하지',
  ugly_or_small: '작거나 못생기면 어떡하지', overpriced: '가격이 비싼 건 아닐까',
  different_from_photo: '사진이랑 다르면 어떡하지', family_rejects: '가족이 안 먹으면 어떡하지',
  bad_gift_feedback: '선물했는데 별로면 어떡하지',
};
const ANXIETY_RESOLVE: Record<string, string> = {
  bad_taste: '감각 묘사로 간접 해소. "달다"가 아니라 "한 입 베면 즙이 턱을 타고 흐른다"',
  damaged_delivery: '포장 신뢰로 해소. "에어캡 3중 + 아이스팩 + 당일 발송"',
  ugly_or_small: '선별 과정 언급으로 해소. "하나하나 손으로 골랐다"',
  overpriced: '가치 비교로 해소. 직접 "싸다" 하지 말고 경험 가치를 느끼게',
  different_from_photo: '있는 그대로의 사진/영상으로 해소. 보정 없는 실제 모습',
  family_rejects: '아이/어르신 반응 스토리로 해소',
  bad_gift_feedback: '받는 사람 반응 장면으로 해소. "엄마가 전화해서 뭐냐고 물어봤다"',
};

// ── 구매 트리거 데이터 ──
const TRIGGER_MAP: Record<string, string[]> = {
  '복숭아': ['seasonal_peak', 'direct_from_farm', 'harvested_today', 'sold_out_risk'],
  '옥수수': ['seasonal_peak', 'direct_from_farm', 'camping', 'kids_snack'],
  '절임배추': ['kimjang', 'seasonal_peak', 'limited_quantity', 'group_buy_deadline'],
  '고구마': ['seasonal_peak', 'direct_from_farm', 'kids_snack', 'camping'],
  '사과': ['seasonal_peak', 'holiday', 'direct_from_farm', 'limited_quantity'],
  '밤': ['seasonal_peak', 'holiday', 'direct_from_farm', 'camping'],
};
const TRIGGER_LABEL: Record<string, string> = {
  seasonal_peak: '제철 피크', limited_quantity: '한정 수량', direct_from_farm: '산지 직송',
  harvested_today: '오늘 수확', repurchase: '재구매', sold_out_risk: '품절 위험',
  holiday: '명절', kimjang: '김장철', camping: '캠핑', kids_snack: '아이 간식',
  group_buy_deadline: '공구 마감',
};

// ── 농산물 감각 데이터 ──
const SENSORY_DB: Record<string, { texture: string[]; aroma: string[]; scene: string[]; timing: string[]; emotionalImages: string[] }> = {
  '복숭아': {
    texture: ['말랑함', '아삭함', '과즙', '달큰함', '탱글한 과육', '이 사이로 터지는 즙'],
    aroma: ['복숭아 향', '냉장고 문 열 때 퍼지는 향', '코끝에 먼저 닿는 달콤함'],
    scene: ['밥상 위 디저트', '아이 간식', '선물 박스', '여름 냉장고', '캠핑 과일'],
    timing: ['제철 초입', '수확 직후', '한여름 2주'],
    emotionalImages: ['향으로 먼저 들키는 과일', '여름이 냉장고에 들어온 느낌', '한 입 베면 여름이 입 안에 터지는 순간'],
  },
  '옥수수': {
    texture: ['쫀득함', '탱글함', '알알이 씹히는 식감', '찰기', '톡톡 터지는 알갱이'],
    aroma: ['옥수수 찐 냄새', '찜기에서 올라오는 김', '고소한 단내'],
    scene: ['아이 간식', '캠핑', '가족 간식', '비 오는 날 간식'],
    timing: ['여름 제철', '수확 직후', '장마 끝나고'],
    emotionalImages: ['집 안 공기가 여름이 되는 냄새', '찜기 뚜껑 열 때 퍼지는 김', '아이가 양손에 하나씩 들고 먹는 모습'],
  },
  '절임배추': {
    texture: ['아삭함', '속이 찬 느낌', '절임 정도가 딱 맞는 식감'],
    aroma: ['김장 양념 냄새', '겨울 밥상 냄새'],
    scene: ['김장날', '가족 겨울 준비', '엄마 집 김장'],
    timing: ['김장철', '11월 초', '겨울 전'],
    emotionalImages: ['실패하면 안 되는 겨울 준비', '올해도 무사히 김장 끝냈다는 안도감'],
  },
  '고구마': {
    texture: ['꿀처럼 흐르는 속', '촉촉함', '포슬포슬', '쫀득함'],
    aroma: ['군고구마 냄새', '오븐에서 나는 달콤한 향'],
    scene: ['겨울 간식', '다이어트 식단', '캠핑 화로'],
    timing: ['가을~겨울', '수확 후 숙성'],
    emotionalImages: ['반으로 갈랐을 때 속이 노란 순간', '호호 불며 먹는 겨울 간식'],
  },
  '사과': {
    texture: ['아삭함', '과즙', '단단한 과육', '씹을 때 소리'],
    aroma: ['사과 향', '깎을 때 퍼지는 향'],
    scene: ['명절 선물', '아침 과일', '가을 소풍'],
    timing: ['가을 제철', '추석 전'],
    emotionalImages: ['아삭 소리가 들리는 한 입', '선물 박스 열었을 때 빨간 사과'],
  },
};

// ── 플랫폼별 골든타임 ──
const GOLDEN_TIMES: Record<string, { times: string[]; reason: string }> = {
  threads: { times: ['07:00~08:30', '21:30~23:00'], reason: '출근 전 + 잠자기 전 스크롤' },
  youtube_shorts: { times: ['12:00~13:00', '18:00~19:30'], reason: '점심 + 퇴근 후 (배고플 때)' },
  youtube_thumbnail: { times: ['12:00~13:00', '18:00~19:30'], reason: '점심 + 퇴근 후' },
  instagram_reels: { times: ['12:00~13:00', '19:00~21:00'], reason: '점심 + 저녁 이후' },
  naver_blog: { times: ['09:00~11:00 (화~목)'], reason: '검색 트래픽 피크' },
  headcopy: { times: ['07:00~08:30', '21:30~23:00'], reason: '스레드/릴스 기준' },
  full_package: { times: ['07:00~08:30', '21:30~23:00'], reason: '멀티 플랫폼 기준' },
};

// ── 플랫폼별 카피 규칙 ──
const PLATFORM_RULES_DB: Record<string, string> = {
  headcopy: `[플랫폼: 헤드카피]
15자 이내, 스크롤을 멈추게 하는 강렬한 한 줄.
톤: 친구에게 툭 던지듯. 광고 냄새 제로.
DO: 짧고 강렬, 감각어 필수, 궁금증/취향대립/계절감
DON'T: 설명형 금지, "~입니다" 금지, 가격 언급 금지`,
  threads_post: `[플랫폼: 스레드]
3~5문장, 줄바꿈 리듬, 공감+궁금증, 댓글 유도.
톤: 친구한테 말하듯 툭 던지는 톤. 광고 냄새 제로.
DO: 첫 줄 10자 이내 툭, 댓글 갈릴 만한 취향/상황, 줄바꿈 리듬, 여운
DON'T: 링크 삽입 금지, 가격 언급 금지, 해시태그 3개 이내, 긴 설명 금지`,
  reels_script: `[플랫폼: 릴스/쇼츠]
15초 구조: [0~3초] 후킹 → [3~10초] 장면 → [10~15초] CTA
톤: 빠르고 감각적. 장면 중심.
DO: 0~3초 후킹이 생명, 자막 리듬, 먹는 소리/향/자르는 장면
DON'T: 긴 설명 금지, "안녕하세요" 시작 금지, 광고 느낌 금지`,
  youtube_thumbnail: `[플랫폼: 유튜브 썸네일]
6~12자 핵심 문구 1줄. 클릭 유도.
DO: 궁금증, 숫자 활용, 시각적으로 강렬한 단어
DON'T: 15자 초과 금지, 설명형 금지, 가격 노출 금지`,
  instagram_copy: `[플랫폼: 인스타그램]
2~3문장, 감각 장면 중심, 해시태그 3~5개.
DO: 감각적 한 문장 시작, 저장하고 싶은 정보성
DON'T: 텍스트 과다 금지, 직접 판매 문구 금지`,
  full_package: `[플랫폼: 마케팅 패키지]
헤드카피 + 썸네일 + 릴스 스크립트 + 스레드 + CTA 각각 다른 문법으로.`,
};

async function generateEnhancedCopy(params: {
  product: string;
  contentType: string;
  count: number;
  trendPatterns: TrendPattern[];
  topVideos: TrendVideo[];
  userStyle?: string;
}): Promise<any> {
  const { product, contentType, count, trendPatterns, topVideos, userStyle } = params;

  // ── 1. 상품 매칭 ──
  const pLower = product.toLowerCase();
  const productKey = Object.keys(HUMAN_DESIRE_MAP).find(k => pLower.includes(k.toLowerCase()) || k.toLowerCase().includes(pLower)) || product;

  // ── 2. 인간 욕구 ──
  const desires = HUMAN_DESIRE_MAP[productKey] || ['choose_good_quality', 'avoid_regret', 'feed_family', 'not_miss_season'];
  const desirePrompt = desires.map(d => `- ${d}: ${DESIRE_LABEL[d] || d}`).join('\n');

  // ── 3. 고객 불안 ──
  const anxieties = ANXIETY_MAP[productKey] || ['bad_taste', 'different_from_photo', 'overpriced'];
  const anxietyPrompt = anxieties.map(a => `- ${a}: ${ANXIETY_LABEL[a] || a}\n  해소 방향: ${ANXIETY_RESOLVE[a] || '자연스럽게 해소'}`).join('\n');

  // ── 4. 구매 트리거 ──
  const triggers = TRIGGER_MAP[productKey] || ['seasonal_peak', 'direct_from_farm', 'repurchase'];
  const triggerPrompt = triggers.map(t => `- ${t}: ${TRIGGER_LABEL[t] || t}`).join('\n');

  // ── 5. 감각 데이터 ──
  const sensory = SENSORY_DB[productKey] || { texture: ['신선함'], aroma: ['자연의 향'], scene: ['가족 식탁'], timing: ['제철'], emotionalImages: ['자연에서 온 먹거리'] };
  const sensoryPrompt = `[농산물 감각 데이터: ${product}]
식감: ${sensory.texture.join(', ')}
향: ${sensory.aroma.join(', ')}
장면: ${sensory.scene.join(', ')}
타이밍: ${sensory.timing.join(', ')}
감정 이미지: ${sensory.emotionalImages.join(' / ')}`;

  // ── 6. 플랫폼 규칙 ──
  const platformRule = PLATFORM_RULES_DB[contentType] || PLATFORM_RULES_DB.headcopy;

  // ── 7. 골든타임 ──
  const goldenTime = GOLDEN_TIMES[contentType] || GOLDEN_TIMES.headcopy;

  // ── 8. 트렌드 패턴 ──
  const patternContext = trendPatterns.slice(0, 5).map((p, i) =>
    `패턴${i + 1}: [${p.hookType}] "${p.hookText}" — 감정: ${p.emotionTrigger}, 바이럴요인: ${p.viralFactor}, 감각어: ${p.sensoryKeywords.join('/')}, 점수: ${p.score}`
  ).join('\n');
  const videoContext = topVideos.slice(0, 3).map((v, i) =>
    `레퍼런스${i + 1}: "${v.title}" (${v.viewCountFormatted}회) — ${v.channelName}`
  ).join('\n');

  // ── 9. 콘텐츠 타입별 지시 ──
  const typeInstructions: Record<string, string> = {
    headcopy: `후킹 문구 ${count}개를 생성하세요. 각각 15자 이내, 스크롤을 멈추게 하는 강렬한 한 줄.`,
    threads_post: `스레드 글 ${count}개를 생성하세요. 각각 3~5문장, 줄바꿈 리듬, 공감+궁금증 유발, 댓글 유도.`,
    reels_script: `릴스 스크립트 ${count}개를 생성하세요. 각각 15초 분량: [0~3초] 후킹 → [3~10초] 장면/스토리 → [10~15초] CTA.`,
    youtube_thumbnail: `유튜브 썸네일 문구 ${count}개를 생성하세요. 각각 10자 이내, 클릭을 유도하는 강렬한 텍스트.`,
    instagram_copy: `인스타그램 캡션 ${count}개를 생성하세요. 각각 2~3문장, 감각 장면 중심, 해시태그 3~5개.`,
    full_package: `마케팅 패키지 ${count}개를 생성하세요. 각각: 헤드카피 + 썸네일 문구 + 릴스 스크립트(15초) + 스레드 글 + CTA.`,
  };
  const instruction = typeInstructions[contentType] || typeInstructions.headcopy;

  // ── 10. 스타일 학습 데이터 로드 (3초 타임아웃) ──
  let styleMemory = '';
  try {
    if (WORKSPACE_SHEET_ID && GOOGLE_SHEETS_CREDENTIALS) {
      const stylePromise = (async () => {
        const token = await getGoogleSheetsToken();
        const range = encodeURIComponent('StyleMemory!A:D');
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?majorDimension=ROWS`;
        const smRes: any = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (smRes.ok) {
          const smData = await smRes.json();
          const smRows = (smData.values || []).slice(-20);
          const approved = smRows.filter((r: string[]) => r[2] === 'approved').map((r: string[]) => r[1]).slice(-5);
          const rejected = smRows.filter((r: string[]) => r[2] === 'rejected').map((r: string[]) => r[1]).slice(-5);
          if (approved.length > 0 || rejected.length > 0) {
            styleMemory = `\n[mawinpay 스타일 학습 결과]
대표님이 선택한 카피: ${approved.join(' | ')}
대표님이 거절한 카피: ${rejected.join(' | ')}
→ 선택된 카피의 톤, 길이, 감각어 밀도를 더 반영하고, 거절된 카피 패턴은 피하세요.`;
          }
        }
      })();
      await Promise.race([stylePromise, new Promise<void>(r => setTimeout(r, 3000))]);
    }
  } catch {}

  // ── 11. A/B 테스트 설계 ──
  const abVariables = [
    { groupA: '감각형 후킹 (식감/향 강조)', groupB: '감정형 후킹 (추억/불안 강조)', testVariable: '후킹 유형' },
    { groupA: '짧은 카피 (3줄 이내)', groupB: '긴 카피 (5줄 이상)', testVariable: '카피 길이' },
    { groupA: '질문형 엔딩', groupB: '여운형 엔딩', testVariable: '엔딩 스타일' },
    { groupA: '제철 타이밍 강조', groupB: '품질/신뢰 강조', testVariable: '핵심 메시지' },
  ];
  const abTest = abVariables[Math.floor(Math.random() * abVariables.length)];

  // ═══ System Prompt ═══
  const systemPrompt = `당신은 "Mawin Agricultural Human Desire Copy Engine"입니다.
농산물/식품 바이럴 마케팅 전문 카피 엔진으로, 인간의 욕구와 불안을 깊이 이해하고 이를 카피에 반영합니다.

[핵심 원칙 — 절대 어기지 마세요]
1. 상품명만 보고 카피 쓰기 금지 — 반드시 인간 욕구 + 고객 불안 + 구매 트리거 + 감각 데이터를 기반으로 생성
2. 일반 광고문 자동 FAIL — "신선한 OOO를 만나보세요", "특별한 가격", "최고의 품질" 등 감지 시 즉시 재작성
3. 플랫폼별 문법 엄수 — 스레드≠블로그≠썸네일, 각각 완전히 다른 문법으로 작성
4. 광고 냄새가 나면 실패. 친구에게 카톡으로 말하듯, 자연스럽게.
5. 첫 문장 1.5초 안에 스크롤을 멈추게 해야 합니다.
6. 감각(맛, 향, 식감, 온도, 소리)을 글로 느끼게 해야 합니다.
7. 각 카피는 완전히 다른 각도/톤/구조로 쓰세요. 비슷한 카피 반복 금지.

[후킹 유형] sensory_hook/conflict_hook/confession_hook/seasonal_hook/contrarian_hook/local_trust_hook/memory_hook/limited_timing_hook/identity_hook/question_hook/surprise_hook — 각각 다른 유형 사용, 중복 금지

[문장 리듬] 짧은→긴→짧은, 줄바꿈 활용, 말줄임표(...)로 여운
[감각어] 맛(달콤/새콤/청량) 식감(아삭/터짐/즙이톡/쫀득) 향(달콤한/은은한/풀내음) 온도(차가운/시원한) 소리(아삭/톡/바삭)

[mawinpay 스타일]
- 친근하고 말하듯 툭 던지는 문장. 광고 같으면 실패.
- 강한 첫 문장. 첫 줄이 전부.
- 계절감과 식감을 살린 생생한 묘사
- 스토리텔링 (수확 현장, 농부 이야기, 산지 풍경)
- 댓글/DM 유도하는 마무리 ("나만 그런가?", "이거 아는 사람?")
- 여운 있는 끝맺음 (다 말하지 않기)
${userStyle ? `- 추가 스타일: ${userStyle}` : ''}
${styleMemory}

[FAIL 표현] "만나보세요"/"특별한 가격"/"신선하고 맛있는"/"최고의 품질"/"역대급"/"지금 바로 구매"/"많은 분들이"/"대박 할인" → 즉시 재작성
[금지] 허위 효능, 과장, 가격 스팸, 허위 재고, 매출 보장
[검증] 스크롤 멈춤? 카톡으로 보낼 법? 감각어 2개+? 다른 카피와 다른 각도?`;

  // ═══ User Prompt ═══
  const userPrompt = `[상품] ${product}
[콘텐츠 타입] ${contentType}

[인간 욕구 — 이 카피가 건드려야 할 욕구]
${desirePrompt}
→ 상위 2개 욕구를 핵심으로, 나머지는 보조로 활용하세요.

[고객 불안 — 이 카피가 해소해야 할 불안]
${anxietyPrompt}
→ 불안을 직접 겁주지 말고, 이해하고 해소하는 방향으로 녹이세요.

[구매 트리거]
${triggerPrompt}

${sensoryPrompt}

${platformRule}

[현재 트렌드 패턴 — 실제 반응 좋은 콘텐츠에서 추출]
${patternContext || '(수집된 패턴 없음 — 기본 농산물 바이럴 공식 적용)'}

[레퍼런스 영상 — 구조만 참고, 원문 복사 금지]
${videoContext || '(레퍼런스 없음)'}

[A/B 테스트 설계]
테스트 변수: ${abTest.testVariable}
Group A: ${abTest.groupA} / Group B: ${abTest.groupB}
→ 생성되는 카피 중 절반은 A 스타일, 절반은 B 스타일로 만드세요.

[생성 요청]
${instruction}

[댓글 예측]
각 카피에 대해 예상되는 댓글 3개를 생성하세요.
댓글이 많이 달릴수록 좋은 카피입니다.

[최적 발행 시간]
이 플랫폼의 골든타임: ${goldenTime.times.join(', ')} (${goldenTime.reason})
각 카피에 최적 발행 시간을 추천하세요.

[응답 형식 — 반드시 JSON]
{
  "copies": [
    {
      "id": "copy_1",
      "headline": "후킹 문구 (첫 줄)",
      "body": "전체 본문",
      "hookType": "사용한 후킹 유형",
      "emotionTrigger": "자극한 감정",
      "score": 85,
      "desires": ["not_miss_season", "feed_family"],
      "anxiety_resolved": "해소한 고객 불안 유형 (bad_taste 등)",
      "trigger_used": "활용한 구매 트리거 (seasonal_peak 등)",
      "sensory_hook": "사용한 핵심 감각 표현 한 줄",
      "sensory_words": ["사용한 감각 단어"],
      "why_this_works": "이 카피가 왜 터질 수 있는지 한 줄",
      "predicted_comments": ["예상 댓글 1", "예상 댓글 2", "예상 댓글 3"],
      "comment_engagement_score": 85,
      "best_posting_time": "21:30",
      "best_posting_reason": "잠자기 전 스크롤 시간대",
      "anti_boring_pass": true,
      "ab_group": "A 또는 B",
      "referenceNote": "어떤 트렌드를 참고했는지",
      "tags": ["#태그1", "#태그2"],
      "viralScore": 85,
      "sensoryLevel": "high|medium|low",
      "platformVersions": { "threads": "스레드 1줄 변환", "reels": "릴스 1줄 변환", "kakao": "카카오톡 1줄 변환" }
    }
  ]
}`;

  try {
    const res: any = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 3500,
        temperature: 0.88,
      }),
    });
    if (!res.ok) return { success: false, error: `GPT API error: ${res.status}` };
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { success: false, error: 'JSON parse failed', raw: content };
    const parsed = JSON.parse(jsonMatch[0]);
    // ═══ Anti-Boring Filter (인라인) ═══
    const BORING_RX: [RegExp, string, number][] = [
      [/제철\s*.{1,5}를?\s*지금\s*만나보세요/, '제철 OOO를 지금 만나보세요', 20],
      [/특별한\s*가격/, '특별한 가격', 20],
      [/신선하고\s*맛있는/, '신선하고 맛있는', 15],
      [/최고의\s*품질/, '최고의 품질', 20],
      [/지금\s*만나보세요/, '지금 만나보세요', 18],
      [/놓치지\s*마세요/, '놓치지 마세요', 15],
      [/역대급/, '역대급', 15],
      [/대박\s*할인/, '대박 할인', 15],
      [/건강에\s*좋/, '건강에 좋습니다', 20],
      [/지금\s*바로\s*구매/, '지금 바로 구매', 20],
      [/서두르세요/, '서두르세요', 12],
      [/최저가\s*보장/, '최저가 보장', 15],
      [/합리적인\s*가격/, '합리적인 가격', 15],
      [/프리미엄\s*품질/, '프리미엄 품질', 12],
      [/풍부한\s*영양/, '풍부한 영양', 12],
      [/다양한\s*혜택/, '다양한 혜택', 10],
      [/한\s*단계\s*업그레이드/, '한 단계 업그레이드', 10],
      [/달콤함을\s*놓치지/, '달콤함을 놓치지', 15],
      [/특별한\s*기회/, '특별한 기회', 15],
      [/만족\s*보장/, '만족 보장', 15],
      [/오늘만\s*특가/, '오늘만 특가', 12],
    ];
    function runBoringCheck(text: string): { score: number; reasons: string[]; pass: boolean } {
      let sc = 0; const reasons: string[] = [];
      for (const [rx, reason, w] of BORING_RX) { if (rx.test(text)) { sc += w; reasons.push(reason); } }
      // 구조적 지루함
      const sens = text.match(/달콤|아삭|쫀득|바삭|촉촉|향|과즙|터지|물씬|식감|시원한|쫄깃|고소한|새콤|톡톡/g);
      if (!sens || sens.length === 0) { sc += 10; reasons.push('감각 표현 없음'); }
      if (!/있잖아|솔직히|근데|사실|그래서|진짜|되게|완전/.test(text)) { sc += 8; reasons.push('구어체 없음'); }
      const lines = (text.match(/\n/g) || []).length;
      if (text.length > 50 && lines < 2) { sc += 8; reasons.push('줄바꿈 부족'); }
      return { score: Math.min(100, sc), reasons, pass: sc < 30 };
    }
    // ═══ Hook Score (인라인) ═══
    function calcHookScore(text: string): number {
      const first = text.split('\n')[0]?.trim() || '';
      let s = 50;
      if (first.length <= 7) s += 20;
      else if (first.length <= 15) s += 15;
      else if (first.length <= 25) s += 5;
      else s -= 10;
      if (/\?/.test(first)) s += 5;
      if (/있잖아|솔직히|근데|사실/.test(first)) s += 5;
      return Math.max(0, Math.min(100, s));
    }
    // ═══ Sensory Score (인라인) ═══
    function calcSensoryScore(text: string): number {
      let s = 40;
      const w = text.match(/달콤|아삭|쫀득|바삭|촉촉|향|과즙|터지|물씬|식감|시원한|쫄깃|고소한|새콤|톡톡|사각사각/g) || [];
      if (w.length >= 3) s += 30;
      else if (w.length >= 1) s += 15;
      else s -= 10;
      if (/열었|베어물|올려|삶|구워|갈랐|터지|흐르|퍼지|올라/.test(text)) s += 15;
      return Math.max(0, Math.min(100, s));
    }
    // ═══ 서버사이드 종합 점수 계산 ═══
    function serverJudge(text: string): { finalScore: number; boringScore: number; hookScore: number; sensoryScore: number; pass: boolean; boringReasons: string[] } {
      const boring = runBoringCheck(text);
      const hook = calcHookScore(text);
      const sensory = calcSensoryScore(text);
      const finalScore = Math.round(hook * 0.3 + sensory * 0.3 + (100 - boring.score) * 0.4);
      return { finalScore, boringScore: boring.score, hookScore: hook, sensoryScore: sensory, pass: boring.pass && finalScore >= 50, boringReasons: boring.reasons };
    }

    // GPT 응답 필드를 UI 필드명으로 매핑 + 서버사이드 품질 검증
    const mappedCopies = (parsed.copies || []).map((c: any, idx: number) => {
      const fullText = `${c.headline || ''}\n${c.body || ''}`;
      const judge = serverJudge(fullText);
      return {
        id: c.id || `copy_${idx + 1}`,
        headline: c.headline || '',
        body: c.body || '',
        hookType: c.hookType || 'unknown',
        emotionTrigger: c.emotionTrigger || '',
        // 서버사이드 검증 점수로 교체 (모델 자가 보고 무시)
        viralScore: judge.finalScore,
        score: judge.finalScore,
        sensoryLevel: judge.sensoryScore >= 70 ? 'high' : judge.sensoryScore >= 40 ? 'medium' : 'low',
        // Human Desire Engine 필드 매핑
        desires_used: c.desires_used || c.desires || [],
        anxiety_resolved: c.anxiety_resolved || c.anxiety || null,
        trigger_used: c.trigger_used || c.trigger || null,
        sensory_hook: c.sensory_hook || (c.sensory_words ? c.sensory_words.join(', ') : null),
        sensory_words: c.sensory_words || (c.sensory_hook ? [c.sensory_hook] : []),
        why_this_works: c.why_this_works || '',
        // 댓글 예측
        predicted_comments: c.predicted_comments || [],
        comment_engagement_score: c.comment_engagement_score || 70,
        // 골든타임
        best_posting_time: c.best_posting_time || goldenTime.times[0] || '20:00',
        best_posting_reason: c.best_posting_reason || goldenTime.reason || '',
        // Anti-Boring: 서버사이드 실제 검증 결과
        anti_boring_pass: judge.pass,
        anti_boring_score: judge.boringScore,
        anti_boring_reasons: judge.boringReasons,
        hook_score: judge.hookScore,
        sensory_score: judge.sensoryScore,
        ab_group: c.ab_group || (idx % 2 === 0 ? 'A' : 'B'),
        referenceNote: c.referenceNote || '',
        tags: c.tags || [],
        platformVersions: c.platformVersions || {},
      };
    })
    // 서버사이드 점수 기준으로 정렬 (높은 점수 우선)
    .sort((a: any, b: any) => b.score - a.score);
    return {
      success: true,
      copies: mappedCopies,
      metadata: {
        desires: desires.map(d => ({ type: d, label: DESIRE_LABEL[d] || d })),
        anxieties: anxieties.map(a => ({ type: a, label: ANXIETY_LABEL[a] || a })),
        triggers: triggers.map(t => ({ type: t, label: TRIGGER_LABEL[t] || t })),
        sensoryProfile: productKey,
        goldenTime,
        abTest,
      },
      raw: content,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ═══ 메인 핸들러 ═══
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { action, product, contentType, count, keywords, userStyle } = req.body || {};

    // ── Action: collect — 트렌드 수집 + 패턴 분석 + 저장 ──
    if (action === 'collect') {
      const searchKeywords = Array.isArray(keywords) ? keywords : [product || '농산물'];
      const videos = await collectTrendingVideos(product || '농산물', searchKeywords);
      const patterns = await analyzePatterns(product || '농산물', videos);
      const savedToSheets = await saveTrendToSheets(product || '농산물', patterns, videos);

      const result: TrendCollectionResult = {
        success: true,
        product: product || '농산물',
        videosCollected: videos.length,
        patternsExtracted: patterns.length,
        patterns,
        topVideos: videos.slice(0, 5),
        savedToSheets,
        collectedAt: new Date().toISOString(),
      };
      return res.status(200).json(result);
    }

        // ── Action: generate — 트렌드 기반 강화 카피 생성 ──
    if (action === 'generate') {
      const copyCount = Math.min(Number(count) || 10, 20);
      // 1. 저장된 트렌드 라이브러리 로드 (실패 시 빈 배열)
      let savedPatterns: TrendPattern[] = [];
      try {
        savedPatterns = await loadTrendLibrary(product || '농산물');
      } catch { savedPatterns = []; }
      // 2. 실시간 트렌드 수집 (저장된 게 부족하면, 15초 타임아웃)
      let livePatterns: TrendPattern[] = [];
      let liveVideos: TrendVideo[] = [];
      if (savedPatterns.length < 3) {
        try {
          const searchKeywords = Array.isArray(keywords) ? keywords : [product || '농산물'];
          // 8초 타임아웃으로 실시간 수집 시도 (전체 60초 내 완료 보장)
          const trendPromise = (async () => {
            liveVideos = await collectTrendingVideos(product || '농산물', searchKeywords);
            livePatterns = await analyzePatterns(product || '농산물', liveVideos);
          })();
          const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 8000));
          await Promise.race([trendPromise, timeoutPromise]);
          // 수집 성공 시 비동기 저장 (기다리지 않음)
          if (livePatterns.length > 0) {
            saveTrendToSheets(product || '농산물', livePatterns, liveVideos).catch(() => {});
          }
        } catch { /* 실시간 수집 실패 시 무시 — 카피 생성은 계속 */ }
      }

      const allPatterns = [...savedPatterns, ...livePatterns].slice(0, 8);
      const allVideos = liveVideos.length > 0 ? liveVideos : [];

      // 3. 강화 카피 생성
      const copyResult = await generateEnhancedCopy({
        product: product || '농산물',
        contentType: contentType || 'headcopy',
        count: copyCount,
        trendPatterns: allPatterns,
        topVideos: allVideos,
        userStyle,
      });

      return res.status(200).json({
        success: copyResult.success,
        product: product || '농산물',
        contentType: contentType || 'headcopy',
        copies: copyResult.copies || [],
        metadata: copyResult.metadata || null,
        trendPatternsUsed: allPatterns.length,
        videosReferenced: allVideos.length,
        error: copyResult.error,
      });
    }

    // ── Action: library — 저장된 트렌드 라이브러리 조회 ──
    if (action === 'library') {
      const patterns = await loadTrendLibrary(product || '농산물');
      return res.status(200).json({
        success: true,
        product: product || '농산물',
        patterns,
        count: patterns.length,
      });
    }

    // ── Action: save_feedback — 스타일 학습 피드백 저장 ──
    if (action === 'save_feedback') {
      const { headline, feedbackType } = req.body || {};
      try {
        if (WORKSPACE_SHEET_ID && GOOGLE_SHEETS_CREDENTIALS && headline) {
          const token = await getGoogleSheetsToken();
          const now = new Date().toISOString();
          const row = [[now, headline, feedbackType || 'unknown', product || '']];
          const range = encodeURIComponent('StyleMemory!A1');
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
          await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: row }),
          });
          return res.status(200).json({ success: true, saved: true });
        }
        return res.status(200).json({ success: true, saved: false, reason: 'no_sheets_config' });
      } catch (e: any) {
        return res.status(200).json({ success: false, error: e.message });
      }
    }

    return res.status(400).json({ error: `Unknown action: ${action}. Use "collect", "generate", "library", or "save_feedback".` });
  } catch (e: any) {
    console.error('[trend-collector] Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
