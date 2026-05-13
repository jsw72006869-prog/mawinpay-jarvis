import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * SEO-K.1 Keyword Radar MVP
 * 상품 링크 → 상품명 추출 → 키워드 후보 생성 → 네이버 쇼핑 순위 측정
 *
 * POST /api/keyword-radar
 * Body: { productUrl: string; manualKeywords?: string[]; maxRank?: number }
 */

interface KeywordResult {
  keyword: string;
  rank: number | null;
  status: 'found' | 'not_found' | 'error';
  checkedAt: string;
  source: 'naver_shopping_search';
}

interface RadarResponse {
  success: boolean;
  productUrl: string;
  productName?: string;
  keywords: KeywordResult[];
  message?: string;
}

// ── 상품 URL에서 productId 추출 ──
function extractProductId(url: string): string | null {
  // smartstore.naver.com/.../products/1234567890
  const m1 = url.match(/products\/(\d+)/);
  if (m1) return m1[1];
  // shopping.naver.com/...?NaPm=...&productId=...
  const m2 = url.match(/productId=(\d+)/);
  if (m2) return m2[1];
  // brand.naver.com/.../products/1234567890
  const m3 = url.match(/\/products\/(\d+)/);
  if (m3) return m3[1];
  return null;
}

// ── 상품명 추출 (HTML fetch → og:title / title) ──
async function fetchProductName(productUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const html = await res.text();

    // og:title 우선
    const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogMatch) return cleanProductName(ogMatch[1]);

    // <title> fallback
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) return cleanProductName(titleMatch[1]);

    return null;
  } catch {
    return null;
  }
}

// ── 상품명 정리 (스토어명, 특수문자 제거) ──
function cleanProductName(raw: string): string {
  // "상품명 : 네이버쇼핑" 또는 "상품명 - 스토어명" 패턴 제거
  let name = raw
    .replace(/\s*[:：]\s*네이버.*$/i, '')
    .replace(/\s*[-–—]\s*네이버.*$/i, '')
    .replace(/\s*\|\s*.*$/, '')
    .trim();
  return name;
}

