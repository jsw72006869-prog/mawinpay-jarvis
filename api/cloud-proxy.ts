import type { VercelRequest, VercelResponse } from '@vercel/node';

const CLOUD_SERVER = process.env.CLOUD_SERVER_URL || 'http://35.243.215.119:3001';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// ── 이메일 + 소셜미디어 추출 (채널 설명 + branding 설명에서) ──
function extractContactInfo(description: string, brandDesc: string = '') {
  const allText = description + '\n' + brandDesc;

  // 이메일 추출 (비즈니스 이메일 우선)
  const emailMatches = allText.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
  const businessEmail = emailMatches.find(e =>
    !e.includes('example.com') && !e.includes('noreply') && !e.includes('no-reply')
  ) || '';

  // Instagram
  const igMatch = allText.match(/(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9_.]+)/i);
  const instagram = igMatch ? igMatch[1].replace(/\/$/, '') : '';

  return { email: businessEmail, instagram };
}

// ── 카테고리별 키워드 확장 ──
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '맛집': ['맛집 리뷰', '먹방 유튜버', '맛집 추천'],
  '먹방': ['먹방', '먹방 유튜버', '대식가'],
  '농산물': ['농산물 리뷰', '농가 유튜버', '로컬푸드 리뷰'],
  '캠핑': ['캠핑 유튜버', '차박 브이로그'],
  '뷰티': ['뷰티 유튜버', '화장품 리뷰', '메이크업 튜토리얼'],
  '여행': ['여행 브이로그', '여행 유튜버'],
  '패션': ['패션 유튜버', '코디 추천'],
  '운동': ['운동 유튜버', '홈트레이닝', '피트니스'],
};

// ── YouTube Data API v3 채널 검색 (이메일 추출 + brandingSettings 포함) ──
async function searchYouTubeDirect(keyword: string, maxResults: number = 10) {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  // 카테고리 키워드 확장
  const keywords = CATEGORY_KEYWORDS[keyword] || [keyword];
  const count = Math.min(maxResults, 50);
  const allResults: any[] = [];

  for (const kw of keywords) {
    if (allResults.length >= count) break;

    // 1단계: 채널 검색
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(kw)}&maxResults=50&regionCode=KR&hl=ko&key=${YOUTUBE_API_KEY}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) continue;
    const searchData = await searchRes.json();

    if (!searchData.items || searchData.items.length === 0) continue;

    // 2단계: 채널 상세 정보 (brandingSettings 포함 → 이메일 추출 가능)
    const channelIds = searchData.items.map((item: any) => item.snippet.channelId || item.id.channelId).join(',');
    const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channelIds}&key=${YOUTUBE_API_KEY}`;
    const channelsRes = await fetch(channelsUrl);
    if (!channelsRes.ok) continue;
    const channelsData = await channelsRes.json();

    // 3단계: 결과 포맷팅 + 이메일 추출
    for (const ch of (channelsData.items || [])) {
      if (allResults.length >= count) break;

      const snippet = ch.snippet || {};
      const stats = ch.statistics || {};
      const branding = ch.brandingSettings?.channel || {};
      const subs = parseInt(stats.subscriberCount || '0', 10);
      const views = parseInt(stats.viewCount || '0', 10);
      const videos = parseInt(stats.videoCount || '1', 10);
      const avgViews = videos > 0 ? Math.round(views / videos) : 0;

      // 이메일 + 인스타 추출 (snippet.description + branding.description)
      const contact = extractContactInfo(snippet.description || '', branding.description || '');

      allResults.push({
        channelId: ch.id,
        title: snippet.title,
        description: (snippet.description || '').substring(0, 300),
        customUrl: snippet.customUrl || '',
        thumbnailUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
        subscriberCount: subs,
        subscriberFormatted: formatNumber(subs),
        videoCount: videos,
        viewCount: views,
        avgViews,
        channelUrl: `https://www.youtube.com/channel/${ch.id}`,
        email: contact.email,
        instagram: contact.instagram,
        category: keyword,
        source: 'YouTube Data API v3',
      });
    }
  }

  return { success: true, result: allResults };
}

