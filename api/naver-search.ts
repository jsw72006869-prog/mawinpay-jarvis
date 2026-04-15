import type { VercelRequest, VercelResponse } from '@vercel/node';

const NAVER_BLOG_API = 'https://openapi.naver.com/v1/search/blog.json';
const NAVER_CAFE_API = 'https://openapi.naver.com/v1/search/cafearticle.json';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 허용
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: 'Naver API credentials not configured',
      message: 'NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET 환경변수를 Vercel에 설정해주세요.',
    });
  }

  const { keyword, source = 'blog', display = '100', sort = 'sim' } = req.query;

  if (!keyword) {
    return res.status(400).json({ error: 'keyword is required' });
  }

  const apiUrl = source === 'cafe' ? NAVER_CAFE_API : NAVER_BLOG_API;
  const displayNum = Math.min(Number(display) || 100, 100);

  try {
    // 네이버 API는 한 번에 최대 100개 → 여러 번 호출로 더 많이 수집
    const allItems: NaverItem[] = [];
    const maxPages = Math.ceil(displayNum / 100);

    for (let page = 0; page < maxPages; page++) {
      const start = page * 100 + 1;
      if (start > 1000) break; // 네이버 API 최대 start=1000

      const response = await fetch(
        `${apiUrl}?query=${encodeURIComponent(String(keyword))}&display=100&start=${start}&sort=${sort}`,
        {
          headers: {
            'X-Naver-Client-Id': clientId,
            'X-Naver-Client-Secret': clientSecret,
          },
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error('Naver API error:', response.status, errText);
        break;
      }

      const data = await response.json() as NaverApiResponse;
      if (!data.items || data.items.length === 0) break;

      allItems.push(...data.items);
      if (data.items.length < 100) break; // 더 이상 결과 없음
    }

    // 결과 정제
    const results = allItems.map(item => ({
      source: source as 'blog' | 'cafe',
      title: stripHtml(item.title),
      url: item.link,
      creatorName: source === 'cafe'
        ? (item as NaverCafeItem).cafename || '알 수 없음'
        : (item as NaverBlogItem).bloggername || '알 수 없음',
      creatorUrl: source === 'cafe'
        ? (item as NaverCafeItem).cafeurl || ''
        : (item as NaverBlogItem).bloggerlink || '',
      description: stripHtml(item.description),
      postDate: item.postdate || '',
    }));

    return res.status(200).json({
      total: results.length,
      keyword,
      source,
      items: results,
    });
  } catch (error) {
    console.error('Naver search error:', error);
    return res.status(500).json({
      error: 'Failed to fetch from Naver API',
      message: String(error),
    });
  }
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

interface NaverItem {
  title: string;
  link: string;
  description: string;
  postdate: string;
}

interface NaverBlogItem extends NaverItem {
  bloggername: string;
  bloggerlink: string;
}

interface NaverCafeItem extends NaverItem {
  cafename: string;
  cafeurl: string;
}

interface NaverApiResponse {
  total: number;
  start: number;
  display: number;
  items: NaverItem[];
}
