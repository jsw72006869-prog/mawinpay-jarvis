import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── 인스타그램 계정 검색 (Google 크롤링 방식 - 앱 방식 이식) ──
// 공식 API 없이 Google 검색으로 instagram.com/username 패턴 추출

const RESERVED_USERNAMES = new Set([
  'p', 'reel', 'reels', 'stories', 'explore', 'accounts',
  'about', 'developer', 'legal', '_n', '_u', 'tv', 'direct',
  'ar', 'challenge', 'create', 'press', 'blog', 'help',
]);

async function searchInstagramViaGoogle(query: string): Promise<InstagramResult[]> {
  const results: InstagramResult[] = [];
  try {
    const searchQuery = `${query} site:instagram.com`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=10&hl=ko`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return results;
    const html = await res.text();

    // instagram.com/username 패턴 추출
    const igPattern = /instagram\.com\/([a-zA-Z0-9_.]{2,30})\/?/g;
    const seen = new Set<string>();
    let match;
    while ((match = igPattern.exec(html)) !== null) {
      const username = match[1].replace(/\/$/, '').toLowerCase();
      if (!RESERVED_USERNAMES.has(username) && !seen.has(username) && username.length >= 2) {
        seen.add(username);
        results.push({
          username,
          profileUrl: `https://instagram.com/${username}`,
          source: 'google',
        });
      }
    }
  } catch (e) {
    console.error('[Instagram] Google search error:', e);
  }
  return results;
}

// ── 인스타그램 프로필 페이지 직접 접근 (팔로워 수 등) ──
async function fetchInstagramProfile(username: string): Promise<{
  followers: number;
  bio: string;
  email: string;
  fullName: string;
  isVerified: boolean;
}> {
  const empty = { followers: 0, bio: '', email: '', fullName: '', isVerified: false };
  try {
    const url = `https://www.instagram.com/${username}/`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return empty;
    const html = await res.text();

    // JSON-LD 또는 meta 태그에서 정보 추출
    const followersMatch = html.match(/"edge_followed_by":\{"count":(\d+)\}/) ||
                           html.match(/(\d+(?:\.\d+)?[KMB]?) Followers/i);
    const followers = followersMatch ? parseInt(followersMatch[1].replace(/[KMB,]/g, ''), 10) : 0;

    // bio에서 이메일 추출
    const bioMatch = html.match(/"biography":"([^"]+)"/);
    const bio = bioMatch ? bioMatch[1].replace(/\\n/g, ' ') : '';
    const emailInBio = bio.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    const email = emailInBio ? emailInBio[0] : '';

    // 전체 이름
    const nameMatch = html.match(/"full_name":"([^"]+)"/);
    const fullName = nameMatch ? nameMatch[1] : '';

    // 인증 여부
    const isVerified = html.includes('"is_verified":true');

    return { followers, bio, email, fullName, isVerified };
  } catch {
    return empty;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { keyword, maxResults = '10', fetchProfile = 'false' } = req.query;
  if (!keyword) return res.status(400).json({ error: 'keyword is required' });

  const count = Math.min(Number(maxResults) || 10, 20);
  const shouldFetchProfile = fetchProfile === 'true';

  try {
    // Google 검색으로 인스타그램 계정 찾기
    const igResults = await searchInstagramViaGoogle(String(keyword));
    const limited = igResults.slice(0, count);

    // 프로필 상세 정보 수집 (선택적)
    const enriched = await Promise.all(limited.map(async (ig) => {
      if (shouldFetchProfile) {
        const profile = await fetchInstagramProfile(ig.username);
        return {
          ...ig,
          followers: profile.followers,
          bio: profile.bio,
          email: profile.email,
          fullName: profile.fullName,
          isVerified: profile.isVerified,
          followersFormatted: profile.followers >= 1000000
            ? `${(profile.followers / 1000000).toFixed(1)}M`
            : profile.followers >= 10000
            ? `${(profile.followers / 10000).toFixed(1)}만`
            : profile.followers >= 1000
            ? `${(profile.followers / 1000).toFixed(1)}K`
            : String(profile.followers),
        };
      }
      return { ...ig, followers: 0, bio: '', email: '', fullName: '', isVerified: false, followersFormatted: '-' };
    }));

    return res.status(200).json({
      total: enriched.length,
      keyword,
      items: enriched,
    });
  } catch (error) {
    console.error('[Instagram] Error:', error);
    return res.status(500).json({ error: 'Failed to search Instagram', message: String(error) });
  }
}

interface InstagramResult {
  username: string;
  profileUrl: string;
  source: string;
}
