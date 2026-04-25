// youtube-trending.js
// YouTube 인기 영상 추천 API - 트렌딩, 키워드별 인기, 채널별 인기 영상 조회
// YouTube Data API v3 사용

const YT_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YT_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';

// ── 유튜브 카테고리 ID (한국 기준) ──
const CATEGORY_MAP = {
  '전체': '',
  '음악': '10',
  '게임': '20',
  '뉴스': '25',
  '엔터테인먼트': '24',
  '스포츠': '17',
  '교육': '27',
  '과학기술': '28',
  '여행': '19',
  '음식': '26', // Howto & Style에 음식 포함
  '뷰티': '26',
  '자동차': '2',
  '동물': '15',
  '코미디': '23',
  '영화': '1',
  '일상': '22', // People & Blogs
};

// ── 조회수 포맷팅 ──
function formatViews(count) {
  if (count >= 100000000) return `${(count / 100000000).toFixed(1)}억회`;
  if (count >= 10000) return `${(count / 10000).toFixed(1)}만회`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}천회`;
  return `${count}회`;
}

// ── 기간 포맷팅 ──
function formatDuration(iso8601) {
  if (!iso8601) return '';
  const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';
  const h = match[1] ? `${match[1]}:` : '';
  const m = match[2] ? match[2].padStart(h ? 2 : 1, '0') : '0';
  const s = match[3] ? match[3].padStart(2, '0') : '00';
  return `${h}${m}:${s}`;
}

// ── 상대 시간 포맷팅 ──
function timeAgo(dateStr) {
  const now = new Date();
  const published = new Date(dateStr);
  const diffMs = now - published;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  if (diffWeek < 5) return `${diffWeek}주 전`;
  if (diffMonth < 12) return `${diffMonth}개월 전`;
  return `${diffYear}년 전`;
}

// ── 1. 한국 트렌딩 영상 조회 (mostPopular) ──
async function getTrending(apiKey, { category = '', maxResults = 5 } = {}) {
  const params = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    chart: 'mostPopular',
    regionCode: 'KR',
    hl: 'ko',
    maxResults: String(Math.min(maxResults, 50)),
    key: apiKey,
  });
  if (category && CATEGORY_MAP[category]) {
    params.set('videoCategoryId', CATEGORY_MAP[category]);
  }

  const res = await fetch(`${YT_VIDEOS_URL}?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`YouTube API 오류: ${res.status} - ${err.error?.message || '알 수 없는 오류'}`);
  }
  const data = await res.json();

  return (data.items || []).map((item, idx) => ({
    rank: idx + 1,
    videoId: item.id,
    title: item.snippet.title,
    channelName: item.snippet.channelTitle,
    channelId: item.snippet.channelId,
    thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
    publishedAt: item.snippet.publishedAt,
    publishedAgo: timeAgo(item.snippet.publishedAt),
    duration: formatDuration(item.contentDetails?.duration || ''),
    viewCount: parseInt(item.statistics?.viewCount || '0', 10),
    viewCountFormatted: formatViews(parseInt(item.statistics?.viewCount || '0', 10)),
    likeCount: parseInt(item.statistics?.likeCount || '0', 10),
    commentCount: parseInt(item.statistics?.commentCount || '0', 10),
    url: `https://www.youtube.com/watch?v=${item.id}`,
    category: item.snippet.categoryId || '',
    tags: (item.snippet.tags || []).slice(0, 5),
  }));
}

// ── 2. 키워드 기반 인기 영상 검색 (조회수순) ──
async function searchPopularByKeyword(apiKey, { keyword, maxResults = 5, publishedAfter = '' } = {}) {
  if (!keyword) throw new Error('키워드를 입력해주세요.');

  // Step 1: 조회수순으로 영상 검색
  const searchParams = new URLSearchParams({
    part: 'snippet',
    q: keyword,
    type: 'video',
    order: 'viewCount',
    regionCode: 'KR',
    hl: 'ko',
    maxResults: String(Math.min(maxResults, 50)),
    key: apiKey,
  });

  // 기간 필터 (최근 1주, 1달, 1년 등)
  if (publishedAfter) {
    searchParams.set('publishedAfter', publishedAfter);
  }

  const searchRes = await fetch(`${YT_SEARCH_URL}?${searchParams}`);
  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(`YouTube Search API 오류: ${searchRes.status} - ${err.error?.message || '알 수 없는 오류'}`);
  }
  const searchData = await searchRes.json();
  const videoIds = (searchData.items || []).map(i => i.id.videoId).filter(Boolean);

  if (videoIds.length === 0) return [];

  // Step 2: 영상 상세 정보 조회 (조회수, 좋아요, 댓글 수 등)
  const detailParams = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(','),
    hl: 'ko',
    key: apiKey,
  });

  const detailRes = await fetch(`${YT_VIDEOS_URL}?${detailParams}`);
  if (!detailRes.ok) {
    const err = await detailRes.json().catch(() => ({}));
    throw new Error(`YouTube Videos API 오류: ${detailRes.status} - ${err.error?.message || '알 수 없는 오류'}`);
  }
  const detailData = await detailRes.json();

  return (detailData.items || [])
    .map((item, idx) => ({
      rank: idx + 1,
      videoId: item.id,
      title: item.snippet.title,
      channelName: item.snippet.channelTitle,
      channelId: item.snippet.channelId,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
      publishedAt: item.snippet.publishedAt,
      publishedAgo: timeAgo(item.snippet.publishedAt),
      duration: formatDuration(item.contentDetails?.duration || ''),
      viewCount: parseInt(item.statistics?.viewCount || '0', 10),
      viewCountFormatted: formatViews(parseInt(item.statistics?.viewCount || '0', 10)),
      likeCount: parseInt(item.statistics?.likeCount || '0', 10),
      commentCount: parseInt(item.statistics?.commentCount || '0', 10),
      url: `https://www.youtube.com/watch?v=${item.id}`,
      tags: (item.snippet.tags || []).slice(0, 5),
      description: (item.snippet.description || '').slice(0, 200),
    }))
    .sort((a, b) => b.viewCount - a.viewCount);
}

