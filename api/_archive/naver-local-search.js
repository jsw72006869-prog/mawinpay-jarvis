"use strict";
// Vercel Serverless Function
// 네이버 지역 검색 API - 업체 수집 (맛집, 고기집 등)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: '네이버 API 키 없음',
      message: 'NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 환경변수를 설정해주세요.',
    });
  }

  const query = req.query.query || req.body?.query;
  const display = Math.min(parseInt(req.query.display || req.body?.display || '100'), 5);
  const start = parseInt(req.query.start || req.body?.start || '1');
  const category = req.query.category || req.body?.category || '';

  if (!query) {
    return res.status(400).json({ error: 'query 파라미터가 필요합니다.' });
  }

  try {
    // 네이버 지역 검색 API 호출 (최대 5페이지 = 100개)
    const allItems = [];
    const maxDisplay = 5; // 네이버 지역 검색 최대 display
    const pages = Math.ceil(display / maxDisplay);

    for (let page = 0; page < Math.min(pages, 20); page++) {
      const startIdx = (start - 1) * maxDisplay + page * maxDisplay + 1;
      const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=${maxDisplay}&start=${startIdx}&sort=random`;

      const response = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[Naver Local] API 오류:', errText);
        break;
      }

      const data = await response.json();
      if (!data.items || data.items.length === 0) break;

      allItems.push(...data.items);

      // 더 이상 결과 없으면 중단
      if (allItems.length >= data.total) break;
    }

    // HTML 태그 제거 함수
    const stripHtml = (str) => str ? str.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : '';

    // 데이터 정제
    let items = allItems.map(item => ({
      name: stripHtml(item.title),
      category: stripHtml(item.category),
      address: stripHtml(item.address),
      roadAddress: stripHtml(item.roadAddress),
      phone: item.telephone || '',
      link: item.link || '',
      mapx: item.mapx || '',
      mapy: item.mapy || '',
      description: stripHtml(item.description || ''),
    }));

    // 카테고리 필터링 (선택적)
    if (category) {
      const categoryKeywords = category.split(',').map(c => c.trim().toLowerCase());
      items = items.filter(item =>
        categoryKeywords.some(kw =>
          item.category.toLowerCase().includes(kw) ||
          item.name.toLowerCase().includes(kw)
        )
      );
    }

    return res.status(200).json({
      success: true,
      total: items.length,
      query,
      category: category || '전체',
      items,
    });

  } catch (err) {
    console.error('[Naver Local] 오류:', err);
    return res.status(500).json({
      error: '검색 실패',
      message: String(err.message || err),
    });
  }
};
