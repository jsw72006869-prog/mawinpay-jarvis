import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * SEO-K.1.1 Keyword Radar — Real Product URL Verification
 * 상품 링크 → productId 추출 + nl-query 힌트 → 상품명 추출 → 키워드 후보 생성 → 네이버 쇼핑 순위 측정
 *
 * POST /api/keyword-radar
 * Body: { productUrl: string; manualKeywords?: string[]; maxRank?: number }
 */

interface KeywordResult {
  keyword: string;
  rank: number | null;
  status: 'found' | 'not_found' | 'error';
  rankType: 'organic_or_mixed' | 'unknown';
  checkedAt: string;
  source: 'naver_shopping_search';
}

interface Diagnostics {
  productId: string | null;
  productIdExtracted: boolean;
  keywordHint: string | null;
  productNameExtracted: boolean;
  checkedKeywords: number;
  maxRank: number;
  matchStrategy: string;
}

interface RadarResponse {
  success: boolean;
  productUrl: string;
  productName?: string;
  keywords: KeywordResult[];
  diagnostics?: Diagnostics;
  message?: string;
}

// ── 구현 A: productId 추출 보강 ──
function extractProductId(url: string): string | null {
  try {
    // 1. /products/{productId} 패턴 (smartstore, brand, m.smartstore)
    const m1 = url.match(/\/products\/(\d{8,})/);
    if (m1) return m1[1];

    // 2. /window-products/{productId} (shopping.naver.com)
    const m2 = url.match(/\/window-products\/(\d{8,})/);
    if (m2) return m2[1];

    // 3. query param productId=
    const urlObj = new URL(url);
    const qpId = urlObj.searchParams.get('productId');
    if (qpId && /^\d{8,}$/.test(qpId)) return qpId;

    return null;
  } catch {
    // URL 파싱 실패 시 regex fallback
    const m = url.match(/\/products\/(\d{8,})/);
    return m ? m[1] : null;
  }
}

// ── 구현 B: nl-query 키워드 힌트 추출 ──
function extractNlQuery(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const nlQuery = urlObj.searchParams.get('nl-query');
    if (nlQuery && nlQuery.trim().length > 0) {
      return decodeURIComponent(nlQuery.trim());
    }
    return null;
  } catch {
    const m = url.match(/[?&]nl-query=([^&]+)/);
    if (m) {
      try { return decodeURIComponent(m[1]); } catch { return m[1]; }
    }
    return null;
  }
}

// ── 구현 C: 상품명 추출 (og:title → title → meta[name=title]) ──
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

    // 1. og:title
    const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (ogMatch) return cleanProductName(ogMatch[1]);

    // 2. <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) return cleanProductName(titleMatch[1]);

    // 3. meta[name="title"]
    const metaTitleMatch = html.match(/<meta[^>]*name=["']title["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']title["']/i);
    if (metaTitleMatch) return cleanProductName(metaTitleMatch[1]);

    return null;
  } catch {
    return null;
  }
}

