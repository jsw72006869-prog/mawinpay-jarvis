/**
 * MarketIntelligence API Module v1.0
 * KAMIS Open API를 활용한 농산물 도매/소매 가격 수집 및 분석
 * 
 * ─── KAMIS API 파라미터 문서 ───
 * Base URL: https://www.kamis.or.kr/service/price/xml.do
 * 
 * 요청 파라미터:
 *   p_cert_key     : 인증키 (공공데이터포털 또는 KAMIS 발급)
 *   p_cert_id      : 인증 ID
 *   p_returntype   : 응답 형식 (json / xml)
 *   p_startday     : 조회 시작일 (YYYY-MM-DD)
 *   p_endday       : 조회 종료일 (YYYY-MM-DD)
 *   p_itemcategorycode : 품목 카테고리 코드 (100: 식량작물, 200: 채소류, 300: 특용작물, 400: 과일류, 500: 축산물, 600: 수산물)
 *   p_itemcode     : 품목 코드 (예: 111: 쌀, 225: 옥수수, 312: 참깨)
 *   p_kindcode     : 품종 코드
 *   p_productrankcode : 등급 코드 (04: 상품, 05: 중품)
 *   p_countrycode  : 지역 코드 (1101: 서울)
 *   p_convert_kg_yn : kg 단위 변환 여부 (Y/N)
 *   action         : periodProductList (기간별 품목 가격)
 * 
 * 응답 형식:
 *   data.item[] = { itemname, kindname, countyname, marketname, yyyy, regday, price, ... }
 * 
 * ─── 분석 알고리즘 ───
 * 1. 이동평균 (SMA): 7일, 14일 이동평균으로 추세 파악
 * 2. 변동성 (Volatility): 표준편차 기반 가격 변동성 측정
 * 3. 매입/매도 추천: 현재가 < SMA7 이면 매입 추천, 현재가 > SMA14 이면 매도 추천
 */

const fetch = require('node-fetch');

// ─── 품목 코드 매핑 ───
const ITEM_CODES = {
  '옥수수': { category: '200', code: '225', kind: '00' },
  '밤':     { category: '300', code: '312', kind: '00' },
  '쌀':     { category: '100', code: '111', kind: '01' },
  '고구마': { category: '200', code: '212', kind: '00' },
  '감자':   { category: '200', code: '211', kind: '01' },
  '사과':   { category: '400', code: '411', kind: '05' },
  '배':     { category: '400', code: '412', kind: '01' },
  '참깨':   { category: '300', code: '312', kind: '00' },
};

// ─── 이동평균 계산 ───
function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

// ─── 변동성(표준편차) 계산 ───
function calculateVolatility(prices) {
  if (prices.length < 2) return 0;
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
  const variance = prices.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / prices.length;
  return Math.sqrt(variance);
}

// ─── 등락률 계산 ───
function calculateChangeRate(current, previous) {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous * 100).toFixed(2);
}

// ─── 매입/매도 추천 로직 ───
function getTradeRecommendation(currentPrice, sma7, sma14, volatility) {
  if (!sma7 || !sma14) return { action: 'HOLD', reason: '데이터 부족 - 분석 대기' };
  
  const priceVsSma7 = ((currentPrice - sma7) / sma7 * 100).toFixed(1);
  const priceVsSma14 = ((currentPrice - sma14) / sma14 * 100).toFixed(1);
  
  if (currentPrice < sma7 * 0.95 && currentPrice < sma14) {
    return { action: 'BUY', reason: `현재가가 7일 이동평균 대비 ${Math.abs(priceVsSma7)}% 하락. 매입 적기.`, confidence: 'HIGH' };
  } else if (currentPrice < sma7) {
    return { action: 'BUY', reason: `현재가가 단기 이동평균 하회. 매입 고려.`, confidence: 'MEDIUM' };
  } else if (currentPrice > sma14 * 1.05 && currentPrice > sma7) {
    return { action: 'SELL', reason: `현재가가 14일 이동평균 대비 ${priceVsSma14}% 상승. 매도 적기.`, confidence: 'HIGH' };
  } else if (currentPrice > sma14) {
    return { action: 'SELL', reason: `현재가가 장기 이동평균 상회. 매도 고려.`, confidence: 'MEDIUM' };
  }
  return { action: 'HOLD', reason: '이동평균 범위 내 안정적. 관망 추천.', confidence: 'LOW' };
}