// ── 3. 특정 채널의 인기 영상 조회 ──
async function getChannelPopularVideos(apiKey, { channelId, channelName, maxResults = 5 } = {}) {
  // 채널명으로 검색하여 channelId 찾기
  let resolvedChannelId = channelId;
  if (!resolvedChannelId && channelName) {
    const chSearchParams = new URLSearchParams({
      part: 'snippet',
      q: channelName,
      type: 'channel',
      maxResults: '1',
      regionCode: 'KR',
      hl: 'ko',
      key: apiKey,
    });
    const chRes = await fetch(`${YT_SEARCH_URL}?${chSearchParams}`);
    if (chRes.ok) {
      const chData = await chRes.json();
      if (chData.items?.length > 0) {
        resolvedChannelId = chData.items[0].id.channelId;
      }
    }
  }

  if (!resolvedChannelId) throw new Error('채널을 찾을 수 없습니다.');

  // 채널 정보 조회
  const chInfoParams = new URLSearchParams({
    part: 'snippet,statistics',
    id: resolvedChannelId,
    hl: 'ko',
    key: apiKey,
  });
  const chInfoRes = await fetch(`${YT_CHANNELS_URL}?${chInfoParams}`);
  let channelInfo = {};
  if (chInfoRes.ok) {
    const chInfoData = await chInfoRes.json();
    if (chInfoData.items?.length > 0) {
      const ch = chInfoData.items[0];
      channelInfo = {
        channelId: resolvedChannelId,
        channelName: ch.snippet.title,
        subscribers: parseInt(ch.statistics.subscriberCount || '0', 10),
        totalViews: parseInt(ch.statistics.viewCount || '0', 10),
        videoCount: parseInt(ch.statistics.videoCount || '0', 10),
        thumbnail: ch.snippet.thumbnails?.high?.url || '',
      };
    }
  }

  // 채널의 영상을 조회수순으로 검색
  const searchParams = new URLSearchParams({
    part: 'snippet',
    channelId: resolvedChannelId,
    type: 'video',
    order: 'viewCount',
    maxResults: String(Math.min(maxResults, 50)),
    hl: 'ko',
    key: apiKey,
  });

  const searchRes = await fetch(`${YT_SEARCH_URL}?${searchParams}`);
  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(`YouTube Search API 오류: ${searchRes.status} - ${err.error?.message || '알 수 없는 오류'}`);
  }
  const searchData = await searchRes.json();
  const videoIds = (searchData.items || []).map(i => i.id.videoId).filter(Boolean);

  if (videoIds.length === 0) return { channel: channelInfo, videos: [] };

  // 영상 상세 정보
  const detailParams = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(','),
    hl: 'ko',
    key: apiKey,
  });
  const detailRes = await fetch(`${YT_VIDEOS_URL}?${detailParams}`);
  const detailData = detailRes.ok ? await detailRes.json() : { items: [] };

  const videos = (detailData.items || [])
    .map((item, idx) => ({
      rank: idx + 1,
      videoId: item.id,
      title: item.snippet.title,
      channelName: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
      publishedAt: item.snippet.publishedAt,
      publishedAgo: timeAgo(item.snippet.publishedAt),
      duration: formatDuration(item.contentDetails?.duration || ''),
      viewCount: parseInt(item.statistics?.viewCount || '0', 10),
      viewCountFormatted: formatViews(parseInt(item.statistics?.viewCount || '0', 10)),
      likeCount: parseInt(item.statistics?.likeCount || '0', 10),
      commentCount: parseInt(item.statistics?.commentCount || '0', 10),
      url: `https://www.youtube.com/watch?v=${item.id}`,
      tags: (item.snippet.tags || []).slice(0, 5),
    }))
    .sort((a, b) => b.viewCount - a.viewCount);

  return { channel: channelInfo, videos };
}

