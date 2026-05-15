import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * SEO-K.1.2 Keyword Radar — Product Name Resolver
 * 상품 링크 → productId 추출 + nl-query 힌트 → 상품명 추출 보강 → 키워드 후보 생성 → 네이버 쇼핑 순위 측정
 *
 * 상품명 추출 우선순위:
 *   og:title → title → json_ld → search_result → keyword_hint → manual → failed
 *
 * POST /api/keyword-radar
 * Body: { productUrl: string; manualKeywords?: string[]; maxRank?: number }
 *
 * NOTE: 스마트스토어는 CSR(JavaScript 렌더링) 방식이라 서버 fetch로 og:title/title/json_ld 추출이
 *       불가능한 경우가 많습니다. 이 경우 search_result(네이버 쇼핑 API 결과에서 productId 매칭된
 *       상품의 title 역추출) → keyword_hint(nl-query 파라미터) → manual 순서로 fallback합니다.
 *       향후 Browser Operator/Playwright 도입 시 og:title 추출 성공률 개선 가능.
 */

// ── 타입 정의 ──
type ProductNameSource =
  | 'og:title'
  | 'title'
  | 'json_ld'
  | 'search_result'
  | 'keyword_hint'
  | 'manual'
  | 'failed';

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
  productNameResolved: boolean;
  productNameSource: ProductNameSource;
  keywordHint: string | null;
  checkedKeywords: number;
  maxRank: number;
  matchStrategy: string;
}

interface RadarResponse {
  success: boolean;
  productUrl: string;
  productName?: string;
  productNameSource?: ProductNameSource;
  keywords: KeywordResult[];
  diagnostics?: Diagnostics;
  message?: string;
}

// ── 구현 A: productId 추출 ──
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
    const m = url.match(/\/products\/(\d{8,})/);
    return m ? m[1] : null;
  }
}

// ── 구현 D: nl-query 키워드 힌트 추출 ──
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

// ── HTML 정제 ──
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

// ── 구현 B: HTML에서 상품명 추출 (og:title → title → json_ld) ──
function extractNameFromHtml(html: string): { productName: string; source: ProductNameSource } | null {
  // 1순위: og:title
  const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (ogMatch) {
    const name = cleanProductName(ogMatch[1]);
    if (name && name.length > 1) return { productName: name, source: 'og:title' };
  }

  // 2순위: <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const name = cleanProductName(titleMatch[1]);
    if (name && name.length > 1) return { productName: name, source: 'title' };
  }

  // 3순위: JSON-LD product schema
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch: RegExpExecArray | null;
  while ((ldMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(ldMatch[1]);
      const items: Record<string, unknown>[] = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'Product' && typeof item.name === 'string') {
          const name = cleanProductName(item.name);
          if (name && name.length > 1) return { productName: name, source: 'json_ld' };
        }
      }
    } catch {
      // JSON 파싱 에러 무시
    }
  }

  return null;
}