// ─── KAMIS API 호출 ───
async function fetchKamisData(itemName, days = 30) {
  const KAMIS_KEY = process.env.KAMIS_API_KEY || process.env.VITE_KAMIS_API_KEY || '';
  const KAMIS_ID = process.env.KAMIS_CERT_ID || process.env.VITE_KAMIS_CERT_ID || '4457';
  
  const item = ITEM_CODES[itemName];
  if (!item) {
    throw new Error(`지원하지 않는 품목입니다: ${itemName}. 지원 품목: ${Object.keys(ITEM_CODES).join(', ')}`);
  }
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
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
    p_productrankcode: '04', // 상품 등급
    p_countrycode: '1101',   // 서울
    p_convert_kg_yn: 'Y',
  });
  
  const url = `https://www.kamis.or.kr/service/price/xml.do?${params.toString()}`;
  
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    timeout: 15000,
  });
  
  if (!response.ok) {
    throw new Error(`KAMIS API 응답 오류: ${response.status}`);
  }
  
  const data = await response.json();
  return data;
}

// ─── 데이터 분석 및 요약 생성 ───
function analyzeMarketData(rawData, itemName) {
  const items = rawData?.data?.item || rawData?.price || [];
  
  if (!items || items.length === 0) {
    return {
      item: itemName,
      status: 'NO_DATA',
      message: '해당 기간 데이터가 없습니다.',
      lastUpdated: new Date().toISOString(),
    };
  }
  
  // 가격 데이터 추출 및 정제
  const priceData = items
    .filter(i => i.price && i.price !== '-' && i.price !== '0')
    .map(i => ({
      date: i.regday || i.yyyy,
      price: parseInt(String(i.price).replace(/,/g, ''), 10),
      market: i.marketname || '가락시장',
    }))
    .filter(i => !isNaN(i.price) && i.price > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  if (priceData.length === 0) {
    return { item: itemName, status: 'NO_VALID_DATA', message: '유효한 가격 데이터가 없습니다.' };
  }
  
  const prices = priceData.map(p => p.price);
  const currentPrice = prices[prices.length - 1];
  const previousPrice = prices.length > 1 ? prices[prices.length - 2] : null;
  
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const avgPrice = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
  
  const sma7 = calculateSMA(prices, 7);
  const sma14 = calculateSMA(prices, 14);
  const volatility = calculateVolatility(prices);
  const changeRate = calculateChangeRate(currentPrice, previousPrice);
  const recommendation = getTradeRecommendation(currentPrice, sma7, sma14, volatility);
  
  return {
    item: itemName,
    status: 'SUCCESS',
    totalRecords: priceData.length,
    currentPrice,
    previousPrice,
    maxPrice,
    minPrice,
    avgPrice,
    changeRate: `${changeRate}%`,
    sma7: sma7 ? Math.round(sma7) : null,
    sma14: sma14 ? Math.round(sma14) : null,
    volatility: Math.round(volatility),
    recommendation,
    trend: changeRate > 0 ? 'UP' : changeRate < 0 ? 'DOWN' : 'FLAT',
    lastUpdated: new Date().toISOString(),
    // Chart.js용 데이터 구조
    chartData: {
      labels: priceData.map(p => p.date),
      datasets: [
        { label: `${itemName} 가격`, data: prices, borderColor: '#00D4FF', fill: false },
        ...(sma7 ? [{ label: '7일 이동평균', data: prices.map((_, i) => i >= 6 ? calculateSMA(prices.slice(0, i + 1), 7) : null), borderColor: '#FFD700', borderDash: [5, 5] }] : []),
        ...(sma14 ? [{ label: '14일 이동평균', data: prices.map((_, i) => i >= 13 ? calculateSMA(prices.slice(0, i + 1), 14) : null), borderColor: '#FF6B6B', borderDash: [10, 5] }] : []),
      ],
    },
  };
}

// ─── API 핸들러 ───
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  try {
    const { item = '옥수수', days = 30, action = 'analyze' } = req.method === 'POST' ? req.body : req.query;
    
    // 지원 품목 목록 조회
    if (action === 'list_items') {
      return res.status(200).json({
        success: true,
        items: Object.keys(ITEM_CODES),
        categories: {
          '식량작물': ['쌀'],
          '채소류': ['옥수수', '고구마', '감자'],
          '특용작물': ['밤', '참깨'],
          '과일류': ['사과', '배'],
        },
      });
    }
    
    // 데이터 수집 및 분석
    const rawData = await fetchKamisData(item, parseInt(days));
    const analysis = analyzeMarketData(rawData, item);
    
    return res.status(200).json({
      success: true,
      data: analysis,
      // 텔레메트리용 요약 (프론트엔드에서 emitNodeData에 사용)
      telemetrySummary: {
        item: analysis.item,
        totalRecords: analysis.totalRecords || 0,
        avgPrice: analysis.avgPrice || 0,
        maxPrice: analysis.maxPrice || 0,
        minPrice: analysis.minPrice || 0,
        trend: analysis.trend || 'N/A',
        recommendation: analysis.recommendation?.action || 'N/A',
        lastUpdated: analysis.lastUpdated,
      },
    });
    
  } catch (error) {
    console.error('[MarketIntelligence] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      telemetrySummary: { item: req.body?.item || req.query?.item || 'unknown', status: 'ERROR', error: error.message },
    });
  }
};
