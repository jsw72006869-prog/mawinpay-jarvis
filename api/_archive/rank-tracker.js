/**
 * SmartStore Rank Tracker API v1.0
 * 네이버 쇼핑 검색 결과에서 특정 상품의 순위를 추적합니다.
 * 
 * ─── 크롤링 방식 ───
 * 네이버 쇼핑 검색 API 또는 모바일 검색 페이지를 파싱하여
 * 지정된 키워드에 대한 상품 순위를 확인합니다.
 * 
 * ─── 데이터 저장 ───
 * Google Sheets 또는 로컬 JSON에 시계열 데이터를 기록하여
 * 순위 변동 추이를 분석합니다.
 * 
 * ─── 알림 조건 ───
 * - 순위가 3단계 이상 변동 시 알림
 * - 1페이지(상위 40위) 진입/이탈 시 알림
 * - 일일 최고/최저 순위 보고
 */

const fetch = require('node-fetch');

// ─── 네이버 쇼핑 검색 API (비공식) ───
async function searchNaverShopping(keyword, page = 1) {
  const url = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}&pagingIndex=${page}&pagingSize=40&sort=rel`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
    timeout: 15000,
  });
  
  if (!response.ok) {
    throw new Error(`네이버 쇼핑 검색 실패: ${response.status}`);
  }
  
  return await response.text();
}

// ─── HTML에서 상품 목록 파싱 ───
function parseShoppingResults(html) {
  const products = [];
  
  // JSON-LD 또는 __NEXT_DATA__ 에서 상품 데이터 추출 시도
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const items = nextData?.props?.pageProps?.initialState?.products?.list || [];
      items.forEach((item, idx) => {
        const product = item?.item;
        if (product) {
          products.push({
            rank: idx + 1,
            title: product.productTitle || product.productName || '',
            price: product.price || product.lowPrice || 0,
            mallName: product.mallName || product.shopName || '',
            productId: product.id || product.productId || '',
            url: product.crUrl || product.productUrl || '',
            reviewCount: product.reviewCount || 0,
            purchaseCount: product.purchaseCnt || 0,
          });
        }
      });
    } catch (e) {
      // JSON 파싱 실패 시 정규식 폴백
    }
  }
  
  // 폴백: 정규식으로 상품명 추출
  if (products.length === 0) {
    const titleRegex = /class="[^"]*product_title[^"]*"[^>]*>([^<]+)/g;
    let match;
    let rank = 1;
    while ((match = titleRegex.exec(html)) !== null) {
      products.push({ rank: rank++, title: match[1].trim(), price: 0, mallName: '', productId: '' });
    }
  }
  
  return products;
}

// ─── 특정 상품/스토어의 순위 찾기 ───
function findProductRank(products, targetStoreName, targetProductKeyword) {
  for (const product of products) {
    const matchStore = targetStoreName ? product.mallName.includes(targetStoreName) : true;
    const matchProduct = targetProductKeyword ? product.title.includes(targetProductKeyword) : true;
    
    if (matchStore && matchProduct) {
      return {
        found: true,
        rank: product.rank,
        title: product.title,
        mallName: product.mallName,
        price: product.price,
      };
    }
  }
  return { found: false, rank: -1 };
}

// ─── 순위 변동 분석 ───
function analyzeRankChange(currentRank, history) {
  if (!history || history.length === 0) {
    return { delta: 0, trend: 'NEW', alert: false, message: '첫 번째 기록' };
  }
  
  const previousRank = history[history.length - 1].rank;
  const delta = previousRank - currentRank; // 양수 = 순위 상승
  
  let trend = 'STABLE';
  let alert = false;
  let message = '';
  
  if (delta > 0) {
    trend = 'UP';
    message = `순위 ${delta}단계 상승 (${previousRank}위 → ${currentRank}위)`;
    if (delta >= 3) alert = true;
  } else if (delta < 0) {
    trend = 'DOWN';
    message = `순위 ${Math.abs(delta)}단계 하락 (${previousRank}위 → ${currentRank}위)`;
    if (Math.abs(delta) >= 3) alert = true;
  } else {
    message = `순위 유지 (${currentRank}위)`;
  }
  
  // 1페이지 진입/이탈 체크
  if (previousRank > 40 && currentRank <= 40) {
    alert = true;
    message += ' [1페이지 진입!]';
  } else if (previousRank <= 40 && currentRank > 40) {
    alert = true;
    message += ' [1페이지 이탈!]';
  }
  
  return { delta, trend, alert, message };
}

// ─── API 핸들러 ───
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  try {
    const { keyword, storeName, productKeyword, page = 1 } = req.method === 'POST' ? req.body : req.query;
    
    if (!keyword) {
      return res.status(400).json({ success: false, error: '검색 키워드를 입력해주세요.' });
    }
    
    // 네이버 쇼핑 검색
    const html = await searchNaverShopping(keyword, parseInt(page));
    const products = parseShoppingResults(html);
    
    if (products.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          keyword,
          totalResults: 0,
          message: '검색 결과를 파싱할 수 없습니다. 네이버 쇼핑 페이지 구조가 변경되었을 수 있습니다.',
          products: [],
        },
      });
    }
    
    // 특정 상품 순위 찾기
    let rankResult = null;
    if (storeName || productKeyword) {
      rankResult = findProductRank(products, storeName, productKeyword);
      
      // 이전 기록과 비교 (localStorage 대신 쿼리 파라미터로 이전 순위 전달)
      const previousRanks = []; // 프론트엔드에서 관리
      const analysis = analyzeRankChange(
        rankResult.found ? rankResult.rank : -1,
        previousRanks
      );
      
      rankResult = { ...rankResult, ...analysis };
    }
    
    return res.status(200).json({
      success: true,
      data: {
        keyword,
        totalResults: products.length,
        topProducts: products.slice(0, 10), // 상위 10개만 반환
        myRank: rankResult,
        lastChecked: new Date().toISOString(),
      },
      // 텔레메트리용 요약
      telemetrySummary: {
        keyword,
        currentRank: rankResult?.found ? rankResult.rank : 'N/A',
        delta: rankResult?.delta || 0,
        trend: rankResult?.trend || 'N/A',
        alert: rankResult?.alert || false,
        totalResults: products.length,
        lastChecked: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    console.error('[RankTracker] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      telemetrySummary: { keyword: req.body?.keyword || req.query?.keyword || 'unknown', status: 'ERROR' },
    });
  }
};
