"use strict";
// Vercel Serverless Function (CommonJS)
// 인스타그램 계정 검색 - 네이버 웹 검색 API 방식 (공식 API 활용)
// 네이버 검색에서 "인스타그램 {키워드}" 검색 → instagram.com/username 패턴 추출

const NAVER_WEB_API = 'https://openapi.naver.com/v1/search/webkr.json';
const NAVER_BLOG_API = 'https://openapi.naver.com/v1/search/blog.json';

const RESERVED_USERNAMES = new Set([
  'p', 'reel', 'reels', 'stories', 'explore', 'accounts',
  'about', 'developer', 'legal', '_n', '_u', 'tv', 'direct',
  'ar', 'challenge', 'create', 'press', 'blog', 'help',
  'login', 'signup', 'register', 'privacy', 'terms', 'api',
  'shoppingtag', 'tagged', 'saved', 'web',
]);

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

// 네이버 검색 API로 인스타그램 계정 찾기
async function searchInstagramViaNaver(keyword, clientId, clientSecret) {
  const results = [];
  const seen = new Set();

  // 1차: 웹 검색으로 instagram.com URL 추출
  try {
    const query = `인스타그램 ${keyword}`;
    const url = `${NAVER_WEB_API}?query=${encodeURIComponent(query)}&display=30&start=1`;
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      for (const item of (data.items || [])) {
        const link = item.link || '';
        const desc = stripHtml(item.description || '');
        const title = stripHtml(item.title || '');

        // instagram.com/username 패턴 추출
        const igPattern = /instagram\.com\/([a-zA-Z0-9_.]{2,30})\/?/g;
        let match;
        const combined = link + ' ' + desc + ' ' + title;
        while ((match = igPattern.exec(combined)) !== null) {
          const username = match[1].replace(/\/$/, '').toLowerCase();
          if (!RESERVED_USERNAMES.has(username) && !seen.has(username) && username.length >= 2) {
            seen.add(username);
            // bio에서 이메일 추출
            const emailMatch = desc.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
            results.push({
              username,
              profileUrl: `https://instagram.com/${username}`,
              bio: desc.substring(0, 100),
              email: emailMatch ? emailMatch[0] : '',
              source: 'naver-web',
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('[Instagram] Naver web search error:', e);
  }

  // 2차: 블로그 검색에서도 인스타 계정 추출
  try {
    const query2 = `${keyword} 인스타`;
    const url2 = `${NAVER_BLOG_API}?query=${encodeURIComponent(query2)}&display=20&start=1`;
    const res2 = await fetch(url2, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res2.ok) {
      const data2 = await res2.json();
      for (const item of (data2.items || [])) {
        const desc = stripHtml(item.description || '');
        const title = stripHtml(item.title || '');
        const combined = desc + ' ' + title;

        // @username 패턴 추출 (인스타 계정명)
        const atPattern = /@([a-zA-Z0-9_.]{2,30})/g;
        let match;
        while ((match = atPattern.exec(combined)) !== null) {
          const username = match[1].toLowerCase();
          if (!RESERVED_USERNAMES.has(username) && !seen.has(username) && username.length >= 2) {
            seen.add(username);
            results.push({
              username,
              profileUrl: `https://instagram.com/${username}`,
              bio: desc.substring(0, 100),
              email: '',
              source: 'naver-blog',
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('[Instagram] Naver blog search error:', e);
  }

  return results;
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

  const { keyword, limit = '10' } = req.query;
  if (!keyword) return res.status(400).json({ error: 'keyword is required' });

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: 'Naver API credentials missing',
      message: 'NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET 환경변수를 Vercel에 설정해주세요.',
    });
  }

  const count = Math.min(Number(limit) || 10, 30);

  try {
    const igResults = await searchInstagramViaNaver(String(keyword), clientId, clientSecret);
    const limited = igResults.slice(0, count);

    const enriched = limited.map((ig) => ({
      ...ig,
      followers: 0,
      followerCount: 0,
      followersFormatted: '-',
      fullName: '',
      isVerified: false,
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