// ── YouTube 인기 영상 검색 + 바이럴 분석 ──
async function searchPopularVideos(keyword: string, maxResults: number = 5, period: string = '') {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  // 기간 필터
  let publishedAfter = '';
  if (period === 'day') publishedAfter = new Date(Date.now() - 86400000).toISOString();
  else if (period === 'week') publishedAfter = new Date(Date.now() - 7 * 86400000).toISOString();
  else if (period === 'month') publishedAfter = new Date(Date.now() - 30 * 86400000).toISOString();
  else if (period === 'year') publishedAfter = new Date(Date.now() - 365 * 86400000).toISOString();

  const count = Math.min(maxResults, 20);
  let searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(keyword)}&order=viewCount&maxResults=${count}&regionCode=KR&hl=ko&key=${YOUTUBE_API_KEY}`;
  if (publishedAfter) searchUrl += `&publishedAfter=${publishedAfter}`;

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) throw new Error(`YouTube Search API 오류: ${searchRes.status}`);
  const searchData = await searchRes.json();

  if (!searchData.items || searchData.items.length === 0) {
    return { success: true, videos: [], analysis: '', summary: '검색 결과가 없습니다.' };
  }

  // 영상 상세 정보
  const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');
  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
  const videosRes = await fetch(videosUrl);
  if (!videosRes.ok) throw new Error(`YouTube Videos API 오류: ${videosRes.status}`);
  const videosData = await videosRes.json();

  const videos = (videosData.items || []).map((v: any) => {
    const stats = v.statistics || {};
    const viewCount = parseInt(stats.viewCount || '0', 10);
    const likeCount = parseInt(stats.likeCount || '0', 10);
    const commentCount = parseInt(stats.commentCount || '0', 10);
    return {
      videoId: v.id,
      title: v.snippet.title,
      channelName: v.snippet.channelTitle,
      channelId: v.snippet.channelId,
      description: (v.snippet.description || '').substring(0, 200),
      publishedAt: v.snippet.publishedAt,
      publishedAgo: getRelativeTime(v.snippet.publishedAt),
      viewCount,
      viewCountFormatted: formatNumber(viewCount),
      likeCount,
      commentCount,
      engagementRate: viewCount > 0 ? ((likeCount + commentCount) / viewCount * 100).toFixed(2) + '%' : '0%',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnailUrl: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url || '',
    };
  });

  // GPT로 바이럴 분석
  let analysis = '';
  if (OPENAI_API_KEY && videos.length > 0) {
    try {
      const videoSummary = videos.slice(0, 5).map((v: any, i: number) =>
        `${i + 1}. "${v.title}" (${v.channelName}) - 조회수: ${v.viewCountFormatted}, 좋아요: ${v.likeCount.toLocaleString()}, 댓글: ${v.commentCount.toLocaleString()}, 참여율: ${v.engagementRate}, 게시: ${v.publishedAgo}`
      ).join('\n');

      const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [{
            role: 'system',
            content: '당신은 유튜브 트렌드 분석 전문가입니다. 한국어로 답변하세요.'
          }, {
            role: 'user',
            content: `다음 "${keyword}" 관련 인기 영상들을 분석해주세요:\n\n${videoSummary}\n\n다음 항목을 분석해주세요:\n1. **바이럴 이유**: 각 영상이 왜 인기를 끌었는지 (제목, 썸네일 전략, 시의성, 감정 자극 등)\n2. **공통 성공 요인**: 이 영상들의 공통된 성공 패턴\n3. **트렌드 방향**: 이 키워드의 현재 트렌드 방향성\n4. **비즈니스 활용**: 마케팅이나 사업에 어떻게 활용할 수 있는지\n5. **추천 전략**: 유사한 인기 콘텐츠를 만들기 위한 전략\n\n간결하고 실용적으로 분석해주세요.`
          }],
          max_tokens: 1500,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (gptRes.ok) {
        const gptData = await gptRes.json();
        analysis = gptData.choices?.[0]?.message?.content || '';
      }
    } catch (e: any) {
      console.error('[cloud-proxy] GPT 분석 오류:', e.message);
    }
  }

  const summary = `"${keyword}" 관련 인기 영상 ${videos.length}건을 찾았습니다.`;

  return {
    success: true,
    videos,
    analysis,
    summary,
    logs: [
      { step: 1, status: 'done', message: `"${keyword}" 인기 영상 ${videos.length}건 수집 완료` },
      { step: 2, status: analysis ? 'done' : 'skip', message: analysis ? 'AI 바이럴 분석 완료' : 'AI 분석 건너뜀' },
    ],
  };
}

function formatNumber(num: number): string {
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}억`;
  if (num >= 10000) return `${(num / 10000).toFixed(1)}만`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}천`;
  return num.toString();
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return '방금 전';
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const endpoint = req.query.endpoint as string || 'status';

      // ── YouTube 인기 영상 분석 (GET) ──
      if (endpoint === 'youtube-analyze') {
        const keyword = String(req.query.keyword || '');
        const count = Number(req.query.count) || 5;
        const period = String(req.query.period || '');
        if (!keyword) return res.status(400).json({ error: 'keyword is required' });
        const result = await searchPopularVideos(keyword, count, period);
        return res.status(200).json(result);
      }

      // ── YouTube 트렌딩 (GET) ──
      if (endpoint === 'youtube-trending') {
        const action = String(req.query.action || 'trending');
        const keyword = String(req.query.keyword || req.query.channelName || '');
        const count = Number(req.query.maxResults) || 5;
        // 트렌딩은 인기 영상 검색으로 대체
        const searchKeyword = action === 'trending' ? '한국 인기' : keyword;
        const result = await searchPopularVideos(searchKeyword, count);
        return res.status(200).json(result);
      }

      // ── 기타 GET 요청 → 클라우드 서버 프록시 ──
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(req.query)) {
        if (key !== 'endpoint' && value) {
          queryParams.set(key, String(value));
        }
      }
      const qs = queryParams.toString();
      const url = `${CLOUD_SERVER}/api/${endpoint}${qs ? `?${qs}` : ''}`;
      
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000)
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: `Cloud server returned ${response.status}` });
      }
      
      const data = await response.json();
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { endpoint, taskType, params, ...rest } = req.body;

      // ── YouTube 채널 검색 (이메일 추출 포함) ──
      if (taskType === 'youtube-search') {
        console.log('[cloud-proxy] YouTube 직접 검색 (이메일 추출 포함):', params?.keyword, params?.maxResults);
        const result = await searchYouTubeDirect(
          params?.keyword || '',
          params?.maxResults || 10
        );
        return res.status(200).json(result);
      }

      // ── YouTube 인기 영상 분석 (POST) ──
      if (taskType === 'youtube-viral') {
        console.log('[cloud-proxy] YouTube 인기 영상 분석:', params?.keyword);
        const result = await searchPopularVideos(
          params?.keyword || '',
          params?.count || 5,
          params?.period || ''
        );
        return res.status(200).json(result);
      }

      // ── 그 외 작업은 클라우드 서버로 프록시 ──
      const url = `${CLOUD_SERVER}/api/${endpoint || 'task'}`;
      const body = taskType 
        ? JSON.stringify({ taskType, params })
        : JSON.stringify({ ...params, ...rest });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(55000)
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: `Cloud server returned ${response.status}` });
      }
      
      const data = await response.json();
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[cloud-proxy] Error:', error.message);
    return res.status(503).json({ 
      error: 'Cloud server unavailable',
      message: error.message 
    });
  }
}
