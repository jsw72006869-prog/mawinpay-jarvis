"use strict";
// Vercel Serverless Function (CommonJS)
// 인스타그램 계정 검색 - DuckDuckGo HTML 검색 방식 (Google 차단 우회)

const RESERVED_USERNAMES = new Set([
  'p', 'reel', 'reels', 'stories', 'explore', 'accounts',
  'about', 'developer', 'legal', '_n', '_u', 'tv', 'direct',
  'ar', 'challenge', 'create', 'press', 'blog', 'help',
  'login', 'signup', 'register', 'privacy', 'terms', 'api',
]);

// DuckDuckGo HTML 검색으로 인스타그램 계정 찾기
async function searchInstagramViaDDG(query) {
  const results = [];
  try {
    const searchQuery = `${query} site:instagram.com`;
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}&kl=kr-kr`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return results;
    const html = await res.text();

    // instagram.com/username 패턴 추출
    const igPattern = /instagram\.com\/([a-zA-Z0-9_.]{2,30})\/?/g;
    const seen = new Set();
    let match;
    while ((match = igPattern.exec(html)) !== null) {
      const username = match[1].replace(/\/$/, '').toLowerCase();
      if (!RESERVED_USERNAMES.has(username) && !seen.has(username) && username.length >= 2) {
        seen.add(username);
        results.push({
          username,
          profileUrl: `https://instagram.com/${username}`,
          source: 'duckduckgo',
        });
      }
    }
  } catch (e) {
    console.error('[Instagram] DDG search error:', e);
  }
  return results;
}

// 인스타그램 프로필 페이지에서 팔로워/bio/이메일 추출
async function fetchInstagramProfile(username) {
  const empty = { followers: 0, bio: '', email: '', fullName: '', isVerified: false };
  try {
    // Instagram JSON API endpoint (비공식, 모바일 UA 필요)
    const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'application/json',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `https://www.instagram.com/${username}/`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // 폴백: HTML 파싱
      return await fetchInstagramProfileHTML(username);
    }
    const data = await res.json();
    const user = data?.data?.user;
    if (!user) return empty;
    const followers = user.edge_followed_by?.count || 0;
    const bio = user.biography || '';
    const emailInBio = bio.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    const email = emailInBio ? emailInBio[0] : '';
    return {
      followers,
      bio,
      email,
      fullName: user.full_name || '',
      isVerified: user.is_verified || false,
    };
  } catch {
    return await fetchInstagramProfileHTML(username);
  }
}

// HTML 파싱 폴백
async function fetchInstagramProfileHTML(username) {
  const empty = { followers: 0, bio: '', email: '', fullName: '', isVerified: false };
  try {
    const url = `https://www.instagram.com/${username}/`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return empty;
    const html = await res.text();
    const followersMatch = html.match(/"edge_followed_by":\{"count":(\d+)\}/);
    const followers = followersMatch ? parseInt(followersMatch[1], 10) : 0;
    const bioMatch = html.match(/"biography":"([^"]+)"/);
    const bio = bioMatch ? bioMatch[1].replace(/\\n/g, ' ') : '';
    const emailInBio = bio.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    const email = emailInBio ? emailInBio[0] : '';
    const nameMatch = html.match(/"full_name":"([^"]+)"/);
    const fullName = nameMatch ? nameMatch[1] : '';
    const isVerified = html.includes('"is_verified":true');
    return { followers, bio, email, fullName, isVerified };
  } catch {
    return empty;
  }
}

function formatFollowers(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { keyword, limit = '10', fetchProfile = 'false' } = req.query;
  if (!keyword) return res.status(400).json({ error: 'keyword is required' });

  const count = Math.min(Number(limit) || 10, 20);
  const shouldFetchProfile = fetchProfile === 'true';

  try {
    const igResults = await searchInstagramViaDDG(String(keyword));
    const limited = igResults.slice(0, count);

    const enriched = await Promise.all(limited.map(async (ig) => {
      if (shouldFetchProfile) {
        const profile = await fetchInstagramProfile(ig.username);
        return {
          ...ig,
          followers: profile.followers,
          followerCount: profile.followers,
          followersFormatted: formatFollowers(profile.followers),
          bio: profile.bio,
          email: profile.email,
          fullName: profile.fullName,
          isVerified: profile.isVerified,
        };
      }
      return {
        ...ig,
        followers: 0,
        followerCount: 0,
        followersFormatted: '-',
        bio: '',
        email: '',
        fullName: '',
        isVerified: false,
      };
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
};
