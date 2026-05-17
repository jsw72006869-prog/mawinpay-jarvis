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

// ═══ 강화된 카피 생성 (트렌드 라이브러리 활용) ═══
async function generateEnhancedCopy(params: {
  product: string;
  contentType: string;
  count: number;
  trendPatterns: TrendPattern[];
  topVideos: TrendVideo[];
  userStyle?: string;
}): Promise<any> {
  const { product, contentType, count, trendPatterns, topVideos, userStyle } = params;
  
  // 트렌드 패턴을 프롬프트에 주입
  const patternContext = trendPatterns.slice(0, 5).map((p, i) => 
    `패턴${i + 1}: [${p.hookType}] "${p.hookText}" — 감정: ${p.emotionTrigger}, 바이럴요인: ${p.viralFactor}, 감각어: ${p.sensoryKeywords.join('/')}, 점수: ${p.score}`
  ).join('\n');

  const videoContext = topVideos.slice(0, 3).map((v, i) =>
    `레퍼런스${i + 1}: "${v.title}" (${v.viewCountFormatted}회) — ${v.channelName}`
  ).join('\n');

  // 콘텐츠 타입별 지시
  const typeInstructions: Record<string, string> = {
    headcopy: `후킹 문구 ${count}개를 생성하세요. 각각 15자 이내, 스크롤을 멈추게 하는 강렬한 한 줄.`,
    threads_post: `스레드 글 ${count}개를 생성하세요. 각각 3~5문장, 줄바꿈 리듬, 공감+궁금증 유발, 댓글 유도.`,
    reels_script: `릴스 스크립트 ${count}개를 생성하세요. 각각 15초 분량: [0~3초] 후킹 → [3~10초] 장면/스토리 → [10~15초] CTA.`,
    youtube_thumbnail: `유튜브 썸네일 문구 ${count}개를 생성하세요. 각각 10자 이내, 클릭을 유도하는 강렬한 텍스트.`,
    instagram_copy: `인스타그램 캡션 ${count}개를 생성하세요. 각각 2~3문장, 감각 장면 중심, 해시태그 3~5개.`,
    full_package: `마케팅 패키지 ${count}개를 생성하세요. 각각: 헤드카피 + 썸네일 문구 + 릴스 스크립트(15초) + 스레드 글 + CTA.`,
  };

  const instruction = typeInstructions[contentType] || typeInstructions.headcopy;

  // 스타일 학습 데이터 로드 (localStorage에서 저장된 피드백)
  let styleMemory = '';
  try {
    // Sheets에서 스타일 학습 데이터 로드
    if (WORKSPACE_SHEET_ID && GOOGLE_SHEETS_CREDENTIALS) {
      const token = await getGoogleSheetsToken();
      const range = encodeURIComponent('StyleMemory!A:D');
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?majorDimension=ROWS`;
      const smRes: any = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (smRes.ok) {
        const smData = await smRes.json();
        const smRows = (smData.values || []).slice(-20); // 최근 20건
        const approved = smRows.filter((r: string[]) => r[2] === 'approved').map((r: string[]) => r[1]).slice(-5);
        const rejected = smRows.filter((r: string[]) => r[2] === 'rejected').map((r: string[]) => r[1]).slice(-5);
        if (approved.length > 0 || rejected.length > 0) {
          styleMemory = `\n[mawinpay 스타일 학습 결과]
대표님이 선택한 카피 예시: ${approved.join(' | ')}
대표님이 거절한 카피 예시: ${rejected.join(' | ')}
→ 선택된 카피의 톤, 길이, 감각어 밀도를 더 반영하고, 거절된 카피의 패턴은 피하세요.`;
        }
      }
    }
  } catch {} // 스타일 메모리 실패해도 카피 생성은 계속

  const systemPrompt = `당신은 "농산물 바이럴 카피 마스터"입니다.
대한민국 농산물/식품 분야에서 가장 반응이 좋은 카피를 쓰는 전문가입니다.
당신의 카피는 실제로 스레드/릴스/카카오톡에서 바이럴이 되어 수백 개의 댓글과 DM을 유도합니다.

[핵심 원칙 — 절대 어기지 마세요]
1. 광고 냄새가 나면 실패입니다. 친구에게 카톡으로 말하듯, 자연스럽게.
2. 첫 문장 1.5초 안에 스크롤을 멈추게 해야 합니다. 첫 문장이 전부입니다.
3. 감각(맛, 향, 식감, 온도, 소리)을 글로 느끼게 해야 합니다. 독자가 침을 삼키게.
4. 계절감, 수확 타이밍, 한정성을 자연스럽게 녹여내세요.
5. 댓글/DM/저장을 유도하는 여운을 남기세요. 끝을 다 말하지 마세요.
6. 과장 광고, 허위 효능, 매출 보장 표현은 절대 금지합니다.
7. 각 카피는 완전히 다른 각도/톤/구조로 쓰세요. 비슷한 카피 반복 금지.
8. 실제 사람이 쓰는 구어체, 말줄임표, 감탄사를 자연스럽게 사용하세요.

[후킹 유형별 마스터 템플릿]
- sensory_hook: 감각을 자극하는 문장으로 시작. "한 입 베는 순간, 즙이 턱 아래로 흐르는..."
- conflict_hook: 예상을 깨는 반전/갈등. "농부들이 절대 안 팔려고 하는 복숭아가 있다"
- confession_hook: 솔직한 고백/인정. "사실 나도 이거 먹기 전에는 복숭아 다 똑같은 줄 알았다"
- seasonal_hook: 계절/시기 긴박감. "지금 이 2주가 지나면 내년까지 못 먹는다"
- contrarian_hook: 통념 부수기. "마트에서 복숭아 사는 사람들이 모르는 것"
- local_trust_hook: 산지/농부 신뢰. "우리 아버지가 40년 키운 나무에서"
- memory_hook: 추억/감성 자극. "어릴 때 할머니 댓 뒤에서 따먹던 그 맛"
- limited_timing_hook: 한정/긴박. "오늘 수확한 거 내일까지만 받을 수 있음"
- identity_hook: 정체성/자부심. "이거 아는 사람만 사는 복숭아"
- question_hook: 질문으로 호기심. "복숭아 달기가 왜 해마다 다른지 아세요?"
- surprise_hook: 놀라운 사실. "이 복숭아 당도 24도인데 신맛이 나요"

[문장 리듬 법칙]
- 짧은 문장 → 긴 문장 → 짧은 문장 (호흡 리듬)
- 줄바꿈을 적극 활용 (스레드/릴스는 줄바꿈이 생명)
- 말줄임표(...)로 여운 남기기
- 감탄사는 아끼지 마세요 ("진짜", "실화", "레전드")

[감각어 마스터 클래스]
- 맛: 달콤/새콤/짭조름/청량/농밀/상큼함/꽀덕함
- 식감: 아삭/터짐/즙이 톡/물컹/사각/쪰덕/쏠득
- 향: 달콤한 향/은은한 향/풀내음/꽃향/수박 향
- 온도: 차가운/시원한/따뜻한/뜨거운/얼음장 같은
- 소리: 아삭/톡/쏠득/시원하게/바삭

[mawinpay 스타일]
- 친근하고 말하듯 툹 던지는 문장. 광고 같으면 실패.
- 강한 첫 문장으로 시작. 첫 줄이 전부.
- 계절감과 식감을 살린 생생한 묘사
- 스토리텔링 (수확 현장, 농부 이야기, 산지 풍경)
- 댓글/DM 유도하는 마무리 ("나만 그런가?", "이거 아는 사람?")
- 여운 있는 끝맺음 (다 말하지 않기)
${userStyle ? `- 추가 스타일 요청: ${userStyle}` : ''}
${styleMemory}

[금지 표현 — 이거 쓰면 실격]
- "최저가 보장", "효능 보장", "매출 보장", "성공 보장"
- "지금 안 사면 후회", "한정 수량 마감 임박" (과도한 공포)
- 가짜 리뷰처럼 꾸며 쓰기
- 근거 없는 건강 효능 주장
- "대박 할인", "무료 배송" 등 가격 중심 표현
- "많은 분들이", "화제의" 등 모호한 사회적 증거

[품질 자가 검증]
각 카피를 쓰고 나서 스스로 점검하세요:
✔ 첫 문장만 읽어도 스크롤을 멈추는가?
✔ 실제 사람이 카톡으로 보낼 법한 문장인가?
✔ 감각어가 2개 이상 들어갔는가?
✔ 다른 카피와 완전히 다른 각도인가?
✔ 금지 표현을 쓰지 않았는가?
통과 못하면 다시 쓰세요.`;

  const userPrompt = `[상품] ${product}
[콘텐츠 타입] ${contentType}

[현재 트렌드 패턴 — 실제 반응 좋은 콘텐츠에서 추출]
${patternContext || '(수집된 패턴 없음 — 기본 농산물 바이럴 공식 적용)'}

[레퍼런스 영상 — 구조만 참고, 원문 복사 금지]
${videoContext || '(레퍼런스 없음)'}

[생성 요청]
${instruction}

[응답 형식 — 반드시 JSON]
{
  "copies": [
    {
      "id": "copy_1",
      "headline": "후킹 문구 (첫 줄)",
      "body": "전체 본문",
      "hookType": "사용한 후킹 유형",
      "emotionTrigger": "자극한 감정",
      "referenceNote": "이 카피는 어떤 트렌드/레퍼런스를 참고했는지 1줄 설명",
      "tags": ["#태그1", "#태그2"],
      "viralScore": 85,
      "sensoryLevel": "high|medium|low",
      "platformVersions": {
        "threads": "스레드 버전 (있으면)",
        "reels": "릴스 버전 (있으면)",
        "kakao": "카카오톡 버전 (있으면)"
      }
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
        max_tokens: 4000,
        temperature: 0.85,
      }),
    });

    if (!res.ok) return { success: false, error: `GPT API error: ${res.status}` };
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { success: false, error: 'JSON parse failed', raw: content };
    
    const parsed = JSON.parse(jsonMatch[0]);
    return { success: true, copies: parsed.copies || [], raw: content };
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
      
      // 1. 저장된 트렌드 라이브러리 로드
      const savedPatterns = await loadTrendLibrary(product || '농산물');
      
      // 2. 실시간 트렌드도 수집 (저장된 게 부족하면)
      let livePatterns: TrendPattern[] = [];
      let liveVideos: TrendVideo[] = [];
      if (savedPatterns.length < 3) {
        const searchKeywords = Array.isArray(keywords) ? keywords : [product || '농산물'];
        liveVideos = await collectTrendingVideos(product || '농산물', searchKeywords);
        livePatterns = await analyzePatterns(product || '농산물', liveVideos);
        // 자동 저장
        await saveTrendToSheets(product || '농산물', livePatterns, liveVideos);
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
