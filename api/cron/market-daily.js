"use strict";
/**
 * Vercel Cron Job: 매일 아침 7시 농산물 시장 데이터 수집 및 분석
 * 
 * Cron Schedule: 0 7 * * * (매일 오전 7시 KST)
 * 
 * 수행 작업:
 * 1. KAMIS API에서 주요 품목 가격 데이터 수집
 * 2. 이동평균/변동성 분석 수행
 * 3. 매입/매도 추천 생성
 * 4. 결과를 캐시에 저장 (다음 모닝 브리핑에서 활용)
 */

// Vercel Cron 인증 확인
function verifyCronAuth(req) {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return false;
  }
  return true;
}

// 간단한 메모리 캐시 (Vercel Edge Config 또는 KV로 대체 가능)
const CACHE_KEY = 'market_daily_cache';
let cachedData = null;

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Cron 인증 (Vercel에서 호출 시)
  if (!verifyCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const KAMIS_KEY = process.env.KAMIS_API_KEY || '';
  const KAMIS_ID = process.env.KAMIS_CERT_ID || '4457';
  
  if (!KAMIS_KEY) {
    console.log('[Cron/MarketDaily] KAMIS_API_KEY not set, skipping...');
    return res.status(200).json({ 
      success: false, 
      message: 'KAMIS_API_KEY not configured. Skipping daily collection.',
      timestamp: new Date().toISOString(),
    });
  }
  
  const ITEMS = ['옥수수', '밤', '쌀', '고구마', '감자', '사과', '배'];
  const ITEM_CODES = {
    '옥수수': { category: '200', code: '225', kind: '00' },
    '밤':     { category: '300', code: '312', kind: '00' },
    '쌀':     { category: '100', code: '111', kind: '01' },
    '고구마': { category: '200', code: '212', kind: '00' },
    '감자':   { category: '200', code: '211', kind: '01' },
    '사과':   { category: '400', code: '411', kind: '05' },
    '배':     { category: '400', code: '412', kind: '01' },
  };
  
  const results = [];
  const errors = [];
  
  console.log(`[Cron/MarketDaily] Starting daily collection at ${new Date().toISOString()}`);
  
  for (const itemName of ITEMS) {
    try {
      const item = ITEM_CODES[itemName];
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      
      const formatDate = (d) => d.toISOString().split('T')[0];
      
      const params = new URLSearchParams({
        action: 'periodProductList',
        p_cert_key: KAMIS_KEY,
        p_cert_id: KAMIS_ID,
        p_returntype: 'json',
        p_startday: formatDate(startDate),
        p_endday: formatDate(endDate),
        p_itemcategorycode: item.category,
        p_itemcode: item.code,
        p_kindcode: item.kind,
        p_productrankcode: '04',
        p_countrycode: '1101',
        p_convert_kg_yn: 'Y',
      });
      
      const url = `https://www.kamis.or.kr/service/price/xml.do?${params.toString()}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      
      if (!response.ok) {
        errors.push({ item: itemName, error: `HTTP ${response.status}` });
        continue;
      }
      
      const data = await response.json();
      const items = data?.data?.item || data?.price || [];
      
      const priceData = items
        .filter(i => i.price && i.price !== '-' && i.price !== '0')
        .map(i => ({
          date: i.regday || i.yyyy,
          price: parseInt(String(i.price).replace(/,/g, ''), 10),
        }))
        .filter(i => !isNaN(i.price) && i.price > 0)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      
      if (priceData.length === 0) {
        errors.push({ item: itemName, error: 'No valid price data' });
        continue;
      }
      
      const prices = priceData.map(p => p.price);
      const currentPrice = prices[prices.length - 1];
      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);
      const avgPrice = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
      
      // 간단한 추세 판단
      const recentAvg = prices.slice(-5).reduce((s, p) => s + p, 0) / Math.min(5, prices.length);
      const olderAvg = prices.slice(0, 5).reduce((s, p) => s + p, 0) / Math.min(5, prices.length);
      const trend = recentAvg > olderAvg * 1.02 ? 'UP' : recentAvg < olderAvg * 0.98 ? 'DOWN' : 'STABLE';
      
      results.push({
        item: itemName,
        currentPrice,
        maxPrice,
        minPrice,
        avgPrice,
        trend,
        dataPoints: priceData.length,
        lastDate: priceData[priceData.length - 1].date,
      });
      
      console.log(`[Cron/MarketDaily] ${itemName}: ${currentPrice}원 (${trend})`);
      
      // API 쿼터 보호를 위한 딜레이
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      errors.push({ item: itemName, error: error.message });
      console.error(`[Cron/MarketDaily] ${itemName} failed:`, error.message);
    }
  }
  
  // 결과 캐시 저장
  cachedData = {
    collectedAt: new Date().toISOString(),
    results,
    errors,
    summary: {
      totalItems: ITEMS.length,
      successCount: results.length,
      errorCount: errors.length,
    },
  };
  
  console.log(`[Cron/MarketDaily] Completed: ${results.length}/${ITEMS.length} items collected`);
  
  return res.status(200).json({
    success: true,
    ...cachedData,
  });
};
