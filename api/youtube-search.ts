import type { VercelRequest, VercelResponse } from '@vercel/node';

const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YT_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';

// ── 앱 방식: 채널 설명에서 소셜미디어 + 이메일 추출 ──
function extractSocialMedia(description: string, brandDesc = '') {
  const allText = description + '\n' + brandDesc;

  // Instagram 패턴 (앱 routers.ts 방식 이식)
  const igPatterns = [
    /(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9_.]+)/gi,
    /(?:^|\s)(?:IG|Instagram|인스타(?:그램)?)\s*[:\-@]?\s*@?([a-zA-Z0-9_.]{2,30})/gi,
  ];
  let instagram = '';
  for (const p of igPatterns) {
    const m = p.exec(allText);
    if (m && m[1] && !['p','reel','reels','stories','explore','accounts','about','developer','legal'].includes(m[1].toLowerCase())) {
      instagram = m[1].replace(/\/$/, '');
      break;
    }
  }

  // TikTok 패턴
  const tkPatterns = [
    /tiktok\.com\/@([a-zA-Z0-9_.]+)/gi,
    /(?:TikTok|틱톡)\s*[:\-@]?\s*@?([a-zA-Z0-9_.]{2,30})/gi,
  ];
  let tiktok = '';
  for (const p of tkPatterns) {
    const m = p.exec(allText);
    if (m && m[1]) { tiktok = m[1].replace(/\/$/, ''); break; }
  }

  // 이메일 추출 (비즈니스 이메일 우선)
  const emailMatches = allText.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
  // 가짜 도메인 제외, 비즈니스 이메일 우선
  const businessEmail = emailMatches.find(e =>
    !e.includes('example.com') &&
    !e.includes('noreply') &&
    !e.includes('no-reply')
  ) || '';

  // 웹사이트 (소셜 제외)
  const urlMatch = allText.match(/https?:\/\/(?!(?:www\.)?(?:instagram|tiktok|twitter|x|youtube|facebook|threads|naver|blog)\.)[^\s"'<>]+/);
  const website = urlMatch ? urlMatch[0] : '';

  return { instagram, tiktok, email: businessEmail, website };
}

// ── 인스타그램 계정 Google 검색으로 찾기 ──
async function searchInstagramViaGoogle(creatorName: string): Promise<string> {
  try {
    const query = `${creatorName} site:instagram.com`;
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=5`;
    const res = await fetch(googleUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    // instagram.com/username 패턴 추출
    const matches = html.match(/instagram\.com\/([a-zA-Z0-9_.]{2,30})/g) || [];
    const reserved = ['p','reel','reels','stories','explore','accounts','about','developer','legal','_n','_u'];
    for (const m of matches) {
      const username = m.replace('instagram.com/', '').replace(/\/$/, '');
      if (!reserved.includes(username.toLowerCase()) && username.length >= 2) {
        return username;
      }
    }
    return '';
  } catch {
    return '';
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  const { keyword, maxResults = '10', category = '' } = req.query;
  if (!keyword) return res.status(400).json({ error: 'keyword is required' });

  // 카테고리별 키워드 확장 (앱 방식)
  const CATEGORY_KEYWORDS: Record<string, string[]> = {
    '맛집': ['맛집 리뷰', '먹방', '맛집 추천', '음식 리뷰'],
    '먹방': ['먹방', '먹방 유튜버', '대식가', '먹방 채널'],
    '캠핑': ['캠핑 유튜버', '캠핑 장비 리뷰', '차박', '백패킹'],
    '정보': ['정보 유튜버', '지식 채널', '교육 유튜버', '꿀팁'],
    '뷰티': ['뷰티 유튜버', '화장품 리뷰', '메이크업 튜토리얼'],
    '여행': ['여행 브이로그', '여행 유튜버', '해외여행'],
    '패션': ['패션 유튜버', '코디 추천', '패션 하울'],
    '운동': ['운동 유튜버', '홈트레이닝', '피트니스'],
  };

  const cat = String(category || keyword);
  const keywords = CATEGORY_KEYWORDS[cat] || [String(keyword)];
  const count = Math.min(Number(maxResults) || 10, 50);

  try {
    const allItems: any[] = [];

    for (const kw of keywords) {
      if (allItems.length >= count) break;

      // Step 1: 채널 검색
      const searchUrl = `${YT_SEARCH_URL}?part=snippet&q=${encodeURIComponent(kw)}&type=channel&maxResults=50&regionCode=KR&hl=ko&key=${apiKey}`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json() as any;
      const channelIds = (searchData.items || [])
        .map((item: any) => item?.snippet?.channelId || item?.id?.channelId)
        .filter(Boolean);
      if (channelIds.length === 0) continue;

      // Step 2: 채널 상세 정보
      const channelsUrl = `${YT_CHANNELS_URL}?part=snippet,statistics,brandingSettings&id=${channelIds.join(',')}&key=${apiKey}`;
      const channelsRes = await fetch(channelsUrl);
      if (!channelsRes.ok) continue;
      const channelsData = await channelsRes.json() as any;

      for (const ch of (channelsData.items || [])) {
        if (allItems.length >= count) break;

        const stats = ch.statistics || {};
        const snippet = ch.snippet || {};
        const branding = ch.brandingSettings?.channel || {};
        const desc = snippet.description || '';
        const brandDesc = branding.description || '';

        // 소셜미디어 + 이메일 추출 (앱 방식)
        let social = extractSocialMedia(desc, brandDesc);

        // 인스타그램 없으면 Google 검색으로 찾기 (앱 방식 폴백)
        if (!social.instagram && snippet.title) {
          social.instagram = await searchInstagramViaGoogle(snippet.title);
        }

        const subs = parseInt(stats.subscriberCount || '0', 10);
        const views = parseInt(stats.viewCount || '0', 10);
        const videos = parseInt(stats.videoCount || '1', 10);
        const avgViews = videos > 0 ? Math.round(views / videos) : 0;

        // 구독자 수 포맷
        const subsFormatted = subs >= 1000000
          ? `${(subs / 1000000).toFixed(1)}M`
          : subs >= 10000
          ? `${(subs / 10000).toFixed(1)}만`
          : subs >= 1000
          ? `${(subs / 1000).toFixed(1)}K`
          : String(subs);

        allItems.push({
          channelId: ch.id,
          name: snippet.title || 'Unknown',
          description: desc.substring(0, 300),
          thumbnailUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
          subscribers: subs,
          subscribersFormatted: subsFormatted,
          videoCount: videos,
          viewCount: views,
          avgViews,
          profileUrl: `https://youtube.com/channel/${ch.id}`,
          customUrl: snippet.customUrl ? `https://youtube.com/@${snippet.customUrl.replace('@', '')}` : `https://youtube.com/channel/${ch.id}`,
          email: social.email,
          instagram: social.instagram ? `https://instagram.com/${social.instagram}` : '',
          instagramUsername: social.instagram,
          tiktok: social.tiktok ? `https://tiktok.com/@${social.tiktok}` : '',
          website: social.website,
          country: snippet.country || 'KR',
          category: cat,
        });
      }
    }

    return res.status(200).json({
      total: allItems.length,
      keyword,
      category: cat,
      items: allItems,
    });
  } catch (error) {
    console.error('[YouTube API] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch from YouTube API', message: String(error) });
  }
}
