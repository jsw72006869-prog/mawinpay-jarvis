import type { VercelRequest, VercelResponse } from '@vercel/node';

const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YT_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'YouTube API key not configured',
      message: 'YOUTUBE_API_KEY 환경변수를 Vercel에 설정해주세요.',
    });
  }

  const { keyword, maxResults = '10' } = req.query;
  if (!keyword) {
    return res.status(400).json({ error: 'keyword is required' });
  }

  const count = Math.min(Number(maxResults) || 10, 50);

  try {
    // Step 1: 채널 검색
    const searchUrl = `${YT_SEARCH_URL}?part=snippet&q=${encodeURIComponent(String(keyword))}&type=channel&maxResults=${count}&regionCode=KR&hl=ko&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error('[YouTube API] Search failed:', searchRes.status, errText);
      return res.status(searchRes.status).json({ error: 'YouTube search failed', details: errText });
    }
    const searchData = await searchRes.json() as YouTubeSearchResponse;
    const channelIds = (searchData.items || [])
      .map((item: any) => item.snippet?.channelId || item.id?.channelId)
      .filter(Boolean);

    if (channelIds.length === 0) {
      return res.status(200).json({ total: 0, keyword, items: [] });
    }

    // Step 2: 채널 상세 정보 (구독자 수, 설명, 이메일 등)
    const channelsUrl = `${YT_CHANNELS_URL}?part=snippet,statistics,brandingSettings&id=${channelIds.join(',')}&key=${apiKey}`;
    const channelsRes = await fetch(channelsUrl);
    if (!channelsRes.ok) {
      const errText = await channelsRes.text();
      console.error('[YouTube API] Channels failed:', channelsRes.status, errText);
      return res.status(channelsRes.status).json({ error: 'YouTube channels failed', details: errText });
    }
    const channelsData = await channelsRes.json() as YouTubeChannelsResponse;

    // Step 3: 결과 정제
    const items = (channelsData.items || []).map((ch: any) => {
      const stats = ch.statistics || {};
      const snippet = ch.snippet || {};
      const branding = ch.brandingSettings?.channel || {};
      const desc = snippet.description || '';
      const brandDesc = branding.description || '';
      const allText = desc + ' ' + brandDesc;

      // 이메일 추출
      const emailMatch = allText.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
      const email = emailMatch ? emailMatch[0] : '';

      // 소셜 미디어 추출
      const igMatch = allText.match(/(?:instagram\.com\/|@)([a-zA-Z0-9_.]+)/i);
      const instagram = igMatch ? igMatch[1] : '';

      return {
        channelId: ch.id,
        name: snippet.title || 'Unknown',
        description: (snippet.description || '').substring(0, 200),
        thumbnailUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
        subscribers: parseInt(stats.subscriberCount || '0', 10),
        videoCount: parseInt(stats.videoCount || '0', 10),
        viewCount: parseInt(stats.viewCount || '0', 10),
        profileUrl: `https://youtube.com/channel/${ch.id}`,
        email,
        instagram,
        country: snippet.country || '',
      };
    });

    return res.status(200).json({
      total: items.length,
      keyword,
      items,
    });
  } catch (error) {
    console.error('[YouTube API] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch from YouTube API',
      message: String(error),
    });
  }
}

interface YouTubeSearchResponse {
  items: any[];
  pageInfo: { totalResults: number; resultsPerPage: number };
}

interface YouTubeChannelsResponse {
  items: any[];
}