// ── 키워드 후보 생성 (상품명 기반, 최대 5개) ──
function generateKeywords(productName: string, manualKeywords?: string[]): string[] {
  const keywords: string[] = [];

  // 수동 키워드 우선
  if (manualKeywords && manualKeywords.length > 0) {
    keywords.push(...manualKeywords.slice(0, 5));
  }

  if (keywords.length >= 5) return keywords.slice(0, 5);

  // 상품명에서 자동 생성
  // 브랜드/수식어/특수문자 제거
  const cleaned = productName
    .replace(/[[\](){}<>【】「」『』""'']/g, ' ')
    .replace(/[!@#$%^&*+=~`|\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 단어 분리
  const words = cleaned.split(' ').filter(w => w.length > 0);

  // 전체 상품명 (짧으면)
  if (cleaned.length <= 30 && !keywords.includes(cleaned)) {
    keywords.push(cleaned);
  }

  // 핵심 명사 조합 (수량/단위/수식어 제거)
  const stopWords = ['특가', '할인', '무료배송', '당일발송', '국내산', '프리미엄', '고급', '최상급',
    '특품', '상품', '선물세트', '선물용', '가정용', '업소용', '대용량', '소포장',
    '개입', '입', '개', '팩', 'kg', 'g', 'ml', 'L', '박스', '세트'];

  const coreWords = words.filter(w => {
    if (/^\d+[개입팩kgmlL박스세트]*$/.test(w)) return false;
    if (stopWords.some(sw => w.toLowerCase().includes(sw.toLowerCase()))) return false;
    return w.length >= 2;
  });

  // 핵심 단어 조합
  if (coreWords.length >= 2) {
    const combo = coreWords.slice(0, 3).join(' ');
    if (!keywords.includes(combo)) keywords.push(combo);
  }

  // 핵심 단어 2개 조합
  if (coreWords.length >= 2) {
    const combo2 = coreWords.slice(0, 2).join(' ');
    if (!keywords.includes(combo2)) keywords.push(combo2);
  }

  // 첫 번째 핵심 단어 단독
  if (coreWords.length >= 1 && !keywords.includes(coreWords[0])) {
    keywords.push(coreWords[0]);
  }

  // 수량 포함 조합
  const quantityWord = words.find(w => /^\d+[개입팩]+$/.test(w));
  if (quantityWord && coreWords.length >= 1) {
    const withQty = `${coreWords[0]} ${quantityWord}`;
    if (!keywords.includes(withQty)) keywords.push(withQty);
  }

  return keywords.slice(0, 5);
}

// ── 네이버 쇼핑 검색으로 순위 측정 ──
async function measureRank(
  keyword: string,
  productId: string | null,
  productUrl: string,
  maxRank: number,
  clientId: string,
  clientSecret: string
): Promise<KeywordResult> {
  const checkedAt = new Date().toISOString();

  try {
    // 네이버 쇼핑 검색 API
    const searchUrl = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=${Math.min(maxRank, 100)}&sort=sim`;

    const res = await fetch(searchUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    if (!res.ok) {
      return { keyword, rank: null, status: 'error', checkedAt, source: 'naver_shopping_search' };
    }

    const data = await res.json();
    const items = data.items || [];

    // 순위 찾기
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const link = item.link || '';

      // 1순위: productId 매칭
      if (productId) {
        if (link.includes(productId) || (item.productId && String(item.productId) === productId)) {
          return { keyword, rank: i + 1, status: 'found', checkedAt, source: 'naver_shopping_search' };
        }
      }

      // 2순위: URL 부분 매칭 (스토어 도메인 + 상품 경로)
      const urlParts = productUrl.match(/smartstore\.naver\.com\/([^/]+)\/products\/(\d+)/);
      if (urlParts) {
        const storeId = urlParts[1];
        if (link.includes(storeId) && (productId ? link.includes(productId) : false)) {
          return { keyword, rank: i + 1, status: 'found', checkedAt, source: 'naver_shopping_search' };
        }
      }
    }

    // 100위 밖 / 미노출
    return { keyword, rank: null, status: 'not_found', checkedAt, source: 'naver_shopping_search' };
  } catch {
    return { keyword, rank: null, status: 'error', checkedAt, source: 'naver_shopping_search' };
  }
}

// ── Main Handler ──
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      success: false,
      message: 'Naver API credentials not configured',
    } as RadarResponse);
  }

  const { productUrl, manualKeywords, maxRank = 100 } = req.body || {};

  if (!productUrl || typeof productUrl !== 'string') {
    return res.status(400).json({
      success: false,
      productUrl: productUrl || '',
      keywords: [],
      message: '상품 URL을 입력해주세요.',
    } as RadarResponse);
  }

  // URL 유효성 검사
  if (!productUrl.includes('naver.com') && !productUrl.includes('shopping.naver')) {
    return res.status(400).json({
      success: false,
      productUrl,
      keywords: [],
      message: '네이버 스마트스토어 또는 네이버 쇼핑 URL만 지원합니다.',
    } as RadarResponse);
  }

  // productId 추출
  const productId = extractProductId(productUrl);

  // 상품명 추출
  const productName = await fetchProductName(productUrl);

  if (!productName && (!manualKeywords || manualKeywords.length === 0)) {
    return res.status(200).json({
      success: false,
      productUrl,
      productName: undefined,
      keywords: [],
      message: '상품명 추출에 실패했습니다. 키워드를 직접 입력해주세요.',
    } as RadarResponse);
  }

  // 키워드 후보 생성
  const keywords = generateKeywords(productName || '', manualKeywords);

  if (keywords.length === 0) {
    return res.status(200).json({
      success: false,
      productUrl,
      productName: productName || undefined,
      keywords: [],
      message: '키워드를 생성할 수 없습니다. 키워드를 직접 입력해주세요.',
    } as RadarResponse);
  }

  // 순위 측정 (순차 실행 — 요청 수 최소화)
  const effectiveMaxRank = Math.min(Number(maxRank) || 100, 100);
  const results: KeywordResult[] = [];

  for (const kw of keywords) {
    const result = await measureRank(kw, productId, productUrl, effectiveMaxRank, clientId, clientSecret);
    results.push(result);
  }

  return res.status(200).json({
    success: true,
    productUrl,
    productName: productName || undefined,
    keywords: results,
    message: productName
      ? `${productName} — ${results.length}개 키워드 측정 완료`
      : `${results.length}개 키워드 측정 완료 (상품명 추출 실패)`,
  } as RadarResponse);
}
