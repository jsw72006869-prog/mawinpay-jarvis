// Vercel Serverless Function (CommonJS 방식)

const NAVER_BLOG_API = 'https://openapi.naver.com/v1/search/blog.json';
const NAVER_CAFE_API = 'https://openapi.naver.com/v1/search/cafearticle.json';

// ── 네이버 블로그 프로필 크롤링 (이웃수/방문자수/이메일) ──
async function fetchNaverBlogProfile(blogId: string): Promise<{
  neighborCount: number;
  dailyVisitors: number;
  email: string;
  profileDesc: string;
}> {
  const result = { neighborCount: 0, dailyVisitors: 0, email: '', profileDesc: '' };
  try {
    // 네이버 블로그 프로필 페이지
    const profileUrl = `https://blog.naver.com/NoteIntro.naver?blogId=${blogId}`;
    const res = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return result;
    const html = await res.text();

    // 이메일 추출
    const emailMatch = html.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    if (emailMatch) result.email = emailMatch[0];

    // 프로필 설명에서 이메일 추출 (더 넓은 범위)
    if (!result.email) {
      const descMatch = html.match(/class="[^"]*desc[^"]*"[^>]*>([^<]+)/i);
      if (descMatch) {
        result.profileDesc = descMatch[1].trim();
        const emailInDesc = descMatch[1].match(/[\w.+-]+@[\w-]+\.[\w.]+/);
        if (emailInDesc) result.email = emailInDesc[0];
      }
    }

    // 이웃수 추출 (네이버 블로그 이웃 카운트)
    const neighborMatch = html.match(/이웃[^\d]*(\d[\d,]+)/);
    if (neighborMatch) result.neighborCount = parseInt(neighborMatch[1].replace(/,/g, ''), 10);

    // 방문자수 추출
    const visitorMatch = html.match(/방문[^\d]*(\d[\d,]+)/);
    if (visitorMatch) result.dailyVisitors = parseInt(visitorMatch[1].replace(/,/g, ''), 10);

  } catch (e) {
    // 크롤링 실패 시 빈 결과 반환
  }
  return result;
}

// ── 블로거 링크에서 블로그 ID 추출 ──
function extractBlogId(bloggerlink: string): string {
  if (!bloggerlink) return '';
  // https://blog.naver.com/blogId 형태
  const match = bloggerlink.match(/blog\.naver\.com\/([a-zA-Z0-9_]+)/);
  if (match) return match[1];
  // 직접 ID만 있는 경우
  const idMatch = bloggerlink.match(/\/([a-zA-Z0-9_]+)\/?$/);
  if (idMatch) return idMatch[1];
  return '';
}

// ── 추정 이메일 생성 (블로그 ID + 주요 도메인) ──
function guessEmail(blogId: string): string {
  if (!blogId) return '';
  // 네이버 블로그 ID가 이메일 아이디일 가능성이 높음
  // 가장 흔한 패턴: blogId@naver.com
  return `${blogId}@naver.com`;
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

module.exports = async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: 'Naver API credentials not configured',
      message: 'NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET 환경변수를 Vercel에 설정해주세요.',
    });
  }

  const {
    keyword,
    source = 'blog',
    display = '100',
    sort = 'sim',
    fetchProfile = 'false',  // 프로필 크롤링 여부 (느리므로 선택적)
  } = req.query;

  if (!keyword) return res.status(400).json({ error: 'keyword is required' });

  const apiUrl = source === 'cafe' ? NAVER_CAFE_API : NAVER_BLOG_API;
  const displayNum = Math.min(Number(display) || 100, 100);
  const shouldFetchProfile = fetchProfile === 'true';

  try {
    const allItems: NaverItem[] = [];
    const maxPages = Math.ceil(displayNum / 100);

    for (let page = 0; page < maxPages; page++) {
      const start = page * 100 + 1;
      if (start > 1000) break;

      const response = await fetch(
        `${apiUrl}?query=${encodeURIComponent(String(keyword))}&display=100&start=${start}&sort=${sort}`,
        {
          headers: {
            'X-Naver-Client-Id': clientId,
            'X-Naver-Client-Secret': clientSecret,
          },
        }
      );

      if (!response.ok) break;
      const data = await response.json() as NaverApiResponse;
      if (!data.items || data.items.length === 0) break;
      allItems.push(...data.items);
      if (data.items.length < 100) break;
    }

    // 결과 정제 + 블로그 ID 추출 + 추정 이메일
    const results = await Promise.all(allItems.map(async (item) => {
      const isBlog = source !== 'cafe';
      const blogItem = item as NaverBlogItem;
      const cafeItem = item as NaverCafeItem;

      const creatorName = isBlog ? (blogItem.bloggername || '알 수 없음') : (cafeItem.cafename || '알 수 없음');
      const creatorUrl = isBlog ? (blogItem.bloggerlink || '') : (cafeItem.cafeurl || '');

      // 블로그 ID 추출
      const blogId = isBlog ? extractBlogId(creatorUrl) : '';

      // 추정 이메일 (블로그 ID + @naver.com)
      const guessedEmail = blogId ? guessEmail(blogId) : '';

      // 프로필 크롤링 (선택적, 실제 이메일/이웃수/방문자수)
      let profileData = { neighborCount: 0, dailyVisitors: 0, email: '', profileDesc: '' };
      if (shouldFetchProfile && blogId && isBlog) {
        profileData = await fetchNaverBlogProfile(blogId);
      }

      // 이메일 우선순위: 실제 크롤링 > 추정
      const email = profileData.email || guessedEmail;

      return {
        source: source as 'blog' | 'cafe',
        title: stripHtml(item.title),
        url: item.link,
        creatorName,
        creatorUrl,
        blogId,
        email,
        guessedEmail,
        realEmail: profileData.email || '',
        neighborCount: profileData.neighborCount,
        dailyVisitors: profileData.dailyVisitors,
        profileDesc: profileData.profileDesc,
        description: stripHtml(item.description),
        postDate: item.postdate || '',
      };
    }));

    return res.status(200).json({
      total: results.length,
      keyword,
      source,
      items: results,
    });
  } catch (error) {
    console.error('Naver search error:', error);
    return res.status(500).json({ error: 'Failed to fetch from Naver API', message: String(error) });
  }
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