// ── 구현 B+C: 상품명 추출 (HTML fetch → search_result 역추출) ──
async function resolveProductName(
  productUrl: string,
  productId: string | null,
  keywordHint: string | null,
  clientId: string,
  clientSecret: string
): Promise<{ productName: string | null; source: ProductNameSource }> {
  // Step 1: HTML fetch (og:title → title → json_ld)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
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
    if (res.ok) {
      const html = await res.text();
      const htmlResult = extractNameFromHtml(html);
      if (htmlResult) {
        return { productName: htmlResult.productName, source: htmlResult.source };
      }
    }
  } catch {
    // HTML fetch 실패 — 다음 단계로
  }

  // Step 2: search_result 역추출 (productId가 있을 때만)
  // 네이버 쇼핑 API에서 productId 매칭된 결과의 title 추출
  if (productId && keywordHint) {
    try {
      const searchUrl = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keywordHint)}&display=100&sort=sim`;
      const searchRes = await fetch(searchUrl, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      });
      if (searchRes.ok) {
        const data = await searchRes.json();
        const items: Record<string, string>[] = data.items || [];
        for (const item of items) {
          const link = item.link || '';
          const mallProductId = item.mallProductId || item.productId || '';
          // 반드시 동일 productId 결과만 사용 (다른 상품명 가져오면 안 됨)
          if (
            link.includes(productId) ||
            String(mallProductId) === productId
          ) {
            const rawTitle = item.title || '';
            // 네이버 쇼핑 API 결과의 title에는 <b> 태그가 포함될 수 있음
            const cleanedTitle = rawTitle.replace(/<[^>]+>/g, '').trim();
            if (cleanedTitle && cleanedTitle.length > 1) {
              return { productName: cleanedTitle, source: 'search_result' };
            }
          }
        }
      }
    } catch {
      // search_result 실패 — 다음 단계로
    }
  }

  // Step 3: keyword_hint fallback (nl-query 파라미터)
  // 상품명이 아님 — UI에서 "검색 키워드 힌트 사용 중"으로 표시해야 함
  if (keywordHint && keywordHint.length > 0) {
    return { productName: keywordHint, source: 'keyword_hint' };
  }

  // Step 4: 모든 추출 실패
  return { productName: null, source: 'failed' };
}

// ── 키워드 후보 생성 (nl-query 힌트 우선, 최대 5개) ──
function generateKeywords(
  productName: string,
  productNameSource: ProductNameSource,
  manualKeywords?: string[],
  nlQueryHint?: string | null
): string[] {
  const keywords: string[] = [];

  // 1. nl-query 힌트 우선 (keyword_hint source일 때도 포함)
  if (nlQueryHint && nlQueryHint.trim().length > 0) {
    const hint = nlQueryHint.trim();
    if (!keywords.includes(hint)) keywords.push(hint);
  }

  // 2. 수동 키워드 (manualKeywords fallback — 절대 제거 금지)
  if (manualKeywords && manualKeywords.length > 0) {
    for (const kw of manualKeywords) {
      if (kw.trim().length > 0 && !keywords.includes(kw.trim()) && keywords.length < 5) {
        keywords.push(kw.trim());
      }
    }
  }

  if (keywords.length >= 5) return keywords.slice(0, 5);

  // 3. 상품명 기반 자동 생성 (og:title / title / json_ld / search_result source일 때)
  if (
    productName &&
    productName.length > 0 &&
    productNameSource !== 'keyword_hint' &&
    productNameSource !== 'failed' &&
    productNameSource !== 'manual'
  ) {
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

// ── URL normalize ──
function normalizeUrlForMatch(url: string): string {
  try { return decodeURIComponent(url).toLowerCase(); }
  catch { return url.toLowerCase(); }
}

// ── 검색 결과에서 productId 매칭 ──
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

// ── 순위 측정 ──
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

  // 구현 D: nl-query 키워드 힌트 추출
  const keywordHint = extractNlQuery(productUrl);

  // 구현 B+C: 상품명 추출 (og:title → title → json_ld → search_result → keyword_hint → failed)
  const { productName, source: productNameSource } = await resolveProductName(
    productUrl,
    productId,
    keywordHint,
    clientId,
    clientSecret
  );

  const productNameResolved = productName !== null && productName.length > 0 && productNameSource !== 'failed';

  // 구현 E: manualKeywords fallback 유지 — 모든 추출 실패 + manualKeywords 없음 + keywordHint 없음 → 에러
  if (!productNameResolved && (!manualKeywords || manualKeywords.length === 0) && !keywordHint) {
    return res.status(200).json({
      success: false,
      productUrl,
      productNameSource: 'failed',
      keywords: [],
      diagnostics: {
        productId,
        productIdExtracted: productId !== null,
        productNameResolved: false,
        productNameSource: 'failed' as ProductNameSource,
        keywordHint,
        checkedKeywords: 0,
        maxRank: Math.min(Number(maxRank) || 100, 100),
        matchStrategy: 'no_keywords_available',
      },
      message: '상품명 추출에 실패했습니다. 키워드를 직접 입력해주세요.',
    } as RadarResponse);
  }

  // 키워드 후보 생성
  const keywords = generateKeywords(
    productName || '',
    productNameSource,
    manualKeywords,
    keywordHint
  );

  if (keywords.length === 0) {
    return res.status(200).json({
      success: false,
      productUrl,
      productName: productName || undefined,
      productNameSource,
      keywords: [],
      diagnostics: {
        productId,
        productIdExtracted: productId !== null,
        productNameResolved,
        productNameSource,
        keywordHint,
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

  // 구현 H: diagnostics 보강
  const diagnostics: Diagnostics = {
    productId,
    productIdExtracted: productId !== null,
    productNameResolved,
    productNameSource,
    keywordHint,
    checkedKeywords: results.length,
    maxRank: effectiveMaxRank,
    matchStrategy: lastMatchStrategy,
  };

  const foundCount = results.filter(r => r.status === 'found').length;
  const notFoundCount = results.filter(r => r.status === 'not_found').length;

  // 상품명 source별 메시지
  let resolveNote = '';
  if (productNameSource === 'og:title') resolveNote = '(og:title 추출)';
  else if (productNameSource === 'title') resolveNote = '(title 추출)';
  else if (productNameSource === 'json_ld') resolveNote = '(JSON-LD 추출)';
  else if (productNameSource === 'search_result') resolveNote = '(검색결과 역추출)';
  else if (productNameSource === 'keyword_hint') resolveNote = '(키워드 힌트 — 상품명 아님)';
  else if (productNameSource === 'manual') resolveNote = '(수동 입력)';
  else resolveNote = '(상품명 추출 실패)';

  return res.status(200).json({
    success: true,
    productUrl,
    productName: productName || undefined,
    productNameSource,
    keywords: results,
    diagnostics,
    message: productNameResolved && productNameSource !== 'keyword_hint'
      ? `${productName} ${resolveNote} — ${results.length}개 키워드 측정 완료 (발견: ${foundCount}, 100위 밖: ${notFoundCount})`
      : `${results.length}개 키워드 측정 완료 ${resolveNote} (발견: ${foundCount}, 100위 밖: ${notFoundCount})`,
  } as RadarResponse);
}