// ── Vercel 서버리스 핸들러 ──
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.',
      });
    }

    // GET 또는 POST 파라미터 파싱
    const params = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    const action = params.action || 'trending';
    const maxResults = Math.min(parseInt(params.maxResults || params.count || '5', 10), 50);

    let result;
    const logs = [];
    const startTime = Date.now();

    switch (action) {
      // ── 트렌딩 영상 ──
      case 'trending': {
        const category = params.category || '전체';
        logs.push({ step: 1, status: 'start', message: `🔥 한국 트렌딩 영상 조회 시작 (카테고리: ${category})` });
        logs.push({ step: 2, status: 'running', message: 'YouTube Data API v3 mostPopular 호출 중...' });

        const videos = await getTrending(apiKey, { category, maxResults });

        logs.push({ step: 3, status: 'done', message: `✅ ${videos.length}개 트렌딩 영상 조회 완료` });

        result = {
          success: true,
          action: 'trending',
          category,
          count: videos.length,
          videos,
          summary: videos.length > 0
            ? `현재 한국에서 가장 인기 있는 영상 TOP ${videos.length}입니다. 1위는 "${videos[0].title}" (${videos[0].viewCountFormatted})입니다.`
            : '현재 트렌딩 영상을 찾을 수 없습니다.',
        };
        break;
      }

      // ── 키워드 인기 영상 ──
      case 'search':
      case 'keyword': {
        const keyword = params.keyword || params.query || '';
        if (!keyword) {
          return res.status(400).json({ success: false, error: '키워드(keyword)를 입력해주세요.' });
        }

        // 기간 필터
        let publishedAfter = '';
        const period = params.period || '';
        if (period === 'day' || period === '오늘') {
          publishedAfter = new Date(Date.now() - 86400000).toISOString();
        } else if (period === 'week' || period === '이번주') {
          publishedAfter = new Date(Date.now() - 7 * 86400000).toISOString();
        } else if (period === 'month' || period === '이번달') {
          publishedAfter = new Date(Date.now() - 30 * 86400000).toISOString();
        } else if (period === 'year' || period === '올해') {
          publishedAfter = new Date(Date.now() - 365 * 86400000).toISOString();
        }

        logs.push({ step: 1, status: 'start', message: `🔍 "${keyword}" 키워드 인기 영상 검색 시작` });
        logs.push({ step: 2, status: 'running', message: `YouTube Search API 조회수순 검색 중... (기간: ${period || '전체'})` });

        const videos = await searchPopularByKeyword(apiKey, { keyword, maxResults, publishedAfter });

        logs.push({ step: 3, status: 'running', message: `${videos.length}개 영상 상세 정보 조회 완료` });
        logs.push({ step: 4, status: 'done', message: `✅ "${keyword}" 인기 영상 ${videos.length}개 정렬 완료` });

        result = {
          success: true,
          action: 'keyword_search',
          keyword,
          period: period || '전체',
          count: videos.length,
          videos,
          summary: videos.length > 0
            ? `"${keyword}" 관련 조회수 TOP ${videos.length} 영상입니다. 1위: "${videos[0].title}" (${videos[0].viewCountFormatted})`
            : `"${keyword}" 관련 인기 영상을 찾을 수 없습니다.`,
        };
        break;
      }

      // ── 채널 인기 영상 ──
      case 'channel': {
        const channelId = params.channelId || '';
        const channelName = params.channelName || params.channel || '';
        if (!channelId && !channelName) {
          return res.status(400).json({ success: false, error: '채널 ID(channelId) 또는 채널명(channelName)을 입력해주세요.' });
        }

        logs.push({ step: 1, status: 'start', message: `📺 ${channelName || channelId} 채널 인기 영상 조회 시작` });
        logs.push({ step: 2, status: 'running', message: '채널 정보 및 영상 목록 조회 중...' });

        const { channel, videos } = await getChannelPopularVideos(apiKey, { channelId, channelName, maxResults });

        logs.push({ step: 3, status: 'done', message: `✅ ${channel.channelName || channelName} 채널 인기 영상 ${videos.length}개 조회 완료` });

        result = {
          success: true,
          action: 'channel_popular',
          channel,
          count: videos.length,
          videos,
          summary: videos.length > 0
            ? `${channel.channelName || channelName} 채널의 조회수 TOP ${videos.length} 영상입니다. 1위: "${videos[0].title}" (${videos[0].viewCountFormatted})`
            : `${channelName || channelId} 채널의 영상을 찾을 수 없습니다.`,
        };
        break;
      }

      // ── 카테고리 목록 ──
      case 'categories': {
        result = {
          success: true,
          action: 'categories',
          categories: Object.keys(CATEGORY_MAP),
        };
        break;
      }

      default:
        return res.status(400).json({
          success: false,
          error: `알 수 없는 action: ${action}. 사용 가능: trending, search, keyword, channel, categories`,
        });
    }

    result.logs = logs;
    result.elapsed = `${((Date.now() - startTime) / 1000).toFixed(1)}초`;

    return res.status(200).json(result);

  } catch (error) {
    console.error('[youtube-trending] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '알 수 없는 오류가 발생했습니다.',
    });
  }
};
