export type ProductNameSource =
  | 'og:title'
  | 'title'
  | 'json_ld'
  | 'search_result'
  | 'keyword_hint'
  | 'manual'
  | 'failed';

export interface ResolveProductNameResult {
  success: boolean;
  productName?: string;
  source: ProductNameSource;
}

/**
 * HTML 문자열에서 상품명을 추출하는 헬퍼 함수
 * 1순위: og:title
 * 2순위: <title>
 * 3순위: JSON-LD product schema
 */
export function extractProductNameFromHtml(html: string): { productName: string; source: ProductNameSource } | null {
  // 1. og:title
  const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (ogMatch) {
    const name = cleanProductName(ogMatch[1]);
    if (name) return { productName: name, source: 'og:title' };
  }

  // 2. <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const name = cleanProductName(titleMatch[1]);
    if (name) return { productName: name, source: 'title' };
  }

  // 3. JSON-LD
  try {
    const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      const jsonStr = match[1];
      try {
        const data = JSON.parse(jsonStr);
        // data가 배열일 수도 있고 객체일 수도 있음
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Product' && item.name) {
            const name = cleanProductName(item.name);
            if (name) return { productName: name, source: 'json_ld' };
          }
        }
      } catch (e) {
        // JSON 파싱 에러 무시
      }
    }
  } catch (e) {
    // matchAll 에러 무시
  }

  return null;
}

export function cleanProductName(raw: string): string {
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