function cleanProductName(raw: string): string {
  let name = raw
    .replace(/\s*[:：]\s*네이버.*$/i, '')
    .replace(/\s*[-–—]\s*네이버.*$/i, '')
    .replace(/\s*\|\s*.*$/, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
  return name.length > 0 ? name : raw.trim();
}

// ── 키워드 후보 생성 (nl-query 힌트 우선, 최대 5개) ──
function generateKeywords(
  productName: string,
  manualKeywords?: string[],
  nlQueryHint?: string | null
): string[] {
  const keywords: string[] = [];

  // 1. nl-query 힌트 우선
  if (nlQueryHint && nlQueryHint.trim().length > 0) {
    const hint = nlQueryHint.trim();
    if (!keywords.includes(hint)) keywords.push(hint);
  }

  // 2. 수동 키워드
  if (manualKeywords && manualKeywords.length > 0) {
    for (const kw of manualKeywords) {
      if (kw.trim().length > 0 && !keywords.includes(kw.trim()) && keywords.length < 5) {
        keywords.push(kw.trim());
      }
    }
  }

  if (keywords.length >= 5) return keywords.slice(0, 5);

  // 3. 상품명 기반 자동 생성
  if (productName && productName.length > 0) {
    const cleaned = productName
      .replace(/[[\](){}<>【】「」『』""'']/g, ' ')
      .replace(/[!@#$%^&*+=~`|\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = cleaned.split(' ').filter(w => w.length > 0);
    const stopWords = ['특가', '할인', '무료배송', '당일발송', '국내산', '프리미엄', '고급', '최상급',
      '특품', '상품', '선물세트', '선물용', '가정용', '업소용', '대용량', '소포장',
      '개입', '입', '개', '팩', 'kg', 'g', 'ml', 'L', '박스', '세트'];
    const coreWords = words.filter(w => {
      if (/^\d+[개입팩kgmlL박스세트]*$/.test(w)) return false;
      if (stopWords.some(sw => w.toLowerCase().includes(sw.toLowerCase()))) return false;
      return w.length >= 2;
    });

    // 전체 상품명 (짧으면)
    if (cleaned.length <= 30 && !keywords.includes(cleaned) && keywords.length < 5) {
      keywords.push(cleaned);
    }

    // 핵심 단어 3개 조합
    if (coreWords.length >= 3) {
      const combo = coreWords.slice(0, 3).join(' ');
      if (!keywords.includes(combo) && keywords.length < 5) keywords.push(combo);
    }

    // 핵심 단어 2개 조합
    if (coreWords.length >= 2) {
      const combo2 = coreWords.slice(0, 2).join(' ');
      if (!keywords.includes(combo2) && keywords.length < 5) keywords.push(combo2);
    }

    // 첫 번째 핵심 단어
    if (coreWords.length >= 1 && !keywords.includes(coreWords[0]) && keywords.length < 5) {
      keywords.push(coreWords[0]);
    }

    // 수량 포함 조합
    const quantityWord = words.find(w => /^\d+[개입팩]+$/.test(w));
    if (quantityWord && coreWords.length >= 1 && keywords.length < 5) {
      const withQty = `${coreWords[0]} ${quantityWord}`;
      if (!keywords.includes(withQty)) keywords.push(withQty);
    }
  }

  return keywords.filter(k => k.trim().length > 0).slice(0, 5);
}

// ── 구현 D: URL normalize ──
function normalizeUrlForMatch(url: string): string {
  try { return decodeURIComponent(url).toLowerCase(); }
  catch { return url.toLowerCase(); }
}

// ── 구현 D: 검색 결과에서 productId 매칭 보강 ──
function matchProductId(
  item: Record<string, string>,
  productId: string
): { matched: boolean; strategy: string } {
  const link = item.link || '';
  const mallProductId = item.mallProductId || item.productId || '';
  const normalizedLink = normalizeUrlForMatch(link);
  const normalizedId = productId.toLowerCase();

  if (link.includes(productId)) return { matched: true, strategy: 'productId_in_href' };
  if (normalizedLink.includes(normalizedId)) return { matched: true, strategy: 'productId_in_decoded_href' };
  if (String(mallProductId) === productId) return { matched: true, strategy: 'mallProductId_field_match' };
  if (normalizedLink.includes(`/products/${normalizedId}`)) return { matched: true, strategy: 'products_path_match' };
  if (normalizedLink.includes(`/${normalizedId}`) && normalizedLink.includes('naver.com')) {
    return { matched: true, strategy: 'naver_path_match' };
  }
  return { matched: false, strategy: 'no_match' };
}

// ── 구현 E: 순위 측정 (rankType + diagnostics 포함) ──
async function measureRank(
  keyword: string,
  productId: string | null,
  _productUrl: string,
  maxRank: number,
  clientId: string,
  clientSecret: string
): Promise<{ result: KeywordResult; matchStrategy: string }> {
  const checkedAt = new Date().toISOString();

  try {
    const searchUrl = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=${Math.min(maxRank, 100)}&sort=sim`;
    const res = await fetch(searchUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    if (!res.ok) {
      return {
        result: { keyword, rank: null, status: 'error', rankType: 'unknown', checkedAt, source: 'naver_shopping_search' },
        matchStrategy: 'api_error',
      };
    }

    const data = await res.json();
    const items: Record<string, string>[] = data.items || [];

    if (productId) {
      for (let i = 0; i < items.length; i++) {
        const { matched, strategy } = matchProductId(items[i], productId);
        if (matched) {
          return {
            result: { keyword, rank: i + 1, status: 'found', rankType: 'organic_or_mixed', checkedAt, source: 'naver_shopping_search' },
            matchStrategy: strategy,
          };
        }
      }
      return {
        result: { keyword, rank: null, status: 'not_found', rankType: 'organic_or_mixed', checkedAt, source: 'naver_shopping_search' },
        matchStrategy: 'scanned_all_not_found',
      };
    }

    // productId 없으면 순위 측정 불가
    return {
      result: { keyword, rank: null, status: 'not_found', rankType: 'unknown', checkedAt, source: 'naver_shopping_search' },
      matchStrategy: 'no_productId',
    };
  } catch {
    return {
      result: { keyword, rank: null, status: 'error', rankType: 'unknown', checkedAt, source: 'naver_shopping_search' },
      matchStrategy: 'network_error',
    };
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
    return res.status(500).json({ success: false, message: 'Naver API credentials not configured' } as RadarResponse);
  }

  const { productUrl, manualKeywords, maxRank = 100 } = req.body || {};

  if (!productUrl || typeof productUrl !== 'string') {
    return res.status(400).json({ success: false, productUrl: productUrl || '', keywords: [], message: '상품 URL을 입력해주세요.' } as RadarResponse);
  }

  if (!productUrl.includes('naver.com') && !productUrl.includes('shopping.naver')) {
    return res.status(400).json({ success: false, productUrl, keywords: [], message: '네이버 스마트스토어 또는 네이버 쇼핑 URL만 지원합니다.' } as RadarResponse);
  }

  // 구현 A: productId 추출
  const productId = extractProductId(productUrl);

  // 구현 B: nl-query 힌트 추출
  const keywordHint = extractNlQuery(productUrl);

  // 구현 C: 상품명 추출
  const productName = await fetchProductName(productUrl);
  const productNameExtracted = productName !== null && productName.length > 0;

  // 상품명 추출 실패 + manualKeywords 없음 + nl-query 없음 → 에러
  if (!productNameExtracted && (!manualKeywords || manualKeywords.length === 0) && !keywordHint) {
    return res.status(200).json({
      success: false,
      productUrl,
      keywords: [],
      diagnostics: {
        productId,
        productIdExtracted: productId !== null,
        keywordHint,
        productNameExtracted: false,
        checkedKeywords: 0,
        maxRank: Math.min(Number(maxRank) || 100, 100),
        matchStrategy: 'no_keywords_available',
      },
      message: '상품명 추출에 실패했습니다. 키워드를 직접 입력해주세요.',
    } as RadarResponse);
  }

  // 키워드 후보 생성
  const keywords = generateKeywords(productName || '', manualKeywords, keywordHint);

  if (keywords.length === 0) {
    return res.status(200).json({
      success: false,
      productUrl,
      productName: productName || undefined,
      keywords: [],
      diagnostics: {
        productId,
        productIdExtracted: productId !== null,
        keywordHint,
        productNameExtracted,
        checkedKeywords: 0,
        maxRank: Math.min(Number(maxRank) || 100, 100),
        matchStrategy: 'no_keywords_generated',
      },
      message: '키워드를 생성할 수 없습니다. 키워드를 직접 입력해주세요.',
    } as RadarResponse);
  }

  // 순위 측정
  const effectiveMaxRank = Math.min(Number(maxRank) || 100, 100);
  const results: KeywordResult[] = [];
  let lastMatchStrategy = 'not_measured';

  for (const kw of keywords) {
    const { result, matchStrategy } = await measureRank(kw, productId, productUrl, effectiveMaxRank, clientId, clientSecret);
    results.push(result);
    if (result.status === 'found') lastMatchStrategy = matchStrategy;
    else if (lastMatchStrategy === 'not_measured') lastMatchStrategy = matchStrategy;
  }

  // 구현 F: diagnostics
  const diagnostics: Diagnostics = {
    productId,
    productIdExtracted: productId !== null,
    keywordHint,
    productNameExtracted,
    checkedKeywords: results.length,
    maxRank: effectiveMaxRank,
    matchStrategy: lastMatchStrategy,
  };

  const foundCount = results.filter(r => r.status === 'found').length;
  const notFoundCount = results.filter(r => r.status === 'not_found').length;

  return res.status(200).json({
    success: true,
    productUrl,
    productName: productName || undefined,
    keywords: results,
    diagnostics,
    message: productNameExtracted
      ? `${productName} — ${results.length}개 키워드 측정 완료 (발견: ${foundCount}, 100위 밖: ${notFoundCount})`
      : `${results.length}개 키워드 측정 완료 (상품명 추출 실패, 발견: ${foundCount}, 100위 밖: ${notFoundCount})`,
  } as RadarResponse);
}
