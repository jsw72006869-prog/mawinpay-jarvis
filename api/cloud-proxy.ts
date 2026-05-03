import type { VercelRequest, VercelResponse } from '@vercel/node';

const CLOUD_SERVER = process.env.CLOUD_SERVER_URL || 'http://35.243.215.119:3001';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

// ── YouTube Data API v3 직접 검색 (클라우드 서버 의존 제거) ──
async function searchYouTubeDirect(keyword: string, maxResults: number = 10) {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  // 1단계: 채널 검색
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(keyword)}&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(`YouTube Search API 오류: ${searchRes.status} - ${JSON.stringify(err)}`);
  }
  const searchData = await searchRes.json();

  if (!searchData.items || searchData.items.length === 0) {
    return { success: true, result: [] };
  }

  // 2단계: 채널 상세 정보 (구독자 수, 영상 수 등)
  const channelIds = searchData.items.map((item: any) => item.snippet.channelId || item.id.channelId).join(',');
  const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds}&key=${YOUTUBE_API_KEY}`;
  const channelsRes = await fetch(channelsUrl);
  if (!channelsRes.ok) {
    const err = await channelsRes.json().catch(() => ({}));
    throw new Error(`YouTube Channels API 오류: ${channelsRes.status} - ${JSON.stringify(err)}`);
  }
  const channelsData = await channelsRes.json();

  // 3단계: 결과 포맷팅
  const results = (channelsData.items || []).map((ch: any) => ({
    channelId: ch.id,
    title: ch.snippet.title,
    description: ch.snippet.description,
    customUrl: ch.snippet.customUrl || '',
    thumbnailUrl: ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url || '',
    subscriberCount: parseInt(ch.statistics.subscriberCount || '0', 10),
    subscriberFormatted: formatNumber(parseInt(ch.statistics.subscriberCount || '0', 10)),
    videoCount: parseInt(ch.statistics.videoCount || '0', 10),
    viewCount: parseInt(ch.statistics.viewCount || '0', 10),
    channelUrl: `https://www.youtube.com/channel/${ch.id}`,
    source: 'YouTube Data API v3',
  }));

  return { success: true, result: results };
}

function formatNumber(num: number): string {
  if (num >= 10000) return `${(num / 10000).toFixed(1)}만`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}천`;
  return num.toString();
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
      // GET: 상태 조회, 히스토리, 또는 범용 API 전달
      const endpoint = req.query.endpoint as string || 'status';
      
      // Instagram 검색도 Vercel에서 직접 처리할 수 있도록 확장 가능
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

      // ── YouTube 검색은 Vercel에서 직접 처리 (클라우드 서버 의존 제거) ──
      if (taskType === 'youtube-search') {
        console.log('[cloud-proxy] YouTube 직접 검색:', params?.keyword, params?.maxResults);
        const result = await searchYouTubeDirect(
          params?.keyword || '',
          params?.maxResults || 10
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
