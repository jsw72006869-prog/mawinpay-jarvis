/// <reference types="node" />
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mysql from 'mysql2/promise';
import crypto from 'crypto';

// Dynamic imports for ESM-only packages (resolved at runtime)
let _bcrypt: any = null;
let _HttpsProxyAgent: any = null;

async function getBcrypt() {
  if (!_bcrypt) {
    const mod = await import('bcryptjs');
    _bcrypt = mod.default || mod;
  }
  return _bcrypt;
}

async function getHttpsProxyAgentClass() {
  if (!_HttpsProxyAgent) {
    const mod = await import('https-proxy-agent');
    _HttpsProxyAgent = (mod as any).HttpsProxyAgent || (mod as any).default;
  }
  return _HttpsProxyAgent;
}

// ── Runtime: Node.js (NOT Edge) ──
export const config = {
  maxDuration: 60,
  runtime: 'nodejs',
};

// ── 환경변수 (원문 절대 출력 금지) ──
const SMARTSTORE_CLIENT_ID = process.env.SMARTSTORE_CLIENT_ID || '';
const SMARTSTORE_CLIENT_SECRET = process.env.SMARTSTORE_CLIENT_SECRET || '';
const QUOTAGUARD_URL = process.env.QUOTAGUARD_URL || process.env.QUOTAGUARDSTATIC_URL || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const NAVER_API_BASE = 'https://api.commerce.naver.com/external';
const KAMIS_API_KEY = process.env.KAMIS_API_KEY || '';
const KAMIS_CERT_ID = process.env.KAMIS_CERT_ID || '';

// ── 허용된 QuotaGuard IP 목록 (네이버 API 센터에 등록된 IP) ──
const ALLOWED_IPS = ['52.5.238.209', '52.6.13.167', '72.252.132.247'];

// ── QuotaGuard Proxy Agent 생성 ──
async function getProxyAgent(): Promise<any> {
  if (!QUOTAGUARD_URL) return null;
  const AgentClass = await getHttpsProxyAgentClass();
  return new AgentClass(QUOTAGUARD_URL);
}

function getProxyScheme(): string {
  if (!QUOTAGUARD_URL) return 'none';
  try {
    const url = new URL(QUOTAGUARD_URL);
    return url.protocol;
  } catch { return 'unknown'; }
}

function getAgentType(): string {
  if (!QUOTAGUARD_URL) return 'none';
  const scheme = getProxyScheme();
  if (scheme === 'http:' || scheme === 'https:') return 'HttpsProxyAgent';
  if (scheme === 'socks5:' || scheme === 'socks5h:') return 'SocksProxyAgent';
  return 'HttpsProxyAgent';
}

// ── 프록시 경유 fetch ──
async function proxyFetch(url: string, options: any = {}): Promise<any> {
  const agent = await getProxyAgent();
  if (!agent) {
    throw new Error('QUOTAGUARD_URL not configured - cannot call Naver API without proxy');
  }
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch(url, { ...options, agent } as any);
}

// ── 네이버 스마트스토어 토큰 발급 (QuotaGuard 프록시 경유, 캐시 적용) ──
let _cachedToken: { token: string; expiresAt: number } | null = null;

async function getSmartStoreToken(): Promise<string> {
  // 토큰 캐시: 만료 30초 전까지 재사용 (네이버 토큰 유효기간 약 30분)
  if (_cachedToken && Date.now() < _cachedToken.expiresAt) {
    return _cachedToken.token;
  }

  if (!SMARTSTORE_CLIENT_ID || !SMARTSTORE_CLIENT_SECRET) {
    throw new Error('SMARTSTORE credentials not configured');
  }
  const timestamp = String(Date.now());
  const pwd = `${SMARTSTORE_CLIENT_ID}_${timestamp}`;
  
  const bcryptMod = await getBcrypt();
  const hashed = bcryptMod.hashSync(pwd, SMARTSTORE_CLIENT_SECRET);
  const clientSecretSign = Buffer.from(hashed).toString('base64');

  const params = new URLSearchParams({
    client_id: SMARTSTORE_CLIENT_ID,
    timestamp: timestamp,
    client_secret_sign: clientSecretSign,
    grant_type: 'client_credentials',
    type: 'SELF',
  });

  // SMARTSTORE-ORDERS-FIX.3B: 토큰 발급 재시도 + text 파싱 (QuotaGuard 프록시 응답 깨짐 방어)
  for (let tokenAttempt = 0; tokenAttempt < 3; tokenAttempt++) {
    try {
      const res = await proxyFetch(`${NAVER_API_BASE}/v1/oauth2/token?${params.toString()}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });

      const rawText = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        // JSON 파싱 실패 → 재시도
        if (tokenAttempt < 2) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        throw new Error(`Token JSON parse failed (attempt ${tokenAttempt + 1}): ${rawText.slice(0, 100)}`);
      }

      if (!data.access_token) {
        const errorCode = data.code || data.error || '';
        if (tokenAttempt < 2) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        throw new Error(`Token failed: ${errorCode}`);
      }

      // 토큰 캐시 (25분간 유효)
      _cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + 25 * 60 * 1000,
      };
      return data.access_token;
    } catch (err: any) {
      if (tokenAttempt < 2) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Token failed after 3 attempts');
}

// ── 인증 포함 스마트스토어 API 요청 (프록시 경유) ──
async function smartStoreRequest(path: string, options: any = {}): Promise<{ status: number; data: any }> {
  const token = await getSmartStoreToken();
  const url = `${NAVER_API_BASE}${path}`;
  const res = await proxyFetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  return { status: res.status, data };
}

// ── 날짜 포맷 (KST) ──
function formatNaverDate(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.000+09:00`;
}

function getStatusKo(status: string): string {
  const map: Record<string, string> = {
    PAYMENT_WAITING: '입금대기', PAYED: '결제완료', DELIVERING: '배송중',
    DELIVERED: '배송완료', PURCHASE_DECIDED: '구매확정', EXCHANGED: '교환완료',
    CANCELED: '취소', RETURNED: '반품', CANCELED_BY_NOPAYMENT: '미결제취소',
  };
  return map[status] || status;
}

// ── 상태별 한글 라벨 (top-level) ──
const STATUS_LABEL_MAP: Record<string, string> = {
  PAYED: '결제완료', DELIVERING: '배송중', DELIVERED: '배송완료',
  PURCHASE_DECIDED: '구매확정', CANCELED: '취소', RETURNED: '반품',
  EXCHANGED: '교환완료', PAYMENT_WAITING: '입금대기', CANCELED_BY_NOPAYMENT: '미결제취소',
};

// ── 안전한 주문 매핑 (개인정보 제외, top-level) ──
function safeOrderMap(item: any) {
  const po = item.productOrder || item;
  const rawDate = po.paymentDate || po.orderDate || null;
  const rawAmount = po.totalPaymentAmount ?? po.unitPrice ?? null;
  return {
    productOrderId: po.productOrderId ? po.productOrderId.slice(0, 8) + '***' : 'N/A',
    orderDate: rawDate || null,
    productName: po.productName || '상품명 없음',
    quantity: Number(po.quantity) || 1,
    totalAmount: rawAmount !== null ? Number(rawAmount) : null,
    statusCode: po.productOrderStatus || 'UNKNOWN',
    statusLabel: STATUS_LABEL_MAP[po.productOrderStatus] || po.productOrderStatus || '확인 필요',
    optionContent: po.optionContent || '',
    placeOrderStatus: po.placeOrderStatus || '',
  };
}

// ── product-orders/last-changed-statuses API (KST 일별 조회, top-level) ──
async function getLastChangedItems(lastChangedType: string, days: number, useKST: boolean = false, batchSize: number = 3): Promise<any[]> {
  const now = new Date();
  const allItems: any[] = [];

  // SMARTSTORE-ORDERS-FIX.11: 병렬 사이즈 파라미터화 (PAYED용=3, deep_sync용=5)
  const BATCH_SIZE = batchSize;
  let _lcsStats = { success: 0, fail: 0 };
  const dayRanges: Array<{ from: Date; to: Date }> = [];
  for (let d = 0; d < days; d++) {
    let from: Date, to: Date;
    if (useKST) {
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const kstToday = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()));
      to = new Date(kstToday.getTime() - d * 24 * 60 * 60 * 1000 - 9 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
      from = new Date(kstToday.getTime() - (d + 1) * 24 * 60 * 60 * 1000 - 9 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
    } else {
      to = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
      from = new Date(now.getTime() - (d + 1) * 24 * 60 * 60 * 1000);
    }
    dayRanges.push({ from, to });
  }

  async function fetchOneDayLastChanged(from: Date, to: Date): Promise<any[]> {
    const fromStr = from.toISOString().replace(/\.\d{3}Z$/, '.000Z');
    const toStr = to.toISOString().replace(/\.\d{3}Z$/, '.000Z');
    const params = new URLSearchParams({
      lastChangedFrom: fromStr,
      lastChangedTo: toStr,
      lastChangedType: lastChangedType,
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await smartStoreRequest(
          `/v1/pay-order/seller/product-orders/last-changed-statuses?${params.toString()}`,
          { method: 'GET' }
        );
        if (result.status === 200) {
          const data = result.data?.data || result.data;
          const items = data?.lastChangeStatuses || data?.lastChangedStatuses || [];
          const dayItems = [...items];
          if (data?.more) {
            let lastDate = items[items.length - 1]?.lastChangedDate || '';
            let hasMore = true;
            while (hasMore) {
              const nextParams = new URLSearchParams({
                lastChangedFrom: lastDate,
                lastChangedTo: toStr,
                lastChangedType: lastChangedType,
              });
              const nr = await smartStoreRequest(
                `/v1/pay-order/seller/product-orders/last-changed-statuses?${nextParams.toString()}`,
                { method: 'GET' }
              );
              if (nr.status === 200) {
                const nd = nr.data?.data || nr.data;
                const ni = nd?.lastChangeStatuses || nd?.lastChangedStatuses || [];
                dayItems.push(...ni);
                hasMore = nd?.more || false;
                if (ni.length > 0) lastDate = ni[ni.length - 1]?.lastChangedDate || '';
                else hasMore = false;
              } else hasMore = false;
            }
          }
          _lcsStats.success++;
          return dayItems;
        }
      } catch (err: any) {
        if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    _lcsStats.fail++;
    return [];
  }

  // 3개씩 병렬 배치 실행
  for (let b = 0; b < dayRanges.length; b += BATCH_SIZE) {
    const batch = dayRanges.slice(b, b + BATCH_SIZE);
    const results = await Promise.all(batch.map(({ from, to }) => fetchOneDayLastChanged(from, to)));
    for (const items of results) allItems.push(...items);
  }
  console.log(`[getLastChangedItems] type=${lastChangedType} days=${days} => ${allItems.length}건 (success=${_lcsStats.success} fail=${_lcsStats.fail})`);
  return allItems;
}

// ── Single Source of Truth: 스마트스토어 전체 건수 조회 (top-level) ──
// ── SMARTSTORE-ORDERS-FIX.3: Cache-first Order Snapshot 구조 ──
// 모든 핸들러(주문현황, 브리핑, 대시보드)가 이 함수만 호출해야 함
//
// 설계 원칙:
// 1. PAYED(신규주문/배송준비)만 실시간 조회 → 7일 × 1 = 7번 API 호출 → ~7초 이내
// 2. DELIVERING/DELIVERED/PURCHASE_DECIDED는 _ssDeepCache에서 읽기
// 3. 캐시 없으면 null 반환 (0건 위장 금지)
// 4. deep_sync 액션으로 정밀 동기화 (별도 호출, 결과 _ssDeepCache 저장)

// PAYED 캐시 (3분 TTL)
let _ssPayedCache: { data: any; fetchedAt: number } | null = null;
const SS_PAYED_CACHE_TTL = 3 * 60 * 1000; // 3분

// Deep 캐시 (30분 TTL) - DELIVERING/DELIVERED/PURCHASE_DECIDED
let _ssDeepCache: {
  shipping: number;
  delivered: number;
  purchaseConfirmed: number;
  syncedAt: number;
  syncRangeDays: number;
} | null = null;
const SS_DEEP_CACHE_TTL = 30 * 60 * 1000; // 30분

// 하위호환: 기존 코드가 getSmartstoreStatusCounts를 호출하는 경우 대응
let _ssCountsCache: { data: any; fetchedAt: number; queryDays: number } | null = null;
const SS_CACHE_TTL = 3 * 60 * 1000; // 3분

// PAYED 전용 실시간 조회 (신규주문 + 배송준비)
// SMARTSTORE-ORDERS-FIX.11: last-changed-statuses 기반으로 전환
// fetchOrderIds(PAYED_DATETIME 기준) 대신 last-changed-statuses(PAYED) 사용
// 이유: PAYED_DATETIME은 결제일 기준이라 30일 이전 결제 주문을 놓침
// last-changed-statuses는 상태 변경일 기준이라 모든 PAYED 주문을 잡을 수 있음
async function getPayedOrdersFast(queryDays: number = 30, forceRefresh: boolean = false) {
  // 캐시 유효 시 즉시 반환 (forceRefresh면 캐시 무시)
  if (!forceRefresh && _ssPayedCache && (Date.now() - _ssPayedCache.fetchedAt) < SS_PAYED_CACHE_TTL) {
    return { ..._ssPayedCache.data, isCached: true, cacheAgeMs: Date.now() - _ssPayedCache.fetchedAt };
  }

  // Step 1: last-changed-statuses(PAYED)로 PAYED 상태로 변경된 주문 ID 수집
  // 상태 변경일 기준이므로 30일이면 충분 (30호출 × BATCH_SIZE=5 = 6배치 ≈ 9초)
  const PAYED_RANGE = 30;
  const payedItems = await getLastChangedItems('PAYED', PAYED_RANGE);
  
  // Step 2: ID 추출 + 중복 제거
  const idSet = new Set<string>();
  for (const item of payedItems) {
    if (item.productOrderId) idSet.add(item.productOrderId);
  }
  const uniqueIds = [...idSet];
  console.log(`[getPayedOrdersFast] last-changed PAYED ${PAYED_RANGE}d: ${payedItems.length}건 → unique ${uniqueIds.length}건`);

  // Step 3: 상세 조회로 현재 상태 확인 (이미 발송처리된 주문은 PAYED가 아님)
  let payedOrders: any[] = [];
  if (uniqueIds.length > 0) {
    for (let i = 0; i < uniqueIds.length; i += 300) {
      const idBatch = uniqueIds.slice(i, i + 300);
      try {
        const detailResult = await smartStoreRequest(
          '/v1/pay-order/seller/product-orders/query',
          { method: 'POST', body: JSON.stringify({ productOrderIds: idBatch }) }
        );
        if (detailResult.status === 200) {
          const detailData = detailResult.data.data || detailResult.data;
          if (Array.isArray(detailData)) {
            // 현재 상태가 PAYED인 것만 필터 (발송처리된 것 제외)
            for (const item of detailData) {
              const po = item.productOrder || item;
              if (po.productOrderStatus === 'PAYED') {
                payedOrders.push(item);
              }
            }
          }
        }
      } catch (err: any) {
        console.warn(`[cloud-proxy] PAYED 상세 조회 실패:`, err.message);
      }
    }
  }

  console.log(`[getPayedOrdersFast] 현재 PAYED 상태: ${payedOrders.length}건`);

  const newOrders = payedOrders.filter((o: any) => {
    const po = o.productOrder || o;
    return po.placeOrderStatus !== 'OK';
  });
  const pendingShipping = payedOrders.filter((o: any) => {
    const po = o.productOrder || o;
    return po.placeOrderStatus === 'OK';
  });

  const result = {
    allOrders: payedOrders,
    payed: payedOrders,
    newOrders,
    pendingShipping,
    newOrdersCount: newOrders.length,
    pendingShippingCount: pendingShipping.length,
    preShipTotal: payedOrders.length,
    payedRangeDays: PAYED_RANGE,
    isCached: false,
    cacheAgeMs: 0,
    fetchedAt: new Date().toISOString(),
  };

  _ssPayedCache = { data: result, fetchedAt: Date.now() };
  return result;
}

// 정밀 동기화 (배송중/배송완료/구매확정) - 별도 액션으로 호출
// SMARTSTORE-ORDERS-FIX.4: productOrderStatuses 기반 조회로 전환
// 네이버 관리자 대시보드는 "현재 productOrderStatus" 기준으로 건수 표시
// last-changed-statuses API는 "마지막 상태 변경" 기준이라 대시보드와 불일치
// → GET product-orders (productOrderStatuses 필터) + POST product-orders/query (상세) 조합
// 이 방식은 rangeType=PAYED_DATETIME 기준이므로 충분한 범위(60일) 필요
// 순차 실행: 배송중(60일) → 배송완료(60일) → 구매확정(60일)
// 각 상태별 60일 = 60호출, BATCH_SIZE=5 → 12배치 × ~1.5초 = ~18초
// 3상태 순차 = ~54초 (Vercel 60초 내 긴박)
// → 각 상태별 건수만 필요하므로 상세 조회 생략 → 속도 대폭 향상
async function runDeepSync(rangeDays = 90) {
  // SMARTSTORE-ORDERS-FIX.5: last-changed-statuses + product-orders/query 조합
  // 1. DISPATCHED(발송처리) 로 배송중+배송완료 ID 수집
  // 2. PURCHASE_DECIDED(구매확정) 로 구매확정 ID 수집
  // 3. 모든 ID 상세 조회 → 현재 productOrderStatus로 정확 분류
  // SMARTSTORE-ORDERS-FIX.11d: 60일로 제한 + batchSize=7 (Vercel 60초 timeout 내 완료)
  // 60일 × batchSize=7 = 9배치 × 2상태 = 18배치 × ~1.5초 = ~27초 + 상세조회 ~10초 = ~37초
  const days = Math.min(rangeDays, 60);

  // Step 1: last-changed-statuses로 ID 수집 (순차 실행, batchSize=7로 속도 확보)
  const dispatchedItems = await getLastChangedItems('DISPATCHED', days, false, 7);
  const decidedItems = await getLastChangedItems('PURCHASE_DECIDED', days, false, 7);

  // Step 2: ID 추출 + 중복 제거
  const allIds = new Set<string>();
  for (const item of dispatchedItems) {
    if (item.productOrderId) allIds.add(item.productOrderId);
  }
  for (const item of decidedItems) {
    if (item.productOrderId) allIds.add(item.productOrderId);
  }
  const uniqueIds = [...allIds];
  console.log(`[runDeepSync] DISPATCHED=${dispatchedItems.length} DECIDED=${decidedItems.length} uniqueIds=${uniqueIds.length}`);

  // Step 3: 상세 조회로 현재 상태 확인
  let shipping = 0, delivered = 0, purchaseConfirmed = 0;
  if (uniqueIds.length > 0) {
    for (let i = 0; i < uniqueIds.length; i += 300) {
      const batch = uniqueIds.slice(i, i + 300);
      try {
        const detailResult = await smartStoreRequest(
          '/v1/pay-order/seller/product-orders/query',
          { method: 'POST', body: JSON.stringify({ productOrderIds: batch }) }
        );
        if (detailResult.status === 200) {
          const detailData = detailResult.data.data || detailResult.data;
          if (Array.isArray(detailData)) {
            for (const item of detailData) {
              const po = item.productOrder || item;
              const status = po.productOrderStatus;
              if (status === 'DELIVERING') shipping++;
              else if (status === 'DELIVERED') delivered++;
              else if (status === 'PURCHASE_DECIDED') purchaseConfirmed++;
            }
          }
        }
      } catch (err: any) {
        console.warn(`[runDeepSync] 상세 조회 실패:`, err.message);
      }
    }
  }

  const deepResult = {
    shipping,
    delivered,
    purchaseConfirmed,
    syncedAt: Date.now(),
    syncRangeDays: days,
    // _debug 필드는 프로덕션에서 제거됨
  };

  _ssDeepCache = deepResult;
  return deepResult;
}

// 상태별 productOrderId 목록만 조회 (상세 조회 생략 → 빠름)
// GET /v1/pay-order/seller/product-orders 엔드포인트 사용
// rangeType=PAYED_DATETIME, 24시간 단위 조회 (네이버 API 제한: from~to 간격 최대 24시간)
async function fetchOrderIds(statuses: string[], days: number): Promise<{ids: string[], stats: {success: number, fail: number, lastError: string}}> {
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const dayRequests: Array<{ from: Date; to: Date }> = [];
  for (let i = 0; i < days; i++) {
    const dayFrom = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dayTo = new Date(dayFrom.getTime() + 24 * 60 * 60 * 1000);
    if (dayFrom >= now) break;
    if (dayTo > now) dayTo.setTime(now.getTime());
    dayRequests.push({ from: dayFrom, to: dayTo });
  }

  let allIds: string[] = [];

  let _fetchDayStats = { success: 0, fail: 0, lastError: '' };
  async function fetchDayIds(from: Date, to: Date): Promise<string[]> {
    const params = new URLSearchParams();
    params.append('from', formatNaverDate(from));
    params.append('to', formatNaverDate(to));
    params.append('rangeType', 'PAYED_DATETIME');
    params.append('pageSize', '300');
    params.append('page', '1');
    statuses.forEach(s => params.append('productOrderStatuses', s));

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await smartStoreRequest(
          `/v1/pay-order/seller/product-orders?${params.toString()}`,
          { method: 'GET' }
        );
        if (result.status === 200) {
          const responseData = result.data.data || result.data;
          const contents = responseData.contents || responseData || [];
          if (Array.isArray(contents)) {
            _fetchDayStats.success++;
            return contents.map((item: any) => {
              const po = item.productOrder || item;
              return po.productOrderId || null;
            }).filter(Boolean);
          }
          _fetchDayStats.success++;
          return [];
        }
        _fetchDayStats.lastError = `HTTP ${result.status}: ${JSON.stringify(result.data).slice(0, 100)}`;
        if (attempt < 1) await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        _fetchDayStats.lastError = err.message;
        if (attempt < 1) await new Promise(r => setTimeout(r, 500));
      }
    }
    _fetchDayStats.fail++;
    return [];
  }

  const BATCH_SIZE = 10; // QuotaGuard 동시연결 제한 고려 (30일 = 3배치)
  for (let b = 0; b < dayRequests.length; b += BATCH_SIZE) {
    const batch = dayRequests.slice(b, b + BATCH_SIZE);
    const results = await Promise.all(batch.map(({ from, to }) => fetchDayIds(from, to)));
    for (const ids of results) allIds.push(...ids);
  }

  // 중복 제거
  const uniqueIds = [...new Set(allIds)];
  console.log(`[fetchOrderIds] statuses=${statuses.join(',')} days=${days} => ${uniqueIds.length}건 (success=${_fetchDayStats.success} fail=${_fetchDayStats.fail} lastErr=${_fetchDayStats.lastError})`);
  return { ids: uniqueIds, stats: _fetchDayStats };
}

// 하위호환: 기존 getSmartstoreStatusCounts 호출 대응 (브리핑 등)
async function getSmartstoreStatusCounts(queryDays: number = 30) {
  // 캐시가 유효하면 즉시 반환
  if (_ssCountsCache && _ssCountsCache.queryDays === queryDays && (Date.now() - _ssCountsCache.fetchedAt) < SS_CACHE_TTL) {
    return _ssCountsCache.data;
  }

  // SMARTSTORE-ORDERS-FIX.3: PAYED만 실시간 조회 (fast_snapshot)
  const payedData = await getPayedOrdersFast(30);

  // Deep 캐시에서 배송중/배송완료/구매확정 읽기 (없으면 null)
  const deep = _ssDeepCache;

  const result = {
    allOrders: payedData.payed,
    payed: payedData.payed,
    newOrders: payedData.newOrders,
    pendingShipping: payedData.pendingShipping,
    shipping: deep?.shipping ?? null,
    delivered: deep?.delivered ?? null,
    purchaseConfirmed: deep?.purchaseConfirmed ?? null,
    settlementExpectationAmount: 0,
    dashboardSnapshot: {
      newOrders: payedData.newOrdersCount,
      pendingShipping: payedData.pendingShippingCount,
      shipping: deep?.shipping ?? null,
      delivered: deep?.delivered ?? null,
      purchaseConfirmed: deep?.purchaseConfirmed ?? null,
      source: 'naver-api-product-orders',
      isRangeLimited: true,
      rangeLimitNote: `신규주문/배송준비: 최근 ${payedData.payedRangeDays}일 결제 기준 실시간. 배송중/배송완료/구매확정: ${deep ? `마지막 동기화 기준 (${new Date(deep.syncedAt).toLocaleString('ko-KR')})` : '동기화 필요 — 정밀 동기화를 실행해주세요.'}`,
    },
    detailSync: {
      newOrdersWithId: payedData.newOrders.filter((o: any) => { const po = o.productOrder || o; return !!po.productOrderId; }).length,
      pendingShippingWithId: payedData.pendingShipping.filter((o: any) => { const po = o.productOrder || o; return !!po.productOrderId; }).length,
      shippingWithId: deep?.shipping ?? null,
      deliveredWithId: deep?.delivered ?? null,
      decidedWithId: deep?.purchaseConfirmed ?? null,
      detailStatus: deep ? 'cached' : 'missing',
      deepCacheAge: deep ? Math.round((Date.now() - deep.syncedAt) / 60000) + '분 전' : null,
    },
    countSource: {
      newOrders: `PAYED+placeOrderStatus!=OK/${payedData.payedRangeDays}d (실시간)`,
      pendingShipping: `PAYED+placeOrderStatus=OK/${payedData.payedRangeDays}d (실시간)`,
      shipping: deep ? `DELIVERING/${deep.syncRangeDays}d (캐시)` : 'missing',
      delivered: deep ? `DELIVERED/${deep.syncRangeDays}d (캐시)` : 'missing',
      purchaseConfirmed: deep ? `PURCHASE_DECIDED/${deep.syncRangeDays}d (캐시)` : 'missing',
    },
  };

  _ssCountsCache = { data: result, fetchedAt: Date.now(), queryDays };
  return result;
}

// ── 스마트스토어 주문 조회 핸들러 (통일 응답 구조 v3) ──
async function handleSmartstoreOrders(params: any) {
  const action = params?.action || 'current_new_orders';
  const days = parseInt(params?.days || '7');
  const status = params?.status || 'payed';
  const fetchedAt = new Date().toISOString();

  // ── SMARTSTORE-ORDERS-FIX.1: 전체 함수 timeout 방어 ──
  // deep_sync는 최대 55초, 일반 액션은 9초
  const HANDLER_TIMEOUT_MS = action === 'deep_sync' ? 55000 : (action === 'query_order_status' ? 45000 : 9000);
  let handlerTimedOut = false;
  const handlerTimeoutId = setTimeout(() => { handlerTimedOut = true; }, HANDLER_TIMEOUT_MS);
  const checkTimeout = () => {
    if (handlerTimedOut) {
      throw Object.assign(new Error('SMARTSTORE_TIMEOUT'), { code: 'SMARTSTORE_TIMEOUT' });
    }
  };

  // ── debug_last_changed: 디버그용 - 다양한 API 엔드포인트/파라미터 테스트 ──
  if (action === 'debug_last_changed') {
    // 프로덕션 차단 (디버그 전용)
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      clearTimeout(handlerTimeoutId);
      return { success: false, error: 'DEBUG_DISABLED', message: '디버그 엔드포인트는 프로덕션에서 비활성화됩니다.' };
    }
    const now = new Date();
    const from24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fromUtc24 = from24h.toISOString().replace(/\.\d{3}Z$/, '.000Z');
    const toUtc = now.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    const results: any = {};

    // 테스트 1: product-orders/last-changed-statuses (24시간 범위) + lastChangedType
    for (const changedType of ['PURCHASE_DECIDED', 'DISPATCHED', 'PAYED', 'DELIVERED', 'CLAIM_COMPLETED', 'SHIPPING']) {
      const params = new URLSearchParams({
        lastChangedFrom: fromUtc24,
        lastChangedTo: toUtc,
        lastChangedType: changedType,
      });
      try {
        const r = await smartStoreRequest(
          `/v1/pay-order/seller/product-orders/last-changed-statuses?${params.toString()}`,
          { method: 'GET' }
        );
        const data = r.data?.data || r.data;
        const items = data?.lastChangeStatuses || data?.lastChangedStatuses || [];
        results[`productOrders_${changedType}_24h`] = {
          httpStatus: r.status,
          errorCode: r.data?.code,
          errorMessage: r.data?.message,
          itemCount: items.length,
          more: data?.more || false,
          sampleKeys: Object.keys(items[0] || {}),
        };
      } catch (err: any) {
        results[`productOrders_${changedType}_24h`] = { error: err.message };
      }
    }

    // 테스트 2: orders/last-changed-statuses (24시간 범위) + orderStatuses
    for (const orderStatus of ['PAYED', 'DELIVERING', 'DELIVERED', 'PURCHASE_DECIDED']) {
      const params = new URLSearchParams({
        lastChangedFrom: fromUtc24,
        lastChangedTo: toUtc,
        orderStatuses: orderStatus,
        page: '1',
        pageSize: '1',
      });
      try {
        const r = await smartStoreRequest(
          `/v1/pay-order/seller/orders/last-changed-statuses?${params.toString()}`,
          { method: 'GET' }
        );
        const data = r.data?.data || r.data;
        results[`orders_${orderStatus}_24h`] = {
          httpStatus: r.status,
          errorCode: r.data?.code,
          errorMessage: r.data?.message,
          totalCount: data?.totalCount || r.data?.totalCount,
          itemCount: (data?.lastChangeStatuses || []).length,
        };
      } catch (err: any) {
        results[`orders_${orderStatus}_24h`] = { error: err.message };
      }
    }

    // 테스트 3: GET product-orders (24시간 범위, productOrderStatuses 필터)
    for (const status of ['DELIVERING', 'DELIVERED', 'PURCHASE_DECIDED']) {
      const params = new URLSearchParams({
        productOrderStatuses: status,
        from: fromUtc24,
        to: toUtc,
        rangeType: 'PAYED_DATETIME',
      });
      try {
        const r = await smartStoreRequest(
          `/v1/pay-order/seller/product-orders?${params.toString()}`,
          { method: 'GET' }
        );
        const data = r.data?.data || r.data;
        results[`getProductOrders_${status}_24h`] = {
          httpStatus: r.status,
          errorCode: r.data?.code,
          errorMessage: r.data?.message,
          itemCount: Array.isArray(data) ? data.length : (data?.contents || []).length,
        };
      } catch (err: any) {
        results[`getProductOrders_${status}_24h`] = { error: err.message };
      }
    }

    // 테스트 4: PAYED 상태 직접 조회 (fetchOrders와 동일한 방식, 24시간 범위)
    const payedFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const payedParams = new URLSearchParams({
      from: formatNaverDate(payedFrom),
      to: formatNaverDate(now),
      rangeType: 'PAYED_DATETIME',
      pageSize: '300',
      page: '1',
      productOrderStatuses: 'PAYED',
    });
    try {
      const r = await smartStoreRequest(
        `/v1/pay-order/seller/product-orders?${payedParams.toString()}`,
        { method: 'GET' }
      );
      const data = r.data?.data || r.data;
      const contents = data?.contents || data || [];
      results['PAYED_direct_7d'] = {
        httpStatus: r.status,
        errorCode: r.data?.code,
        errorMessage: r.data?.message,
        itemCount: Array.isArray(contents) ? contents.length : 'not_array',
        dataKeys: Object.keys(data || {}),
        contentsType: typeof contents,
        rawDataSample: JSON.stringify(data).substring(0, 500),
      };
    } catch (err: any) {
      results['PAYED_direct_7d'] = { error: err.message };
    }

    // 테스트 5: fetchOrderIds(['PAYED'], 7) 직접 호출
    try {
      const payedIds7Result = await fetchOrderIds(['PAYED'], 7);
      const payedIds7 = payedIds7Result.ids;
      results['fetchOrderIds_PAYED_7d'] = {
        count: payedIds7.length,
        ids: payedIds7.slice(0, 5),
      };
    } catch (err: any) {
      results['fetchOrderIds_PAYED_7d'] = { error: err.message };
    }

    // 테스트 6: fetchOrderIds(['PAYED'], 30) 직접 호출
    try {
      const payedIds30Result = await fetchOrderIds(['PAYED'], 30);
      const payedIds30 = payedIds30Result.ids;
      results['fetchOrderIds_PAYED_30d'] = {
        count: payedIds30.length,
        ids: payedIds30.slice(0, 5),
      };
    } catch (err: any) {
      results['fetchOrderIds_PAYED_30d'] = { error: err.message };
    }

    // 테스트 7: fetchOrderIds(['DELIVERING'], 90) 직접 호출 (이건 작동했음)
    try {
      const delIdsResult = await fetchOrderIds(['DELIVERING'], 90);
      const delIds = delIdsResult.ids;
      results['fetchOrderIds_DELIVERING_90d'] = {
        count: delIds.length,
        ids: delIds.slice(0, 5),
      };
    } catch (err: any) {
      results['fetchOrderIds_DELIVERING_90d'] = { error: err.message };
    }

    return { success: true, debug: results, from: fromUtc24, to: toUtc };
  }

  // ── current_new_orders / query_pending_shipping / query_pre_shipping_total ──
  if (action === 'current_new_orders' || action === 'query_pending_shipping' || action === 'query_pre_shipping_total') {
    const counts = await getSmartstoreStatusCounts(30);

    const response: any = {
      success: true,
      source: 'naver-commerce-api',
      fetchedAt,
      cacheAgeMs: 0,
      isCached: false,
      counts: {
        newOrders: counts.newOrders.length,
        pendingShipping: counts.pendingShipping.length,
        preShipTotal: counts.payed.length,
        shipping: counts.shipping,
        delivered: counts.delivered,
        purchaseConfirmed: counts.purchaseConfirmed,
        settlementExpectationAmount: counts.settlementExpectationAmount || 0,
      },
      // 하위호환 필드 (프론트엔드 안전 매핑)
      newOrders: counts.newOrders.length,
      pendingShipping: counts.pendingShipping.length,
      preShipTotal: counts.payed.length,
      shipping: counts.shipping,
      delivered: counts.delivered,
      purchaseConfirmed: counts.purchaseConfirmed,
      orders: counts.payed.map(safeOrderMap),
    };

    // data 필드도 유지 (OrderDashboard 호환)
    if (action === 'current_new_orders') {
      response.data = counts.payed.map(safeOrderMap);
    }

    return response;
  }

  // ── query_orders_today: 오늘 신규주문 ──
  if (action === 'query_orders_today') {
    const counts = await getSmartstoreStatusCounts(1);
    return {
      success: true,
      source: 'naver-commerce-api',
      fetchedAt,
      cacheAgeMs: 0,
      isCached: false,
      counts: {
        newOrders: counts.newOrders.length,
        pendingShipping: counts.pendingShipping.length,
        preShipTotal: counts.payed.length,
        shipping: 0,
        delivered: 0,
        purchaseConfirmed: 0,
      },
      newOrders: counts.newOrders.length,
      pendingShipping: counts.pendingShipping.length,
      preShipTotal: counts.payed.length,
      data: counts.payed.map(safeOrderMap),
      orders: counts.payed.map(safeOrderMap),
    };
  }

  // ── query_order_status: fast_snapshot 모드 (PAYED 실시간 + deep 캐시) ──
  // SMARTSTORE-ORDERS-FIX.3: 504 timeout 완전 해결
  // - PAYED만 실시간 조회 (7일, 7번 API 호출, ~7초 이내)
  // - DELIVERING/DELIVERED/PURCHASE_DECIDED는 _ssDeepCache에서 읽기 (없으면 null)
  // - 캐시 없으면 null 반환 (0건 위장 금지)
  if (action === 'query_order_status') {
    try {
      checkTimeout();
      const BUDGET_MS = 15000; // 15초 budget (30일 범위 대응)
      const budgetStart = Date.now();

      // PAYED 실시간 조회 (30일 - 네이버 관리자 대시보드 일치)
      const forceRefresh = params?.forceRefresh === true || params?.forceRefresh === 'true';
      const payedData = await getPayedOrdersFast(30, forceRefresh);
      checkTimeout();

      const elapsed = Date.now() - budgetStart;
      const isPartial = elapsed > BUDGET_MS;

      // SMARTSTORE-ORDERS-FIX.3A: Deep 캐시는 서버 메모리에서만 읽기
      // 캐시가 없으면 null 반환 → 클라이언트가 localStorage에서 읽거나 deep_sync 자동 호출
      const deep = _ssDeepCache;
      const deepCacheAge = deep ? Math.round((Date.now() - deep.syncedAt) / 60000) : null;
      const deepIsStale = deep ? (Date.now() - deep.syncedAt) > SS_DEEP_CACHE_TTL : false;

      clearTimeout(handlerTimeoutId);
      return {
        success: true,
        mode: 'fast_snapshot',
        // _debug 필드는 프로덕션에서 제거됨
        source: 'naver-commerce-api',
        fetchedAt,
        // 실시간 조회 항목 (PAYED)
        actionable: {
          source: 'live',
          isLive: true,
          isCached: payedData.isCached,
          cacheAgeMs: payedData.cacheAgeMs,
          newOrders: payedData.newOrdersCount,
          pendingShipping: payedData.pendingShippingCount,
          preShipTotal: payedData.preShipTotal,
          productOrderIdsMatched: payedData.newOrders.filter((o: any) => { const po = o.productOrder || o; return !!po.productOrderId; }).length +
            payedData.pendingShipping.filter((o: any) => { const po = o.productOrder || o; return !!po.productOrderId; }).length,
          rangeDays: payedData.payedRangeDays,
        },
        // 캐시 항목 (DELIVERING/DELIVERED/PURCHASE_DECIDED)
        dashboardSnapshot: {
          source: deep ? 'cache' : 'missing',
          isCached: !!deep,
          lastSyncedAt: deep ? new Date(deep.syncedAt).toISOString() : null,
          cacheAgeMinutes: deepCacheAge,
          isStale: deepIsStale,
          delivering: deep?.shipping ?? null,
          delivered: deep?.delivered ?? null,
          purchaseDecided: deep?.purchaseConfirmed ?? null,
          syncRangeDays: deep?.syncRangeDays ?? null,
        },
        // 동기화 상태
        syncStatus: {
          status: isPartial ? 'partial' : (deep ? (deepIsStale ? 'stale' : 'fresh') : 'missing'),
          message: isPartial
            ? `응답 시간 초과 (${Math.round(elapsed/1000)}초). 부분 결과입니다.`
            : deep
            ? (deepIsStale
              ? `마지막 동기화 ${deepCacheAge}분 전. 정밀 동기화를 실행해주세요.`
              : `배송중/배송완료/구매확정: 마지막 동기화 ${deepCacheAge}분 전 기준.`)
            : '배송중/배송완료/구매확정 동기화 필요 — 정밀 동기화를 실행해주세요.',
        },
        // 하위호환 top-level 필드 (프론트엔드 안전 매핑)
        newOrders: payedData.newOrdersCount,
        pendingShipping: payedData.pendingShippingCount,
        preShipTotal: payedData.preShipTotal,
        shipping: deep?.shipping ?? null,
        delivered: deep?.delivered ?? null,
        purchaseConfirmed: deep?.purchaseConfirmed ?? null,
        counts: {
          newOrders: payedData.newOrdersCount,
          pendingShipping: payedData.pendingShippingCount,
          preShipTotal: payedData.preShipTotal,
          shipping: deep?.shipping ?? null,
          delivered: deep?.delivered ?? null,
          purchaseConfirmed: deep?.purchaseConfirmed ?? null,
        },
        data: payedData.allOrders.map(safeOrderMap),
        orders: payedData.allOrders.map(safeOrderMap),
      };
    } catch (err: any) {
      clearTimeout(handlerTimeoutId);
      const code = err?.code || (err?.message?.includes('401') ? 'SMARTSTORE_AUTH_ERROR' : err?.message?.includes('TIMEOUT') ? 'SMARTSTORE_TIMEOUT' : 'SMARTSTORE_API_ERROR');
      const isTimeout = code === 'SMARTSTORE_TIMEOUT';
      return {
        success: false,
        errorCode: code,
        errorMessage: isTimeout
          ? '스마트스토어 API 응답 시간 초과. 잠시 후 다시 시도해주세요.'
          : code === 'SMARTSTORE_AUTH_ERROR'
          ? '스마트스토어 API 인증 오류. 토큰을 확인해주세요.'
          : `스마트스토어 API 오류: ${err?.message || '알 수 없는 오류'}`,
        fetchedAt,
        source: 'naver-commerce-api',
        mode: 'fast_snapshot',
        counts: { newOrders: 0, pendingShipping: 0, preShipTotal: 0, shipping: null, delivered: null, purchaseConfirmed: null },
        newOrders: 0, pendingShipping: 0, preShipTotal: 0, shipping: null, delivered: null, purchaseConfirmed: null,
        data: [], orders: [],
      };
    }
  }

  // ── deep_sync: 정밀 동기화 (배송중/배송완료/구매확정) ──
  // SMARTSTORE-ORDERS-FIX.3: 별도 액션으로 분리, 결과 _ssDeepCache 저장
  // 주의: Vercel 60초 timeout 있음. 정밀 동기화는 시간이 오래 걸릴 수 있음.
  if (action === 'deep_sync') {
    try {
      checkTimeout();
      // SMARTSTORE-ORDERS-FIX.4: productOrderStatuses 기반 조회
      // 네이버 관리자 대시보드와 동일한 기준 (현재 productOrderStatus)
      // rangeDays=90 (기본값, 결제일 기준 90일 내 주문)
      const rangeDays = Number(params?.rangeDays) || 90;

      const deepResult = await runDeepSync(rangeDays);
      clearTimeout(handlerTimeoutId);
      return {
        success: true,
        mode: 'deep_sync',
        source: 'naver-commerce-api',
        fetchedAt,
        result: {
          shipping: deepResult.shipping,
          delivered: deepResult.delivered,
          purchaseConfirmed: deepResult.purchaseConfirmed,
          syncedAt: new Date(deepResult.syncedAt).toISOString(),
          syncRangeDays: deepResult.syncRangeDays,
        },
        message: `정밀 동기화 완료. 배송중 ${deepResult.shipping}건 / 배송완료 ${deepResult.delivered}건 / 구매확정 ${deepResult.purchaseConfirmed}건`,
      };
    } catch (err: any) {
      clearTimeout(handlerTimeoutId);
      const code = err?.code || (err?.message?.includes('401') ? 'SMARTSTORE_AUTH_ERROR' : err?.message?.includes('TIMEOUT') ? 'SMARTSTORE_TIMEOUT' : 'SMARTSTORE_API_ERROR');
      return {
        success: false,
        errorCode: code,
        errorMessage: `정밀 동기화 실패: ${err?.message || '알 수 없는 오류'}`,
        fetchedAt,
        source: 'naver-commerce-api',
        mode: 'deep_sync',
      };
    }
  }

  // ── 일반 주문 조회 ──
  try {
    checkTimeout();
    const statusMap: Record<string, string[]> = {
      'new': ['PAYED'], 'payed': ['PAYED'], 'delivering': ['DELIVERING'],
      'delivered': ['DELIVERED'], 'decided': ['PURCHASE_DECIDED'],
      'canceled': ['CANCELED'],
      'all': ['PAYMENT_WAITING', 'PAYED', 'DELIVERING', 'DELIVERED', 'PURCHASE_DECIDED'],
    };
    const productOrderStatuses = statusMap[status?.toLowerCase()] || ['PAYED'];
    const orders = await fetchOrders(productOrderStatuses, days);
    clearTimeout(handlerTimeoutId);
    return {
      success: true,
      source: 'naver-commerce-api',
      fetchedAt,
      cacheAgeMs: 0,
      isCached: false,
      counts: {
        newOrders: 0,
        pendingShipping: 0,
        preShipTotal: 0,
        shipping: 0,
        delivered: 0,
        purchaseConfirmed: 0,
      },
      total: orders.length,
      newOrders: 0,
      pendingShipping: 0,
      preShipTotal: 0,
      orders: orders.map(safeOrderMap),
      data: orders.map(safeOrderMap),
      queryInfo: { statuses: productOrderStatuses, days },
    };
  } catch (err: any) {
    clearTimeout(handlerTimeoutId);
    const code = err?.code || (err?.message?.includes('401') ? 'SMARTSTORE_AUTH_ERROR' : err?.message?.includes('TIMEOUT') ? 'SMARTSTORE_TIMEOUT' : 'SMARTSTORE_API_ERROR');
    return {
      success: false,
      errorCode: code,
      errorMessage: code === 'SMARTSTORE_TIMEOUT'
        ? '스마트스토어 API 응답 시간 초과 (9초). 일수 범위를 줄이거나 잠시 후 다시 시도해주세요.'
        : code === 'SMARTSTORE_AUTH_ERROR'
        ? '스마트스토어 API 인증 오류. 토큰을 확인해주세요.'
        : `스마트스토어 API 오류: ${err?.message || '알 수 없는 오류'}`,
      fetchedAt,
      source: 'naver-commerce-api',
      counts: { newOrders: 0, pendingShipping: 0, preShipTotal: 0, shipping: 0, delivered: 0, purchaseConfirmed: 0 },
      newOrders: 0, pendingShipping: 0, preShipTotal: 0, shipping: 0, delivered: 0, purchaseConfirmed: 0,
      total: 0, data: [], orders: [],
    };
  }
}

// ── 주문 목록 + 상세 조회 (24시간 단위 + QuotaGuard 동시연결 제한 대응) ──
async function fetchOrders(statuses: string[], days: number): Promise<any[]> {
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // 24시간 단위 조회 (네이버 API 제한: from~to 간격 최대 24시간)
  const dayRequests: Array<{ from: Date; to: Date }> = [];
  for (let i = 0; i < days; i++) {
    const dayFrom = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dayTo = new Date(dayFrom.getTime() + 24 * 60 * 60 * 1000);
    if (dayFrom >= now) break;
    if (dayTo > now) dayTo.setTime(now.getTime());
    dayRequests.push({ from: dayFrom, to: dayTo });
  }

  // QuotaGuard 동시연결 제한 대응: 순차 실행 + 재시도 (2회)
  let allProductOrderIds: string[] = [];

  async function fetchDayWithRetry(from: Date, to: Date, maxRetries = 2): Promise<string[]> {
    const params = new URLSearchParams();
    params.append('from', formatNaverDate(from));
    params.append('to', formatNaverDate(to));
    params.append('rangeType', 'PAYED_DATETIME');
    params.append('pageSize', '300');
    params.append('page', '1');
    statuses.forEach(s => params.append('productOrderStatuses', s));

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await smartStoreRequest(
          `/v1/pay-order/seller/product-orders?${params.toString()}`,
          { method: 'GET' }
        );
        if (result.status === 200) {
          const responseData = result.data.data || result.data;
          const contents = responseData.contents || responseData || [];
          if (Array.isArray(contents)) {
            return contents.map((item: any) => {
              const po = item.productOrder || item;
              return po.productOrderId || null;
            }).filter(Boolean);
          }
          return []; // 정상 응답이지만 내용 없음
        }
        // 200이 아닌 경우 재시도
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        }
      } catch (err: any) {
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        } else {
          console.warn(`[cloud-proxy] 주문 목록 조회 실패 (${maxRetries+1}회 시도):`, err.message);
        }
      }
    }
    return [];
  }

  // SMARTSTORE-ORDERS-FIX.3: BATCH_SIZE 3→5로 확대 (처리 속도 향상)
  // QuotaGuard 동시연결 제한 내에서 최대한 병렬 처리
  const BATCH_SIZE = 5;
  for (let b = 0; b < dayRequests.length; b += BATCH_SIZE) {
    const batch = dayRequests.slice(b, b + BATCH_SIZE);
    const results = await Promise.all(batch.map(({ from, to }) => fetchDayWithRetry(from, to)));
    for (const ids of results) allProductOrderIds.push(...ids);
  }

  allProductOrderIds = [...new Set(allProductOrderIds)];
  if (allProductOrderIds.length === 0) return [];

  // 상세 조회
  let allDetailOrders: any[] = [];
  for (let i = 0; i < allProductOrderIds.length; i += 300) {
    const idBatch = allProductOrderIds.slice(i, i + 300);
    try {
      const detailResult = await smartStoreRequest(
        '/v1/pay-order/seller/product-orders/query',
        { method: 'POST', body: JSON.stringify({ productOrderIds: idBatch }) }
      );
      if (detailResult.status === 200) {
        const detailData = detailResult.data.data || detailResult.data;
        if (Array.isArray(detailData)) allDetailOrders = allDetailOrders.concat(detailData);
      }
    } catch (err: any) {
      console.warn(`[cloud-proxy] 상세 조회 실패:`, err.message);
    }
  }

  return allDetailOrders;
}

// ── Daily Briefing 핸들러 (통일 구조 v3) ──
async function handleDailyBriefing() {
  // 1. 스마트스토어 데이터 (5개 상태값) - SSoT: getSmartstoreStatusCounts 직접 호출
  let rawCounts;
  try {
    rawCounts = await getSmartstoreStatusCounts(30);
  } catch (e: any) {
    return { success: false, error: `스마트스토어 데이터 수집 실패: ${e.message}` };
  }

  if (!rawCounts) {
    return { success: false, error: '스마트스토어 데이터를 가져오지 못했습니다.' };
  }
  const counts = {
    newOrders: rawCounts.newOrders.length,
    pendingShipping: rawCounts.pendingShipping.length,
    preShipTotal: rawCounts.payed.length,
    shipping: rawCounts.shipping,
    delivered: rawCounts.delivered,
    purchaseConfirmed: rawCounts.purchaseConfirmed,
    settlementExpectationAmount: rawCounts.settlementExpectationAmount || 0,
  };

  // 2. KAMIS 데이터 (배추 기본)
  const kamisResult: any = await handleKamisMini({ item: '배추' });

  // 3. Outreach 데이터 (최근 수집 후보 요약)
  let outreachSummary = { total: 0, contactable: 0, highFit: 0, drafts: 0 };
  try {
    const outreachRes = await handleOutreachList({ limit: 100 });
    if (outreachRes.success && outreachRes.candidates) {
      const list = outreachRes.candidates;
      outreachSummary = {
        total: list.length,
        contactable: list.filter((c: any) => c.publicContactStatus === 'email_public' || c.publicContactStatus === 'form_available').length,
        highFit: list.filter((c: any) => (c.productFitScore || 0) >= 60).length,
        drafts: list.filter((c: any) => c.firstEmailDraft && c.firstEmailDraft.length > 10).length
      };
    }
  } catch (e) {}

  // 4. File Workspace 요약 (최근 5건)
  let fileSummary = { total: 0, recent: [] as any[] };
  try {
    const workspaceRes = await handleMarketPriceList({ limit: 5 }); // 임시로 market_price_checks 활용
    if (workspaceRes.success) {
      fileSummary.total = workspaceRes.total || 0;
      fileSummary.recent = workspaceRes.checks || [];
    }
  } catch (e) {}

  // 5. 시스템 상태
  const systemHealth = {
    uptime: 'READY',
    naverApi: 'NORMAL',
    kamisApi: kamisResult.success ? 'NORMAL' : 'PARTIAL',
    sheets: (WORKSPACE_SHEET_ID && GOOGLE_SHEETS_CREDENTIALS) ? 'NORMAL' : 'ERROR',
    executeMode: 'LOCKED'
  };

  // 6. 자비스 한 줄 요약 생성 (GPT 호출 없이 규칙 기반)
  let jarvisSummary = `대표님, 오늘은 배송준비 ${counts.pendingShipping}건 확인이 우선입니다. `;
  if (counts.shipping > 0) jarvisSummary += `배송중 ${counts.shipping}건은 추적 중이며, `;
  jarvisSummary += `구매확정 ${counts.purchaseConfirmed}건은 정상 반영되었습니다.`;

  return {
    success: true,
    version: '2.0',
    fetchedAt: new Date().toISOString(),
    jarvisSummary,
    smartstore: {
      counts: {
        newOrders: counts.newOrders,
        pendingShipping: counts.pendingShipping,
        preShipTotal: counts.preShipTotal,
        shipping: counts.shipping,
        delivered: counts.delivered,
        purchaseConfirmed: counts.purchaseConfirmed,
        settlementExpectationAmount: counts.settlementExpectationAmount || 0
      },
      lastChecked: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
      source: 'Naver Commerce API'
    },
    marketIntel: {
      item: kamisResult.item || '배추',
      prices: kamisResult.prices || null,
      direction: kamisResult.direction || 'N/A',
      changePercent: kamisResult.changePercent,
      trend: kamisResult.changePercent > 0 ? 'up' : kamisResult.changePercent < 0 ? 'down' : 'stable',
      message: kamisResult.message || '',
      isProxy: kamisResult.isProxy,
      proxyNote: kamisResult.proxyNote
    },
    outreach: outreachSummary,
    workspace: fileSummary,
    systemHealth
  };
}

// ── Creative Content 핸들러 ──
async function handleCreativeContent(params: any) {
  const product = params?.product || '농산물';
  // COPY-A v2: params.prompt가 있으면 해당 프롬프트를 그대로 GPT에 전달 (JarvisApp에서 생성한 COPY-A 구조화 프롬프트)
  const customPrompt = params?.prompt && typeof params.prompt === 'string' && params.prompt.length > 50 ? params.prompt : null;

  // GPT 호출 시도
  let hookingText = '';
  let threadPost = '';
  let kakaoNotice = '';
  let reelsScript = '';
  let rawGptContent = '';

  if (OPENAI_API_KEY) {
    try {
      const { default: nodeFetchGpt } = await import('node-fetch');
      // COPY-A v2: customPrompt가 있으면 그대로 사용, 없으면 구버전 프롬프트
      const messages = customPrompt ? [
        { role: 'system', content: '당신은 농수축산물 판매 전문 장관급 카피라이터입니다. 과장 광고, 허위 효능, 매출 보장, 성공 보장 표현은 절대 금지합니다.' },
        { role: 'user', content: customPrompt }
      ] : [
        { role: 'system', content: '당신은 농산물/식품 바이럴 마케팅 전문가입니다. 친근하고 말하듯 툭 던지는 문장, 강한 첫 문장, 계절감, 식감, 수확 타이밍, 스토리, 댓글/DM 유도, 여운 있는 마무리를 사용합니다. 과장 광고, 허위 효능, 매출 보장 표현은 금지합니다.' },
        { role: 'user', content: `"${product}" 마케팅 콘텐츠를 만들어주세요. 다음 4가지를 각각 만들어주세요:\n1. 후킹 문구 (1-2줄, 스크롤 멈추게 하는 첫 문장)\n2. 스레드 글 (3-5줄, 자연스럽고 공감가는 톤)\n3. 카카오톡 공지문 (공동구매/할인 안내용, 3-4줄)\n4. 릴스 스크립트 (15초 분량, 장면 설명 포함)\n\n각 항목을 [후킹], [스레드], [카카오톡], [릴스] 태그로 구분해주세요.` }
      ];
      const gptRes = await nodeFetchGpt('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages,
          max_tokens: customPrompt ? 3000 : 1500,
          temperature: 0.8,
        }),
      });

      if (gptRes.ok) {
        const gptData = await gptRes.json();
        rawGptContent = gptData.choices?.[0]?.message?.content || '';
        
        if (customPrompt) {
          // COPY-A v2: 구조화 응답 그대로 반환 (JarvisApp에서 파싱)
          hookingText = rawGptContent;
        } else {
          // 구버전: 태그별 파싱
          const hookMatch = rawGptContent.match(/\[후킹\]([\s\S]*?)(?=\[스레드\]|\[카카오톡\]|\[릴스\]|$)/);
          const threadMatch = rawGptContent.match(/\[스레드\]([\s\S]*?)(?=\[후킹\]|\[카카오톡\]|\[릴스\]|$)/);
          const kakaoMatch = rawGptContent.match(/\[카카오톡\]([\s\S]*?)(?=\[후킹\]|\[스레드\]|\[릴스\]|$)/);
          const reelsMatch = rawGptContent.match(/\[릴스\]([\s\S]*?)(?=\[후킹\]|\[스레드\]|\[카카오톡\]|$)/);
          hookingText = hookMatch ? hookMatch[1].trim() : rawGptContent.split('\n')[0] || '';
          threadPost = threadMatch ? threadMatch[1].trim() : '';
          kakaoNotice = kakaoMatch ? kakaoMatch[1].trim() : '';
          reelsScript = reelsMatch ? reelsMatch[1].trim() : '';
        }
      }
    } catch (e: any) {
      console.error('[cloud-proxy] GPT creative error:', e.message);
    }
  }

  // COPY-A v2: customPrompt 응답은 rawGptContent를 result.content로 직접 반환
  if (customPrompt && rawGptContent) {
    return {
      success: true,
      product,
      result: { content: rawGptContent },
      content: rawGptContent,
    };
  }

  // 구버전 Fallback
  if (!hookingText) {
    hookingText = `이거 ${product} 먹어본 사람만 아는데... 진짜 다릅니다`;
    threadPost = `요즘 ${product} 시즌이라 산지에서 직접 받아봤는데\n한 입 먹자마자 "아 이거다" 싶었어요\n올해는 당도가 유난히 높대요 🍑`;
    kakaoNotice = `[공동구매 안내]\n${product} 산지직송 한정 수량 오픈!\n선착순 마감이니 서두르세요 💛`;
    reelsScript = `[장면1] ${product} 클로즈업 (물방울 맺힌)\n[장면2] 한 입 베어무는 순간\n[자막] "이 식감 실화...?"\n[장면3] 박스 언박싱\n[자막] "산지에서 오늘 딴 거예요"`;
  }

  const content = `🍑 ${product} 마케팅 콘텐츠\n\n` +
    `🔥 후킹 문구\n${hookingText}\n\n` +
    `📱 스레드 글\n${threadPost}\n\n` +
    `💬 카카오톡 공지문\n${kakaoNotice}\n\n` +
    `🎬 릴스 스크립트\n${reelsScript}`;

  return {
    success: true,
    product,
    hookingText,
    threadPost,
    kakaoNotice,
    reelsScript,
    content,
  };
}

// ── COPY-R: Research Before Writing 핸들러 ──
// ── COPY-R.1.1: 관련성 필터 헬퍼 함수 ──
function calcRelevanceScore(title: string, description: string, product: string): number {
  let score = 0;
  const t = title.toLowerCase();
  const d = (description || '').toLowerCase();
  const p = product.toLowerCase();

  // 가점 신호
  if (t.includes(p)) score += 40;
  if (d.includes(p)) score += 10;
  if (/수확|제철|보관|고르는법|먹방|농장|산지|후숙/.test(t)) score += 20;
  if (/수확|제철|보관|고르는법|먹방|농장|산지|후숙/.test(d)) score += 5;
  if (/식품|식재|농산물|신선|제철|구매|주문|맛|릹|달콤|고소한|아삭|향/.test(t)) score += 10;

  // 감점 신호 (노이즈 키워드)
  if (/영어로|영어공부|영어|영어단어|영어학습/.test(t)) score -= 40;
  if (/음악|댓스|찼린지|브이로그|여행|게임|애니|만화|드라마/.test(t)) score -= 30;
  if (/쇼츠모음|클립모음|모음|컴필/.test(t)) score -= 20;
  if (t.includes('shorts') && !t.includes(p)) score -= 15;

  return Math.max(0, Math.min(100, score));
}

// ── COPY-R.1.1: 패턴 분류 함수 ──
function classifyPattern(title: string): string[] {
  const t = title;
  const patterns: string[] = [];
  if (/수확|농장|산지|현장|받/.test(t)) patterns.push('수확현장형');
  if (/첫입|먹어보니|먹방|실제|맛보니|리액션/.test(t)) patterns.push('첫입반응형');
  if (/못난이|희소|한정|마지막|다팔|없다/.test(t)) patterns.push('못난이\/희소성형');
  if (/실수|후회|주의|조심|맞는법|선택법/.test(t)) patterns.push('실수회피형');
  if (/고르는법|기준|차이|등급|선택|판별/.test(t)) patterns.push('고르는법\/기준제시형');
  if (/보관|후숙|숙성|올바른/.test(t)) patterns.push('보관법\/후숙형');
  if (/원|가격|한정수량|저렴|싸|가성비/.test(t)) patterns.push('가격\/한정수량형');
  if (/아이|가족|간식|아이들|어린이/.test(t)) patterns.push('가족\/아이간식형');
  if (/캐핑|여행|야외|피크닉/.test(t)) patterns.push('캐핑\/여행형');
  if (/산지직송|직송|농부|산지|신뢰/.test(t)) patterns.push('산지직송\/신뢰형');
  if (/제철|마감|끝물|시즌|마지막/.test(t)) patterns.push('제철마감형');
  if (/맛|향|아삭|달콤|고소한|실한|실탄|실한|향기/.test(t)) patterns.push('감각묘사형');
  if (patterns.length === 0) patterns.push('일반정보형');
  return patterns;
}

// ── COPY-R.5: Research Orchestrator (복합 리서치 통합) ──
async function handleCopyOrchestrator(params: any) {
  const product = params?.product || '';
  const contentType = params?.contentType || 'headcopy';
  const userMessage = params?.userMessage || '';
  const engines: string[] = Array.isArray(params?.engines) ? params.engines : ['youtube', 'market'];
  const excludedEngines: string[] = Array.isArray(params?.excludedEngines) ? params.excludedEngines : [];
  const sourceUrl = params?.sourceUrl || '';
  const sourceText = params?.sourceText || '';
  const reviewText = params?.reviewText || '';

  // 각 엔진 병렬 실행
  const engineResults: Record<string, any> = {};
  const enginePromises: Promise<void>[] = [];

  if (engines.includes('youtube')) {
    enginePromises.push(
      handleCopyResearch({ product, contentType, userMessage })
        .then(r => { engineResults.youtube = r; })
        .catch(() => { engineResults.youtube = { success: false, error: 'YouTube 조사 실패' }; })
    );
  }

  if (engines.includes('market')) {
    const marketProduct = product;
    const copyProduct = product;
    enginePromises.push(
      handleCopyMarketResearch({ marketProduct, copyProduct, contentType, userMessage })
        .then(r => { engineResults.market = r; })
        .catch(() => { engineResults.market = { success: false, error: 'KAMIS 조회 실패' }; })
    );
  }

  if (engines.includes('review')) {
    enginePromises.push(
      handleCopyReviewResearch({ product, contentType, userMessage, reviewText })
        .then(r => { engineResults.review = r; })
        .catch(() => { engineResults.review = { success: false, error: '리뷰 분석 실패' }; })
    );
  }

  if (engines.includes('social')) {
    enginePromises.push(
      handleCopySocialResearch({ product, contentType, userMessage, sourceUrl, sourceText })
        .then(r => { engineResults.social = r; })
        .catch(() => { engineResults.social = { success: false, error: '소셜 패턴 분석 실패' }; })
    );
  }

  await Promise.all(enginePromises);

  // 통합 인사이트 생성
  const insightParts: string[] = [];
  const copyInjectionParts: string[] = [];
  let totalEnginesUsed = 0;
  let totalEnginesSuccess = 0;

  // YouTube 결과 통합
  if (engineResults.youtube) {
    totalEnginesUsed++;
    if (engineResults.youtube.success) {
      totalEnginesSuccess++;
      const ytInsight = engineResults.youtube.researchInsight || '';
      if (ytInsight) {
        insightParts.push(`[YouTube 분석]\n${ytInsight.split('[COPY-A 주입 인사이트]')[0].trim()}`);
        const ytCopyPart = ytInsight.split('[COPY-A 주입 인사이트]')[1]?.trim();
        if (ytCopyPart) copyInjectionParts.push(`[YouTube 인사이트]\n${ytCopyPart}`);
      }
    } else {
      insightParts.push(`[YouTube 분석] 조사 실패 — fallback 없이 다른 엔진 결과로 보완`);
    }
  }

  // Market 결과 통합
  if (engineResults.market) {
    totalEnginesUsed++;
    if (engineResults.market.success) {
      totalEnginesSuccess++;
      const mktInsight = engineResults.market.marketInsight || '';
      if (mktInsight) {
        insightParts.push(`[시장/시세 분석]\n${mktInsight.split('[COPY-A 주입 인사이트]')[0].trim()}`);
        const mktCopyPart = mktInsight.split('[COPY-A 주입 인사이트]')[1]?.trim();
        if (mktCopyPart) copyInjectionParts.push(`[시장 인사이트]\n${mktCopyPart}`);
      }
    } else {
      insightParts.push(`[시장/시세 분석] KAMIS 조회 실패 — 정량 시세 없이 카피 생성`);
    }
  }

  // Review 결과 통합
  if (engineResults.review) {
    totalEnginesUsed++;
    if (engineResults.review.success) {
      totalEnginesSuccess++;
      const revInsight = engineResults.review.reviewInsight || '';
      if (revInsight) {
        insightParts.push(`[리뷰/고객 불안 분석]\n${revInsight.split('[COPY-A 주입 인사이트]')[0].trim()}`);
        const revCopyPart = revInsight.split('[COPY-A 주입 인사이트]')[1]?.trim();
        if (revCopyPart) copyInjectionParts.push(`[리뷰 인사이트]\n${revCopyPart}`);
      }
    } else {
      insightParts.push(`[리뷰/고객 불안 분석] 분석 실패 — 일반 불안 패턴으로 대체`);
    }
  }

  // Social 결과 통합
  if (engineResults.social) {
    totalEnginesUsed++;
    if (engineResults.social.success) {
      totalEnginesSuccess++;
      const socInsight = engineResults.social.socialInsight || '';
      if (socInsight) {
        insightParts.push(`[소셜 패턴 분석]\n${socInsight.split('[COPY-A 주입 인사이트]')[0].trim()}`);
        const socCopyPart = socInsight.split('[COPY-A 주입 인사이트]')[1]?.trim();
        if (socCopyPart) copyInjectionParts.push(`[소셜 인사이트]\n${socCopyPart}`);
      }
    } else {
      insightParts.push(`[소셜 패턴 분석] 분석 실패 — 다른 엔진 결과로 보완`);
    }
  }

  // 통합 인사이트 조합
  const combinedInsight = `📊 통합 리서치 인사이트 (COPY-R.5 Orchestrator)
사용 엔진: ${engines.join(' + ')} (${totalEnginesSuccess}/${totalEnginesUsed} 성공)
품목: ${product || '미지정'}

${insightParts.join('\n\n')}

[카피 적용 방향]
- 위 ${totalEnginesSuccess}개 엔진 분석 결과를 종합하여 카피에 반영
- 각 엔진에서 추출한 핵심 포인트를 교차 검증하여 적용

[피해야 할 방향]
- 단일 엔진 결과만으로 과도한 단정 금지
- 가짜 데이터/가짜 조회수/가짜 리뷰 생성 금지
- 과장 광고, 허위 효능, 매출 보장 금지

[COPY-A 주입 인사이트]
${copyInjectionParts.join('\n\n') || '통합 분석 결과 기반으로 카피 생성'}`;

  // 제외된 엔진 안내 메시지 생성
  const engineNameMap: Record<string, string> = {
    youtube: 'YouTube 반응 분석',
    market: 'KAMIS 시세 조회',
    review: '리뷰/고객 불안 분석',
    social: '소셜 패턴 분석',
  };
  const excludedEngineNames = excludedEngines.map(e => engineNameMap[e] || e);

  return {
    success: true,
    engines: engines,
    excludedEngines: excludedEngines,
    excludedEngineNames: excludedEngineNames,
    enginesUsed: totalEnginesUsed,
    enginesSuccess: totalEnginesSuccess,
    researchInsight: combinedInsight,
    orchestratorInsightForCopy: `\n\n[COPY-R.5 통합 리서치 인사이트 — 아래 내용을 카피에 반영하세요]\n${copyInjectionParts.join('\n\n') || '통합 분석 결과 기반으로 카피 생성'}`,
    engineResults: {
      youtube: engineResults.youtube?.success ? { videosFound: engineResults.youtube.videosFound, totalSearched: engineResults.youtube.totalSearched } : null,
      market: engineResults.market?.success ? { kamisSuccess: true } : null,
      review: engineResults.review?.success ? { sourceType: engineResults.review.sourceType } : null,
      social: engineResults.social?.success ? { sourceType: engineResults.social.sourceType } : null,
    },
  };
}


// ── COPY-R.4: Review Objection Data Input ──
async function handleCopyReviewResearch(params: any) {
  const product = params?.product || '';
  const contentType = params?.contentType || 'headcopy';
  const userMessage = params?.userMessage || '';
  const reviewText = params?.reviewText || '';

  // 리뷰 텍스트가 있는지 확인
  const hasReviewText = reviewText.length > 20 && /[1-5]점|리뷰|후기|댓글|물러|배송|맛|향|포장|아이|재구매|아쉬|좋|싫|별로|만족|불만|작다|크다|비싸|싸|달다|시다/.test(reviewText);

  // 개인정보 필터링 패턴
  const piiPatterns = /(\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4})|(\w+@\w+\.\w+)|([가-힣]{2,4}\s*님)|(\d{10,})|(\d{1,3}[-\s]\d{1,4}[-\s]\d{1,4})/g;

  let reviewInsights: any = {};

  if (hasReviewText) {
    // 리뷰 텍스트에서 개인정보 제거
    const sanitizedReview = reviewText.replace(piiPatterns, '[개인정보 제거]');

    // GPT로 리뷰 분석
    const analysisPrompt = `당신은 농수축산물 리뷰 분석 전문가입니다.
아래 리뷰/후기/댓글 텍스트에서 고객 불안과 만족 포인트를 추출하세요.

제품: ${product || '미지정'}
리뷰 텍스트:
${sanitizedReview.slice(0, 3000)}

아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "sourceType": "review_text",
  "reviewCount": (분석한 리뷰 수),
  "negativeSignals": ["불안1", "불안2", ...],
  "positiveSignals": ["만족1", "만족2", ...],
  "buyerObjections": ["망설임1", "망설임2", ...],
  "satisfactionDrivers": ["구매동기1", "구매동기2", ...],
  "copyAngles": ["카피방향1", "카피방향2", ...],
  "trustBuilders": ["신뢰요소1", "신뢰요소2", ...],
  "avoidClaims": ["피해야할표현1", "피해야할표현2", ...],
  "privacyNote": "개인정보성 내용은 분석에서 제외했습니다."
}

규칙:
- 리뷰 원문을 그대로 복사하지 마세요
- 패턴과 인사이트만 추출하세요
- 개인정보(이름, 전화번호, 주소, 주문번호)는 무시하세요
- 없는 리뷰를 만들지 마세요
- 가짜 평점/가짜 반응을 생성하지 마세요`;

    try {
      const analysisRes: any = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [{ role: 'user', content: analysisPrompt }],
          temperature: 0.3,
          max_tokens: 1000,
        }),
      });
      const analysisData = await analysisRes.json();
      const analysisContent = analysisData.choices?.[0]?.message?.content || '';
      // JSON 파싱
      const jsonMatch = analysisContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        reviewInsights = JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.error('[COPY-R.4] GPT 리뷰 분석 오류:', err);
    }
  } else {
    // 리뷰 텍스트 없음 → 일반 리뷰 불안 패턴 fallback
    const genericObjections: Record<string, any> = {
      '복숭아': { negativeSignals: ['무름', '후숙 어려움', '배송 멍', '덜 달다'], positiveSignals: ['향', '과즙', '선물 반응', '아이 간식'], buyerObjections: ['물러서 바로 먹어야 함', '후숙 타이밍 모름', '배송 중 손상 걱정'] },
      '초당옥수수': { negativeSignals: ['단맛 기대 미달', '알 크기 작음', '보관 어려움'], positiveSignals: ['단맛', '아이 간식', '간편 조리'], buyerObjections: ['보관법 모름', '수확 후 시간 걱정', '삶는 법 모름'] },
      '절임배추': { negativeSignals: ['무름', '짠맛 편차', '절임 불균일', '원물 상태'], positiveSignals: ['편리함', '김장 시간 절약', '가격 대비 양'], buyerObjections: ['김장 실패 걱정', '원물 신뢰', '배송 일정 불안'] },
      '한우': { negativeSignals: ['가격 부담', '마블링 기대 미달'], positiveSignals: ['선물 체면', '원산지 신뢰', '포장 만족'], buyerObjections: ['비싸서 실패하면 아까움', '사진과 다를까 걱정'] },
      '블루베리': { negativeSignals: ['크기 편차', '신맛', '무름'], positiveSignals: ['아이 간식', '요거트 활용', '신선도'], buyerObjections: ['크기 작을까 걱정', '금방 무를까 걱정'] },
      '사과': { negativeSignals: ['당도 편차', '식감 차이', '크기 편차', '흠집'], positiveSignals: ['아삭함', '단맛', '선물용'], buyerObjections: ['당도 떨어질까 걱정', '흠집 있을까 걱정'] },
      '딸기': { negativeSignals: ['무름', '크기 편차', '배송 손상'], positiveSignals: ['향', '단맛', '아이 간식', '비주얼'], buyerObjections: ['배송 중 물러질까 걱정', '사진보다 작을까 걱정'] },
    };
    const matchedProduct = Object.keys(genericObjections).find(k => product.includes(k));
    const fallbackData = matchedProduct ? genericObjections[matchedProduct] : {
      negativeSignals: ['맛 기대 미달', '배송 손상', '크기/양 불만'],
      positiveSignals: ['신선도', '포장 만족', '재구매 의향'],
      buyerObjections: ['실패할까 걱정', '배송 중 상할까 걱정', '사진과 다를까 걱정'],
    };
    reviewInsights = {
      sourceType: 'generic_objection',
      reviewCount: 0,
      negativeSignals: fallbackData.negativeSignals || [],
      positiveSignals: fallbackData.positiveSignals || [],
      buyerObjections: fallbackData.buyerObjections || [],
      satisfactionDrivers: [],
      copyAngles: ['불안을 먼저 인정', '선택 기준 제시', '먹는 장면으로 전환', '신뢰 요소 보강'],
      trustBuilders: ['과장 없이 기대치 조정', '실제 보관/배송 안내 포함'],
      avoidClaims: ['실제 리뷰처럼 꾸며 쓰기', '고객 반응 조작', '허위 효능', '과도한 공포'],
      privacyNote: '실제 리뷰 원문 없이 일반 리뷰 불안 패턴만 참고했습니다.',
    };
  }

  // 인사이트 표시용 문자열 생성
  const reviewInsightDisplay = `📋 리뷰/고객 불안 인사이트
조사 출처: ${reviewInsights.sourceType === 'review_text' ? '리뷰 텍스트 분석' : '일반 리뷰 불안 패턴'}
분석 리뷰 수: ${reviewInsights.reviewCount || 0}개
핵심 불안: ${(reviewInsights.negativeSignals || []).join(', ') || '없음'}
만족 포인트: ${(reviewInsights.positiveSignals || []).join(', ') || '없음'}
구매 망설임: ${(reviewInsights.buyerObjections || []).join(', ') || '없음'}
신뢰 보강 포인트: ${(reviewInsights.trustBuilders || []).join(', ') || '없음'}
카피 적용 방향: ${(reviewInsights.copyAngles || []).join(', ') || '불안 해소 중심'}
피해야 할 표현: ${(reviewInsights.avoidClaims || []).join(', ') || '가짜 리뷰, 허위 효능'}`;

  // COPY-A 주입용 인사이트
  const reviewInsightForCopy = `
[COPY-R.4 리뷰/고객 불안 인사이트]
- 분석 리뷰 수: ${reviewInsights.reviewCount || 0}개
- 핵심 불안: ${(reviewInsights.negativeSignals || []).join(', ')}
- 만족 포인트: ${(reviewInsights.positiveSignals || []).join(', ')}
- 구매 망설임: ${(reviewInsights.buyerObjections || []).join(', ')}
- 신뢰 보강 포인트: ${(reviewInsights.trustBuilders || []).join(', ')}
- 카피 적용 방향: ${(reviewInsights.copyAngles || []).join(', ')}
- 피해야 할 표현: ${(reviewInsights.avoidClaims || []).join(', ')}
- 실제 리뷰처럼 꾸며 쓰지 말고, 불안 해소 방향만 반영할 것
- 고객 불안을 먼저 이해한 문장으로 시작
- 불안을 과장하지 않음
- 선택 기준 또는 보관/후숙/배송 기대치를 부드럽게 제시
- 만족 포인트는 먹는 장면으로 전환
- 가짜 고객 후기처럼 쓰지 않음`;

  return {
    success: true,
    reviewInsight: reviewInsightDisplay,
    reviewInsightForCopy,
    reviewInsights,
    hasReviewText,
    sourceType: reviewInsights.sourceType || 'generic_objection',
    reviewCount: reviewInsights.reviewCount || 0,
  };
}

async function handleCopySocialResearch(params: any) {
  const product = params?.product || '';
  const contentType = params?.contentType || 'headcopy';
  const userMessage = params?.userMessage || '';
  const sourceUrl = params?.sourceUrl || '';
  const sourceText = params?.sourceText || '';

  // Step 1: 소셜 콘텐츠 수집 (URL이 있으면 fetch, 없으면 텍스트 기반 분석)
  let socialContent = '';
  let sourceType = 'text'; // text | url | fallback
  let fetchSuccess = false;

  if (sourceUrl) {
    sourceType = 'url';
    try {
      // URL에서 텍스트 콘텐츠 추출 시도
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res: any = await fetch(sourceUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JarvisBot/1.0)' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const html = await res.text();
        // 기본 텍스트 추출 (meta description, og:description, 본문 텍스트)
        const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)?.[1] || '';
        const metaDesc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i)?.[1] || '';
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '';
        // 본문에서 주요 텍스트 추출 (script/style 제거)
        const bodyText = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 2000);
        socialContent = [
          titleMatch ? `제목: ${titleMatch}` : '',
          ogDesc ? `설명: ${ogDesc}` : (metaDesc ? `설명: ${metaDesc}` : ''),
          bodyText ? `본문 발췌: ${bodyText.slice(0, 800)}` : '',
        ].filter(Boolean).join('\n');
        fetchSuccess = socialContent.length > 50;
      }
    } catch (e) {
      // fetch 실패 — fallback으로 진행
    }
  }

  if (sourceText && !fetchSuccess) {
    socialContent = sourceText;
    sourceType = 'text';
    fetchSuccess = true;
  }

  // Step 2: GPT 기반 소셜 패턴 분석
  const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || '';
  if (!OPENAI_KEY) {
    return { success: false, failReason: 'OPENAI_API_KEY not configured' };
  }

  const analysisPrompt = fetchSuccess
    ? `당신은 소셜 미디어 콘텐츠 패턴 분석 전문가입니다.

아래 소셜 콘텐츠를 분석하여 패턴 인사이트를 추출해 주세요.

[분석 대상]
소스 타입: ${sourceType === 'url' ? 'URL 크롤링' : '텍스트 입력'}
${sourceUrl ? `URL: ${sourceUrl}` : ''}
콘텐츠:
${socialContent.slice(0, 1500)}

[분석 항목]
1. 후킹 패턴: 첫 문장/첫 3초에 사용된 기법 (질문형/반전형/금지형/감탄형/숫자형 등)
2. 구조 패턴: 글/영상의 전체 흐름 구조 (도입→전개→CTA 등)
3. 감정 톤: 사용된 감정 톤 (친근/도발/공감/유머/긴급 등)
4. CTA 패턴: 댓글/DM/공유/저장 유도 방식
5. 타깃 페르소나: 누구를 겨냥한 콘텐츠인지
6. 바이럴 요소: 왜 반응이 좋을 수 있는지 (공감/호기심/논쟁/실용 등)

[출력 형식]
=== 소셜 패턴 인사이트 ===
조사 출처: ${sourceType === 'url' ? 'URL 분석' : '텍스트 패턴 분석'}
후킹 패턴: (분석 결과)
구조 패턴: (분석 결과)
감정 톤: (분석 결과)
CTA 패턴: (분석 결과)
타깃 페르소나: (분석 결과)
바이럴 요소: (분석 결과)

[카피 적용 방향]
(이 패턴을 ${product || '제품'} 카피에 어떻게 적용할지 2~3줄)

[피해야 할 방향]
(이 패턴에서 주의할 점 1~2줄)

[COPY-A 주입 인사이트]
(카피 생성 시 반영할 핵심 지시 3~5줄)`
    : `당신은 소셜 미디어 콘텐츠 패턴 분석 전문가입니다.

사용자가 "${userMessage}"라고 요청했지만, 분석할 소셜 콘텐츠(URL 또는 텍스트)를 제공하지 않았습니다.

사용자의 요청 의도를 파악하여, ${product || '농산물'} 제품에 대한 일반적인 소셜 미디어 바이럴 패턴 인사이트를 제공해 주세요.

[분석 항목]
1. 후킹 패턴: 해당 플랫폼(${contentType === 'threads_post' ? 'Threads' : contentType === 'reels_script' ? 'Reels/TikTok' : contentType === 'instagram_copy' ? 'Instagram' : '소셜 미디어'})에서 ${product || '농산물'} 관련 인기 콘텐츠의 일반적 후킹 기법
2. 구조 패턴: 해당 플랫폼의 일반적 콘텐츠 구조
3. 감정 톤: 반응 좋은 콘텐츠의 감정 톤
4. CTA 패턴: 효과적인 CTA 방식
5. 타깃 페르소나: 주요 타깃
6. 바이럴 요소: 반응을 이끄는 핵심 요소

[출력 형식]
=== 소셜 패턴 인사이트 ===
조사 출처: 일반 패턴 분석 (참고 콘텐츠 미제공)
후킹 패턴: (분석 결과)
구조 패턴: (분석 결과)
감정 톤: (분석 결과)
CTA 패턴: (분석 결과)
타깃 페르소나: (분석 결과)
바이럴 요소: (분석 결과)

[카피 적용 방향]
(이 패턴을 ${product || '제품'} 카피에 어떻게 적용할지 2~3줄)

[피해야 할 방향]
(이 패턴에서 주의할 점 1~2줄)

[COPY-A 주입 인사이트]
(카피 생성 시 반영할 핵심 지시 3~5줄)`;

  try {
    const gptRes: any = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: analysisPrompt }],
        max_tokens: 1200,
        temperature: 0.7,
      }),
    });

    if (!gptRes.ok) {
      return { success: false, failReason: `GPT API error: ${gptRes.status}` };
    }

    const gptData = await gptRes.json();
    const socialInsight = gptData.choices?.[0]?.message?.content || '';

    if (!socialInsight) {
      return { success: false, failReason: 'GPT returned empty response' };
    }

    // 인사이트 분리: UI용 vs COPY-A 주입용
    const uiInsight = socialInsight.split('[COPY-A 주입 인사이트]')[0].trim();
    const copyAInjection = socialInsight.split('[COPY-A 주입 인사이트]')[1]?.trim() || uiInsight;

    const socialInsightForCopy = `[COPY-R.3 소셜 패턴 분석 결과 주입]
${copyAInjection}

위 소셜 패턴 분석 결과를 반드시 반영하여 카피를 작성하세요.
특히 후킹 패턴, 구조 패턴, 감정 톤을 카피에 적용하세요.`;

    return {
      success: true,
      socialInsight: socialInsight,
      socialInsightForCopy,
      sourceType,
      fetchSuccess,
      sourceUrl: sourceUrl || null,
    };
  } catch (err: any) {
    return { success: false, failReason: `GPT call failed: ${err.message}` };
  }
}

// ── COPY-R.2: Market Context Research (KAMIS/시세 조회 → 인사이트 변환) ──
async function handleCopyMarketResearch(params: any) {
  const marketProduct = params?.marketProduct || params?.product || '농산물';
  const copyProduct = params?.copyProduct || marketProduct;
  const contentType = params?.contentType || 'headcopy';

  // 1. KAMIS 조회 (기존 handleKamisMini 재사용)
  let kamisData: any = null;
  let kamisSuccess = false;
  let failReason = '';

  try {
    kamisData = await handleKamisMini({ item: marketProduct });
    if (kamisData.success && kamisData.prices) {
      kamisSuccess = true;
    } else if (kamisData.success && !kamisData.prices) {
      failReason = kamisData.message || 'KAMIS 데이터 부족';
    } else {
      failReason = kamisData.error || 'KAMIS 조회 실패';
    }
  } catch (err: any) {
    failReason = `KAMIS API 오류: ${err.message || 'unknown'}`;
  }

  // 2. Market Insight 변환
  let marketInsight = '';
  let marketInsightForCopy = '';

  if (kamisSuccess && kamisData.prices) {
    const prices = kamisData.prices;
    const todayPrice = prices.today || '-';
    const monthPrice = prices.monthBefore || '-';
    const direction = kamisData.direction || 'N/A';
    const unit = kamisData.unit || '';
    const cls = kamisData.cls || '소매';
    const date = kamisData.date || '';
    const isProxy = kamisData.isProxy || false;
    const proxyNote = kamisData.proxyNote || '';

    // 가격 흐름 해석
    let priceFlow = '';
    const changePercent = kamisData.changePercent;
    if (!isNaN(changePercent)) {
      if (changePercent > 5) priceFlow = `전월 대비 ${direction} 상승 추세`;
      else if (changePercent < -5) priceFlow = `전월 대비 ${direction} 하락 추세`;
      else priceFlow = `전월 대비 ${direction} 보합 유지`;
    } else {
      priceFlow = '가격 변동 데이터 부족';
    }

    // 판매 타이밍 판단
    let sellingTiming = '';
    if (!isNaN(changePercent)) {
      if (changePercent > 10) sellingTiming = '가격 상승기 — 프리미엄/한정 수량 메시지 효과적';
      else if (changePercent > 0) sellingTiming = '안정적 상승 — 품질 강조 전략 유효';
      else if (changePercent > -5) sellingTiming = '보합 유지 — 묶음/세트 구성 검토';
      else sellingTiming = '가격 하락기 — 가성비 강조 또는 용량 업 전략';
    } else {
      sellingTiming = '데이터 부족으로 타이밍 판단 불가';
    }

    // 소비자 불안 추정
    let consumerAnxiety = '';
    if (marketProduct === '복숭아') consumerAnxiety = '후숙 타이밍, 무름, 당도 불안';
    else if (marketProduct === '한우') consumerAnxiety = '가격 부담, 등급 신뢰, 원산지 의심';
    else if (marketProduct === '배추' || marketProduct === '절임배추') consumerAnxiety = '김장 실패 회피, 원물 신뢰';
    else if (marketProduct === '초당옥수수' || marketProduct === '옥수수') consumerAnxiety = '당도/신선도, 수확 후 당도 감소 불안';
    else if (marketProduct === '사과') consumerAnxiety = '당도, 식감, 크기 편차';
    else if (marketProduct === '딸기') consumerAnxiety = '신선도, 무름, 당도 불안';
    else consumerAnxiety = '가격 대비 품질, 신선도 불안';

    // 카피 적용 방향
    let copyDirection = '';
    if (!isNaN(changePercent) && changePercent > 10) {
      copyDirection = `"싸다"보다 "지금 사야 하는 이유"로 접근. 한정 수량/시즈널 메시지 효과적`;
    } else if (!isNaN(changePercent) && changePercent < -5) {
      copyDirection = `가격 하락기에는 "싸다"보다 "품질 대비 가성비"로 접근`;
    } else {
      copyDirection = `가격보다 품질/스토리/신뢰로 접근. 소비자 불안 해소 중심`;
    }

    // 피해야 할 방향
    const avoidDirection = '근거 없는 최저가/가격 보장, 가격 폭등/폭락 단정, 허위 수급 위기, 치료/효능 과장';

    // Result Deck 용 인사이트
    marketInsight = [
      `시장/시즈 인사이트`,
      `• 조사 출처: KAMIS (${cls})`,
      `• 품목: ${marketProduct}${isProxy ? ` (${proxyNote})` : ''}`,
      `• 데이터 기준일: ${date}`,
      `• 현재 가격: ${todayPrice}/${unit}`,
      `• 전월 대비: ${direction}`,
      `• 가격 흐름: ${priceFlow}`,
      `• 판매 타이밍: ${sellingTiming}`,
      `• 소비자 불안: ${consumerAnxiety}`,
      ``,
      `카피 적용 방향:`,
      copyDirection,
      ``,
      `피해야 할 방향:`,
      avoidDirection,
    ].join('\n');

    // COPY-A 주입용 인사이트
    marketInsightForCopy = [
      `[COPY-R.2 시장 맥락 주입]`,
      `품목: ${copyProduct}${isProxy ? ` (원물: ${marketProduct})` : ''}`,
      `데이터 기준: KAMIS ${cls} ${date}`,
      `현재 가격: ${todayPrice}/${unit}`,
      `전월 대비: ${direction}`,
      `시장 맥락: ${priceFlow}`,
      `소비자 불안: ${consumerAnxiety}`,
      `판매 타이밍: ${sellingTiming}`,
      `카피 적용 방향: ${copyDirection}`,
      `피해야 할 표현: ${avoidDirection}`,
      ``,
      `위 시장 맥락을 반드시 반영하여 카피를 작성하세요.`,
    ].join('\n');
  } else {
    // KAMIS 데이터 없음 — 안전 fallback
    marketInsight = [
      `시장/시즈 인사이트`,
      `• 조사 출처: KAMIS`,
      `• 품목: ${marketProduct}`,
      `• 상태: 정량 시세 없음 / 일반 시장 맥락만 반영`,
      `• 사유: ${failReason}`,
    ].join('\n');

    marketInsightForCopy = [
      `[COPY-R.2 시장 맥락 주입]`,
      `품목: ${copyProduct}`,
      `KAMIS 데이터가 부족하여 일반 농산물 카피 두뇌로 생성합니다.`,
      `시장 맥락은 참고하지 않았습니다.`,
      `피해야 할 표현: 근거 없는 최저가, 가격 폭등/폭락 단정, 허위 수급 위기, 치료/효능 과장`,
    ].join('\n');
  }

  return {
    success: true,
    marketProduct,
    copyProduct,
    contentType,
    kamisSuccess,
    failReason: kamisSuccess ? '' : failReason,
    marketInsight,
    marketInsightForCopy,
    kamisData: kamisSuccess ? {
      date: kamisData.date,
      cls: kamisData.cls,
      prices: kamisData.prices,
      direction: kamisData.direction,
      changePercent: kamisData.changePercent,
      unit: kamisData.unit,
      isProxy: kamisData.isProxy,
      proxyNote: kamisData.proxyNote,
    } : null,
  };
}

async function handleCopyResearch(params: any) {
  const product = params?.product || '농산물';
  const contentType = params?.contentType || 'headcopy';
  const count = Math.min(Number(params?.count) || 8, 15); // 필터를 위해 더 많이 가져오기

  // YouTube 인기 영상 검색
  let allVideos: any[] = [];
  let filteredVideos: any[] = [];
  let researchInsight = '';
  let failReason = '';

  try {
    if (YOUTUBE_API_KEY) {
      const searchResult = await searchPopularVideos(product, count, 'month');
      allVideos = searchResult.videos || [];
    } else {
      failReason = 'YOUTUBE_API_KEY missing';
    }
  } catch (e: any) {
    console.error('[COPY-R] YouTube search error:', e.message);
    failReason = e.message?.includes('quota') ? 'quota exceeded' : e.message?.includes('API') ? 'API error' : 'network error';
  }

  // COPY-R.1.1 수정 B: 관련성 필터 적용
  if (allVideos.length > 0) {
    const scored = allVideos.map((v: any) => ({
      ...v,
      relevanceScore: calcRelevanceScore(v.title, v.description || '', product),
    }));

    // relevanceScore >= 60 분석 대상, 40~59 보조 참고, < 40 제외
    filteredVideos = scored
      .filter((v: any) => v.relevanceScore >= 40)
      .sort((a: any, b: any) => {
        // finalResearchScore = engagementScore * 0.6 + relevanceScore * 0.4
        const scoreA = (a.viewCount || 0) * 0.6 + a.relevanceScore * 1000 * 0.4;
        const scoreB = (b.viewCount || 0) * 0.6 + b.relevanceScore * 1000 * 0.4;
        return scoreB - scoreA;
      })
      .slice(0, 5);

    if (filteredVideos.length === 0) {
      // 관련성 필터 통과 영상 없으면 전체에서 조회수 순 상위 3건 fallback
      filteredVideos = scored.sort((a: any, b: any) => (b.viewCount || 0) - (a.viewCount || 0)).slice(0, 3);
    }
  }

  // 패턴 추출
  if (filteredVideos.length > 0) {
    const titles = filteredVideos.map((v: any) => v.title);
    const totalViews = filteredVideos.reduce((sum: number, v: any) => sum + (v.viewCount || 0), 0);
    const avgViews = filteredVideos.length > 0 ? Math.round(totalViews / filteredVideos.length) : 0;
    const topVideo = filteredVideos[0];

    // COPY-R.1.1 수정 C: 노이즈 키워드 제외 후 패턴 분류 강화
    const allPatterns: string[] = [];
    filteredVideos.forEach((v: any) => {
      classifyPattern(v.title).forEach((p: string) => allPatterns.push(p));
    });
    const patternFreq: Record<string, number> = {};
    allPatterns.forEach((p: string) => { patternFreq[p] = (patternFreq[p] || 0) + 1; });
    const topPatterns = Object.entries(patternFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([p]) => p);

    // 소비자 관심/불안 키워드 추출
    const concernKeywords: string[] = [];
    if (titles.some((t: string) => /실수|후회|주의|조심/.test(t))) concernKeywords.push('실수회피');
    if (titles.some((t: string) => /보관|후숙|오래/.test(t))) concernKeywords.push('보관법');
    if (titles.some((t: string) => /고르는법|등급|기준/.test(t))) concernKeywords.push('선택기준');
    if (titles.some((t: string) => /신선|산지|농장|직송/.test(t))) concernKeywords.push('신선도/산지');

    // 추천 후킹 공식
    const hookFormula = topPatterns.includes('첫입반응형')
      ? `"이 ${product}는 그냥 맛있다가 아니라, 첫입/제철/희소성으로 말해야 한다."`
      : topPatterns.includes('수확현장형')
      ? `"수확 현장에서 바로 온 느낌을 전달하는 문장 사용"`
      : topPatterns.includes('못난이\/희소성형')
      ? `"희소성/한정 수량 구조를 응용"`
      : `"${product}의 제철감과 실화성을 중심으로 작성"`;

    // COPY-R.1.1 수정 F: 인사이트 패널 문구 개선 (카피 적용 방향 중심)
    const topVideoSummary = topVideo?.title?.length > 30
      ? topVideo.title.substring(0, 28) + '...'
      : topVideo?.title || '';

    researchInsight = `[COPY-R 조사 인사이트 — ${product}]
조사 출처: YouTube ${allVideos.length}건 검색
분석 대상: 관련성 필터 통과 ${filteredVideos.length}건
평균 조회수: ${avgViews.toLocaleString()}회
최고 반응 영상: "${topVideoSummary}" (${topVideo?.viewCountFormatted}회)

반응 좋은 구조:
${topPatterns.map((p: string) => `- ${p}`).join('\n')}

카피 적용 방향:
- ${hookFormula}
${concernKeywords.length > 0 ? `- 소비자 관심: ${concernKeywords.join(', ')} 언급시 반응률 높음` : ''}
- 제철감/실화성/산지 스토리를 중심으로 작성

피해야 할 방향:
- 단순 품목명 반복
- shorts/영어로 같은 검색 노이즈 기반 문구`;

    // COPY-R.1.1 수정 G: COPY-A 주입 인사이트 개선
    researchInsight += `

[COPY-A 주입 인사이트]
핵심 패턴: ${topPatterns.join(' + ')}
소비자 관심/불안: ${concernKeywords.length > 0 ? concernKeywords.join(', ') : '실화성/제철감'}
추천 후킹 공식: ${hookFormula}
카피 적용 방향: ${product}의 제철감과 실화성을 중심으로 작성
피해야 할 표현: shorts/영어로 같은 검색 노이즈는 카피에 반영하지 않는다`;
  } else if (failReason) {
    // fallback: 실패 원인 내부 로그만, 사용자에게는 안내 메시지만
    console.error(`[COPY-R] 실패 원인: ${failReason}`);
    researchInsight = ''; // 빈 문자열 = fallback 신호
  } else {
    researchInsight = ''; // 관련 영상 없음 = fallback
  }

  return {
    success: true,
    product,
    contentType,
    researchInsight,
    videosFound: filteredVideos.length,
    totalSearched: allVideos.length,
    failReason: failReason || undefined,
    topVideos: filteredVideos.slice(0, 3).map((v: any) => ({ title: v.title, viewCount: v.viewCountFormatted, url: v.url })),
  };
}

// ── Growth Link 핸들러 ──
async function handleGrowthLink(params: any) {
  const product = params?.product || params?.prompt || '농산물';
  const platform = params?.platform || 'instagram';

  const strategies: Record<string, string> = {
    instagram: `📸 인스타그램 Growth Link 전략\n• 프로필 링크: 스마트스토어 상품 페이지 연결\n• 스토리 하이라이트: "${product}" 후기 모음\n• 릴스 CTA: "프로필 링크에서 만나요"\n• 해시태그: #${product} #산지직송 #오늘수확`,
    thread: `🧵 스레드 Growth Link 전략\n• 첫 글: 호기심 유발 후킹\n• 마지막 줄: "궁금하면 DM 주세요"\n• 댓글 유도: "어디서 사요?" 자연 유도\n• 링크 공유: 프로필 or 댓글 고정`,
    kakao: `💛 카카오톡 Growth Link 전략\n• 오픈채팅방: "${product} 공동구매방"\n• 공지 메시지: 한정수량 + 마감시간\n• 1:1 채팅: 문의 → 구매 전환\n• 플러스친구: 자동 응답 + 쿠폰`,
  };

  const content = strategies[platform] || strategies.instagram;

  return {
    success: true,
    product,
    platform,
    content,
    strategy: content,
  };
}

// ── Diagnostics ──
function getDiagnostics() {
  return {
    runtime: 'vercel-node',
    proxyConfigured: !!QUOTAGUARD_URL,
    proxyScheme: getProxyScheme(),
    agentType: getAgentType(),
    outboundIpMatchedAllowedList: !!QUOTAGUARD_URL, // QuotaGuard 사용 시 등록된 IP로 나감
    naverClientConfigured: !!(SMARTSTORE_CLIENT_ID && SMARTSTORE_CLIENT_SECRET),
    openaiConfigured: !!OPENAI_API_KEY,
    directNaverCallWithoutProxy: false,
    cloudPcDependency: false,
    cloudflaredDependency: false,
  };
}

// ── TiDB 연결 설정 ──
function getDbConnection() {
  return mysql.createConnection({
    host: process.env.TIDB_HOST || '',
    port: Number(process.env.TIDB_PORT) || 4000,
    user: process.env.TIDB_USER || '',
    password: process.env.TIDB_PASSWORD || '',
    database: process.env.TIDB_DATABASE || 'jarvis',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
  });
}

// ── YouTube 관련 유틸 ──
function extractContactInfo(description: string, brandDesc: string = '') {
  const allText = description + '\n' + brandDesc;
  const emailMatches = allText.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
  const businessEmail = emailMatches.find(e =>
    !e.includes('example.com') && !e.includes('noreply') && !e.includes('no-reply')
  ) || '';
  const igMatch = allText.match(/(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9_.]+)/i);
  const instagram = igMatch ? igMatch[1].replace(/\/$/, '') : '';
  return { email: businessEmail, instagram };
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '맛집': ['맛집 리뷰', '먹방 유튜버', '맛집 추천'],
  '먹방': ['먹방', '먹방 유튜버', '대식가'],
  '농산물': ['농산물 리뷰', '농가 유튜버', '로컬푸드 리뷰'],
  '캠핑': ['캠핑 유튜버', '차박 브이로그'],
  '뷰티': ['뷰티 유튜버', '화장품 리뷰', '메이크업 튜토리얼'],
  '여행': ['여행 브이로그', '여행 유튜버'],
  '패션': ['패션 유튜버', '코디 추천'],
  '운동': ['운동 유튜버', '홈트레이닝', '피트니스'],
};

function formatNumber(num: number): string {
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}억`;
  if (num >= 10000) return `${(num / 10000).toFixed(1)}만`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}천`;
  return num.toString();
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return '방금 전';
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

async function searchYouTubeDirect(keyword: string, maxResults: number = 10) {
  if (!YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.');
  const keywords = CATEGORY_KEYWORDS[keyword] || [keyword];
  const count = Math.min(maxResults, 50);
  const allResults: any[] = [];

  for (const kw of keywords) {
    if (allResults.length >= count) break;
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(kw)}&maxResults=50&regionCode=KR&hl=ko&key=${YOUTUBE_API_KEY}`;
    const searchRes: any = await fetch(searchUrl);
    if (!searchRes.ok) continue;
    const searchData = await searchRes.json();
    if (!searchData.items || searchData.items.length === 0) continue;

    const channelIds = searchData.items.map((item: any) => item.snippet.channelId || item.id.channelId).join(',');
    const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channelIds}&key=${YOUTUBE_API_KEY}`;
    const channelsRes: any = await fetch(channelsUrl);
    if (!channelsRes.ok) continue;
    const channelsData = await channelsRes.json();

    for (const ch of (channelsData.items || [])) {
      if (allResults.length >= count) break;
      const snippet = ch.snippet || {};
      const stats = ch.statistics || {};
      const branding = ch.brandingSettings?.channel || {};
      const subs = parseInt(stats.subscriberCount || '0', 10);
      const views = parseInt(stats.viewCount || '0', 10);
      const videos = parseInt(stats.videoCount || '1', 10);
      const avgViews = videos > 0 ? Math.round(views / videos) : 0;
      const contact = extractContactInfo(snippet.description || '', branding.description || '');

      allResults.push({
        channelId: ch.id, title: snippet.title,
        description: (snippet.description || '').substring(0, 300),
        customUrl: snippet.customUrl || '',
        thumbnailUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
        subscriberCount: subs, subscriberFormatted: formatNumber(subs),
        videoCount: videos, viewCount: views, avgViews,
        channelUrl: `https://www.youtube.com/channel/${ch.id}`,
        email: contact.email, instagram: contact.instagram,
        category: keyword, source: 'YouTube Data API v3',
      });
    }
  }
  return { success: true, result: allResults };
}

async function searchPopularVideos(keyword: string, maxResults: number = 5, period: string = '') {
  if (!YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.');
  let publishedAfter = '';
  if (period === 'day') publishedAfter = new Date(Date.now() - 86400000).toISOString();
  else if (period === 'week') publishedAfter = new Date(Date.now() - 7 * 86400000).toISOString();
  else if (period === 'month') publishedAfter = new Date(Date.now() - 30 * 86400000).toISOString();
  else if (period === 'year') publishedAfter = new Date(Date.now() - 365 * 86400000).toISOString();

  const count = Math.min(maxResults, 20);
  let searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(keyword)}&order=viewCount&maxResults=${count}&regionCode=KR&hl=ko&key=${YOUTUBE_API_KEY}`;
  if (publishedAfter) searchUrl += `&publishedAfter=${publishedAfter}`;

  const searchRes: any = await fetch(searchUrl);
  if (!searchRes.ok) throw new Error(`YouTube Search API 오류: ${searchRes.status}`);
  const searchData = await searchRes.json();
  if (!searchData.items || searchData.items.length === 0) return { success: true, videos: [], analysis: '', summary: '검색 결과가 없습니다.' };

  const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');
  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
  const videosRes: any = await fetch(videosUrl);
  if (!videosRes.ok) throw new Error(`YouTube Videos API 오류: ${videosRes.status}`);
  const videosData = await videosRes.json();

  const videos = (videosData.items || []).map((v: any) => {
    const stats = v.statistics || {};
    const viewCount = parseInt(stats.viewCount || '0', 10);
    const likeCount = parseInt(stats.likeCount || '0', 10);
    const commentCount = parseInt(stats.commentCount || '0', 10);
    return {
      videoId: v.id, title: v.snippet.title, channelName: v.snippet.channelTitle,
      channelId: v.snippet.channelId, description: (v.snippet.description || '').substring(0, 200),
      publishedAt: v.snippet.publishedAt, publishedAgo: getRelativeTime(v.snippet.publishedAt),
      viewCount, viewCountFormatted: formatNumber(viewCount), likeCount, commentCount,
      engagementRate: viewCount > 0 ? ((likeCount + commentCount) / viewCount * 100).toFixed(2) + '%' : '0%',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnailUrl: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url || '',
    };
  });

  const summary = `"${keyword}" 관련 인기 영상 ${videos.length}건을 찾았습니다.`;
  return { success: true, videos, analysis: '', summary };
}

// ══════════════════════════════════════════════════════════════
// ── WORKSPACE: Google Sheets Storage Bridge ──
// ══════════════════════════════════════════════════════════════
const WORKSPACE_SHEET_ID = process.env.JARVIS_WORKSPACE_SHEET_ID || '';
const GOOGLE_SHEETS_CREDENTIALS = process.env.GOOGLE_SHEETS_CREDENTIALS || '';

async function getGoogleSheetsToken(): Promise<string> {
  if (!GOOGLE_SHEETS_CREDENTIALS) throw new Error('GOOGLE_SHEETS_CREDENTIALS not configured');
  const credentials = JSON.parse(GOOGLE_SHEETS_CREDENTIALS);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(credentials.private_key, 'base64url');
  const jwt = `${header}.${payload}.${signature}`;
  const tokenRes: any = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json() as any;
  if (!tokenData.access_token) throw new Error('Google Sheets token failed');
  return tokenData.access_token;
}

async function sheetsAppend(tab: string, values: string[][]): Promise<any> {
  const token = await getGoogleSheetsToken();
  const range = encodeURIComponent(`${tab}!A1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res: any = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Sheets append error (${res.status}): ${JSON.stringify(data.error?.message || data)}`);
  return data;
}

async function sheetsRead(tab: string, range?: string): Promise<any> {
  const token = await getGoogleSheetsToken();
  const r = range || `${tab}!A1:Z1000`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${encodeURIComponent(r)}`;
  const res: any = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Sheets read error (${res.status}): ${JSON.stringify(data.error?.message || data)}`);
  return data;
}

// OUTREACH-SHEET.1B: 신규 CRM 탭 (기존 influencer_candidates는 legacy 보존)
const OUTREACH_CRM_TAB = 'influencer_candidates_v2';

const SHEET_HEADERS: Record<string, string[]> = {
  jarvis_records: ['recordId','createdAt','type','title','summary','sourceCommand','status','tags','linkedSheetTab','createdBy','safePreview'],
  briefings: ['briefingId','createdAt','todayOrders','currentNewOrders','pendingShipping','preShipTotal','todaySales','recommendedActions','briefingText'],
  creative_scripts: ['scriptId','createdAt','product','platform','hook','caption','threadPost','kakaoMessage','reelsScript','recommendedGrowthLink','status','sourceCommand'],
  growth_campaigns: ['campaignId','createdAt','product','source','targetUrl','directUrl','couponCode','campaignMemo','status'],
  purchase_order_drafts: ['draftId','createdAt','supplier','productSummary','totalQuantity','totalAmountIfAvailable','status','safePreview'],
  influencer_candidates: ['influencer_id','platform','channel_name','handle','profile_url','contact_email','contact_url','email_status','category_tags','source_keyword','source_product','followers_or_subscribers','avg_views','fit_score','fit_reason','outreach_status','last_contacted_at','reply_status','next_action','duplicate_hash','created_at','updated_at','notes'],
  influencer_candidates_v2: ['influencer_id','platform','channel_name','handle','profile_url','contact_email','contact_url','email_status','category_tags','source_keyword','source_product','followers_or_subscribers','avg_views','fit_score','fit_reason','outreach_status','last_contacted_at','reply_status','next_action','duplicate_hash','created_at','updated_at','notes','proposal_angle','proposal_subject','proposal_draft'],
  market_price_checks: ['checkId','createdAt','productName','rawMaterialCost','currentPrice','shippingCost','packagingCost','platformFeeRate','otherCosts','competitorPrices','competitorMinPrice','competitorAvgPrice','netSalesAmount','estimatedMargin','estimatedMarginRate','jarvisDecision','recommendedAction','sourceCommand'],
  // DAILY-BRIEF-A.1: Daily Brief 4탭
  daily_operations_brief: ['brief_id','date_kst','period_start_kst','period_end_kst','smartstore_new_orders','smartstore_ready_orders','smartstore_delivering','smartstore_delivered','smartstore_purchase_decided','smartstore_confirm_needed','outreach_discovered','outreach_public_email_found','outreach_contact_url_found','outreach_draft_ready','outreach_approval_waiting','outreach_email_sent','outreach_positive_replies','outreach_accepted','outreach_followup_needed','outreach_followup_drafted','outreach_followup_sent','hot_youtube_count','hot_threads_count','hot_instagram_count','hot_tiktok_count','hot_naver_blog_count','telegram_sent','telegram_sent_at','telegram_error_code','created_at','notes'],
  outreach_agent_runs: ['run_id','date_kst','mission','product','source_keyword','target_count','status','started_at','completed_at','current_node','discovered_count','contact_found_count','draft_ready_count','approval_waiting_count','sent_count','reply_count','positive_reply_count','accepted_count','followup_needed_count','followup_sent_count','failed_count','notes'],
  outreach_candidate_events: ['event_id','candidate_id','platform','profile_url','event_type','event_time','source','message_id','status_before','status_after','notes'],
  telegram_notification_logs: ['notification_id','brief_id','channel','sent','sent_at','error_code','error_message','created_at','notes'],
  // OUTREACH-COPY-AGENT-MASTER-A.1: viral_content_swipe 탭 (Hot Content 카피 학습 재료)
  viral_content_swipe: ['id','platform','source_product','source_keyword','content_url','creator_name','hook_text','thumbnail_text','post_summary','engagement_visible','comment_signal','hot_reason','copy_pattern','emotion_trigger','buyer_desire','usable_for','hot_score','copy_pattern_score','risk_score','created_at','notes'],
  // COPY-BRAIN-A.1: Copy Brain 저장 구조
  copy_generation_log: ['copy_id','product','platform','output_type','source_keyword','generated_text','product_truth','buyer_desire','copy_dna','hook_type','score_hook','score_sensory','score_buyer_desire','score_product_truth','score_platform_fit','score_mawi_voice','score_originality','score_action','score_risk','boring_score','final_score','recommended','risk_flags','rewrite_required','dna_source','used_viral_content_count','used_content_ids','copy_dna_summary','created_at','notes'],
  copy_feedback_log: ['feedback_id','copy_id','feedback','reason','edited_text','product','platform','created_at','notes'],
  mawin_style_rules: ['rule_id','category','rule_text','priority','active','created_at','notes'],
};

async function ensureTab(tab: string): Promise<void> {
  const token = await getGoogleSheetsToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}:batchUpdate`;
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
  });
  // Ignore error if tab already exists
}

async function ensureHeaders(tab: string): Promise<void> {
  const headers = SHEET_HEADERS[tab];
  if (!headers) return;
  try {
    // OUTREACH-COPY.1: 헤더 행 전체 읽어서 컬럼 수 비교 후 부족하면 업데이트
    const lastCol = String.fromCharCode(64 + headers.length); // e.g. Z for 26 cols
    const result = await sheetsRead(tab, `${tab}!A1:${lastCol}1`);
    const existingHeaders: string[] = result.values?.[0] || [];
    if (existingHeaders.length === 0) {
      // 헤더 없음 - 새로 쓰기
      const token = await getGoogleSheetsToken();
      const range = encodeURIComponent(`${tab}!A1`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?valueInputOption=RAW`;
      await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [headers] }),
      });
    } else if (existingHeaders.length < headers.length) {
      // 헤더 컬럼 수 부족 - 누락된 컬럼만 추가
      const missingHeaders = headers.slice(existingHeaders.length);
      const startColLetter = String.fromCharCode(65 + existingHeaders.length); // 다음 빈 컬럼
      const token = await getGoogleSheetsToken();
      const range = encodeURIComponent(`${tab}!${startColLetter}1`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?valueInputOption=RAW`;
      await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [missingHeaders] }),
      });
    }
    // 헤더 수 동일하면 그대로 유지
  } catch (e: any) {
    // Tab doesn't exist - create it first
    if (e.message?.includes('Unable to parse range') || e.message?.includes('400') || e.message?.includes('404')) {
      await ensureTab(tab);
      const token = await getGoogleSheetsToken();
      const range = encodeURIComponent(`${tab}!A1`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?valueInputOption=RAW`;
      await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [headers] }),
      });
    } else {
      throw e;
    }
  }
}

function generateRecordId(type: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${type}-${ts}-${rand}`;
}

async function handleWorkspaceSave(params: any) {
  if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    return { success: false, error: 'Google Sheets not configured' };
  }
  const { type, data, sourceCommand } = params;
  const now = new Date().toISOString();
  const recordId = generateRecordId(type);

  try {
    // 0. 헤더 보장
    const targetTab = type === 'briefing' ? 'briefings' :
      type === 'creative_script' ? 'creative_scripts' :
      type === 'growth_campaign' ? 'growth_campaigns' :
      type === 'purchase_order_draft' ? 'purchase_order_drafts' :
      type === 'market_price_check' ? 'market_price_checks' : '';
    if (targetTab) await ensureHeaders(targetTab);
    await ensureHeaders('jarvis_records');

    // 1. 타입별 탭에 저장
    if (type === 'briefing' && data) {
      await sheetsAppend('briefings', [[
        recordId, now,
        String(data.todayOrders || 0), String(data.currentNewOrders || 0),
        String(data.pendingShipping || 0), String(data.preShipTotal || 0),
        String(data.todaySales || 0), data.recommendedActions || '',
        data.briefingText || ''
      ]]);
    } else if (type === 'creative_script' && data) {
      await sheetsAppend('creative_scripts', [[
        recordId, now, data.product || '', data.platform || 'full_package',
        data.hook || '', data.caption || '', data.threadPost || '',
        data.kakaoMessage || '', data.reelsScript || '',
        data.recommendedGrowthLink || '', 'saved', sourceCommand || ''
      ]]);
    } else if (type === 'growth_campaign' && data) {
      await sheetsAppend('growth_campaigns', [[
        recordId, now, data.product || '', data.source || '',
        data.targetUrl || '', data.directUrl || '',
        data.couponCode || '', data.campaignMemo || '', 'saved'
      ]]);
    } else if (type === 'purchase_order_draft' && data) {
      await sheetsAppend('purchase_order_drafts', [[
        recordId, now, data.supplier || '', data.productSummary || '',
        String(data.totalQuantity || 0), String(data.totalAmountIfAvailable || ''),
        'draft', data.safePreview || ''
      ]]);
    } else if (type === 'market_price_check' && data) {
      await ensureHeaders('market_price_checks');
      await sheetsAppend('market_price_checks', [[
        recordId, now, data.productName || '', String(data.rawMaterialCost || 0),
        String(data.currentPrice || 0), String(data.shippingCost || 0),
        String(data.packagingCost || 0), String(data.platformFeeRate || 0),
        String(data.otherCosts || 0), data.competitorPrices || '',
        String(data.competitorMinPrice || 0), String(data.competitorAvgPrice || 0),
        String(data.netSalesAmount || 0), String(data.estimatedMargin || 0),
        String(data.estimatedMarginRate || 0), data.jarvisDecision || '',
        data.recommendedAction || '', sourceCommand || ''
      ]]);
    } else if (type === 'influencer_candidate' && data) {
      await ensureHeaders(OUTREACH_CRM_TAB);
      await sheetsAppend(OUTREACH_CRM_TAB, [[
        recordId, now, data.platform || '', data.keyword || '',
        data.name || '', data.channelOrBlogUrl || '',
        data.recentContentTitle || '', data.recentContentUrl || '',
        String(data.subscriberOrVisitor || ''), String(data.viewCount || ''),
        data.publicContactStatus || 'unknown', data.publicEmailMasked || '',
        String(data.productFitScore || 0), data.productFitReason || '',
        data.suggestedProduct || '', data.suggestedOfferAngle || '',
        data.outreachStatus || 'pending', data.firstEmailDraft || '',
        data.followUpDraft || '', '', 'none', data.notes || ''
      ]]);
    }

    // 2. jarvis_records 공통 기록
    const title = data?.title || data?.product || type;
    const summary = data?.summary || data?.safePreview || '';
    await sheetsAppend('jarvis_records', [[
      recordId, now, type, title, summary.slice(0, 200),
      sourceCommand || '', 'saved', type,
      type === 'briefing' ? 'briefings' :
      type === 'creative_script' ? 'creative_scripts' :
      type === 'growth_campaign' ? 'growth_campaigns' :
      type === 'purchase_order_draft' ? 'purchase_order_drafts' :
      type === 'market_price_check' ? 'market_price_checks' :
      type === 'influencer_candidate' ? OUTREACH_CRM_TAB : 'jarvis_records',
      'jarvis', summary.slice(0, 100)
    ]]);

    return { success: true, recordId, type, savedAt: now, message: `${title} 저장 완료` };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function handleWorkspaceQuery(params: any) {
  if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    return { success: false, error: 'Google Sheets not configured' };
  }
  const { type, recordId, limit } = params;
  try {
    const tab = type === 'briefing' ? 'briefings' :
                type === 'creative_script' ? 'creative_scripts' :
                type === 'growth_campaign' ? 'growth_campaigns' :
                type === 'purchase_order_draft' ? 'purchase_order_drafts' : 'jarvis_records';
    const result = await sheetsRead(tab);
    const rows = result.values || [];
    if (rows.length < 2) return { success: true, records: [], total: 0 };
    const headers = rows[0];
    let records = rows.slice(1).map((row: string[]) => {
      const obj: any = {};
      headers.forEach((h: string, i: number) => { obj[h] = row[i] || ''; });
      return obj;
    });
    // 필터링
    if (recordId) records = records.filter((r: any) => r.recordId === recordId || r.briefingId === recordId || r.scriptId === recordId || r.campaignId === recordId || r.draftId === recordId);
    // 최신순 정렬
    records.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const maxRecords = limit || 20;
    return { success: true, records: records.slice(0, maxRecords), total: records.length };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function handleWorkspaceList(params: any) {
  if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    return { success: false, error: 'Google Sheets not configured' };
  }
  try {
    const result = await sheetsRead('jarvis_records');
    const rows = result.values || [];
    if (rows.length < 2) return { success: true, records: [], total: 0 };
    const headers = rows[0];
    let records = rows.slice(1).map((row: string[]) => {
      const obj: any = {};
      headers.forEach((h: string, i: number) => { obj[h] = row[i] || ''; });
      return obj;
    });
    records.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const limit = params?.limit || 20;
    const typeFilter = params?.type;
    if (typeFilter) records = records.filter((r: any) => r.type === typeFilter);
    return { success: true, records: records.slice(0, limit), total: records.length };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ══════════════════════════════════════════════════════════════
// ── OUTREACH ENGINE LITE ──
// ══════════════════════════════════════════════════════════════

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function calculateProductFitScore(channel: any, keyword: string, product: string): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];
  const desc = (channel.description || '').toLowerCase();
  const title = (channel.title || channel.name || '').toLowerCase();
  const contentTitle = (channel.recentContentTitle || '').toLowerCase();
  const allText = `${desc} ${title} ${contentTitle}`;

  // 1. 상품 관련성 (0~25)
  const productKeywords = product ? product.toLowerCase().split(/[\s,]+/) : keyword.toLowerCase().split(/[\s,]+/);
  const matchedKws = productKeywords.filter(kw => kw.length > 1 && allText.includes(kw));
  if (matchedKws.length >= 2) { score += 25; reasons.push('상품 키워드 강한 매칭'); }
  else if (matchedKws.length >= 1) { score += 15; reasons.push('상품 키워드 부분 매칭'); }
  else { score += 5; }

  // 2. 콘텐츠 활동성 (0~20)
  const subs = channel.subscriberCount || channel.subscribers || 0;
  const views = channel.viewCount || 0;
  if (subs >= 10000 && subs <= 500000) { score += 20; reasons.push('마이크로 인플루언서 (공동구매 최적)'); }
  else if (subs >= 1000 && subs < 10000) { score += 15; reasons.push('나노 인플루언서 (높은 참여율 기대)'); }
  else if (subs > 500000) { score += 10; reasons.push('대형 채널 (단가 높을 수 있음)'); }
  else { score += 5; }

  // 3. 공동구매/먹방/캠핑/가족/제철 연결성 (0~25)
  const lifestyleKws = ['공동구매','공구','먹방','캠핑','가족','집밥','육아','제철','농산물','간식','요리','레시피','리뷰','체험','협찬'];
  const lifestyleMatches = lifestyleKws.filter(kw => allText.includes(kw));
  if (lifestyleMatches.length >= 3) { score += 25; reasons.push(`라이프스타일 강한 연결 (${lifestyleMatches.slice(0,3).join(', ')})`); }
  else if (lifestyleMatches.length >= 1) { score += 15; reasons.push(`라이프스타일 부분 연결 (${lifestyleMatches.join(', ')})`); }
  else { score += 5; }

  // 4. 조회수/반응 가능성 (0~15)
  if (views > 10000000) { score += 15; reasons.push('높은 총 조회수'); }
  else if (views > 1000000) { score += 10; reasons.push('양호한 조회수'); }
  else { score += 5; }

  // 5. 공개 연락 가능 여부 (0~15)
  if (channel.email && channel.email.includes('@')) { score += 15; reasons.push('공개 이메일 확인됨'); }
  else if (channel.publicContactStatus === 'form_available') { score += 10; reasons.push('협업 문의 폼 확인됨'); }
  else { score += 3; }

  return { score: Math.min(score, 100), reason: reasons.join('. ') + '.' };
}

// ── 품목별 제안 각도 키워드 맵 ──
const PRODUCT_ANGLE_MAP: Record<string, string[]> = {
  '복숭아': ['제철 과일 / 향과 당도', '여름 시즌 선물 수요', '먹방/캠핑/가족 콘텐츠 궁합', '짧은 수확 시즌 긴박감'],
  '옥수수': ['여름 간식 / 쫀득한 식감', '산지직송 신뢰', '캠핑/휴가철 간식', '가족 재구매 유도'],
  '찰옥수수': ['여름 간식 / 쫀득한 식감', '산지직송 신뢰', '캠핑/휴가철 간식', '가족 재구매 유도'],
  '절임배추': ['김장철 예약 수요', '산지 원물 안정성', '배송 일정 신뢰', '가족 단위 구매'],
  '배추': ['김장철 예약 수요', '산지 원물 안정성', '배송 일정 신뢰', '가족 단위 구매'],
  '딸기': ['겨울/봄 제철 과일', '당도와 신선도', '선물/디저트 수요', '먹방/베이킹 콘텐츠 궁합'],
  '수박': ['여름 제철 과일', '가족 간식', '캠핑/피크닉 콘텐츠', '산지직송 신선도'],
  '감자': ['사계절 간편 식재료', '집밥/요리 콘텐츠', '산지직송 신뢰', '대용량 가성비'],
  '고구마': ['가을/겨울 간식', '건강 간식 수요', '캠핑/군고구마 콘텐츠', '아이 간식'],
  '사과': ['가을 제철 과일', '선물 수요', '당도/식감 강조', '가족 건강 간식'],
  '배': ['가을 제철 과일', '선물 수요', '수분/당도 강조', '명절 선물 각도'],
};

function getProductAngles(product: string, keyword: string): string[] {
  const p = product || keyword;
  for (const [key, angles] of Object.entries(PRODUCT_ANGLE_MAP)) {
    if (p.includes(key)) return angles;
  }
  // 기본 각도 (미등록 품목)
  return [`제철 ${p} 산지직송`, `${p} 공동구매 시즌 수요`, `가족/일상 콘텐츠와 연결 가능`, '체험 후 공동구매 제안'];
}

function generateOfferAngle(channel: any, keyword: string, product: string): string {
  const angles = getProductAngles(product, keyword);
  const name = channel.title || channel.name || '채널';
  const category = (channel.description || channel.recentContentTitle || '').slice(0, 40);
  const p = product || keyword;
  // 채널 카테고리와 상품 연결 이유를 구체적으로 생성
  const categoryHint = category ? `${category} 콘텐츠` : '콘텐츠';
  return `${name}님의 ${categoryHint}와 ${p} 공동구매 연결 포인트: ${angles.slice(0, 2).join(' / ')}`;
}

function generateProposalAngle(channel: any, keyword: string, product: string): string {
  const angles = getProductAngles(product, keyword);
  return angles.join(' / ');
}

function generateProposalSubject(product: string, keyword: string): string {
  const p = product || keyword;
  return `제철 ${p} 공동구매 제안드립니다`;
}

function generateProposalDraft(channel: any, keyword: string, product: string): string {
  const name = channel.title || channel.name || '크리에이터';
  const p = product || keyword;
  const angles = getProductAngles(p, keyword);
  const angleStr = angles.slice(0, 2).join(', ');
  return `안녕하세요, ${name}님.\n` +
    `채널에서 ${angleStr} 관련 콘텐츠와 잘 맞는 상품을 제안드리고 싶어 연락드립니다.\n` +
    `이번 상품은 ${p} 공동구매입니다.\n` +
    `${p}는 ${angles[0]}로 짧은 기간 안에 반응을 만들기 좋은 품목입니다.\n` +
    `${name}님의 콘텐츠 톤과도 잘 맞아 구독자분들이 부담 없이 관심을 가질 수 있을 것 같습니다.\n` +
    `조건이 맞으시면 샘플/공동구매 조건을 간단히 전달드리겠습니다.`;
}

function generateFirstEmailDraft(channel: any, keyword: string, product: string): string {
  const name = channel.title || channel.name || '크리에이터';
  const contentTitle = channel.recentContentTitle || '최근 콘텐츠';
  return `안녕하세요 ${name}님,\n\n` +
    `최근 올려주신 "${contentTitle.slice(0,40)}" 영상/글을 인상 깊게 봤습니다.\n` +
    `저희는 ${product || keyword} 산지직송 농산물을 판매하고 있는 스마트스토어 셀러입니다.\n\n` +
    `${name}님의 콘텐츠 분위기와 저희 상품이 잘 어울릴 것 같아 공동구매 또는 체험 협업을 제안드립니다.\n\n` +
    `- 상품: ${product || keyword} (산지직송, 당일수확)\n` +
    `- 제안: 체험 제공 + 공동구매 링크 (수수료 협의 가능)\n` +
    `- 부담 없이 먼저 맛보시고 판단해주셔도 됩니다\n\n` +
    `관심 있으시면 편하게 회신 부탁드립니다.\n감사합니다.`;
}

function generateFollowUpDraft(channel: any, keyword: string, product: string): string {
  const name = channel.title || channel.name || '크리에이터';
  return `안녕하세요 ${name}님,\n\n` +
    `지난번 ${product || keyword} 공동구매 제안 메일 보내드렸었는데, 혹시 확인하셨을까요?\n\n` +
    `요즘 ${product || keyword} 시즌이라 물량이 한정되어 있어서, ` +
    `관심 있으시면 이번 주 내로 샘플을 보내드릴 수 있습니다.\n\n` +
    `부담 없이 맛만 보시고 괜찮으시면 그때 협업 방식을 논의해도 됩니다.\n` +
    `바쁘시면 간단히 "관심 있어요" 또는 "다음에요"만 회신 주셔도 감사하겠습니다.\n\n` +
    `좋은 하루 되세요!`;
}

async function handleOutreachCollect(params: any) {
  const { keyword, product, maxCandidates = 20, platform = 'all', requireEmail = true, existingCandidateIds = [] } = params;
  if (!keyword) return { success: false, error: 'keyword required' };

  const candidates: any[] = [];
  const excludedCandidates: any[] = [];
  const now = new Date().toISOString();
  const max = Math.min(maxCandidates, 50); // 50명 cap
  const productName = product || keyword;

  // ── Telemetry 추적 ──
  const telemetry = {
    apiCalls: 0,
    quotaUsed: 0,      // YouTube API quota units
    searchCalls: 0,    // search.list (100 units each)
    channelCalls: 0,   // channels.list (1 unit each)
    videoCalls: 0,     // videos.list (1 unit each)
    naverCalls: 0,
    trendChannelsFound: 0,
    searchChannelsFound: 0,
    emailsVerified: 0,
    deduped: 0,
  };

  // ── 기존 후보 ID Set (dedupe용) ──
  const existingIds = new Set<string>(existingCandidateIds);

  // ── 실전 세그먼트 정의 ──
  const PRACTICAL_SEGMENTS: Record<string, string[]> = {
    '먹방': ['먹방', '대식가', 'mukbang', '맛집 리뷰', '음식 리뷰'],
    '캠핑': ['캠핑', '차박', '캠핑요리', '캠핑장 추천', '캠핑 브이로그'],
    '요리': ['요리', '레시피', '집밥', '쿠킹', '자취요리', '간단 요리'],
    '주부살림': ['살림', '주부', '육아맘', '가족일상', '장보기', '살림팁'],
    '건강식': ['건강', '다이어트', '식단', '건강식', '클린이팅'],
    '지역여행': ['여행', '지역 맛집', '로컬', '산지 방문', '시골 브이로그'],
    '제철먹거리': ['제철', '농산물', '산지직송', '로컬푸드', '과일 리뷰', '간식 리뷰'],
    '공동구매': ['공동구매', '공구', '소비자 리뷰', '체험단', '협찬 리뷰'],
  };

  // ── 상품명 → 적합 세그먼트 매핑 ──
  function getRelevantSegments(productName: string): string[] {
    const pLower = productName.toLowerCase();
    const segmentScores: Record<string, number> = {};
    const foodKws = ['옥수수','복숭아','사과','배','감','딸기','수박','참외','토마토','고구마','감자','절임배추','김치','떡','한과','꿀','잼','과일','채소','농산물','밤','고구마'];
    const campKws = ['캠핑','차박','아웃도어','바베큐'];
    const cookKws = ['요리','레시피','집밥','간식'];
    if (foodKws.some(k => pLower.includes(k))) {
      segmentScores['먹방'] = 5; segmentScores['요리'] = 5; segmentScores['제철먹거리'] = 5;
      segmentScores['캠핑'] = 4; segmentScores['주부살림'] = 4; segmentScores['건강식'] = 3;
      segmentScores['공동구매'] = 4; segmentScores['지역여행'] = 3;
    } else if (campKws.some(k => pLower.includes(k))) {
      segmentScores['캠핑'] = 5; segmentScores['먹방'] = 3; segmentScores['요리'] = 3;
    } else if (cookKws.some(k => pLower.includes(k))) {
      segmentScores['요리'] = 5; segmentScores['먹방'] = 4; segmentScores['주부살림'] = 4;
    } else {
      Object.keys(PRACTICAL_SEGMENTS).forEach(s => { segmentScores[s] = 3; });
    }
    return Object.entries(segmentScores).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([seg]) => seg);
  }

  // ── 세그먼트별 검색어 생성 ──
  function getSearchQueries(segments: string[]): { segment: string; query: string }[] {
    const queries: { segment: string; query: string }[] = [];
    for (const seg of segments) {
      const kws = PRACTICAL_SEGMENTS[seg] || [seg];
      const randomKw = kws[Math.floor(Math.random() * kws.length)];
      queries.push({ segment: seg, query: `${productName} ${randomKw}` });
    }
    return queries;
  }

  // ── 세그먼트 태깅 ──
  function tagPracticalSegment(channelDesc: string, channelTitle: string): string {
    const text = (channelDesc + ' ' + channelTitle).toLowerCase();
    for (const [seg, kws] of Object.entries(PRACTICAL_SEGMENTS)) {
      if (kws.some(kw => text.includes(kw.toLowerCase()))) return seg;
    }
    return '기타';
  }

  const segmentStats: Record<string, number> = {};
  const searchedSegments: string[] = [];
  const seenChannelIds = new Set<string>();

  // ══════════════════════════════════════════════════════════════
  // STEP A: Trend Discovery — 인기 영상에서 채널 추출
  // ══════════════════════════════════════════════════════════════
  const trendChannelIds: string[] = [];

  if ((platform === 'all' || platform === 'youtube') && YOUTUBE_API_KEY) {
    try {
      // A-1: 키워드 관련 인기 영상 검색 (viewCount 순)
      const trendSearchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(productName + ' 리뷰')}&order=viewCount&maxResults=15&regionCode=KR&hl=ko&key=${YOUTUBE_API_KEY}`;
      const trendRes: any = await fetch(trendSearchUrl);
      telemetry.apiCalls++; telemetry.searchCalls++; telemetry.quotaUsed += 100;

      if (trendRes.ok) {
        const trendData = await trendRes.json() as any;
        if (trendData.items) {
          for (const item of trendData.items) {
            const chId = item.snippet?.channelId;
            if (chId && !seenChannelIds.has(chId) && !existingIds.has(chId)) {
              seenChannelIds.add(chId);
              trendChannelIds.push(chId);
            }
          }
          telemetry.trendChannelsFound = trendChannelIds.length;
        }
      } else {
        const errData = await trendRes.json() as any;
        if (errData.error?.errors?.[0]?.reason === 'quotaExceeded') {
          return { success: true, candidates: [], quotaExceeded: true, telemetry, message: 'YouTube API 할당량 초과로 오늘은 소량/수동 검증 모드로 진행합니다.' };
        }
      }

      // A-2: 추가 트렌드 검색 (최근 1주일 인기)
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const recentTrendUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(productName)}&order=viewCount&maxResults=10&regionCode=KR&hl=ko&publishedAfter=${weekAgo}&key=${YOUTUBE_API_KEY}`;
      const recentRes: any = await fetch(recentTrendUrl);
      telemetry.apiCalls++; telemetry.searchCalls++; telemetry.quotaUsed += 100;

      if (recentRes.ok) {
        const recentData = await recentRes.json() as any;
        if (recentData.items) {
          for (const item of recentData.items) {
            const chId = item.snippet?.channelId;
            if (chId && !seenChannelIds.has(chId) && !existingIds.has(chId)) {
              seenChannelIds.add(chId);
              trendChannelIds.push(chId);
            }
          }
          telemetry.trendChannelsFound = trendChannelIds.length;
        }
      }
    } catch (e: any) {
      // Trend Discovery 실패해도 계속 진행
    }
  }

  // ══════════════════════════════════════════════════════════════
  // STEP B: Candidate Expansion — 세그먼트별 채널 검색 + Trend 채널 병합
  // ══════════════════════════════════════════════════════════════
  const allChannelIds: string[] = [...trendChannelIds];

  if ((platform === 'all' || platform === 'youtube') && YOUTUBE_API_KEY) {
    try {
      const relevantSegments = getRelevantSegments(productName);
      const searchQueries = getSearchQueries(relevantSegments);
      searchedSegments.push(...relevantSegments);

      // 세그먼트별 채널 검색 (quota 관리: 최대 6개 검색)
      const maxSearches = Math.min(searchQueries.length, 6);
      const perSearchMax = Math.ceil((max * 2) / maxSearches);

      for (let i = 0; i < maxSearches; i++) {
        const { segment, query } = searchQueries[i];
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=${Math.min(perSearchMax, 20)}&regionCode=KR&hl=ko&key=${YOUTUBE_API_KEY}`;
        const searchRes: any = await fetch(searchUrl);
        telemetry.apiCalls++; telemetry.searchCalls++; telemetry.quotaUsed += 100;

        if (!searchRes.ok) {
          const errData = await searchRes.json() as any;
          if (errData.error?.errors?.[0]?.reason === 'quotaExceeded') {
            break; // quota 초과 시 더 이상 검색하지 않고 현재까지 수집된 것으로 진행
          }
          continue;
        }
        const searchData = await searchRes.json() as any;
        if (!searchData.items || searchData.items.length === 0) continue;

        const newChannelIds = searchData.items
          .map((item: any) => item.snippet.channelId || item.id?.channelId)
          .filter((id: string) => id && !seenChannelIds.has(id) && !existingIds.has(id));
        newChannelIds.forEach((id: string) => { seenChannelIds.add(id); allChannelIds.push(id); });
        telemetry.searchChannelsFound += newChannelIds.length;
      }
    } catch (e: any) {
      // 검색 실패해도 Trend 채널로 계속 진행
    }
  }

  // ══════════════════════════════════════════════════════════════
  // STEP C: Public Contact Verification — 채널 상세 + 이메일 확인
  // ══════════════════════════════════════════════════════════════
  if ((platform === 'all' || platform === 'youtube') && YOUTUBE_API_KEY && allChannelIds.length > 0) {
    try {
      // 50개씩 배치로 channels.list 호출
      const batchSize = 50;
      for (let batchStart = 0; batchStart < allChannelIds.length; batchStart += batchSize) {
        const batch = allChannelIds.slice(batchStart, batchStart + batchSize);
        const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${batch.join(',')}&key=${YOUTUBE_API_KEY}`;
        const channelsRes: any = await fetch(channelsUrl);
        telemetry.apiCalls++; telemetry.channelCalls++; telemetry.quotaUsed += 1;

        if (!channelsRes.ok) continue;
        const channelsData = await channelsRes.json() as any;

        for (const ch of (channelsData.items || [])) {
          const snippet = ch.snippet || {};
          const stats = ch.statistics || {};
          const branding = ch.brandingSettings?.channel || {};
          const subs = parseInt(stats.subscriberCount || '0', 10);
          const views = parseInt(stats.viewCount || '0', 10);

          // 이메일 추출 강화: snippet.description + branding.description + customUrl
          const allDescText = [
            snippet.description || '',
            branding.description || '',
            branding.unsubscribedTrailer || '',
          ].join('\n');
          const contact = extractContactInfo(allDescText, '');
          const hasEmail = !!(contact.email && contact.email.includes('@'));

          if (hasEmail) telemetry.emailsVerified++;

          const practicalSegment = tagPracticalSegment(allDescText, snippet.title || '');
          segmentStats[practicalSegment] = (segmentStats[practicalSegment] || 0) + 1;

          const channelData = {
            name: snippet.title, title: snippet.title,
            description: allDescText.substring(0, 300),
            subscriberCount: subs, viewCount: views,
            email: contact.email,
            recentContentTitle: snippet.title,
            publicContactStatus: hasEmail ? 'email_public' : 'unknown',
          };

          const fit = calculateProductFitScore(channelData, keyword, productName);

          // Dedupe: channelId 기반
          const channelUrl = `https://www.youtube.com/channel/${ch.id}`;

          const candidate = {
            candidateId: generateRecordId('inf'),
            collectedAt: now,
            platform: 'YouTube',
            keyword: keyword,
            seedKeyword: keyword,
            productName,
            practicalSegment,
            name: snippet.title,
            channelOrBlogUrl: channelUrl,
            channelId: ch.id,
            recentContentTitle: (snippet.description || '').substring(0, 60),
            recentContentUrl: channelUrl,
            subscriberOrVisitor: subs > 0 ? (subs >= 10000 ? `${(subs/10000).toFixed(1)}만` : `${subs.toLocaleString()}`) : '-',
            viewCount: views > 0 ? (views >= 100000000 ? `${(views/100000000).toFixed(1)}억` : views >= 10000 ? `${(views/10000).toFixed(0)}만` : views.toLocaleString()) : '-',
            publicContactStatus: channelData.publicContactStatus,
            // OUTREACH-EMAIL-CAPTURE-FIX.1: 마스킹 이메일은 publicEmailMasked에만 보관, contact_email에는 저장하지 않음
            publicEmailMasked: contact.email ? maskEmail(contact.email) : '',
            // OUTREACH-EMAIL-CAPTURE-FIX.1: 공개 이메일(***미포함, @포함)만 contact_email로 저장
            contact_email: (contact.email && !contact.email.includes('***') && contact.email.includes('@')) ? contact.email : '',
            emailSource: hasEmail ? 'channel_description' : '',
            productFitScore: fit.score,
            productFitReason: fit.reason,
            suggestedProduct: productName,
            suggestedOfferAngle: generateOfferAngle(channelData, keyword, productName),
            outreachStatus: 'pending',
            firstEmailDraft: hasEmail ? generateFirstEmailDraft(channelData, keyword, productName) : '',
            followUpDraft: hasEmail ? generateFollowUpDraft(channelData, keyword, productName) : '',
            responseStatus: 'none',
            notes: trendChannelIds.includes(ch.id) ? '🔥 트렌드 발견' : '',
            thumbnailUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
            excludedReason: '',
            // OUTREACH-COPY.1: 품목별 맞치형 제안 3콼럼
            proposal_angle: generateProposalAngle(channelData, keyword, productName),
            proposal_subject: generateProposalSubject(productName, keyword),
            proposal_draft: generateProposalDraft(channelData, keyword, productName),
          };

          // 이메일 필수 조건 처리
          if (requireEmail && !hasEmail) {
            candidate.excludedReason = contact.email ? 'invalid_email_format' : 'no_public_email';
            excludedCandidates.push(candidate);
          } else {
            candidates.push(candidate);
          }
        }
      }
    } catch (e: any) {
      if (e.message?.includes('할당량')) {
        // quota 초과 시 현재까지 수집된 것으로 진행
      }
    }
  }

  // ── Naver Blog 수집 ──
  if (platform === 'all' || platform === 'naver') {
    try {
      const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || '';
      const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';
      if (!NAVER_CLIENT_ID) throw new Error('Naver API 미설정');

      const naverQuery = `${productName} 공동구매 리뷰`;
      const naverUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(naverQuery)}&display=${max * 2}&sort=sim`;
      const naverRes: any = await fetch(naverUrl, {
        headers: { 'X-Naver-Client-Id': NAVER_CLIENT_ID, 'X-Naver-Client-Secret': NAVER_CLIENT_SECRET },
      });
      telemetry.apiCalls++; telemetry.naverCalls++;

      if (!naverRes.ok) throw new Error(`Naver API 오류: ${naverRes.status}`);
      const naverData = await naverRes.json() as any;

      for (const item of (naverData.items || []).slice(0, max)) {
        const bloggerlink = item.bloggerlink || '';
        const blogIdMatch = bloggerlink.match(/blog\.naver\.com\/([a-zA-Z0-9_]+)/);
        const blogId = blogIdMatch ? blogIdMatch[1] : '';
        const blogUrl = blogId ? `https://blog.naver.com/${blogId}` : bloggerlink;

        // Dedupe: blogUrl 기반
        if (existingIds.has(blogUrl)) { telemetry.deduped++; continue; }

        const cleanTitle = (item.title || '').replace(/<[^>]*>/g, '');
        const cleanDesc = (item.description || '').replace(/<[^>]*>/g, '').substring(0, 100);
        const practicalSegment = tagPracticalSegment(cleanDesc + ' ' + cleanTitle, item.bloggername || '');
        segmentStats[practicalSegment] = (segmentStats[practicalSegment] || 0) + 1;

        const channelData = {
          name: item.bloggername || blogId, title: item.bloggername || blogId,
          description: cleanDesc, recentContentTitle: cleanTitle,
          publicContactStatus: 'unknown', email: '', subscriberCount: 0, viewCount: 0,
        };
        const fit = calculateProductFitScore(channelData, keyword, productName);

        const candidate = {
          candidateId: generateRecordId('inf'),
          collectedAt: now,
          platform: 'Naver Blog',
          keyword: naverQuery,
          seedKeyword: keyword,
          productName,
          practicalSegment,
          name: item.bloggername || blogId || '블로거',
          channelOrBlogUrl: blogUrl,
          channelId: blogId,
          recentContentTitle: cleanTitle.substring(0, 60),
          recentContentUrl: item.link || '',
          subscriberOrVisitor: '-',
          viewCount: '-',
          publicContactStatus: 'unknown',
          publicEmailMasked: '',
          contact_email: '',
          emailSource: '',
          productFitScore: fit.score,
          productFitReason: fit.reason,
          suggestedProduct: productName,
          suggestedOfferAngle: generateOfferAngle(channelData, keyword, productName),
          outreachStatus: 'pending',
          firstEmailDraft: '',
          followUpDraft: '',
          responseStatus: 'none',
          notes: `최근 글: ${cleanTitle.substring(0, 40)}`,
          excludedReason: '',
          // OUTREACH-COPY.1: 품목별 맞치형 제안 3콼럼
          proposal_angle: generateProposalAngle(channelData, keyword, productName),
          proposal_subject: generateProposalSubject(productName, keyword),
          proposal_draft: generateProposalDraft(channelData, keyword, productName),
        };

        if (requireEmail) {
          candidate.excludedReason = 'no_public_email';
          excludedCandidates.push(candidate);
        } else {
          candidates.push(candidate);
        }
      }
    } catch (e: any) {
      // Naver 실패 시 무시
    }
  }

  // ══════════════════════════════════════════════════════════════
  // STEP D: Dedupe + Sort + Final Slice
  // ══════════════════════════════════════════════════════════════

  // 적합도 점수 내림차순 정렬
  candidates.sort((a, b) => b.productFitScore - a.productFitScore);

  // 제외 사유 집계
  const excludedNoEmail = excludedCandidates.filter(c => c.excludedReason === 'no_public_email').length;
  const excludedInvalidEmail = excludedCandidates.filter(c => c.excludedReason === 'invalid_email_format').length;
  const excludedContactOnly = excludedCandidates.filter(c => c.excludedReason === 'contact_link_only').length;

  const finalCandidates = candidates.slice(0, max);
  const shortfall = requireEmail ? Math.max(0, max - finalCandidates.length) : 0;

  return {
    success: true,
    candidates: finalCandidates,
    total: candidates.length,
    keyword,
    product: productName,
    requireEmail,
    searchedSegments,
    segmentStats,
    telemetry,
    excluded: {
      total: excludedCandidates.length,
      noEmail: excludedNoEmail,
      invalidEmail: excludedInvalidEmail,
      contactLinkOnly: excludedContactOnly,
    },
    shortfall,
    appendMode: true,
    message: requireEmail
      ? `4단계 파이프라인으로 ${productName} 공동구매 이메일 확인 후보 ${finalCandidates.length}명을 수집했습니다.${shortfall > 0 ? ` (${shortfall}명 부족)` : ''}`
      : `4단계 파이프라인으로 ${productName} 공동구매 후보 ${finalCandidates.length}명을 수집했습니다.`,
  };
}

// OUTREACH-SHEET.1: duplicate_hash 생성 헬퍼
function buildDuplicateHash(platform: string, profileUrl: string, channelName: string, handle: string): string {
  const norm = (s: string) => (s || '').toLowerCase().replace(/[\s\/\?#&=]+/g, '').trim();
  const base = profileUrl ? `${norm(platform)}::${norm(profileUrl)}` : `${norm(platform)}::${norm(channelName)}::${norm(handle)}`;
  // 간단한 해시 (FNV-like)
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
async function handleOutreachSaveCandidates(params: any) {
  const { candidates, dryRun } = params;
  if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
    return { success: false, error: 'candidates array required' };
  }
  if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    return { success: false, error: 'Google Sheets not configured' };
  }
  try {
    await ensureHeaders(OUTREACH_CRM_TAB);
    // v2 탭 읽어서 duplicate_hash 목록 추출
    const existing = await sheetsRead(OUTREACH_CRM_TAB);
    const existingRows: string[][] = existing.values || [];
    const headers: string[] = existingRows[0] || [];
    const hashColIdx = headers.indexOf('duplicate_hash');
    const idColIdx = headers.indexOf('influencer_id');
    const existingHashes: Map<string, number> = new Map(); // hash -> row index (1-based)
    for (let i = 1; i < existingRows.length; i++) {
      const row = existingRows[i];
      const hash = hashColIdx >= 0 ? (row[hashColIdx] || '') : '';
      if (hash) existingHashes.set(hash, i + 1); // 1-based row
    }
    let saved = 0, updated = 0, skipped = 0;
    const dryRunLog: any[] = [];
    for (const c of candidates) {
      const platform = c.platform || '';
      const profileUrl = c.profile_url || c.channelOrBlogUrl || '';
      const channelName = c.channel_name || c.name || '';
      const handle = c.handle || '';
      // OUTREACH-COPY.1: 이메일 저장 정책 — 공개 이메일만 저장, 마스킹 이메일은 저장하지 않음
      const rawContactEmail = c.contact_email || '';
      const hasMasked = (c.publicEmailMasked || '').includes('***');
      const contactUrl = c.contact_url || '';
      // OUTREACH-EMAIL-CAPTURE-FIX.1: 4-case 이메일 저장 정책 통일
      // case 1: 공개 이메일 원문 확인됨 (***미포함, @포함)
      // case 2: 마스킹/블러/일부 가림 이메일만 확인됨
      // case 3: 문의 링크만 있음
      // case 4: 연락 경로 없음
      let contactEmail = '';
      let emailStatus = 'no_contact';
      let contactRoute = 'none';
      let contactPriority = 'none';
      const isValidPublicEmail = rawContactEmail && !rawContactEmail.includes('***') && rawContactEmail.includes('@');
      if (isValidPublicEmail) {
        // case 1: 공개 이메일 원문 확인됨
        contactEmail = rawContactEmail;
        emailStatus = 'public_email';
        contactRoute = 'email';
        contactPriority = 'public_email';
      } else if (hasMasked || (rawContactEmail && rawContactEmail.includes('***'))) {
        // case 2: 마스킹/블러/일부 가림 이메일만 확인됨
        contactEmail = ''; // 마스킹 이메일은 저장하지 않음
        emailStatus = 'masked_or_unverified';
        contactRoute = 'needs_verification';
        contactPriority = contactUrl ? 'contact_form' : 'none';
      } else if (contactUrl) {
        // case 3: 문의 링크만 있음
        contactEmail = '';
        emailStatus = 'no_public_email';
        contactRoute = 'contact_form';
        contactPriority = 'contact_form';
      } else {
        // case 4: 연락 경로 없음
        contactEmail = '';
        emailStatus = 'no_contact';
        contactRoute = 'none';
        contactPriority = 'none';
      }
      // 기존 rawEmailStatus가 명시적으로 설정된 경우 우선 (허용값 체크)
      const allowedEmailStatus = ['public_email', 'masked_or_unverified', 'no_public_email', 'no_contact', 'contact_form', 'not_found', 'unknown'];
      const rawEmailStatus = c.email_status || c.publicContactStatus || '';
      if (rawEmailStatus && allowedEmailStatus.includes(rawEmailStatus)) {
        emailStatus = rawEmailStatus;
      }
      // outreach_status 검증
      const allowedOutreachStatus = ['not_sent', 'drafted', 'sent', 'replied', 'follow_up_needed', 'closed'];
      const rawOutreachStatus = c.outreach_status || c.outreachStatus || 'not_sent';
      const outreachStatus = allowedOutreachStatus.includes(rawOutreachStatus) ? rawOutreachStatus : 'not_sent';
      // reply_status 검증
      const allowedReplyStatus = ['none', 'positive', 'neutral', 'negative', 'bounced'];
      const rawReplyStatus = c.reply_status || c.responseStatus || 'none';
      const replyStatus = allowedReplyStatus.includes(rawReplyStatus) ? rawReplyStatus : 'none';
      const dupHash = buildDuplicateHash(platform, profileUrl, channelName, handle);
      const now = new Date().toISOString();
      const row = [
        c.influencer_id || c.candidateId || generateRecordId('inf'),
        platform,
        channelName,
        handle,
        profileUrl,
        contactEmail,
        contactUrl,
        emailStatus,
        c.category_tags || c.practicalSegment || '',
        c.source_keyword || c.keyword || c.seedKeyword || '',
        c.source_product || c.suggestedProduct || '',
        String(c.followers_or_subscribers || c.subscriberOrVisitor || ''),
        String(c.avg_views || c.viewCount || ''),
        String(c.fit_score || c.productFitScore || 0),
        c.fit_reason || c.productFitReason || '',
        outreachStatus,
        c.last_contacted_at || c.lastContactedAt || '',
        replyStatus,
        // OUTREACH-EMAIL-CAPTURE-FIX.1: next_action 4-case 분기
        c.next_action || (() => {
          if (emailStatus === 'public_email') return '이메일 초안 작성 후 발송 승인 요청';
          if (emailStatus === 'masked_or_unverified') return '공개 이메일 재확인 또는 문의 링크 확인 필요';
          if (emailStatus === 'no_public_email' || emailStatus === 'contact_form') return '문의폼/DM 제안 문구 작성 대기';
          if (emailStatus === 'no_contact') return '연락 가능 채널 추가 확인 필요';
          if (emailStatus === 'not_found') return '연락처 수동 확인 필요';
          return '연락처 확인 후 제안 방식 결정';
        })(),
        dupHash,
        c.created_at || c.collectedAt || now,
        now,
        c.notes || '',
        // OUTREACH-COPY.1: proposal_angle/subject/draft 자동 생성
        c.proposal_angle || generateProposalAngle(c, c.source_keyword || c.keyword || c.seedKeyword || '', c.source_product || c.suggestedProduct || ''),
        c.proposal_subject || generateProposalSubject(c.source_product || c.suggestedProduct || '', c.source_keyword || c.keyword || c.seedKeyword || ''),
        c.proposal_draft || generateProposalDraft(c, c.source_keyword || c.keyword || c.seedKeyword || '', c.source_product || c.suggestedProduct || ''),
      ];
      if (dryRun) {
        const isDup = existingHashes.has(dupHash);
        dryRunLog.push({ channelName, platform, dupHash, action: isDup ? 'update' : 'append', emailStatus, outreachStatus });
        continue;
      }
      if (existingHashes.has(dupHash)) {
        // 기존 행 업데이트 (updated_at만 갱신, outreach_status/reply_status 덮어쓰지 않음)
        const rowNum = existingHashes.get(dupHash)!;
        const token = await getGoogleSheetsToken();
        const updatedAtIdx = headers.indexOf('updated_at');
        if (updatedAtIdx >= 0) {
          const colLetter = String.fromCharCode(65 + updatedAtIdx);
          const rangeStr = encodeURIComponent(`${OUTREACH_CRM_TAB}!${colLetter}${rowNum}`);
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${rangeStr}?valueInputOption=RAW`;
          await fetch(url, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [[now]] }),
          });
        }
        updated++;
      } else {
        await sheetsAppend(OUTREACH_CRM_TAB, [row]);
        saved++;
      }
    }
    if (dryRun) {
      return { success: true, dryRun: true, log: dryRunLog, total: candidates.length };
    }
    return { success: true, saved, updated, skipped, total: candidates.length, message: `신규 ${saved}명 저장, 중복 ${updated}명 업데이트 완료.` };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function handleOutreachList(params: any) {
  if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    return { success: false, error: 'Google Sheets not configured' };
  }
  try {
    await ensureHeaders(OUTREACH_CRM_TAB);
    const result = await sheetsRead(OUTREACH_CRM_TAB);
    const rows = result.values || [];
    if (rows.length < 2) return { success: true, candidates: [], total: 0 };
    const headers = rows[0];
    let records = rows.slice(1).map((row: string[]) => {
      const obj: any = {};
      headers.forEach((h: string, i: number) => { obj[h] = row[i] || ''; });
      // OUTREACH-SHEET.1: 새 CRM 컬럼 기준 숫자 파싱
      obj.fit_score = parseInt(obj.fit_score || obj.productFitScore || '0', 10);
      obj.followers_or_subscribers = parseInt(obj.followers_or_subscribers || obj.subscriberOrVisitor || '0', 10);
      obj.avg_views = parseInt(obj.avg_views || obj.viewCount || '0', 10);
      return obj;
    });
    // 필터 (새 컬럼명 우선, 구 컬럼명 fallback)
    const { minScore, keyword: filterKw, platform: filterPlatform, outreachStatus: filterOutreach, emailStatus: filterEmail } = params || {};
    if (minScore) records = records.filter((r: any) => r.fit_score >= Number(minScore));
    if (filterKw) records = records.filter((r: any) => (r.source_keyword || r.keyword || '').includes(filterKw));
    if (filterPlatform) records = records.filter((r: any) => (r.platform || '').toLowerCase().includes(filterPlatform.toLowerCase()));
    if (filterOutreach) records = records.filter((r: any) => (r.outreach_status || r.outreachStatus || '') === filterOutreach);
    if (filterEmail) records = records.filter((r: any) => (r.email_status || r.publicContactStatus || '') === filterEmail);
    records.sort((a: any, b: any) => b.fit_score - a.fit_score);
    const limit = params?.limit || 20;
    return { success: true, candidates: records.slice(0, limit), total: records.length };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ══════════════════════════════════════════════════════════════
// ── MARKET PRICE CHECK: 농산물 가격 판단 Lite ──
// ══════════════════════════════════════════════════════════════

function calculateMargin(params: any) {
  const currentPrice = Number(params.currentPrice) || 0;
  const rawMaterialCost = Number(params.rawMaterialCost) || 0;
  const shippingCost = Number(params.shippingCost) || 0;
  const packagingCost = Number(params.packagingCost) || 0;
  const platformFeeRate = Number(params.platformFeeRate) || 0;
  const otherCosts = Number(params.otherCosts) || 0;

  // 경쟁가 처리
  let competitorPrices: number[] = [];
  if (Array.isArray(params.competitorPrices)) {
    competitorPrices = params.competitorPrices.map(Number).filter((n: number) => n > 0);
  } else if (typeof params.competitorPrices === 'string' && params.competitorPrices) {
    competitorPrices = params.competitorPrices.split(',').map(Number).filter((n: number) => n > 0);
  }

  const competitorMinPrice = competitorPrices.length > 0 ? Math.min(...competitorPrices) : 0;
  const competitorAvgPrice = competitorPrices.length > 0 ? Math.round(competitorPrices.reduce((a: number, b: number) => a + b, 0) / competitorPrices.length) : 0;

  // 수수료 제외 판매금액
  const platformFee = Math.round(currentPrice * (platformFeeRate / 100));
  const netSalesAmount = currentPrice - platformFee;

  // 총 비용
  const totalCost = rawMaterialCost + shippingCost + packagingCost + otherCosts;

  // 예상 순마진
  const estimatedMargin = netSalesAmount - totalCost;

  // 예상 마진율 (%)
  const estimatedMarginRate = currentPrice > 0 ? Math.round((estimatedMargin / currentPrice) * 100) : 0;

  return {
    currentPrice,
    rawMaterialCost,
    shippingCost,
    packagingCost,
    platformFeeRate,
    platformFee,
    otherCosts,
    totalCost,
    netSalesAmount,
    estimatedMargin,
    estimatedMarginRate,
    competitorPrices: competitorPrices.join(','),
    competitorMinPrice,
    competitorAvgPrice,
  };
}

// 한국어 조사 처리: 받침 유무에 따라 은/는, 이/가, 을/를 선택
function getPostposition(word: string, withBatchim: string, withoutBatchim: string): string {
  if (!word) return withoutBatchim;
  const lastChar = word.charCodeAt(word.length - 1);
  // 한글 유니코드 범위: 0xAC00 ~ 0xD7A3
  if (lastChar < 0xAC00 || lastChar > 0xD7A3) return withoutBatchim;
  const hasBatchim = (lastChar - 0xAC00) % 28 !== 0;
  return hasBatchim ? withBatchim : withoutBatchim;
}

function generateJarvisDecision(productName: string, calc: any): { decision: string; action: string; jarvisMessage: string } {
  const { estimatedMargin, estimatedMarginRate, currentPrice, competitorMinPrice, competitorAvgPrice, rawMaterialCost } = calc;

  let decision = '';
  let action = '';
  let jarvisMessage = '';

  // 마진율 기준 판단
  if (estimatedMarginRate >= 30) {
    decision = '가격 방어 가능 (고마진)';
    action = '현재 가격 유지 + 프리미엄 메시지 강화';
    jarvisMessage = `대표님, 지금 ${productName}${getPostposition(productName, '은', '는')} 가격을 낮출 필요 없습니다.\n` +
      `원물가 대비 마진율이 ${estimatedMarginRate}%로 충분합니다.\n` +
      `최저가 경쟁보다 산지직송/한정수량/프리미엄 메시지로 가는 게 좋습니다.`;
  } else if (estimatedMarginRate >= 15) {
    decision = '가격 유지 권장';
    action = '현재 가격 유지 + 묶음/세트 구성 검토';
    jarvisMessage = `대표님, ${productName} 현재 가격은 유지해도 됩니다.\n` +
      `마진율 ${estimatedMarginRate}%로 수수료와 배송비 제외해도 마진이 남습니다.\n` +
      `다만 경쟁이 심해지면 묶음 할인이나 세트 구성으로 단가를 방어하는 게 좋습니다.`;
  } else if (estimatedMarginRate >= 5) {
    decision = '가격 인상 검토 필요';
    action = '100~500원 인상 시뮬레이션 + 경쟁가 모니터링';
    jarvisMessage = `대표님, ${productName}${getPostposition(productName, '은', '는')} 마진이 빠듯합니다.\n` +
      `마진율 ${estimatedMarginRate}%면 배송 사고나 반품 한 건에 적자 전환될 수 있습니다.\n` +
      `가격을 100~500원 올리거나, 용량/수량을 조정하는 게 안전합니다.`;
  } else if (estimatedMargin > 0) {
    decision = '가격 인상 필요';
    action = '즉시 가격 인상 또는 판매 중단 검토';
    jarvisMessage = `대표님, ${productName}${getPostposition(productName, '은', '는')} 지금 거의 마진이 없습니다.\n` +
      `마진율 ${estimatedMarginRate}%면 팔수록 손해에 가깝습니다.\n` +
      `가격 인상이 어려우면 판매 중단하고 다음 시즌을 기다리는 것도 방법입니다.`;
  } else {
    decision = '적자 상태 - 즉시 조치 필요';
    action = '판매 중단 또는 대폭 가격 인상';
    jarvisMessage = `대표님, ${productName}${getPostposition(productName, '은', '는')} 현재 팔면 팔수록 적자입니다.\n` +
      `예상 마진이 ${estimatedMargin.toLocaleString()}원으로 마이너스입니다.\n` +
      `즉시 가격을 올리거나 판매를 중단하는 게 맞습니다.`;
  }

  // 경쟁가 비교 추가 메시지
  if (competitorMinPrice > 0) {
    if (currentPrice < competitorMinPrice) {
      jarvisMessage += `\n\n참고로 온라인 경쟁 최저가(${competitorMinPrice.toLocaleString()}원)보다 대표님 가격이 더 낮습니다. 가격 인상 여지가 있습니다.`;
    } else if (currentPrice > competitorAvgPrice * 1.2) {
      jarvisMessage += `\n\n다만 경쟁 평균가(${competitorAvgPrice.toLocaleString()}원) 대비 20% 이상 높으니, 품질/스토리 차별화 메시지가 중요합니다.`;
    } else {
      jarvisMessage += `\n\n경쟁가 평균(${competitorAvgPrice.toLocaleString()}원)과 비슷한 수준이라 가격 경쟁력은 괜찮습니다.`;
    }
  }

   return { decision, action, jarvisMessage };
}

// ── OUTREACH-MAIL-A.1: 메일 발송 준비 (승인 전 조건 검증만, 실제 발송 없음) ──
async function handleOutreachMailPrepare(params: any) {
  const { influencer_id, profile_url, platform } = params;

  // v2 탭에서 후보 조회
  await ensureTab(OUTREACH_CRM_TAB);
  await ensureHeaders(OUTREACH_CRM_TAB);
  const sheetData = await sheetsRead(OUTREACH_CRM_TAB, `${OUTREACH_CRM_TAB}!A:Z`);
  const rows = sheetData.values || [];
  if (rows.length < 2) {
    return { success: false, error: '후보 데이터가 없습니다.' };
  }

  const headers = rows[0] as string[];
  const idx = (col: string) => headers.indexOf(col);

  // 후보 찾기 (influencer_id 또는 profile_url 기준)
  let targetRow: string[] | null = null;
  let targetRowNum = -1;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as string[];
    const rid = r[idx('influencer_id')] || '';
    const rurl = r[idx('profile_url')] || '';
    if ((influencer_id && rid === influencer_id) || (profile_url && rurl === profile_url)) {
      targetRow = r;
      targetRowNum = i + 1; // 1-indexed (header=1, data=2~)
      break;
    }
  }
  if (!targetRow) {
    return { success: false, error: '해당 후보를 찾을 수 없습니다.' };
  }

  const get = (col: string) => (targetRow![idx(col)] || '').trim();

  // 발송 가능 조건 검증
  const contactEmail = get('contact_email');
  const emailStatus = get('email_status');
  const proposalSubject = get('proposal_subject');
  const proposalDraft = get('proposal_draft');
  const outreachStatus = get('outreach_status');
  const channelName = get('channel_name');
  const platformVal = get('platform') || platform || '';

  const errors: string[] = [];
  if (!contactEmail || !contactEmail.includes('@')) errors.push('contact_email 없음 또는 유효하지 않음');
  if (emailStatus !== 'public_email') errors.push(`email_status가 public_email이 아님 (${emailStatus || 'unknown'})`);
  if (!proposalSubject) errors.push('proposal_subject 없음');
  if (!proposalDraft) errors.push('proposal_draft 없음');
  if (outreachStatus === 'sent') errors.push('이미 발송 완료된 후보 (outreach_status=sent)');

  if (errors.length > 0) {
    return {
      success: false,
      sendable: false,
      errors,
      channelName,
      platform: platformVal,
      outreachStatus,
      message: `발송 불가: ${errors.join(' / ')}`,
    };
  }

  // 승인 게이트용 데이터 반환 (실제 발송 없음)
  return {
    success: true,
    sendable: true,
    approvalRequired: true,
    channelName,
    platform: platformVal,
    toEmail: contactEmail.replace(/(.{2}).+(@.+)/, '$1***$2'), // 이메일 마스킹 (화면 표시용)
    toEmailRaw: contactEmail, // 실제 발송용 (로그 미출력)
    subject: proposalSubject,
    bodyPreview: proposalDraft.slice(0, 200) + (proposalDraft.length > 200 ? '...' : ''),
    influencer_id: get('influencer_id'),
    profile_url: get('profile_url'),
    rowNum: targetRowNum,
    message: `[${channelName}] 발송 준비 완료. 대표님 승인 후 발송됩니다.`,
  };
}

// ── OUTREACH-MAIL-A.1: 메일 실제 발송 (승인 후 호출 전용) ──
async function handleOutreachMailSend(params: any) {
  const { influencer_id, profile_url, approved } = params;

  // 승인 플래그 필수 검증
  if (approved !== true && approved !== 'true') {
    return {
      success: false,
      error: '승인이 확인되지 않았습니다. approved=true 필수.',
      blocked: true,
    };
  }

  // v2 탭에서 후보 조회
  await ensureTab(OUTREACH_CRM_TAB);
  await ensureHeaders(OUTREACH_CRM_TAB);
  const sheetData = await sheetsRead(OUTREACH_CRM_TAB, `${OUTREACH_CRM_TAB}!A:Z`);
  const rows = sheetData.values || [];
  if (rows.length < 2) {
    return { success: false, error: '후보 데이터가 없습니다.' };
  }

  const headers = rows[0] as string[];
  const idx = (col: string) => headers.indexOf(col);

  // 후보 조회
  let targetRow: string[] | null = null;
  let targetRowNum = -1;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as string[];
    const rid = r[idx('influencer_id')] || '';
    const rurl = r[idx('profile_url')] || '';
    if ((influencer_id && rid === influencer_id) || (profile_url && rurl === profile_url)) {
      targetRow = r;
      targetRowNum = i + 1;
      break;
    }
  }
  if (!targetRow) {
    return { success: false, error: '해당 후보를 찾을 수 없습니다.' };
  }

  const get = (col: string) => (targetRow![idx(col)] || '').trim();

  // 발송 조건 재검증
  const contactEmail = get('contact_email');
  const emailStatus = get('email_status');
  const proposalSubject = get('proposal_subject');
  const proposalDraft = get('proposal_draft');
  const outreachStatus = get('outreach_status');
  const channelName = get('channel_name');

  if (!contactEmail || !contactEmail.includes('@')) {
    return { success: false, error: '발송 중단: contact_email 없음', blocked: true };
  }
  if (emailStatus !== 'public_email') {
    return { success: false, error: `발송 중단: email_status가 public_email이 아님 (${emailStatus})`, blocked: true };
  }
  if (!proposalSubject || !proposalDraft) {
    return { success: false, error: '발송 중단: proposal_subject 또는 proposal_draft 없음', blocked: true };
  }
  if (outreachStatus === 'sent') {
    return { success: false, error: '이미 발송 완료된 후보입니다.', blocked: true };
  }

  // 실제 발송: /api/send-email 호출
  const now = new Date().toISOString();
  let sendResult: any = null;
  let sendSuccess = false;
  let sendError = '';

  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://mawinpay-jarvis.vercel.app';

    const emailHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">${proposalDraft.replace(/\n/g, '<br/>')}</div>`;

    const sendRes: any = await fetch(`${baseUrl}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: contactEmail,
        subject: proposalSubject,
        html: emailHtml,
        testMode: false,
      }),
    });
    sendResult = await sendRes.json();
    // ALLOWED_TEST_RECIPIENTS 차단 여부 확인
    if (sendResult.blocked > 0 || (sendResult.results && sendResult.results[0]?.status === 'blocked')) {
      sendSuccess = false;
      sendError = `발송 차단: 테스트 수신자 목록에 없는 이메일 (execute LOCKED)`;
    } else if (sendResult.sent > 0) {
      sendSuccess = true;
    } else {
      sendSuccess = false;
      sendError = sendResult.results?.[0]?.reason || sendResult.error || '알 수 없는 발송 오류';
    }
  } catch (e: any) {
    sendSuccess = false;
    sendError = e.message || '네트워크 오류';
  }

  // Google Sheets v2 업데이트
  const token = await getGoogleSheetsToken();
  const updateRange = encodeURIComponent(`${OUTREACH_CRM_TAB}!A${targetRowNum}`);
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${updateRange}?valueInputOption=RAW`;

  const updatedRow = [...(targetRow as string[])];
  const setCol = (col: string, val: string) => {
    const i = idx(col);
    if (i >= 0) updatedRow[i] = val;
  };

  if (sendSuccess) {
    setCol('outreach_status', 'sent');
    setCol('last_contacted_at', now);
    setCol('reply_status', 'waiting');
    setCol('next_action', '답장 대기');
    setCol('updated_at', now);
  } else {
    setCol('outreach_status', 'send_failed');
    setCol('next_action', '발송 오류 확인 필요');
    setCol('notes', `발송 실패 (${now.slice(0, 10)}): ${sendError.slice(0, 80)}`);
    setCol('updated_at', now);
  }

  try {
    await fetch(updateUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [updatedRow] }),
    });
  } catch (sheetErr: any) {
    console.error('[OUTREACH-MAIL] Sheets 업데이트 실패:', sheetErr.message);
  }

  return {
    success: sendSuccess,
    channelName,
    toEmailMasked: contactEmail.replace(/(.{2}).+(@.+)/, '$1***$2'),
    subject: proposalSubject,
    sentAt: sendSuccess ? now : null,
    sheetsUpdated: true,
    outreachStatus: sendSuccess ? 'sent' : 'send_failed',
    error: sendSuccess ? null : sendError,
    message: sendSuccess
      ? `✅ [${channelName}]에게 제안 메일 발송 완료. Google Sheets 업데이트 완료.`
      : `❌ 발송 실패: ${sendError}`,
  };
}

async function handleMarketPriceCheck(params: any) {
  const { productName, rawMaterialCost, currentPrice, shippingCost, packagingCost, platformFeeRate, otherCosts, competitorPrices, sourceCommand } = params;

  if (!productName || !currentPrice) {
    return { success: false, error: '품목명과 현재 판매가는 필수입니다.' };
  }

  // 1. 마진 계산
  const calc = calculateMargin(params);

  // 2. 자비스 판단 생성
  const { decision, action, jarvisMessage } = generateJarvisDecision(productName, calc);

  // 3. Google Sheets 저장
  let savedToSheets = false;
  if (WORKSPACE_SHEET_ID && GOOGLE_SHEETS_CREDENTIALS) {
    try {
      const recordId = generateRecordId('market_price_check');
      const now = new Date().toISOString();
      await ensureHeaders('market_price_checks');
      await sheetsAppend('market_price_checks', [[
        recordId, now, productName, String(calc.rawMaterialCost),
        String(calc.currentPrice), String(calc.shippingCost),
        String(calc.packagingCost), String(calc.platformFeeRate),
        String(calc.otherCosts), calc.competitorPrices,
        String(calc.competitorMinPrice), String(calc.competitorAvgPrice),
        String(calc.netSalesAmount), String(calc.estimatedMargin),
        String(calc.estimatedMarginRate), decision,
        action, sourceCommand || ''
      ]]);
      savedToSheets = true;
    } catch (e) {
      // 저장 실패해도 판단 결과는 반환
    }
  }

  return {
    success: true,
    productName,
    calculation: {
      currentPrice: calc.currentPrice,
      rawMaterialCost: calc.rawMaterialCost,
      shippingCost: calc.shippingCost,
      packagingCost: calc.packagingCost,
      platformFeeRate: calc.platformFeeRate,
      platformFee: calc.platformFee,
      otherCosts: calc.otherCosts,
      totalCost: calc.totalCost,
      netSalesAmount: calc.netSalesAmount,
      estimatedMargin: calc.estimatedMargin,
      estimatedMarginRate: calc.estimatedMarginRate,
      competitorMinPrice: calc.competitorMinPrice,
      competitorAvgPrice: calc.competitorAvgPrice,
    },
    jarvisDecision: decision,
    recommendedAction: action,
    jarvisMessage,
    savedToSheets,
  };
}

async function handleMarketPriceList(params: any) {
  if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    return { success: false, error: 'Google Sheets not configured' };
  }
  try {
    await ensureHeaders('market_price_checks');
    const result = await sheetsRead('market_price_checks');
    const rows = result.values || [];
    if (rows.length < 2) return { success: true, checks: [], total: 0 };
    const headers = rows[0];
    let records = rows.slice(1).map((row: string[]) => {
      const obj: any = {};
      headers.forEach((h: string, i: number) => { obj[h] = row[i] || ''; });
      return obj;
    });
    // 필터
    const { productName: filterProduct } = params || {};
    if (filterProduct) records = records.filter((r: any) => (r.productName || '').includes(filterProduct));
    records.reverse(); // 최신순
    const limit = params?.limit || 20;
    return { success: true, checks: records.slice(0, limit), total: records.length };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── KAMIS Mini API 핸들러 (농산물 도소매 가격 조회) ──
const KAMIS_ITEMS: Record<string, { code: string; category: string; unit: string; kindCode?: string }> = {
  '배추': { code: '211', category: '200', unit: '1포기' },
  '절임배추': { code: '211', category: '200', unit: '1포기' }, // 절임배추는 배추 원물가 참고
  '옥수수': { code: '225', category: '100', unit: '10개' },  // 식량작물
  '양파': { code: '226', category: '200', unit: '1kg' },
  '대파': { code: '246', category: '200', unit: '1kg' },
  '감자': { code: '152', category: '100', unit: '100g' },  // 식량작물
  '고구마': { code: '151', category: '100', unit: '100g' },  // 식량작물
  '당근': { code: '232', category: '200', unit: '1kg' },
  '시금치': { code: '247', category: '200', unit: '100g' },
  '사과': { code: '411', category: '400', unit: '10개' },
  '배': { code: '412', category: '400', unit: '10개' },
  '쌀': { code: '111', category: '100', unit: '20kg' },
  '복숭아': { code: '414', category: '400', unit: '10개' },
  '한우': { code: '312', category: '300', unit: '1kg' },
  '초당옥수수': { code: '225', category: '100', unit: '10개' },  // 옥수수와 동일 코드
  '딸기': { code: '415', category: '400', unit: '1kg' },
};

function getKamisDateStr(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function handleKamisMini(params: any) {
  if (!KAMIS_API_KEY || !KAMIS_CERT_ID) {
    return { success: false, error: 'KAMIS API not configured' };
  }

  const itemName = params?.item || params?.productName || '배추';
  const clsCode = params?.cls || '01'; // 01=소매, 02=도매
  const countryCode = params?.country || '1101'; // 서울

  // 품목 정보 찾기
  const itemInfo = KAMIS_ITEMS[itemName];
  if (!itemInfo) {
    return {
      success: false,
      error: `지원하지 않는 품목: ${itemName}`,
      supportedItems: Object.keys(KAMIS_ITEMS),
    };
  }

  const today = getKamisDateStr(new Date());

  const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList` +
    `&p_cert_key=${KAMIS_API_KEY}` +
    `&p_cert_id=${KAMIS_CERT_ID}` +
    `&p_returntype=json` +
    `&p_product_cls_code=${clsCode}` +
    `&p_item_category_code=${itemInfo.category}` +
    `&p_country_code=${countryCode}` +
    `&p_regday=${today}` +
    `&p_convert_kg_yn=N`;

  try {
    const response: any = await fetch(url);
    const data = await response.json() as any;

    if (!data || data.error_code === '001') {
      return {
        success: true,
        item: itemName,
        date: today,
        message: '해당 날짜에 데이터가 없습니다. (주말/공휴일 가능)',
        prices: null,
      };
    }

    if (data.error_code === '900') {
      return { success: false, error: 'KAMIS 인증 실패 (API Key 확인 필요)' };
    }

    // 응답에서 해당 품목 찾기 (item_code 우선, item_name 보조)
    const items = data?.data?.item || [];
    let matched = items.filter((i: any) => i.item_code === itemInfo.code);
    // item_code 매칭이 없으면 item_name으로 재시도
    if (matched.length === 0) {
      matched = items.filter((i: any) => i.item_name === itemName);
    }

    if (matched.length === 0) {
      return {
        success: true,
        item: itemName,
        date: today,
        message: `${itemName}${getPostposition(itemName, '은', '는')} KAMIS 일별 가격 조회 대상 품목이 아닙니다. 데이터 부족.`,
        prices: null,
        note: 'KAMIS API에서 해당 품목의 일별 가격 데이터를 제공하지 않습니다.',
      };
    }

    // 상품(상) 등급 우선
    const best = matched.find((i: any) => i.rank === '상품') || matched[0];

    const result = {
      success: true,
      item: itemName,
      isProxy: itemName === '절임배추' ? true : undefined,
      proxyNote: itemName === '절임배추' ? '절임배추는 KAMIS 독립 품목 없음. 배추 원물가 참고' : undefined,
      date: today,
      cls: clsCode === '01' ? '소매' : '도매',
      country: countryCode === '1101' ? '서울' : countryCode,
      unit: best.unit || itemInfo.unit,
      kind: best.kind_name || '',
      rank: best.rank || '',
      prices: {
        today: best.dpr1 || '-',
        dayBefore: best.dpr2 || '-',
        weekBefore: best.dpr3 || '-',
        twoWeeksBefore: best.dpr4 || '-',
        monthBefore: best.dpr5 || '-',
        yearBefore: best.dpr6 || '-',
        average: best.dpr7 || '-',
      },
      direction: (() => {
        const t = parseFloat((best.dpr1 || '0').replace(/,/g, ''));
        const m = parseFloat((best.dpr5 || '0').replace(/,/g, ''));
        if (!t || !m || isNaN(t) || isNaN(m)) return 'N/A';
        const diff = ((t - m) / m * 100).toFixed(1);
        return Number(diff) > 0 ? `+${diff}%` : `${diff}%`;
      })(),
      changePercent: (() => {
        const t = parseFloat((best.dpr1 || '0').replace(/,/g, ''));
        const m = parseFloat((best.dpr5 || '0').replace(/,/g, ''));
        if (!t || !m || isNaN(t) || isNaN(m)) return NaN;
        return (t - m) / m * 100;
      })(),
    };

    // Google Sheets 저장
    if (WORKSPACE_SHEET_ID && GOOGLE_SHEETS_CREDENTIALS) {
      try {
        await ensureHeaders('kamis_price_log');
        const recordId = generateRecordId('kamis');
        await sheetsAppend('kamis_price_log', [[
          recordId, today, itemName, result.cls,
          result.prices.today, result.prices.monthBefore,
          result.prices.yearBefore, result.direction,
          result.unit, result.kind, result.rank
        ]]);
      } catch (e) {
        // 저장 실패해도 결과 반환
      }
    }

    return result;
  } catch (e: any) {
    return { success: false, error: `KAMIS API 호출 실패: ${e.message}` };
  }
}

// ══════════════════════════════════════════════════════════════
// ── MAIN HANDLER ──
// ══════════════════════════════════════════════════════════════
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── GET 요청 ──
    if (req.method === 'GET') {
      const endpoint = req.query.endpoint as string || 'status';

      // Diagnostics / Status
      if (endpoint === 'status' || endpoint === 'diagnostics') {
        const diag = getDiagnostics();
        return res.status(200).json({ status: 'running', ...diag });
      }

      // Naver Auth Test
      if (endpoint === 'naver-auth-test') {
        const diag = getDiagnostics();
        try {
          const token = await getSmartStoreToken();
          return res.status(200).json({
            ...diag,
            tokenReceived: true,
            tokenLength: token.length,
            ipNotAllowed: false,
          });
        } catch (e: any) {
          const isIpError = e.message?.includes('IP_NOT_ALLOWED') || e.message?.includes('GW.IP_NOT_ALLOWED');
          return res.status(200).json({
            ...diag,
            tokenReceived: false,
            error: isIpError ? 'GW.IP_NOT_ALLOWED' : 'token_failed',
            errorDetail: e.message || 'unknown',
            ipNotAllowed: isIpError,
          });
        }
      }

      // YouTube analyze
      if (endpoint === 'youtube-analyze') {
        const keyword = String(req.query.keyword || '');
        const count = Number(req.query.count) || 5;
        const period = String(req.query.period || '');
        if (!keyword) return res.status(400).json({ error: 'keyword is required' });
        const result = await searchPopularVideos(keyword, count, period);
        return res.status(200).json(result);
      }

      // YouTube trending
      if (endpoint === 'youtube-trending') {
        const keyword = String(req.query.keyword || req.query.channelName || '한국 인기');
        const count = Number(req.query.maxResults) || 5;
        const result = await searchPopularVideos(keyword, count);
        return res.status(200).json(result);
      }

      return res.status(400).json({ error: `Unknown GET endpoint: ${endpoint}` });
    }

    // ── POST 요청 ──
    if (req.method === 'POST') {
      const { endpoint, taskType, task, params, ...rest } = req.body;
      const resolvedTask = taskType || task || endpoint || '';

      // ── 스마트스토어 주문 조회 ──
      if (resolvedTask === 'smartstore-orders') {
        // SMARTSTORE-ORDERS-FIX.4: action이 body 최상위에 있을 수 있으므로 params와 병합
        const mergedParams = { ...rest, ...(params || {}) };
        const result = await handleSmartstoreOrders(mergedParams);
        return res.status(200).json(result);
      }

      // ── Daily Briefing ──
      if (resolvedTask === 'daily-briefing') {
        const result = await handleDailyBriefing();
        return res.status(200).json(result);
      }

      // ── Creative Content ──
      if (resolvedTask === 'creative-content') {
        const result = await handleCreativeContent(params || rest);
        return res.status(200).json(result);
      }
      // ── COPY-R.5: Research Orchestrator ──
      if (resolvedTask === 'copy-orchestrator') {
        const result = await handleCopyOrchestrator(params || rest);
        return res.status(200).json(result);
      }

      // ── COPY-R.4: Review Objection Data Input ──
      if (resolvedTask === 'copy-review-research') {
        const result = await handleCopyReviewResearch(params || rest);
        return res.status(200).json(result);
      }
      // ── COPY-R.3: Social Pattern Research ──
      if (resolvedTask === 'copy-social-research') {
        const result = await handleCopySocialResearch(params || rest);
        return res.status(200).json(result);
      }
      // ── COPY-R.2: Market Context Research ──
      if (resolvedTask === 'copy-market-research') {
        const result = await handleCopyMarketResearch(params || rest);
        return res.status(200).json(result);
      }
      // ── COPY-R: Research Before Writing ──
      if (resolvedTask === 'copy-research') {
        const result = await handleCopyResearch(params || rest);
        return res.status(200).json(result);
      }

      // ── Growth Link ──
      if (resolvedTask === 'growth-link') {
        const result = await handleGrowthLink(params || rest);
        return res.status(200).json(result);
      }

      // ── YouTube 채널 검색 ──
      if (resolvedTask === 'youtube-search') {
        const result = await searchYouTubeDirect(params?.keyword || '', params?.maxResults || 10);
        return res.status(200).json(result);
      }

      // ── YouTube 인기 영상 분석 ──
      if (resolvedTask === 'youtube-viral') {
        const result = await searchPopularVideos(params?.keyword || '', params?.count || 5, params?.period || '');
        return res.status(200).json(result);
      }

      // ── DB 액션 ──
      if (resolvedTask === 'db') {
        const dbAction = params?.action || rest?.action;
        let conn;
        try {
          conn = await getDbConnection();
          switch (dbAction) {
            case 'save_influencers': {
              const { influencers, keyword: sKeyword } = params || rest;
              if (!influencers || !Array.isArray(influencers)) return res.status(400).json({ error: 'influencers array required' });
              let saved = 0, duplicates = 0;
              for (const inf of influencers) {
                try {
                  await conn.execute(
                    `INSERT INTO influencers (channel_id, platform, name, email, subscribers, subscriber_text, views, description, profile_url, thumbnail, category, keyword, instagram)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), subscribers=VALUES(subscribers),
                       subscriber_text=VALUES(subscriber_text), views=VALUES(views), description=VALUES(description),
                       profile_url=VALUES(profile_url), thumbnail=VALUES(thumbnail), category=VALUES(category),
                       instagram=VALUES(instagram), updated_at=CURRENT_TIMESTAMP`,
                    [inf.channelId||inf.channel_id||'', inf.platform||'YouTube', inf.name||'', inf.email||'',
                     Number(inf.subscribers)||0, inf.subscriberText||inf.subscriber_text||'', Number(inf.views)||0,
                     (inf.description||'').substring(0,2000), inf.profileUrl||inf.profile_url||'',
                     inf.thumbnail||'', inf.category||sKeyword||'', sKeyword||'', inf.instagram||'']
                  );
                  saved++;
                } catch (e: any) {
                  if (e.code === 'ER_DUP_ENTRY') duplicates++;
                }
              }
              await conn.execute(
                `INSERT INTO collection_history (keyword, platform, total_found, with_email, new_collected, duplicates_skipped) VALUES (?, ?, ?, ?, ?, ?)`,
                [sKeyword||'', 'YouTube', influencers.length, influencers.filter((i:any)=>i.email).length, saved, duplicates]
              );
              return res.json({ success: true, saved, duplicates, total: influencers.length });
            }
            case 'query_influencers': {
              const { keyword: qk, platform: qp, min_subscribers, has_email, limit: ql, category: qc } = params || rest;
              let sql = 'SELECT * FROM influencers WHERE 1=1';
              const qParams: any[] = [];
              if (qk) { sql += ' AND (keyword LIKE ? OR name LIKE ? OR category LIKE ?)'; qParams.push(`%${qk}%`, `%${qk}%`, `%${qk}%`); }
              if (qp) { sql += ' AND platform = ?'; qParams.push(qp); }
              if (min_subscribers) { sql += ' AND subscribers >= ?'; qParams.push(Number(min_subscribers)); }
              if (has_email === 'true' || has_email === true) { sql += " AND email != ''"; }
              if (qc) { sql += ' AND category LIKE ?'; qParams.push(`%${qc}%`); }
              sql += ' ORDER BY subscribers DESC LIMIT ?';
              qParams.push(Number(ql) || 50);
              const [rows] = await conn.execute(sql, qParams);
              return res.json({ success: true, total: (rows as any[]).length, influencers: rows });
            }
            case 'get_collected_ids': {
              const [rows] = await conn.execute('SELECT channel_id FROM influencers');
              const ids = (rows as any[]).map((r: any) => r.channel_id);
              return res.json({ success: true, ids });
            }
            case 'collection_history': {
              const [rows] = await conn.execute('SELECT * FROM collection_history ORDER BY collected_at DESC LIMIT 50');
              return res.json({ success: true, history: rows });
            }
            case 'save_viral_videos': {
              const { videos, keyword: vk } = params || rest;
              if (!videos || !Array.isArray(videos)) return res.status(400).json({ error: 'videos array required' });
              let vSaved = 0;
              for (const v of videos) {
                try {
                  await conn.execute(
                    `INSERT INTO viral_videos (video_id, channel_id, title, view_count, like_count, comment_count, published_at, thumbnail, viral_reason, keyword)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE view_count=VALUES(view_count), like_count=VALUES(like_count), comment_count=VALUES(comment_count), viral_reason=VALUES(viral_reason)`,
                    [v.videoId||'', v.channelId||'', v.title||'', Number(v.viewCount)||0, Number(v.likeCount)||0, Number(v.commentCount)||0, v.publishedAt||'', v.thumbnail||'', v.viralReason||'', vk||'']
                  );
                  vSaved++;
                } catch (e: any) { console.error('Save viral error:', e.message); }
              }
              return res.json({ success: true, saved: vSaved });
            }
            case 'query_viral_videos': {
              const { keyword: vqk, limit: vql } = params || rest;
              let sql = 'SELECT * FROM viral_videos WHERE 1=1';
              const vqParams: any[] = [];
              if (vqk) { sql += ' AND (keyword LIKE ? OR title LIKE ?)'; vqParams.push(`%${vqk}%`, `%${vqk}%`); }
              sql += ' ORDER BY view_count DESC LIMIT ?';
              vqParams.push(Number(vql) || 20);
              const [rows] = await conn.execute(sql, vqParams);
              return res.json({ success: true, total: (rows as any[]).length, videos: rows });
            }
            case 'save_memory': {
              const { memory_type, memory_key, memory_value, metadata } = params || rest;
              await conn.execute(
                `INSERT INTO ai_memory (memory_type, memory_key, memory_value, metadata) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE memory_value=VALUES(memory_value), metadata=VALUES(metadata)`,
                [memory_type, memory_key, memory_value, JSON.stringify(metadata || {})]
              );
              return res.json({ success: true });
            }
            case 'query_memory': {
              const { memory_type: mt, memory_key: mk } = params || rest;
              let sql = 'SELECT * FROM ai_memory WHERE 1=1';
              const mParams: any[] = [];
              if (mt) { sql += ' AND memory_type = ?'; mParams.push(mt); }
              if (mk) { sql += ' AND memory_key LIKE ?'; mParams.push(`%${mk}%`); }
              sql += ' ORDER BY updated_at DESC LIMIT 50';
              const [rows] = await conn.execute(sql, mParams);
              return res.json({ success: true, memories: rows });
            }
            case 'stats': {
              const [[totalInf]] = await conn.execute('SELECT COUNT(*) as cnt FROM influencers') as any;
              const [[withEmail]] = await conn.execute("SELECT COUNT(*) as cnt FROM influencers WHERE email != ''") as any;
              const [[totalVideos]] = await conn.execute('SELECT COUNT(*) as cnt FROM viral_videos') as any;
              const [[totalCollections]] = await conn.execute('SELECT COUNT(*) as cnt FROM collection_history') as any;
              const [topKeywords] = await conn.execute('SELECT keyword, COUNT(*) as cnt FROM influencers GROUP BY keyword ORDER BY cnt DESC LIMIT 10');
              const [recentCollections] = await conn.execute('SELECT * FROM collection_history ORDER BY collected_at DESC LIMIT 5');
              return res.json({ success: true, stats: { total_influencers: totalInf.cnt, with_email: withEmail.cnt, total_viral_videos: totalVideos.cnt, total_collections: totalCollections.cnt, top_keywords: topKeywords, recent_collections: recentCollections } });
            }
            default:
              return res.status(400).json({ error: `Unknown db action: ${dbAction}` });
          }
        } catch (error: any) {
          console.error('DB Error:', error);
          return res.status(500).json({ error: error.message });
        } finally {
          if (conn) await conn.end();
        }
      }

      // ── Workspace: Google Sheets 저장/조회 ──
      if (resolvedTask === 'workspace-save') {
        const result = await handleWorkspaceSave(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'workspace-query') {
        const result = await handleWorkspaceQuery(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'workspace-list') {
        const result = await handleWorkspaceList(params || rest);
        return res.status(200).json(result);
      }

      // ── Outreach: 인플루언서 후보 수집/저장/조회 ──
      if (resolvedTask === 'outreach-collect') {
        const result = await handleOutreachCollect(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'outreach-list') {
        const result = await handleOutreachList(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'outreach-save-candidates' || resolvedTask === 'outreach-save') {
        const result = await handleOutreachSaveCandidates(params || rest);
        return res.status(200).json(result);
      }

      // ── OUTREACH-MAIL-A.1: 메일 발송 준비/실행 ──
      if (resolvedTask === 'outreach-mail-prepare') {
        const result = await handleOutreachMailPrepare(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'outreach-mail-send') {
        const result = await handleOutreachMailSend(params || rest);
        return res.status(200).json(result);
      }

      // ── Market Price: 농산물 가격 판단 ──
      if (resolvedTask === 'market-price-check') {
        const result = await handleMarketPriceCheck(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'market-price-list') {
        const result = await handleMarketPriceList(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'kamis-mini') {
        const result = await handleKamisMini(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'smartstore-process-order') {
        const result = await handleSmartstoreProcessOrder(params || rest);
        return res.status(200).json(result);
      }
      // DAILY-BRIEF-A.1: 최근 24시간 운영 브리핑
      if (resolvedTask === 'daily-brief-24h') {
        const result = await handleDailyBrief24h(params || rest);
        return res.status(200).json(result);
      }

      // ── OUTREACH-COPY-AGENT-MASTER-A.1: Multi-platform Collection + Copy Intelligence ──
      if (resolvedTask === 'collect-multi-platform') {
        const result = await handleCollectMultiPlatform(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'hot-content-save') {
        const result = await handleHotContentSave(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'hot-content-list') {
        const result = await handleHotContentList(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'copy-intelligence') {
        const result = await handleCopyIntelligence(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'collector-status') {
        const result = await handleCollectorStatus();
        return res.status(200).json(result);
      }
      // COPY-BRAIN-A.1: Copy Brain tasks
      if (resolvedTask === 'copy_brain_generate') {
        const result = await handleCopyBrainGenerate(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'copy_brain_score') {
        const result = await handleCopyBrainScore(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'copy_brain_feedback_save') {
        const result = await handleCopyBrainFeedbackSave(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === 'copy_brain_list') {
        const result = await handleCopyBrainList(params || rest);
        return res.status(200).json(result);
      }

      return res.status(400).json({ error: `Unknown task: ${resolvedTask}` });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[cloud-proxy] Error:', error.message);
    return res.status(503).json({
      error: 'Service error',
      message: error.message,
    });
  }
}


// ═══════════════════════════════════════════════════════════════════
// handleSmartstoreProcessOrder - 발주서/정산서 처리 (dry-run 기본)
// ═══════════════════════════════════════════════════════════════════

const SENDER_NAME = 'selen 셀렌';
const SENDER_PHONE_ORDER = '010-9943-3201';
const MANAGER_NAME_ORDER = '이혜안';
const DELIVERY_FEE = 3000;

const BAM_SUPPLY: Record<string, number> = {
  '공주알밤 대(1kg)': 8000, '공주알밤 대(2kg)이상': 14000,
  '공주알밤 특(1kg)': 10000, '공주알밤 특(2kg)이상': 17000,
  '포르단칼집밤 대(1kg)': 11000, '포르단칼집밤 대(2kg)이상': 20000,
  '포르단칼집밤 특(1kg)': 12000, '포르단칼집밤 특(2kg)이상': 22000,
  '옥광밤 대(1kg)': 15000, '옥광밤 대(2kg)이상': 28000,
  '대보밤 특(1kg)': 11000, '대보밤 특(2kg)이상': 20000,
};
const BAM_SALE: Record<string, number> = {
  '공주알밤 대(1kg)': 13800, '공주알밤 대(2kg)이상': 24800,
  '공주알밤 특(1kg)': 16800, '공주알밤 특(2kg)이상': 27800,
  '포르단칼집밤 대(1kg)': 19800, '포르단칼집밤 대(2kg)이상': 30800,
  '포르단칼집밤 특(1kg)': 22800, '포르단칼집밤 특(2kg)이상': 32800,
  '대보밤 특(1kg)': 20800, '대보밤 특(2kg)이상': 30800,
};
const OKSU_SUPPLY: Record<string, number> = {
  '냉동 대학찰옥수수 3X5 15개': 15000,
  '냉동 대학찰옥수수 3X7 21개': 21000,
  '냉동 대학찰옥수수 3X10 30개': 30000,
};
const OKSU_SALE: Record<string, number> = {
  '냉동 대학찰옥수수 3X5 15개': 28500,
  '냉동 대학찰옥수수 3X7 21개': 36500,
  '냉동 대학찰옥수수 3X10 30개': 52500,
};

// 로젠택배 양식 헤더 (Sheet1)
const LOGEN_HEADERS = ['제  품', '수량', '보내시는분이름', '보내시는분 전화번호', '받는분이름', '받는분전화번호', '받는분핸드폰번호', '주소', '비고', '우편번호'];
// 롯데택배 양식 헤더 (Sheet1)
const LOTTE_HEADERS = ['상품주문번호', '이름', '옵션정보', '수량', '연락처', '배송지'];

function normalizeOptionOrder(raw: string): string {
  if (!raw) return '';
  const s = String(raw).trim();
  const src = s.includes(':') ? (s.split(':').pop() || '').trim() : s;
  const bamMatch = src.match(/(공주알밤|포르단칼집밤|옥광밤|대보밤)\s*(대|특)\s*(\d+)\s*kg/i);
  if (bamMatch) {
    const kg = parseInt(bamMatch[3]);
    return `${bamMatch[1]} ${bamMatch[2]}(${kg}kg)${kg >= 2 ? '이상' : ''}`;
  }
  const oksuMatch = src.match(/(\d+)[Xx×](\d+)\s*(\d+)개?/);
  if (oksuMatch) {
    return `냉동 대학찰옥수수 ${oksuMatch[1]}X${oksuMatch[2]} ${oksuMatch[3]}개`;
  }
  if (src.includes('3X5') || src.includes('15개')) return '냉동 대학찰옥수수 3X5 15개';
  if (src.includes('3X7') || src.includes('21개')) return '냉동 대학찰옥수수 3X7 21개';
  if (src.includes('3X10') || src.includes('30개')) return '냉동 대학찰옥수수 3X10 30개';
  return src;
}

function detectProductTypeOrder(option: string): 'bam' | 'oksu' | 'unknown' {
  const BAM_KEYWORDS = ['공주알밤', '포르단', '칼집밤', '옥광밤', '대보밤'];
  const OKSU_KEYWORDS = ['옥수수', '찰옥수수', '3X5', '3X7', '3X10'];
  if (BAM_KEYWORDS.some(k => option.includes(k))) return 'bam';
  if (OKSU_KEYWORDS.some(k => option.includes(k))) return 'oksu';
  return 'unknown';
}

interface OrderItem {
  productOrderId: string;
  recipientName: string;
  optionRaw: string;
  option: string;
  quantity: number;
  recipientPhone: string;
  address: string;
}

async function createOrderExcelBuffer(orders: OrderItem[], productType: 'bam' | 'oksu', templateType: 'logen' | 'lotte'): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('발주서');
  const COLOR = productType === 'bam' ? 'FFD4A017' : 'FF1E90FF';

  if (templateType === 'logen') {
    // 로젠택배 양식
    ws.columns = [
      { header: '제  품', key: 'product', width: 30 },
      { header: '수량', key: 'qty', width: 8 },
      { header: '보내시는분이름', key: 'senderName', width: 16 },
      { header: '보내시는분 전화번호', key: 'senderPhone', width: 20 },
      { header: '받는분이름', key: 'recvName', width: 14 },
      { header: '받는분전화번호', key: 'recvPhone1', width: 16 },
      { header: '받는분핸드폰번호', key: 'recvPhone2', width: 16 },
      { header: '주소', key: 'address', width: 45 },
      { header: '비고', key: 'note', width: 12 },
      { header: '우편번호', key: 'zip', width: 10 },
    ];
    ws.getRow(1).eachCell((cell: any) => {
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR } };
      cell.alignment = { horizontal: 'center' };
    });
    for (const o of orders) {
      ws.addRow({
        product: o.option, qty: o.quantity,
        senderName: SENDER_NAME, senderPhone: SENDER_PHONE_ORDER,
        recvName: o.recipientName, recvPhone1: o.recipientPhone, recvPhone2: o.recipientPhone,
        address: o.address, note: '', zip: '',
      });
    }
  } else {
    // 롯데택배 양식
    ws.columns = [
      { header: '상품주문번호', key: 'orderId', width: 20 },
      { header: '이름', key: 'name', width: 14 },
      { header: '옵션정보', key: 'option', width: 30 },
      { header: '수량', key: 'qty', width: 8 },
      { header: '연락처', key: 'phone', width: 16 },
      { header: '배송지', key: 'address', width: 45 },
    ];
    ws.getRow(1).eachCell((cell: any) => {
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR } };
      cell.alignment = { horizontal: 'center' };
    });
    for (const o of orders) {
      ws.addRow({
        orderId: o.productOrderId, name: o.recipientName,
        option: o.option, qty: o.quantity,
        phone: o.recipientPhone, address: o.address,
      });
    }
  }
    return await wb.xlsx.writeBuffer() as any;
}
async function createSettlementBuffer(qtyMap: Record<string, number>, supplyMap: Record<string, number>, saleMap: Record<string, number>, productType: 'bam' | 'oksu', today: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const GOLD = 'FFD4A017';
  const typeName = productType === 'bam' ? '밤' : '옥수수';

  // 공급자용 시트
  const supWs = wb.addWorksheet('공급자용');
  supWs.columns = [
    { key: 'A', width: 32 }, { key: 'B', width: 8 },
    { key: 'C', width: 14 }, { key: 'D', width: 14 }, { key: 'E', width: 16 },
  ];
  supWs.addRow([`새벽장터 ${typeName} 정산서 (배송비별도)`]);
  supWs.getCell('A1').font = { bold: true, size: 13 };
  supWs.addRow(['날짜', today, '', '담당자', MANAGER_NAME_ORDER]);
  supWs.addRow([`배송비: ${DELIVERY_FEE.toLocaleString()}원/건`]);
  supWs.addRow([]);
  supWs.addRow(['제품명', '수량', '제품원가', '배송비', '제품원가+배송비']);
  const hRow = supWs.lastRow;
  hRow.eachCell((cell: any) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
    cell.alignment = { horizontal: 'center' };
  });

  let totalSupply = 0, totalDelivery = 0, totalSettlement = 0;
  const unknownOptions: string[] = [];
  for (const [option, qty] of Object.entries(qtyMap)) {
    const sp = supplyMap[option] || 0;
    if (!supplyMap[option]) unknownOptions.push(option);
    const dt = qty * DELIVERY_FEE;
    const st = qty * sp;
    const total = st + dt;
    totalSupply += st; totalDelivery += dt; totalSettlement += total;
    const row = supWs.addRow([option, qty, st, dt, total]);
    [3,4,5].forEach((c: number) => { row.getCell(c).numFmt = '#,##0'; });
  }
  supWs.addRow([]);
  const totRow = supWs.addRow(['합계', '', totalSupply, totalDelivery, totalSettlement]);
  [3,4,5].forEach((c: number) => { totRow.getCell(c).numFmt = '#,##0'; totRow.getCell(c).font = { bold: true }; });

  // 새벽장터용 시트 (내부용)
  const intWs = wb.addWorksheet('새벽장터용');
  intWs.columns = [
    { key: 'A', width: 32 }, { key: 'B', width: 8 },
    { key: 'C', width: 14 }, { key: 'D', width: 14 },
    { key: 'E', width: 16 }, { key: 'F', width: 14 }, { key: 'G', width: 14 },
  ];
  intWs.addRow([`새벽장터 ${typeName} 정산서 (내부용)`]);
  intWs.getCell('A1').font = { bold: true, size: 13 };
  intWs.addRow(['날짜', today, '', '담당자', MANAGER_NAME_ORDER]);
  intWs.addRow([]);
  intWs.addRow(['제품명', '수량', '제품원가', '배송비', '원가+배송', '매출액', '순수익']);
  const hRow2 = intWs.lastRow;
  hRow2.eachCell((cell: any) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
    cell.alignment = { horizontal: 'center' };
  });

  let totalRevenue = 0, totalProfit = 0;
  for (const [option, qty] of Object.entries(qtyMap)) {
    const sp = supplyMap[option] || 0;
    const slp = saleMap[option] || 0;
    const dt = qty * DELIVERY_FEE;
    const st = qty * sp;
    const cost = st + dt;
    const rev = qty * slp;
    const profit = rev - cost;
    totalRevenue += rev; totalProfit += profit;
    const row = intWs.addRow([option, qty, st, dt, cost, rev, profit]);
    [3,4,5,6,7].forEach((c: number) => { row.getCell(c).numFmt = '#,##0'; });
  }
  intWs.addRow([]);
  const totRow2 = intWs.addRow(['합계', '', totalSupply, totalDelivery, totalSettlement, totalRevenue, totalProfit]);
  [3,4,5,6,7].forEach((c: number) => { totRow2.getCell(c).numFmt = '#,##0'; totRow2.getCell(c).font = { bold: true }; });

  const buffer = await wb.xlsx.writeBuffer();
  return { buffer, totalSupply, totalDelivery, totalSettlement, totalRevenue, totalProfit, unknownOptions };
}

// ═══════════════════════════════════════════════════════════════════════════
// DAILY-BRIEF-A.1: 최근 24시간 운영 브리핑 생성 + 저장 + Telegram 전송
// ═══════════════════════════════════════════════════════════════════════════
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_DAILY_BRIEF_CHAT_ID = process.env.TELEGRAM_DAILY_BRIEF_CHAT_ID || process.env.TELEGRAM_ALLOWED_CHAT_ID || '';

async function sendTelegramMessage(text: string): Promise<{sent: boolean; error?: string}> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_DAILY_BRIEF_CHAT_ID) {
    return { sent: false, error: 'skipped_env_missing' };
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res: any = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_DAILY_BRIEF_CHAT_ID,
        text,
        parse_mode: 'HTML',
      }),
    });
    const data = await res.json();
    if (data.ok) return { sent: true };
    return { sent: false, error: data.description || 'telegram_api_error' };
  } catch (e: any) {
    return { sent: false, error: e.message };
  }
}

async function handleDailyBrief24h(params: any) {
  const { dryRun = false, sendTelegram = true } = params || {};
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kst24hAgo = new Date(kstNow.getTime() - 24 * 60 * 60 * 1000);
  const dateKst = kstNow.toISOString().slice(0, 10);
  const periodStartKst = kst24hAgo.toISOString();
  const periodEndKst = kstNow.toISOString();
  const briefId = generateRecordId('brief');

  // -- 1. 스마트스토어 데이터 수집 --
  let ssData: any = { newOrders: 0, pendingShipping: 0, shipping: 0, delivered: 0, purchaseConfirmed: 0, confirmNeeded: 0 };
  try {
    const rawCounts = await getSmartstoreStatusCounts(30);
    if (rawCounts) {
      ssData = {
        newOrders: rawCounts.newOrders?.length || 0,
        pendingShipping: rawCounts.pendingShipping?.length || 0,
        shipping: rawCounts.shipping ?? 0,
        delivered: rawCounts.delivered ?? 0,
        purchaseConfirmed: rawCounts.purchaseConfirmed ?? 0,
        confirmNeeded: rawCounts.payed?.length || 0,
      };
    }
  } catch (e) {}

  // -- 2. 아웃리치 데이터 수집 --
  let outreachData: any = {
    discovered: 0, publicEmailFound: 0, contactUrlFound: 0,
    draftReady: 0, approvalWaiting: 0, emailSent: 0,
    positiveReplies: 0, accepted: 0,
    followupNeeded: 0, followupDrafted: 0, followupSent: 0,
  };
  try {
    const outreachRes = await handleOutreachList({ limit: 500 });
    if (outreachRes.success && outreachRes.candidates) {
      const list = outreachRes.candidates;
      outreachData = {
        discovered: list.length,
        publicEmailFound: list.filter((c: any) => c.email_status === 'public_email').length,
        contactUrlFound: list.filter((c: any) => c.email_status === 'contact_form' || c.email_status === 'no_public_email').length,
        draftReady: list.filter((c: any) => c.outreach_status === 'drafted').length,
        approvalWaiting: list.filter((c: any) => c.outreach_status === 'drafted' && c.reply_status === 'none').length,
        emailSent: list.filter((c: any) => c.outreach_status === 'sent').length,
        positiveReplies: list.filter((c: any) => c.reply_status === 'positive').length,
        accepted: list.filter((c: any) => c.outreach_status === 'closed' && c.reply_status === 'positive').length,
        followupNeeded: list.filter((c: any) => c.outreach_status === 'follow_up_needed').length,
        followupDrafted: 0,
        followupSent: 0,
      };
    }
  } catch (e) {}

  // -- 3. Hot Content: viral_content_swipe 탭에서 실제 수집 데이터 count --
  const hotContent = { youtube: 0, threads: 0, instagram: 0, tiktok: 0, naverBlog: 0 };
  let hotContentNotes = 'hot_content_not_connected';
  try {
    const vcsData = await sheetsRead('viral_content_swipe');
    if (vcsData.values && vcsData.values.length > 1) {
      const vcsHeaders = vcsData.values[0];
      const platformIdx = vcsHeaders.indexOf('platform');
      const notesIdx = vcsHeaders.indexOf('notes');
      for (let i = 1; i < vcsData.values.length; i++) {
        const row = vcsData.values[i];
        const p = (row[platformIdx] || '').toLowerCase();
        const n = row[notesIdx] || '';
        // isTestViralContentRow 정책과 동일: TEST_ 포함 또는 TEST_DELETE_ME
        if (n.includes('TEST_') || n === 'TEST_DELETE_ME') continue; // 테스트 row 제외
        if (p.includes('youtube')) hotContent.youtube++;
        else if (p.includes('thread')) hotContent.threads++;
        else if (p.includes('instagram')) hotContent.instagram++;
        else if (p.includes('tiktok')) hotContent.tiktok++;
        else if (p.includes('naver') || p.includes('blog')) hotContent.naverBlog++;
      }
      const totalHot = hotContent.youtube + hotContent.threads + hotContent.instagram + hotContent.tiktok + hotContent.naverBlog;
      // test row 수 별도 집계
      let testRowCount = 0;
      for (let i = 1; i < vcsData.values.length; i++) {
        const n = vcsData.values[i][notesIdx] || '';
        if (n.includes('TEST_') || n === 'TEST_DELETE_ME') testRowCount++;
      }
      (hotContent as any).test_count = testRowCount;
      (hotContent as any).prod_count = totalHot;
      if (totalHot > 0) hotContentNotes = `hot_content_prod_${totalHot}_test_${testRowCount}`;
      else if (testRowCount > 0) hotContentNotes = `hot_content_test_only_${testRowCount}`;
    }
  } catch (e) {
    // viral_content_swipe 탭이 없으면 not_connected 유지
  }

  // -- 4. 브리핑 레코드 구성 --
  const briefRow = [
    briefId, dateKst, periodStartKst, periodEndKst,
    String(ssData.newOrders), String(ssData.pendingShipping),
    String(ssData.shipping), String(ssData.delivered),
    String(ssData.purchaseConfirmed), String(ssData.confirmNeeded),
    String(outreachData.discovered), String(outreachData.publicEmailFound),
    String(outreachData.contactUrlFound), String(outreachData.draftReady),
    String(outreachData.approvalWaiting), String(outreachData.emailSent),
    String(outreachData.positiveReplies), String(outreachData.accepted),
    String(outreachData.followupNeeded), String(outreachData.followupDrafted),
    String(outreachData.followupSent),
    String(hotContent.youtube), String(hotContent.threads),
    String(hotContent.instagram), String(hotContent.tiktok),
    String(hotContent.naverBlog),
    '', '', '',
    now.toISOString(),
    hotContentNotes,
  ];

  if (dryRun) {
    return {
      success: true, dryRun: true, briefId, dateKst,
      periodStartKst, periodEndKst,
      smartstore: ssData, outreach: outreachData, hotContent,
      hotContentNotes, telegramConfigured: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_DAILY_BRIEF_CHAT_ID),
    };
  }

  // -- 5. Google Sheets 저장 --
  try {
    await ensureHeaders('daily_operations_brief');
    await sheetsAppend('daily_operations_brief', [briefRow]);
  } catch (e: any) {
    return { success: false, error: `daily_operations_brief 저장 실패: ${e.message}` };
  }

  // -- 6. Telegram 전송 --
  let telegramResult: any = { sent: false, error: 'telegram_disabled' };
  if (sendTelegram) {
    const tgLines = [
      '<b>JARVIS Daily Operations Brief</b>',
      `<b>날짜:</b> ${dateKst}`,
      '',
      '<b>[스마트스토어]</b>',
      `- 신규주문: ${ssData.newOrders}건`,
      `- 배송준비: ${ssData.pendingShipping}건`,
      `- 배송중: ${ssData.shipping}건`,
      `- 배송완료: ${ssData.delivered}건`,
      `- 구매확정: ${ssData.purchaseConfirmed}건`,
      '',
      '<b>[아웃리치]</b>',
      `- 후보: ${outreachData.discovered}명`,
      `- 공개이메일: ${outreachData.publicEmailFound}명`,
      `- 발송완료: ${outreachData.emailSent}건`,
      `- 긍정답변: ${outreachData.positiveReplies}건`,
      '',
      '<i>상세 내역은 Google Sheets 또는 자비스 화면에서 확인하세요.</i>',
    ];
    telegramResult = await sendTelegramMessage(tgLines.join('\n'));
    // Telegram 로그 저장
    try {
      await ensureHeaders('telegram_notification_logs');
      await sheetsAppend('telegram_notification_logs', [[
        generateRecordId('tg'),
        briefId,
        'daily_brief',
        telegramResult.sent ? 'true' : 'false',
        telegramResult.sent ? now.toISOString() : '',
        telegramResult.error || '',
        telegramResult.error || '',
        now.toISOString(),
        '',
      ]]);
    } catch (e) {}
    // daily_operations_brief의 telegram 컬럼 업데이트
    try {
      const token = await getGoogleSheetsToken();
      const existing = await sheetsRead('daily_operations_brief');
      const rows = existing.values || [];
      const headers = rows[0] || [];
      const tgSentIdx = headers.indexOf('telegram_sent');
      const tgSentAtIdx = headers.indexOf('telegram_sent_at');
      const tgErrIdx = headers.indexOf('telegram_error_code');
      const lastRowNum = rows.length;
      if (tgSentIdx >= 0) {
        const colLetter = String.fromCharCode(65 + tgSentIdx);
        const range = encodeURIComponent(`daily_operations_brief!${colLetter}${lastRowNum}`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?valueInputOption=RAW`;
        await fetch(url, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[telegramResult.sent ? 'true' : 'false']] }),
        });
      }
      if (tgSentAtIdx >= 0 && telegramResult.sent) {
        const colLetter = String.fromCharCode(65 + tgSentAtIdx);
        const range = encodeURIComponent(`daily_operations_brief!${colLetter}${lastRowNum}`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?valueInputOption=RAW`;
        await fetch(url, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[now.toISOString()]] }),
        });
      }
      if (tgErrIdx >= 0 && telegramResult.error) {
        const colLetter = String.fromCharCode(65 + tgErrIdx);
        const range = encodeURIComponent(`daily_operations_brief!${colLetter}${lastRowNum}`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?valueInputOption=RAW`;
        await fetch(url, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[telegramResult.error]] }),
        });
      }
    } catch (e) {}
  }

  return {
    success: true,
    briefId,
    dateKst,
    periodStartKst,
    periodEndKst,
    smartstore: ssData,
    outreach: outreachData,
    hotContent,
    hotContentNotes,
    telegram: {
      configured: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_DAILY_BRIEF_CHAT_ID),
      sent: telegramResult.sent,
      error: telegramResult.error || null,
    },
    savedToSheets: true,
  };
}

async function handleSmartstoreProcessOrder(params: any) {
  const { action, fileBase64, fileName, date, dryRun = true, templateType } = params;

  // action: 'check_templates' - 양식 확인만
  if (action === 'check_templates') {
    return {
      success: true,
      mode: 'dry_run',
      task: 'smartstore_process_order',
      templates: {
        lotte: 'found',
        logen: 'found',
        cornSettlement: 'found',
        chestnutSettlement: 'found',
      },
      templateHeaders: {
        lotte: LOTTE_HEADERS,
        logen: LOGEN_HEADERS,
      },
      costData: {
        corn: Object.keys(OKSU_SUPPLY).map(k => ({ product: k, supply: OKSU_SUPPLY[k], sale: OKSU_SALE[k] })),
        chestnut: Object.keys(BAM_SUPPLY).map(k => ({ product: k, supply: BAM_SUPPLY[k], sale: BAM_SALE[k] || 0 })),
      },
      deliveryFee: DELIVERY_FEE,
      executeLocked: true,
    };
  }

  // action: 'create_test_order' - 더미 데이터로 TEST 발주서 생성
  if (action === 'create_test_order') {
    const targetTemplate = templateType || 'logen'; // 'logen' | 'lotte'
    const targetType = params.productType || 'oksu'; // 'bam' | 'oksu'
    const today = date || new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

    // 더미 주문 데이터 (마스킹)
    const dummyOrders: OrderItem[] = [
      { productOrderId: 'TEST_0001', recipientName: '홍*동', optionRaw: '', option: targetType === 'bam' ? '포르단칼집밤 대(2kg)이상' : '냉동 대학찰옥수수 3X5 15개', quantity: 1, recipientPhone: '010-****-1234', address: '서울시 강남구 ***로 123' },
      { productOrderId: 'TEST_0002', recipientName: '김*수', optionRaw: '', option: targetType === 'bam' ? '공주알밤 특(1kg)' : '냉동 대학찰옥수수 3X7 21개', quantity: 2, recipientPhone: '010-****-5678', address: '경기도 성남시 ***로 456' },
      { productOrderId: 'TEST_0003', recipientName: '이*영', optionRaw: '', option: targetType === 'bam' ? '공주알밤 대(1kg)' : '냉동 대학찰옥수수 3X10 30개', quantity: 1, recipientPhone: '010-****-9012', address: '인천시 연수구 ***로 789' },
    ];

    const orderBuffer = await createOrderExcelBuffer(dummyOrders, targetType as 'bam' | 'oksu', targetTemplate as 'logen' | 'lotte');
    const typeName = targetType === 'bam' ? '밤' : '옥수수';
    const templateName = targetTemplate === 'lotte' ? '롯데택배' : '로젠택배';
    const orderFileName = `TEST_${templateName}_${typeName}발주서_${today}.xlsx`;

    return {
      success: true,
      mode: 'dry_run',
      task: 'create_test_order',
      orderSheet: Buffer.from(orderBuffer).toString('base64'),
      orderFileName,
      orderCount: dummyOrders.length,
      templateType: targetTemplate,
      productType: targetType,
      summary: {
        totalRows: dummyOrders.length,
        templateUsed: templateName,
        realCustomerData: false,
        executeLocked: true,
      },
    };
  }

  // action: 'create_test_settlement' - 더미 데이터로 TEST 정산서 생성
  if (action === 'create_test_settlement') {
    const targetType = params.productType || 'oksu';
    const today = date || new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    const supplyMap = targetType === 'bam' ? BAM_SUPPLY : OKSU_SUPPLY;
    const saleMap = targetType === 'bam' ? BAM_SALE : OKSU_SALE;

    // 더미 수량 (테스트용)
    const dummyQty: Record<string, number> = {};
    const keys = Object.keys(supplyMap);
    keys.forEach((k, i) => { dummyQty[k] = i === 0 ? 2 : (i === 1 ? 1 : 0); });

    const settlement = await createSettlementBuffer(dummyQty, supplyMap, saleMap, targetType as 'bam' | 'oksu', today);
    const typeName = targetType === 'bam' ? '밤' : '옥수수';
    const settlementFileName = `TEST_${typeName}정산서_${today}.xlsx`;

    return {
      success: true,
      mode: 'dry_run',
      task: 'create_test_settlement',
      settlementSheet: Buffer.from(settlement.buffer).toString('base64'),
      settlementFileName,
      productType: targetType,
      summary: {
        totalSupply: settlement.totalSupply,
        totalDelivery: settlement.totalDelivery,
        totalSettlement: settlement.totalSettlement,
        totalRevenue: settlement.totalRevenue,
        totalProfit: settlement.totalProfit,
        unknownOptions: settlement.unknownOptions,
        realCustomerData: false,
        executeLocked: true,
      },
    };
  }

  // action: 'full_process' or 'create_order' - 실제 파일 기반 처리
  if (action === 'full_process' || action === 'create_order') {
    if (!fileBase64) {
      return { success: false, error: '파일 데이터 없음 (fileBase64 필수)' };
    }

    // dryRun이 true면 실제 이메일 발송 차단
    const isDryRun = dryRun !== false;

    const ExcelJS = (await import('exceljs')).default;
    const fileBuffer = Buffer.from(fileBase64, 'base64') as any;
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(fileBuffer);
    } catch (e: any) {
      return { success: false, error: '파일 열기 실패. xlsx 형식인지 확인하세요.' };
    }

    const ws = wb.worksheets[0];
    const orders: OrderItem[] = [];
    ws.eachRow((row: any, rn: number) => {
      if (rn < 3) return; // 1~2행 헤더 스킵
      const vals = row.values;
      const orderId = vals[1];
      if (!orderId) return;
      orders.push({
        productOrderId: String(orderId).trim(),
        recipientName: String(vals[8] || '').trim(),
        optionRaw: String(vals[10] || '').trim(),
        option: '',
        quantity: parseInt(vals[11]) || 1,
        recipientPhone: String(vals[14] || '').trim(),
        address: String(vals[18] || '').trim(),
      });
    });

    if (orders.length === 0) {
      return { success: false, error: '주문 데이터 없음' };
    }

    // 옵션 정규화 및 분류
    const bamOrders: OrderItem[] = [], oksuOrders: OrderItem[] = [], unknownOrders: OrderItem[] = [];
    for (const o of orders) {
      o.option = normalizeOptionOrder(o.optionRaw);
      const type = detectProductTypeOrder(o.option);
      if (type === 'bam') bamOrders.push(o);
      else if (type === 'oksu') oksuOrders.push(o);
      else unknownOrders.push(o);
    }

    // 수량 집계
    const bamQty: Record<string, number> = {}, oksuQty: Record<string, number> = {};
    bamOrders.forEach(o => { bamQty[o.option] = (bamQty[o.option] || 0) + o.quantity; });
    oksuOrders.forEach(o => { oksuQty[o.option] = (oksuQty[o.option] || 0) + o.quantity; });

    const today = date || new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    const prefix = isDryRun ? 'TEST_' : '';

    // 발주서 생성 (로젠 양식 = 공급처 발주서)
    let bamOrderSheet = '', bamOrderFileName = '';
    let oksuOrderSheet = '', oksuOrderFileName = '';
    let bamSettlementSheet = '', bamSettlementFileName = '';
    let oksuSettlementSheet = '', oksuSettlementFileName = '';
    let totalSettlement = 0, totalRevenue = 0, totalProfit = 0;
    const qtySummary: Record<string, number> = {};

    if (bamOrders.length > 0) {
      const buf = await createOrderExcelBuffer(bamOrders, 'bam', 'logen');
      bamOrderSheet = Buffer.from(buf).toString('base64');
      bamOrderFileName = `${prefix}셀렌_밤발주서_${today}.xlsx`;
      const settle = await createSettlementBuffer(bamQty, BAM_SUPPLY, BAM_SALE, 'bam', today);
      bamSettlementSheet = Buffer.from(settle.buffer).toString('base64');
      bamSettlementFileName = `${prefix}밤정산서_${today}.xlsx`;
      totalSettlement += settle.totalSettlement;
      totalRevenue += settle.totalRevenue;
      totalProfit += settle.totalProfit;
      Object.entries(bamQty).forEach(([k, v]) => { qtySummary[k] = v; });
    }

    if (oksuOrders.length > 0) {
      const buf = await createOrderExcelBuffer(oksuOrders, 'oksu', 'logen');
      oksuOrderSheet = Buffer.from(buf).toString('base64');
      oksuOrderFileName = `${prefix}셀렌_옥수수발주서_${today}.xlsx`;
      const settle = await createSettlementBuffer(oksuQty, OKSU_SUPPLY, OKSU_SALE, 'oksu', today);
      oksuSettlementSheet = Buffer.from(settle.buffer).toString('base64');
      oksuSettlementFileName = `${prefix}옥수수정산서_${today}.xlsx`;
      totalSettlement += settle.totalSettlement;
      totalRevenue += settle.totalRevenue;
      totalProfit += settle.totalProfit;
      Object.entries(oksuQty).forEach(([k, v]) => { qtySummary[k] = v; });
    }

    // 이메일 발송은 dryRun=false이고 action='full_process'일 때만
    let emailSent = false;
    if (!isDryRun && action === 'full_process') {
      // execute LOCKED - 실제 발송은 승인 게이트 필요
      // 현재는 무조건 차단
      return {
        success: false,
        error: 'execute LOCKED: 실제 이메일 발송은 대표님 승인이 필요합니다. dryRun: true로 먼저 확인하세요.',
        executeLocked: true,
      };
    }

    return {
      success: true,
      mode: isDryRun ? 'dry_run' : 'live',
      task: 'smartstore_process_order',
      orderCount: orders.length,
      orderSheet: bamOrderSheet || oksuOrderSheet,
      orderFileName: bamOrderFileName || oksuOrderFileName,
      settlementSheet: bamSettlementSheet || oksuSettlementSheet,
      settlementFileName: bamSettlementFileName || oksuSettlementFileName,
      bamOrderSheet, bamOrderFileName,
      oksuOrderSheet, oksuOrderFileName,
      bamSettlementSheet, bamSettlementFileName,
      oksuSettlementSheet, oksuSettlementFileName,
      totalSettlement,
      totalRevenue,
      totalProfit,
      qtySummary,
      emailSent,
      summary: {
        total: orders.length,
        bam: bamOrders.length,
        oksu: oksuOrders.length,
        unknown: unknownOrders.length,
        unknownOptions: unknownOrders.map(o => o.optionRaw).slice(0, 5),
      },
      executeLocked: true,
      workspaceSave: true,
    };
  }

  return { success: false, error: `Unknown action: ${action}. 지원: check_templates, create_test_order, create_test_settlement, full_process, create_order` };
}


// ═══════════════════════════════════════════════════════════════════
// OUTREACH-COPY-AGENT-MASTER-A.1
// Multi-platform Collection + Copy Intelligence Foundation
// ═══════════════════════════════════════════════════════════════════

// ── 공통 타입 ──
interface CollectorResult {
  platform: string;
  source_product: string;
  source_keyword: string;
  creator_name: string;
  handle: string;
  profile_url: string;
  content_url: string;
  content_summary: string;
  hook_text: string;
  thumbnail_text: string;
  engagement_visible: string;
  comment_signal: string;
  hot_reason: string;
  contact_email: string;
  contact_url: string;
  contact_route: string;
  contact_priority: number;
  email_status: string;
  fit_score: number;
  fit_reason: string;
  hot_score: number;
  next_action: string;
  notes: string;
}

// ── contact_priority 분류 ──
function classifyContactPriority(email: string, contactUrl: string, contactRoute: string): number {
  if (email && email.includes('@') && !email.includes('***')) return 1; // public_email
  if (contactUrl && contactUrl.length > 5) return 2; // contact_form
  if (contactRoute === 'instagram_dm_manual') return 3;
  if (contactRoute === 'tiktok_dm_manual') return 4;
  if (contactRoute === 'threads_profile_manual') return 5;
  return 6; // none
}

// ── fit_score 기초 계산 ──
function calculateFitScore(item: Partial<CollectorResult>): number {
  let score = 0;
  const engagement = item.engagement_visible || '';
  // 조회수/좋아요 기반
  const viewMatch = engagement.match(/(\d[\d,.]*)\s*(조회|views|회)/i);
  if (viewMatch) {
    const views = parseInt(viewMatch[1].replace(/[,.]/g, ''), 10);
    if (views > 100000) score += 30;
    else if (views > 10000) score += 20;
    else if (views > 1000) score += 10;
  }
  // 이메일 있으면 가산
  if (item.contact_email && item.contact_email.includes('@')) score += 20;
  // 콘텐츠 관련성
  if (item.hot_reason) score += 10;
  if (item.hook_text) score += 10;
  // 카테고리 적합성
  const summary = (item.content_summary || '').toLowerCase();
  const foodKws = ['먹방','리뷰','공구','공동구매','과일','농산물','제철','복숭아','옥수수','사과','감','딸기'];
  if (foodKws.some(k => summary.includes(k))) score += 20;
  return Math.min(score, 100);
}

// ── hot_score 기초 계산 ──
function calculateHotScore(item: Partial<CollectorResult>): number {
  let score = 0;
  const engagement = item.engagement_visible || '';
  const viewMatch = engagement.match(/(\d[\d,.]*)\s*(조회|views|회)/i);
  if (viewMatch) {
    const views = parseInt(viewMatch[1].replace(/[,.]/g, ''), 10);
    if (views > 500000) score += 40;
    else if (views > 100000) score += 30;
    else if (views > 10000) score += 20;
    else if (views > 1000) score += 10;
  }
  const commentMatch = engagement.match(/(\d[\d,.]*)\s*(댓글|comments)/i);
  if (commentMatch) {
    const comments = parseInt(commentMatch[1].replace(/[,.]/g, ''), 10);
    if (comments > 100) score += 20;
    else if (comments > 10) score += 10;
  }
  if (item.comment_signal) score += 10;
  if (item.hook_text && item.hook_text.length > 5) score += 10;
  if (item.hot_reason) score += 10;
  return Math.min(score, 100);
}

// ── copy_pattern_score 기초 계산 ──
function calculateCopyPatternScore(item: Partial<CollectorResult>): number {
  let score = 0;
  if (item.hook_text && item.hook_text.length > 10) score += 30;
  if (item.thumbnail_text && item.thumbnail_text.length > 5) score += 20;
  if (item.content_summary && item.content_summary.length > 20) score += 20;
  if (item.comment_signal) score += 15;
  if (item.hot_reason) score += 15;
  return Math.min(score, 100);
}

// ═══ YouTube Collector Adapter ═══
async function collectYouTubeCandidates(keyword: string, product: string, maxResults: number = 5): Promise<{ candidates: CollectorResult[]; hotContent: CollectorResult[]; status: string; error?: string }> {
  if (!YOUTUBE_API_KEY) return { candidates: [], hotContent: [], status: 'not_connected', error: 'YOUTUBE_API_KEY missing' };
  const candidates: CollectorResult[] = [];
  const hotContent: CollectorResult[] = [];
  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(keyword)}&order=viewCount&maxResults=${maxResults}&regionCode=KR&hl=ko&key=${YOUTUBE_API_KEY}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      const errData = await searchRes.json() as any;
      if (errData.error?.errors?.[0]?.reason === 'quotaExceeded') return { candidates: [], hotContent: [], status: 'quota_exceeded', error: 'YouTube API quota exceeded' };
      return { candidates: [], hotContent: [], status: 'error', error: errData.error?.message || 'YouTube search failed' };
    }
    const searchData = await searchRes.json() as any;
    if (!searchData.items?.length) return { candidates: [], hotContent: [], status: 'done', error: 'No results' };

    // 채널 상세 정보 가져오기
    const channelIds = [...new Set(searchData.items.map((i: any) => i.snippet?.channelId).filter(Boolean))];
    const videoIds = searchData.items.map((i: any) => i.id?.videoId).filter(Boolean);
    let channelMap: Record<string, any> = {};
    let videoMap: Record<string, any> = {};

    if (channelIds.length > 0) {
      const chUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds.join(',')}&key=${YOUTUBE_API_KEY}`;
      const chRes = await fetch(chUrl);
      if (chRes.ok) {
        const chData = await chRes.json() as any;
        for (const ch of (chData.items || [])) channelMap[ch.id] = ch;
      }
    }
    if (videoIds.length > 0) {
      const vUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`;
      const vRes = await fetch(vUrl);
      if (vRes.ok) {
        const vData = await vRes.json() as any;
        for (const v of (vData.items || [])) videoMap[v.id] = v;
      }
    }

    for (const item of searchData.items) {
      const videoId = item.id?.videoId;
      const channelId = item.snippet?.channelId;
      const ch = channelMap[channelId] || {};
      const vid = videoMap[videoId] || {};
      const stats = vid.statistics || {};
      const chStats = ch.statistics || {};
      const chSnippet = ch.snippet || {};
      const desc = chSnippet.description || '';
      // 공개 이메일 추출
      const emailMatch = desc.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
      const publicEmail = emailMatch ? emailMatch[0] : '';
      const contactRoute = publicEmail ? 'public_email' : 'none';
      const emailStatus = publicEmail ? 'public_email' : 'no_public_email';
      const engagementStr = `조회 ${Number(stats.viewCount || 0).toLocaleString()}회, 좋아요 ${Number(stats.likeCount || 0).toLocaleString()}, 댓글 ${Number(stats.commentCount || 0).toLocaleString()}`;

      const base: CollectorResult = {
        platform: 'YouTube',
        source_product: product,
        source_keyword: keyword,
        creator_name: item.snippet?.channelTitle || '',
        handle: channelId || '',
        profile_url: channelId ? `https://www.youtube.com/channel/${channelId}` : '',
        content_url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
        content_summary: (item.snippet?.title || '').substring(0, 200),
        hook_text: (item.snippet?.title || '').substring(0, 100),
        thumbnail_text: '',
        engagement_visible: engagementStr,
        comment_signal: Number(stats.commentCount || 0) > 50 ? '댓글 활발' : '',
        hot_reason: Number(stats.viewCount || 0) > 10000 ? '높은 조회수' : '',
        contact_email: publicEmail,
        contact_url: '',
        contact_route: contactRoute,
        contact_priority: classifyContactPriority(publicEmail, '', contactRoute),
        email_status: emailStatus,
        fit_score: 0,
        fit_reason: '',
        hot_score: 0,
        next_action: publicEmail ? 'draft_proposal' : 'manual_contact_check',
        notes: '',
      };
      base.fit_score = calculateFitScore(base);
      base.fit_reason = base.fit_score >= 50 ? '높은 적합도' : base.fit_score >= 30 ? '보통 적합도' : '낮은 적합도';
      base.hot_score = calculateHotScore(base);

      candidates.push(base);
      // 조회수 10000 이상이면 Hot Content에도 추가
      if (Number(stats.viewCount || 0) > 10000) {
        hotContent.push({ ...base });
      }
    }
    return { candidates, hotContent, status: 'done' };
  } catch (e: any) {
    return { candidates: [], hotContent: [], status: 'error', error: e.message };
  }
}

// ═══ Naver Blog Collector Adapter ═══
async function collectNaverBlogCandidates(keyword: string, product: string, maxResults: number = 5): Promise<{ candidates: CollectorResult[]; hotContent: CollectorResult[]; status: string; error?: string }> {
  const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || '';
  const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';
  if (!NAVER_CLIENT_ID) return { candidates: [], hotContent: [], status: 'not_connected', error: 'NAVER_CLIENT_ID missing' };
  const candidates: CollectorResult[] = [];
  const hotContent: CollectorResult[] = [];
  try {
    const searchUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=${maxResults}&sort=sim`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'X-Naver-Client-Id': NAVER_CLIENT_ID, 'X-Naver-Client-Secret': NAVER_CLIENT_SECRET },
    });
    if (!searchRes.ok) return { candidates: [], hotContent: [], status: 'error', error: 'Naver Blog search failed' };
    const searchData = await searchRes.json() as any;
    if (!searchData.items?.length) return { candidates: [], hotContent: [], status: 'done', error: 'No results' };

    for (const item of searchData.items) {
      const title = (item.title || '').replace(/<[^>]*>/g, '');
      const desc = (item.description || '').replace(/<[^>]*>/g, '');
      const bloggerName = item.bloggername || '';
      const bloggerLink = item.bloggerlink || '';
      const link = item.link || '';

      const base: CollectorResult = {
        platform: 'Naver Blog',
        source_product: product,
        source_keyword: keyword,
        creator_name: bloggerName,
        handle: bloggerLink,
        profile_url: bloggerLink,
        content_url: link,
        content_summary: title.substring(0, 200),
        hook_text: title.substring(0, 100),
        thumbnail_text: '',
        engagement_visible: '',
        comment_signal: '',
        hot_reason: desc.includes('공구') || desc.includes('공동구매') ? '공구/공동구매 언급' : '',
        contact_email: '',
        contact_url: bloggerLink || '',
        contact_route: bloggerLink ? 'contact_form' : 'none',
        contact_priority: classifyContactPriority('', bloggerLink, ''),
        email_status: 'no_public_email',
        fit_score: 0,
        fit_reason: '',
        hot_score: 0,
        next_action: 'manual_contact_check',
        notes: '',
      };
      base.fit_score = calculateFitScore(base);
      base.fit_reason = base.fit_score >= 50 ? '높은 적합도' : base.fit_score >= 30 ? '보통 적합도' : '낮은 적합도';
      base.hot_score = calculateHotScore(base);

      candidates.push(base);
      if (base.hot_reason) hotContent.push({ ...base });
    }
    return { candidates, hotContent, status: 'done' };
  } catch (e: any) {
    return { candidates: [], hotContent: [], status: 'error', error: e.message };
  }
}

// ═══ Threads Collector Adapter (공개 검색 기반) ═══
async function collectThreadsHotPosts(keyword: string, product: string): Promise<{ candidates: CollectorResult[]; hotContent: CollectorResult[]; status: string; error?: string }> {
  // Threads는 공식 검색 API가 없음 → not_connected 정직 표시
  // 향후 Browser Operator 기반 공개 검색으로 확장 가능
  return { candidates: [], hotContent: [], status: 'not_connected', error: 'Threads 공식 검색 API 없음 — Browser Operator 기반 수집 필요' };
}

// ═══ Instagram Collector Adapter ═══
async function collectInstagramProfiles(keyword: string, product: string): Promise<{ candidates: CollectorResult[]; hotContent: CollectorResult[]; status: string; error?: string }> {
  // Instagram은 로그인 없이 검색 API 접근 불가 → not_connected 정직 표시
  return { candidates: [], hotContent: [], status: 'not_connected', error: 'Instagram 로그인 없이 검색 불가 — 수동 확인 필요' };
}

// ═══ TikTok Collector Adapter ═══
async function collectTikTokProfiles(keyword: string, product: string): Promise<{ candidates: CollectorResult[]; hotContent: CollectorResult[]; status: string; error?: string }> {
  // TikTok은 로그인 없이 검색 API 접근 불가 → not_connected 정직 표시
  return { candidates: [], hotContent: [], status: 'not_connected', error: 'TikTok 로그인 없이 검색 불가 — 수동 확인 필요' };
}

// ═══ handleCollectMultiPlatform: 통합 수집 엔드포인트 ═══
async function handleCollectMultiPlatform(params: any) {
  const { keyword, product, platforms = ['youtube', 'naver_blog', 'threads', 'instagram', 'tiktok'], maxResults = 3, dryRun = true } = params;
  if (!keyword) return { success: false, error: 'keyword required' };

  const productName = product || keyword;
  const results: Record<string, { candidates: CollectorResult[]; hotContent: CollectorResult[]; status: string; error?: string }> = {};

  for (const p of platforms) {
    switch (p.toLowerCase().replace(/[\s_-]/g, '')) {
      case 'youtube':
        results.youtube = await collectYouTubeCandidates(keyword, productName, maxResults);
        break;
      case 'naverblog':
        results.naver_blog = await collectNaverBlogCandidates(keyword, productName, maxResults);
        break;
      case 'threads':
        results.threads = await collectThreadsHotPosts(keyword, productName);
        break;
      case 'instagram':
        results.instagram = await collectInstagramProfiles(keyword, productName);
        break;
      case 'tiktok':
        results.tiktok = await collectTikTokProfiles(keyword, productName);
        break;
    }
  }

  // 통합 집계
  const allCandidates: CollectorResult[] = [];
  const allHotContent: CollectorResult[] = [];
  const platformStatus: Record<string, string> = {};

  for (const [p, r] of Object.entries(results)) {
    allCandidates.push(...r.candidates);
    allHotContent.push(...r.hotContent);
    platformStatus[p] = r.status;
  }

  return {
    success: true,
    dryRun,
    keyword,
    product: productName,
    platformStatus,
    candidates: allCandidates.map(c => ({
      ...c,
      // 보안: contact_email은 존재 여부만 표시, 원문은 Google Sheets에만 저장
      contact_email_exists: !!(c.contact_email && c.contact_email.includes('@')),
      contact_email: undefined, // 응답에서 이메일 원문 제거
    })),
    hotContent: allHotContent.map(c => ({
      platform: c.platform,
      content_url: c.content_url,
      creator_name: c.creator_name,
      hook_text: c.hook_text,
      engagement_visible: c.engagement_visible,
      hot_score: c.hot_score,
      hot_reason: c.hot_reason,
    })),
    summary: {
      totalCandidates: allCandidates.length,
      totalHotContent: allHotContent.length,
      publicEmailFound: allCandidates.filter(c => c.email_status === 'public_email').length,
      contactUrlFound: allCandidates.filter(c => c.contact_priority === 2).length,
    },
  };
}

// ═══ handleHotContentSave: viral_content_swipe 탭에 저장 ═══
async function handleHotContentSave(params: any) {
  const { items, dryRun = true } = params;
  if (!items || !Array.isArray(items) || items.length === 0) return { success: false, error: 'items array required' };

  const now = new Date().toISOString();
  const rows: string[][] = [];

  for (const item of items) {
    const id = generateRecordId('hc');
    rows.push([
      id,
      item.platform || '',
      item.source_product || '',
      item.source_keyword || '',
      item.content_url || '',
      item.creator_name || '',
      item.hook_text || '',
      item.thumbnail_text || '',
      item.post_summary || item.content_summary || '',
      item.engagement_visible || '',
      item.comment_signal || '',
      item.hot_reason || '',
      item.copy_pattern || '',
      item.emotion_trigger || '',
      item.buyer_desire || '',
      item.usable_for || '',
      String(item.hot_score || calculateHotScore(item)),
      String(item.copy_pattern_score || calculateCopyPatternScore(item)),
      String(item.risk_score || 0),
      now,
      item.notes || (dryRun ? 'TEST_DELETE_ME' : ''),
    ]);
  }

  if (dryRun) {
    return { success: true, dryRun: true, rowCount: rows.length, preview: rows.slice(0, 2) };
  }

  try {
    await ensureHeaders('viral_content_swipe');
    await sheetsAppend('viral_content_swipe', rows);
    return { success: true, savedCount: rows.length };
  } catch (e: any) {
    return { success: false, error: `viral_content_swipe 저장 실패: ${e.message}` };
  }
}

// ═══ handleHotContentList: viral_content_swipe 탭 조회 ═══
async function handleHotContentList(params: any) {
  const { platform, limit = 50, includeTest = false } = params || {};
  // COPY-BRAIN-A.1C: TEST row 분리 헬퍼
  function isTestViralContentRow(row: any): boolean {
    return String(row.notes || '').includes('TEST_');
  }
  try {
    const data = await sheetsRead('viral_content_swipe');
    if (!data.values || data.values.length <= 1) return { success: true, items: [], total: 0, test_count: 0, prod_count: 0 };
    const headers = data.values[0];
    let records = data.values.slice(1).map((row: string[]) => {
      const obj: any = {};
      headers.forEach((h: string, i: number) => { obj[h] = row[i] || ''; });
      return obj;
    });
    const testRows = records.filter((r: any) => isTestViralContentRow(r));
    const prodRows = records.filter((r: any) => !isTestViralContentRow(r));
    // includeTest=false(default): 운영 row만 반환
    let filtered = includeTest ? records : prodRows;
    if (platform) filtered = filtered.filter((r: any) => (r.platform || '').toLowerCase().includes(platform.toLowerCase()));
    filtered = filtered.slice(-limit);
    return { success: true, items: filtered, total: filtered.length, prod_count: prodRows.length, test_count: testRows.length };
  } catch (e: any) {
    return { success: true, items: [], total: 0, prod_count: 0, test_count: 0, note: 'viral_content_swipe 탭 없음 또는 읽기 실패' };
  }
}

// ═══ handleCopyIntelligence: GPT 기반 카피 생성 ═══
async function handleCopyIntelligence(params: any) {
  const { product, hotContentSamples = [], candidateSamples = [], outputTypes = ['headline', 'thumbnail', 'reels_script', 'threads_post', 'proposal_email'], dryRun = true } = params;
  if (!product) return { success: false, error: 'product required' };

  const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
  if (!OPENAI_KEY) return { success: false, error: 'OPENAI_API_KEY not configured' };

  // 참고 데이터 구성
  const hotContentRef = hotContentSamples.slice(0, 5).map((h: any) =>
    `- [${h.platform}] ${h.hook_text || h.content_summary || ''} (${h.engagement_visible || ''}) ${h.hot_reason || ''}`
  ).join('\n');

  const candidateRef = candidateSamples.slice(0, 3).map((c: any) =>
    `- [${c.platform}] ${c.creator_name} — ${c.content_summary || ''}`
  ).join('\n');

  const systemPrompt = `당신은 농산물/식품 바이럴 마케팅 전문 카피라이터입니다.
아래 규칙을 반드시 지키세요:
- 친근하고 말하듯 툭 던지는 문장
- 강한 첫 문장, 계절감, 식감, 수확 타이밍, 스토리
- 댓글/DM 유도, 여운 있는 마무리
- 과장 광고, 허위 효능, 매출 보장, 성공 보장 표현 금지
- 원본 콘텐츠 장문 복사/표절 금지
- 실제 바이럴에 쓸 수 있는 수준으로 작성`;

  const userPrompt = `상품: ${product}

참고할 반응 좋은 콘텐츠:
${hotContentRef || '(아직 수집된 Hot Content 없음)'}

참고할 후보 정보:
${candidateRef || '(아직 수집된 후보 없음)'}

아래 형식으로 각각 2개씩 생성해주세요:
${outputTypes.includes('headline') ? '1. 헤드카피 (후킹 문구) — 15자 이내, 강렬한 첫인상' : ''}
${outputTypes.includes('thumbnail') ? '2. 썸네일 문구 — 10자 이내, 클릭 유도' : ''}
${outputTypes.includes('reels_script') ? '3. 릴스/쇼츠 스크립트 — 15초 분량, 후킹→본문→CTA' : ''}
${outputTypes.includes('threads_post') ? '4. 스레드 글 — 3~5문장, 공감+궁금증 유발' : ''}
${outputTypes.includes('proposal_email') ? '5. 공동구매 제안 메일 초안 — 제목 + 본문 (상대방 채널명은 [채널명]으로 표기)' : ''}

JSON 형식으로 응답해주세요:
{
  "headlines": ["...", "..."],
  "thumbnails": ["...", "..."],
  "reels_scripts": ["...", "..."],
  "threads_posts": ["...", "..."],
  "proposal_emails": [{"subject": "...", "body": "..."}, {"subject": "...", "body": "..."}]
}`;

  if (dryRun) {
    return {
      success: true, dryRun: true, product,
      prompt_preview: userPrompt.substring(0, 500) + '...',
      outputTypes,
      hotContentRefCount: hotContentSamples.length,
      candidateRefCount: candidateSamples.length,
    };
  }

  try {
    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      }),
    });
    if (!gptRes.ok) {
      const errData = await gptRes.json() as any;
      return { success: false, error: `GPT API error: ${errData.error?.message || 'unknown'}` };
    }
    const gptData = await gptRes.json() as any;
    const content = gptData.choices?.[0]?.message?.content || '';

    // JSON 파싱 시도
    let parsed: any = null;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      parsed = { raw: content };
    }

    return {
      success: true,
      product,
      copyIntelligence: parsed || { raw: content },
      outputTypes,
      hotContentRefCount: hotContentSamples.length,
      candidateRefCount: candidateSamples.length,
      riskWarnings: [],
    };
  } catch (e: any) {
    return { success: false, error: `Copy Intelligence 생성 실패: ${e.message}` };
  }
}

// ═══ handleCollectorStatus: 수집기 상태 조회 ═══
async function handleCollectorStatus() {
  const status: Record<string, { status: string; configured: boolean; note: string }> = {
    youtube: {
      status: YOUTUBE_API_KEY ? 'ready' : 'not_connected',
      configured: !!YOUTUBE_API_KEY,
      note: YOUTUBE_API_KEY ? 'YouTube Data API v3 configured' : 'YOUTUBE_API_KEY missing',
    },
    naver_blog: {
      status: process.env.NAVER_CLIENT_ID ? 'ready' : 'not_connected',
      configured: !!process.env.NAVER_CLIENT_ID,
      note: process.env.NAVER_CLIENT_ID ? 'Naver Search API configured' : 'NAVER_CLIENT_ID missing',
    },
    threads: {
      status: 'not_connected',
      configured: false,
      note: 'Threads 공식 검색 API 없음 — Browser Operator 기반 수집 필요',
    },
    instagram: {
      status: 'not_connected',
      configured: false,
      note: 'Instagram 로그인 없이 검색 불가',
    },
    tiktok: {
      status: 'not_connected',
      configured: false,
      note: 'TikTok 로그인 없이 검색 불가',
    },
    copy_intel: {
      status: process.env.OPENAI_API_KEY ? 'ready' : 'not_connected',
      configured: !!process.env.OPENAI_API_KEY,
      note: process.env.OPENAI_API_KEY ? 'GPT Copy Intelligence ready' : 'OPENAI_API_KEY missing',
    },
    google_sheets: {
      status: WORKSPACE_SHEET_ID ? 'connected' : 'not_connected',
      configured: !!WORKSPACE_SHEET_ID,
      note: WORKSPACE_SHEET_ID ? 'Google Sheets connected' : 'WORKSPACE_SHEET_ID missing',
    },
  };

  // viral_content_swipe 탭 데이터 count
  let hotContentTotal = 0;
  try {
    const data = await sheetsRead('viral_content_swipe');
    if (data.values && data.values.length > 1) {
      hotContentTotal = data.values.length - 1; // 헤더 제외
    }
  } catch (e) {}

  // influencer_candidates_v2 count
  let candidateTotal = 0;
  try {
    const data = await sheetsRead('influencer_candidates_v2');
    if (data.values && data.values.length > 1) {
      candidateTotal = data.values.length - 1;
    }
  } catch (e) {}

  return {
    success: true,
    collectors: status,
    kpi: {
      totalCandidates: candidateTotal,
      hotContentCount: hotContentTotal,
    },
  };
}


// ═══════════════════════════════════════════════════════════════════════
// COPY-BRAIN-A.1: Mawin Agricultural Copy Brain Core
// ═══════════════════════════════════════════════════════════════════════

// --- Copy Brain Engine Imports (inline for Vercel serverless) ---
// Product Truth Engine
const PRODUCT_TRUTH_DB: Record<string, any> = {
  '복숭아': {
    product: '복숭아',
    core_truth: ['여름에는 맛보다 향으로 먼저 기억된다.','딱복/물복 취향 대립이 강하다.','수확 시즌이 짧아 타이밍이 중요하다.','선물용으로 외관(크기, 색)이 중요하다.','냉장고 열 때 퍼지는 향이 구매 만족도를 결정한다.'],
    sensory_points: ['향','과즙','당도','식감','냉장고 열었을 때 향','한 입 베어물 때 터지는 즙'],
    seasonal_timing: '7~9월 수확, 6월 말부터 예약 시작, 8월 피크',
    buyer_contexts: ['가족 간식','선물','캠핑','여름 디저트','아이 간식','부모님 선물','제사/명절'],
    trust_signals: ['산지 직송','당일 수확','농장 사진','선별 과정','무농약/저농약'],
    avoid_claims: ['최고 당도','세상에서 제일 맛있는','효능/건강 주장','100% 만족 보장'],
    content_angles: ['딱복파 vs 물복파 논쟁','냉장고 열 때 향기 장면','한 입 베어물 때 과즙 터지는 장면','아이가 복숭아 먹는 모습','산지에서 바로 따는 장면','복숭아 고르는 법'],
  },
  '옥수수': {
    product: '옥수수',
    core_truth: ['쫀득함은 한 번 먹으면 계속 생각난다.','여름 간식으로 기억과 연결된다.','산지 직송 신뢰가 중요하다.','찰옥수수 vs 단옥수수 취향이 갈린다.','삶아서 바로 먹는 그 순간이 핵심이다.'],
    sensory_points: ['쫀득함','단맛','옥수수 향','뜨거운 김','알갱이 식감','버터 올렸을 때'],
    seasonal_timing: '6~8월 수확, 7월 피크, 초여름부터 예약',
    buyer_contexts: ['캠핑 간식','아이 간식','여름 간식','다이어트 대용','야식','가족 나들이'],
    trust_signals: ['산지 직송','당일 수확 당일 발송','농장 직거래','품종 명시'],
    avoid_claims: ['최고 당도','다이어트 효과','건강 효능'],
    content_angles: ['캠핑에서 옥수수 굽는 장면','삶은 옥수수에 버터 올리는 장면','아이가 옥수수 들고 먹는 모습','산지에서 바로 따는 장면','찰옥수수 vs 단옥수수 논쟁'],
  },
  '절임배추': {
    product: '절임배추',
    core_truth: ['김장은 실패하면 안 되는 집안일이다.','가격보다 원물 신뢰가 중요하다.','예약 수요와 시즌 타이밍이 중요하다.','절임 상태(짠맛, 숨죽임)가 김장 성패를 좌우한다.','엄마/시어머니 세대의 기준이 높다.'],
    sensory_points: ['아삭함','적당한 짠맛','배추 숨죽임 상태','잎 두께','줄기 단맛'],
    seasonal_timing: '11~12월 김장 시즌, 10월부터 예약, 11월 중순 피크',
    buyer_contexts: ['김장','가족 행사','시어머니 선물','1인 가구 소량 김장','공동구매'],
    trust_signals: ['해남/고랭지 산지','절임 공정 사진','배추 원물 사진','절임 후 무게','후기 사진'],
    avoid_claims: ['최고 품질','무조건 맛있는','실패 없는'],
    content_angles: ['김장 준비 과정 브이로그','절임배추 받아서 확인하는 장면','김장 전날 밤 준비하는 모습','엄마와 함께 김장하는 장면','1인 가구 소량 김장 도전기'],
  },
};

function resolveProductTruth(product: string): any {
  const aliases: Record<string, string> = {
    peach: '복숭아', '복숭아': '복숭아', '황도': '복숭아', '백도': '복숭아',
    corn: '옥수수', '옥수수': '옥수수', '찰옥수수': '옥수수', '단옥수수': '옥수수',
    kimchi_cabbage: '절임배추', '절임배추': '절임배추', '배추': '절임배추', '김장배추': '절임배추',
  };
  const key = aliases[product.toLowerCase()] || aliases[product] || product;
  return PRODUCT_TRUTH_DB[key] || {
    product, core_truth: [`${product}의 핵심 가치를 파악하여 진정성 있는 카피를 생성합니다.`],
    sensory_points: ['맛','향','식감','외관'], seasonal_timing: '시즌 확인 필요',
    buyer_contexts: ['일상 소비','선물','가족 식사'], trust_signals: ['산지 직송','신선도'],
    avoid_claims: ['최고','보장','효능'], content_angles: [`${product} 실제 사용/소비 장면`],
  };
}

// Buyer Desire Engine
const DESIRE_LABELS: Record<string, string> = {
  nostalgia: '추억/향수', seasonal_craving: '계절 갈망', family_care: '가족 돌봄',
  gift: '선물', scarcity_timing: '희소성/타이밍', sensory_imagination: '감각 상상',
  trust: '신뢰', convenience: '편리함', identity: '정체성/소속감', community_participation: '참여/소통',
};

const PRODUCT_PLATFORM_DESIRES: Record<string, Record<string, string[]>> = {
  '복숭아': { threads: ['seasonal_craving','sensory_imagination','identity','community_participation'], instagram: ['sensory_imagination','gift','family_care','seasonal_craving'], youtube_shorts: ['sensory_imagination','seasonal_craving','nostalgia'], naver_blog: ['trust','family_care','seasonal_craving','sensory_imagination'], outreach_email: ['seasonal_craving','trust','community_participation'] },
  '옥수수': { threads: ['nostalgia','seasonal_craving','sensory_imagination','community_participation'], instagram: ['sensory_imagination','family_care','convenience'], youtube_shorts: ['sensory_imagination','nostalgia','seasonal_craving'], naver_blog: ['trust','convenience','family_care'], outreach_email: ['seasonal_craving','trust','sensory_imagination'] },
  '절임배추': { threads: ['trust','family_care','scarcity_timing','community_participation'], instagram: ['family_care','trust','convenience'], youtube_shorts: ['trust','family_care','nostalgia'], naver_blog: ['trust','family_care','convenience','scarcity_timing'], outreach_email: ['scarcity_timing','trust','family_care'] },
};

function resolveBuyerDesires(product: string, platform: string): string[] {
  const aliases: Record<string, string> = { peach: '복숭아', '복숭아': '복숭아', corn: '옥수수', '옥수수': '옥수수', kimchi_cabbage: '절임배추', '절임배추': '절임배추' };
  const key = aliases[product.toLowerCase()] || aliases[product] || product;
  return PRODUCT_PLATFORM_DESIRES[key]?.[platform] || ['sensory_imagination','trust','seasonal_craving'];
}

// Mawi Voice Rules
const MAWI_BANNED_PHRASES = ['지금 만나보세요','특별한 가격','놓치지 마세요','최고의 품질','역대급','대박 할인','품질 보장','건강에 좋습니다','효능 있습니다','합리적인 가격','고객님께 추천드립니다','지금 바로 구매하세요','많은 관심 부탁드립니다','신선하고 맛있는','특별한 기회','서두르세요','파격 세일','최저가 보장','만족 보장'];

const MAWI_VOICE_PROMPT = `[Mawi Voice 스타일 규칙]
반드시 지킬 것:
- 첫 줄은 짧게 — 7자 이내 권장, 길어도 15자
- 말하듯 시작 — "있잖아", "솔직히", "근데" 같은 구어체
- 설명보다 장면 먼저 — "복숭아 향이 냉장고에서 퍼진다" > "복숭아는 향이 좋습니다"
- 상품보다 감정 먼저
- 계절감, 산지/현장감, 먹는 장면
- 댓글 달고 싶게 — 질문, 투표, 취향 대립
- 마지막 여운
- 줄바꿈 리듬

절대 금지:
- 광고문 금지, AI스러운 정리체 금지, 흔한 문장 금지
- 과장 금지, 허위 효능 금지, 스팸 느낌 금지

금지 표현: ${MAWI_BANNED_PHRASES.map(p => `"${p}"`).join(', ')}

목표 스타일 예시:
"딱복파랑 물복파는\\n진짜 쉽게 화해 안 한다.\\n\\n근데 향 좋은 복숭아 앞에서는\\n둘 다 조용해진다."

"냉장고 열었는데\\n복숭아 향이 확 올라온 적 있어?\\n\\n그 순간이 여름이다."`;

// Platform Formula
const PLATFORM_FORMULAS: Record<string, string> = {
  threads: '구조: 1~2문장 첫 줄 → 줄바꿈 리듬 → 감각/장면 → 댓글 유도 → 여운. 톤: 친근한 대화체. 길이: 3~5문장. 직접 판매 최소화.',
  instagram: '구조: 감각 장면 → 짧은 캡션 2~3문장 → 해시태그 3~5개. 톤: 감각적, 시각적. 해시태그 남발 금지.',
  youtube_shorts: '구조: [0~3초] 후킹 → [3~10초] 장면/스토리 → [10~15초] 행동 유도. 자막 기준 3~5문장. 자막/썸네일 분리.',
  tiktok: '구조: 빠른 후킹 → 리듬감 → 장면 중심. 광고 냄새 최소화.',
  naver_blog: '구조: 검색형 제목 → 구매 전 고민 공감 → 신뢰 근거 → 후기형. 키워드 스터핑 금지.',
  outreach_email: '구조: 제목(상대 채널 맥락) → 인사(상대 콘텐츠 언급) → 제안(왜 맞는지) → 부담 없는 답장 유도. 스팸 느낌 금지.',
};

// Anti-Boring Filter
const BORING_PATTERNS: { pattern: RegExp; reason: string; weight: number }[] = [
  { pattern: /제철\s*.{1,5}를?\s*지금\s*만나보세요/, reason: '제철 OOO를 지금 만나보세요', weight: 20 },
  { pattern: /특별한\s*가격으로\s*준비했습니다/, reason: '특별한 가격으로 준비했습니다', weight: 20 },
  { pattern: /신선하고\s*맛있는\s*.{1,10}/, reason: '신선하고 맛있는 OOO', weight: 15 },
  { pattern: /많은\s*관심\s*부탁드립니다/, reason: '많은 관심 부탁드립니다', weight: 20 },
  { pattern: /최고의\s*품질/, reason: '최고의 품질', weight: 20 },
  { pattern: /합리적인\s*가격/, reason: '합리적인 가격', weight: 15 },
  { pattern: /고객님께\s*추천드립니다/, reason: '고객님께 추천드립니다', weight: 20 },
  { pattern: /지금\s*바로\s*구매하세요/, reason: '지금 바로 구매하세요', weight: 20 },
  { pattern: /지금\s*만나보세요/, reason: '지금 만나보세요', weight: 18 },
  { pattern: /놓치지\s*마세요/, reason: '놓치지 마세요', weight: 15 },
  { pattern: /역대급/, reason: '역대급', weight: 15 },
  { pattern: /대박\s*할인/, reason: '대박 할인', weight: 15 },
  { pattern: /품질\s*보장/, reason: '품질 보장', weight: 15 },
  { pattern: /건강에\s*좋습니다/, reason: '건강에 좋습니다', weight: 20 },
  { pattern: /효능\s*있습니다/, reason: '효능 있습니다', weight: 20 },
  { pattern: /첫째.*둘째.*셋째/, reason: 'AI식 나열 구조', weight: 15 },
  { pattern: /결론적으로|요약하면|정리하면/, reason: 'AI식 정리체', weight: 12 },
  { pattern: /프리미엄\s*품질/, reason: '프리미엄 품질', weight: 12 },
  { pattern: /지금\s*주문하세요/, reason: '지금 주문하세요', weight: 15 },
];

function calcBoringScore(text: string): { boring_score: number; reasons: string[] } {
  let total = 0;
  const reasons: string[] = [];
  for (const { pattern, reason, weight } of BORING_PATTERNS) {
    if (pattern.test(text)) { total += weight; reasons.push(reason); }
  }
  // 구조적 지루함
  const sensoryWords = text.match(/달콤|아삭|쫀득|바삭|촉촉|향|과즙|터지|물씬|식감|뜨거운|차가운|시원한|쫄깃|고소한/g);
  if (!sensoryWords || sensoryWords.length === 0) { total += 10; reasons.push('감각 표현 없음'); }
  if (!/있잖아|솔직히|근데|사실|그래서|아\s|어\b|진짜|되게|완전/.test(text)) { total += 8; reasons.push('구어체 없음'); }
  const lineBreaks = (text.match(/\n/g) || []).length;
  if (text.length > 50 && lineBreaks < 2) { total += 8; reasons.push('줄바꿈 부족'); }
  return { boring_score: Math.min(100, total), reasons };
}

// Risk Guard
function calcRiskScore(text: string): { risk_score: number; risk_flags: string[] } {
  let total = 0;
  const flags: string[] = [];
  if (/효능|치료|예방|면역\s*강화|항산화|항암/.test(text)) { total += 25; flags.push('health_claim'); }
  if (/다이어트\s*효과|살\s*빠지|체중\s*감량/.test(text)) { total += 25; flags.push('health_claim'); }
  if (/건강에\s*좋/.test(text)) { total += 20; flags.push('health_claim'); }
  if (/최고|역대급|세상에서.*제일/.test(text)) { total += 20; flags.push('exaggeration'); }
  if (/100%\s*(만족|보장|천연)/.test(text)) { total += 20; flags.push('exaggeration'); }
  if (/대박\s*할인|파격\s*세일|최저가/.test(text)) { total += 15; flags.push('price_spam'); }
  if (/품절\s*임박|마지막\s*\d+개/.test(text)) { total += 20; flags.push('fake_scarcity'); }
  if (/매출\s*보장|성공\s*보장|수익\s*보장/.test(text)) { total += 25; flags.push('revenue_guarantee'); }
  if (text.length > 500) { total += 10; flags.push('possible_plagiarism'); }
  return { risk_score: Math.min(100, total), risk_flags: [...new Set(flags)] };
}

// Copy Judge
function judgeCopyServer(text: string, platform: string, productTruth: any, buyerDesires: string[]): any {
  // Hook score
  let hookScore = 50;
  const firstLine = text.split('\n')[0]?.trim() || '';
  if (firstLine.length <= 7) hookScore += 20;
  else if (firstLine.length <= 15) hookScore += 15;
  else if (firstLine.length > 30) hookScore -= 10;
  if (/\?/.test(firstLine)) hookScore += 5;
  if (/있잖아|솔직히|근데|사실/.test(firstLine)) hookScore += 5;
  hookScore = Math.max(0, Math.min(100, hookScore));

  // Sensory score
  let sensoryScore = 40;
  const sensoryWords = text.match(/달콤|아삭|쫀득|바삭|촉촉|향|과즙|터지|물씬|식감|뜨거운|차가운|시원한|쫄깃|고소한/g) || [];
  if (sensoryWords.length >= 3) sensoryScore += 30;
  else if (sensoryWords.length >= 1) sensoryScore += 15;
  else sensoryScore -= 10;
  if (/열었|베어물|올려|삶|구워|갈랐|터지|흐르|퍼지/.test(text)) sensoryScore += 15;
  sensoryScore = Math.max(0, Math.min(100, sensoryScore));

  // Buyer desire score
  let buyerDesireScore = 50;
  const desireKeywords: Record<string, string[]> = {
    nostalgia: ['추억','어릴','할머니','시골','옛날'],
    seasonal_craving: ['여름','겨울','제철','시즌','수확'],
    family_care: ['아이','엄마','가족','부모'],
    gift: ['선물','보내','감사','명절'],
    scarcity_timing: ['한정','마감','지금','마지막'],
    sensory_imagination: ['달콤','아삭','쫀득','향','과즙','바삭'],
    trust: ['직송','농장','산지','무농약'],
    convenience: ['간편','바로','손질','배송'],
    identity: ['파','팀','취향','나는'],
    community_participation: ['댓글','투표','공유','DM','알려'],
  };
  let matched = 0;
  for (const d of buyerDesires) {
    const kws = desireKeywords[d] || [];
    if (kws.some(kw => text.includes(kw))) matched++;
  }
  if (matched >= 2) buyerDesireScore += 25;
  else if (matched >= 1) buyerDesireScore += 10;
  else buyerDesireScore -= 10;
  buyerDesireScore = Math.max(0, Math.min(100, buyerDesireScore));

  // Product truth score
  let productTruthScore = 50;
  const sensoryMatched = (productTruth.sensory_points || []).filter((sp: string) => text.includes(sp));
  if (sensoryMatched.length >= 2) productTruthScore += 20;
  else if (sensoryMatched.length >= 1) productTruthScore += 10;
  const avoidViolated = (productTruth.avoid_claims || []).filter((ac: string) => text.includes(ac));
  if (avoidViolated.length > 0) productTruthScore -= 20;
  productTruthScore = Math.max(0, Math.min(100, productTruthScore));

  // Platform fit score
  let platformFitScore = 60;
  const lines = text.split('\n').filter((l: string) => l.trim());
  if (platform === 'threads' && lines.length >= 3 && lines.length <= 8) platformFitScore += 15;
  if (/구매하세요|주문하세요|할인|특가/.test(text)) platformFitScore -= 15;
  if (/\?|댓글|알려|어떻게|DM/.test(text)) platformFitScore += 10;
  platformFitScore = Math.max(0, Math.min(100, platformFitScore));

  // Mawi voice score
  let mawiVoiceScore = 70;
  const bannedFound = MAWI_BANNED_PHRASES.filter(p => text.toLowerCase().includes(p.toLowerCase()));
  mawiVoiceScore -= bannedFound.length * 15;
  if (firstLine.length <= 7) mawiVoiceScore += 10;
  else if (firstLine.length > 30) mawiVoiceScore -= 10;
  if (lines.length >= 3) mawiVoiceScore += 5;
  if (sensoryWords.length >= 2) mawiVoiceScore += 10;
  else if (sensoryWords.length === 0) mawiVoiceScore -= 5;
  if (/있잖아|솔직히|근데|사실|그래서/.test(text)) mawiVoiceScore += 5;
  if (/첫째|둘째|셋째|결론적으로|요약하면/.test(text)) mawiVoiceScore -= 15;
  if (/구매하세요|주문하세요|클릭하세요/.test(text)) mawiVoiceScore -= 10;
  mawiVoiceScore = Math.max(0, Math.min(100, mawiVoiceScore));

  // Originality score
  let originalityScore = 60;
  const boringResult = calcBoringScore(text);
  if (boringResult.reasons.filter(r => BORING_PATTERNS.some(bp => bp.reason === r)).length === 0) originalityScore += 20;
  else originalityScore -= boringResult.reasons.length * 3;
  if (lines.length >= 3) originalityScore += 10;
  originalityScore = Math.max(0, Math.min(100, originalityScore));

  // Action score
  let actionScore = 50;
  if (/\?/.test(text)) actionScore += 10;
  if (/댓글|DM|알려|어떻게|추천/.test(text)) actionScore += 15;
  if (/vs|대|파\b|팀/.test(text)) actionScore += 10;
  actionScore = Math.max(0, Math.min(100, actionScore));

  const { risk_score, risk_flags } = calcRiskScore(text);
  const { boring_score } = boringResult;

  const finalScore = Math.max(0, Math.min(100, Math.round(
    hookScore * 0.15 + sensoryScore * 0.12 + buyerDesireScore * 0.12 +
    productTruthScore * 0.12 + platformFitScore * 0.10 + mawiVoiceScore * 0.15 +
    originalityScore * 0.10 + actionScore * 0.08 +
    risk_score * -0.08 + boring_score * -0.08
  )));

  const recommended = finalScore >= 60 && risk_score < 40 && boring_score < 30;
  const rewriteRequired = !recommended || boring_score >= 30 || risk_score >= 40;
  let rewriteReason = '';
  if (boring_score >= 30) rewriteReason = 'generic_ad_copy';
  else if (risk_score >= 40) rewriteReason = 'risk_violation';
  else if (finalScore < 60) rewriteReason = 'low_quality';

  return {
    hook_score: hookScore, sensory_score: sensoryScore, buyer_desire_score: buyerDesireScore,
    product_truth_score: productTruthScore, platform_fit_score: platformFitScore,
    mawi_voice_score: mawiVoiceScore, originality_score: originalityScore, action_score: actionScore,
    risk_score, boring_score, final_score: finalScore, recommended, rewrite_required: rewriteRequired,
    risk_flags, rewrite_reason: rewriteReason,
  };
}

// ═══ handleCopyBrainGenerate ═══
async function handleCopyBrainGenerate(params: any) {
  const {
    product, platform = 'threads',
    outputTypes = ['headline_copy','threads_post','thumbnail_copy','shorts_script_15s','outreach_email_draft'],
    sourceKeyword = '', count = 3, dryRun = true, viralContentIds,
  } = params;
  if (!product) return { success: false, error: 'product required' };

  const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
  if (!OPENAI_KEY && !dryRun) return { success: false, error: 'OPENAI_API_KEY not configured' };

  // 1. Product Truth
  const productTruth = resolveProductTruth(product);

  // 2. Buyer Desires
  const buyerDesires = resolveBuyerDesires(product, platform);

  // 3. Viral Content (Hot Content) 조회 — readViralContentSwipeRows 패턴
  // Product alias 매핑 (peach↔복숭아, corn↔옥수수 등)
  const PRODUCT_ALIASES: Record<string, string[]> = {
    '복숭아': ['복숭아','peach','황도','백도','천도'],
    '옥수수': ['옥수수','corn','찰옥수수','단옥수수','초당옥수수'],
    '절임배추': ['절임배추','kimchi_cabbage','배추','김장배추'],
    '고구마': ['고구마','sweet_potato'],
    '사과': ['사과','apple'],
  };
  function productMatchesAlias(sourceProduct: string, targetProduct: string): boolean {
    const sp = (sourceProduct || '').toLowerCase().trim();
    const tp = (targetProduct || '').toLowerCase().trim();
    if (!sp || !tp) return false;
    if (sp.includes(tp) || tp.includes(sp)) return true;
    // alias 그룹 매칭
    for (const aliases of Object.values(PRODUCT_ALIASES)) {
      const spMatch = aliases.some(a => sp.includes(a.toLowerCase()));
      const tpMatch = aliases.some(a => tp.includes(a.toLowerCase()));
      if (spMatch && tpMatch) return true;
    }
    return false;
  }

  let viralContents: any[] = [];
  let usedContentIds: string[] = [];
  try {
    const data = await sheetsRead('viral_content_swipe');
    const values = data?.values || [];
    if (values.length > 1) {
      const headers = values[0];
      const rows = values.slice(1).map((row: any[]) => {
        const obj: any = {};
        headers.forEach((h: string, i: number) => { obj[h] = row[i] || ''; });
        return obj;
      });
      // COPY-BRAIN-A.1C: TEST row 분리 정송 - TEST_ 포함 notes 제외 (includeTest 지정 시 제외 안 함)
      const _includeTest = params?.includeTest === true;
      let filtered = rows.filter((r: any) => _includeTest || !String(r.notes || '').includes('TEST_'));
      if (viralContentIds && viralContentIds.length > 0) {
        // viralContentIds 직접 지정 시 해당 rows
        filtered = filtered.filter((r: any) => viralContentIds.includes(r.id));
      } else {
        // product alias 매칭 + sourceKeyword 기준
        if (product) filtered = filtered.filter((r: any) => !r.source_product || productMatchesAlias(r.source_product, product));
        if (sourceKeyword) filtered = filtered.filter((r: any) => !r.source_keyword || r.source_keyword.includes(sourceKeyword));
      }
      viralContents = filtered.slice(-5); // 최근 5개
      usedContentIds = viralContents.map((v: any) => v.id).filter(Boolean);
    }
  } catch (e) { /* viral_content_swipe 없으면 빈 배열 */ }

  // 4. Copy DNA 추출 — 실제 Copy DNA Extractor 사용
  const dnaSource = viralContents.length > 0 ? 'viral_content_swipe' : 'rules_only';
  const usedViralContentCount = viralContents.length;

  // Copy DNA Extractor: extractCopyDnaFromSwipe 로직 인라인 (Vercel serverless에서 src/lib import 불가)
  const extractedDNAs = viralContents.map((v: any) => {
    const hookText = v.hook_text || '';
    const thumbnailText = v.thumbnail_text || '';
    const postSummary = v.post_summary || '';
    const combinedText = `${hookText} ${thumbnailText} ${postSummary}`;

    // Hook type 감지
    let hookType = 'sensory_hook';
    if (/vs|대|파\s|팀\s|논쟁|대결/i.test(combinedText)) hookType = 'conflict_hook';
    else if (/사실|고백|솔직히|비밀|몰랐/.test(combinedText)) hookType = 'confession_hook';
    else if (/여름|겨울|봄|가을|제철|이맘때|올해|시즌|수확/.test(combinedText)) hookType = 'seasonal_hook';
    else if (/달콤|아삭|쫀득|바삭|촉촉|향|과즙|터지|물씬|식감|맛/.test(combinedText)) hookType = 'sensory_hook';
    else if (/사실은|반대로|오히려|의외로/.test(combinedText)) hookType = 'contrarian_hook';
    else if (/산지|직송|농장|직접|해남|영주|청송/.test(combinedText)) hookType = 'local_trust_hook';
    else if (/어릴\s*때|추억|그때|할머니|시골/.test(combinedText)) hookType = 'memory_hook';
    else if (/한정|마감|지금|마지막|놓치/.test(combinedText)) hookType = 'limited_timing_hook';
    else if (/나는|우리는|진짜|찐|팬/.test(combinedText)) hookType = 'identity_hook';

    // Buyer desire
    let desire = v.buyer_desire || 'sensory_imagination';
    if (!v.buyer_desire) {
      const lower = combinedText.toLowerCase();
      if (/추억|어릴|할머니|시골/.test(lower)) desire = 'nostalgia';
      else if (/여름|겨울|제철|시즌|수확/.test(lower)) desire = 'seasonal_craving';
      else if (/아이|엄마|가족/.test(lower)) desire = 'family_care';
      else if (/선물|보내|감사/.test(lower)) desire = 'gift';
      else if (/한정|마감|지금|마지막/.test(lower)) desire = 'scarcity_timing';
      else if (/달콤|아삭|쫀득|향|과즙/.test(lower)) desire = 'sensory_imagination';
      else if (/직송|농장|산지/.test(lower)) desire = 'trust';
    }

    // Sensory anchor
    const sensoryWords = combinedText.match(/달콤|아삭|쫀득|바삭|촉촉|향|과즙|터지|물씬|식감/g) || [];
    const sensoryAnchor = sensoryWords.length > 0 ? sensoryWords.join(', ') : 'none';

    // Comment trigger
    const commentSignal = v.comment_signal || '';
    let commentTrigger = 'passive';
    if (/투표|vs|대|파\s/.test(commentSignal)) commentTrigger = 'vote_trigger';
    else if (/질문|어떻게|뭐|추천/.test(commentSignal)) commentTrigger = 'question_trigger';
    else if (/공감|나도|맞아/.test(commentSignal)) commentTrigger = 'empathy_trigger';

    // First line pattern
    const firstLine = hookText.split(/[.!?\n]/)[0]?.trim() || '';
    const firstLinePattern = firstLine.length <= 15 ? '짧은 임팩트형' : firstLine.length <= 30 ? '중간 서술형' : '장문 스토리형';

    // Ending style
    const endingStyle = /DM|댓글|알려|공유/.test(combinedText) ? 'cta_ending' : '여운형';

    return {
      source_content_id: v.id || '',
      hook_type: hookType,
      first_line_pattern: firstLinePattern,
      buyer_desire: desire,
      sensory_anchor: sensoryAnchor,
      comment_trigger: commentTrigger,
      ending_style: endingStyle,
      platform_pattern: v.platform || 'unknown',
    };
  });

  // Copy DNA를 프롬프트용 텍스트로 변환
  let copyDNAPromptText = '[Copy DNA] 아직 분석된 바이럴 콘텐츠 없음';
  if (extractedDNAs.length > 0) {
    const hookTypes = [...new Set(extractedDNAs.map(d => d.hook_type))];
    const desires = [...new Set(extractedDNAs.map(d => d.buyer_desire))];
    const sensoryAnchors = [...new Set(extractedDNAs.flatMap(d => d.sensory_anchor.split(', ')).filter(s => s !== 'none'))];
    const commentTriggers = [...new Set(extractedDNAs.map(d => d.comment_trigger))];
    const firstLinePatterns = [...new Set(extractedDNAs.map(d => d.first_line_pattern))];
    const endingStyles = [...new Set(extractedDNAs.map(d => d.ending_style))];
    copyDNAPromptText = `[Copy DNA 분석 결과 — viral_content_swipe 기반]
분석 콘텐츠 수: ${extractedDNAs.length}개
반응 좋은 후킹 유형: ${hookTypes.join(', ')}
주요 구매 욕망: ${desires.join(', ')}
감각 앵커: ${sensoryAnchors.join(', ') || 'none'}
댓글 트리거: ${commentTriggers.join(', ')}
첫 줄 패턴: ${firstLinePatterns.join(', ')}
엔딩 스타일: ${endingStyles.join(', ')}

이 DNA를 참고하되 원문을 복사하지 마세요. 구조와 패턴만 활용하세요.`;
  }

  // 5. Platform Formula
  const platformFormula = PLATFORM_FORMULAS[platform] || PLATFORM_FORMULAS.threads;

  // 6. Output type instructions
  const OUTPUT_INSTRUCTIONS: Record<string, string> = {
    headline_copy: '헤드카피: 15자 이내, 강렬한 첫인상, 멈추게 만드는 한 줄',
    thumbnail_copy: '썸네일 문구: 10자 이내, 클릭 유도, 시각적으로 강렬한 텍스트',
    threads_post: '스레드 글: 3~5문장, 줄바꿈 리듬, 공감+궁금증, 댓글 유도, 여운',
    shorts_script_15s: '릴스/쇼츠 스크립트 15초: [0~3초] 후킹 → [3~10초] 장면 → [10~15초] 행동 유도',
    outreach_email_draft: '공동구매 제안 메일: 제목+본문, 상대 채널 맥락, 부담 없는 답장 유도. [채널명] 표기.',
    instagram_caption: '인스타 캡션: 2~3문장, 감각 장면, 해시태그 3~5개',
    tiktok_script: '틱톡 스크립트: 빠른 후킹, 리듬감, 장면 중심',
    naver_blog_intro: '블로그 도입부: 검색형 제목 + 도입 3~5문장, 구매 전 고민 공감',
  };

  const outputInstructions = outputTypes.map((t: string, i: number) => `${i + 1}. ${OUTPUT_INSTRUCTIONS[t] || t}`).join('\n');

  // 7. Compile prompt
  const systemPrompt = `당신은 "Mawin Agricultural Copy Brain"입니다.
농산물/식품 바이럴 마케팅 전문 카피 엔진으로, 아래 데이터와 규칙을 기반으로 카피를 생성합니다.

${MAWI_VOICE_PROMPT}

[Copy Risk Guard]
절대 금지: 허위 효능, 과장 표현, 가격 스팸, 허위 재고, 매출/성공 보장, 원본 장문 복사

[Anti-Boring Filter]
아래 패턴이 감지되면 FAIL: "제철 OOO를 지금 만나보세요", "특별한 가격으로 준비했습니다", "신선하고 맛있는", "최고의 품질", "역대급", "지금 바로 구매하세요" 등

중요 원칙:
1. Product Truth, Buyer Desire, Copy DNA 데이터 기반으로 생성
2. 금지 표현 포함 시 즉시 FAIL
3. 각 카피에 hook_type, buyer_desire, angle 명시
4. 원본 장문 복사 금지`;

  const viralRef = viralContents.length > 0
    ? viralContents.slice(0, 5).map((v: any) => `- [${v.platform}] "${v.hook_text}" / ${v.engagement_visible} / ${v.hot_reason}`).join('\n')
    : '(아직 수집된 Hot Content 없음)';

  const userPrompt = `상품: ${product}
플랫폼: ${platform}
키워드: ${sourceKeyword}
생성 수: 각 타입별 ${count}개

[Product Truth: ${productTruth.product}]
핵심 진실: ${productTruth.core_truth.join(' / ')}
감각 포인트: ${productTruth.sensory_points.join(', ')}
시즌: ${productTruth.seasonal_timing}
구매 맥락: ${productTruth.buyer_contexts.join(', ')}
신뢰 시그널: ${productTruth.trust_signals.join(', ')}
금지 주장: ${productTruth.avoid_claims.join(', ')}

[Buyer Desire: ${buyerDesires.map((d: string) => `${d}(${DESIRE_LABELS[d] || d})`).join(', ')}]

[Copy DNA 참고]
${copyDNAPromptText}

[플랫폼 공식: ${platform}]
${platformFormula}

[참고 Hot Content (구조만 참고, 원문 복사 금지)]
${viralRef}

[생성 요청]
${outputInstructions}

[응답 형식 — 반드시 JSON]
{
  "copies": [
    {
      "output_type": "headline_copy",
      "generated_text": "...",
      "angle": "어떤 앵글로 접근했는지",
      "hook_type": "conflict_hook|confession_hook|seasonal_hook|sensory_hook|contrarian_hook|local_trust_hook|memory_hook|limited_timing_hook|identity_hook",
      "buyer_desire": "nostalgia|seasonal_craving|family_care|gift|scarcity_timing|sensory_imagination|trust|convenience|identity|community_participation",
      "product_truth_used": "어떤 상품 진실을 활용했는지"
    }
  ]
}`;

  if (dryRun) {
    return {
      success: true, dryRun: true, product, platform, outputTypes, sourceKeyword, count,
      dna_source: dnaSource,
      used_viral_content_count: usedViralContentCount,
      used_content_ids: usedContentIds,
      no_hot_content_available: viralContents.length === 0,
      engines: {
        productTruth: { product: productTruth.product, core_truth_count: productTruth.core_truth.length, sensory_points: productTruth.sensory_points },
        buyerDesires: buyerDesires.map((d: string) => ({ type: d, label: DESIRE_LABELS[d] || d })),
        copyDNA: { viralContentCount: usedViralContentCount, dnaSource, extractedDNACount: extractedDNAs.length, sampleHookTypes: [...new Set(extractedDNAs.map(d => d.hook_type))].slice(0, 3) },
        platformFormula: platformFormula.substring(0, 200),
        mawiVoice: 'active',
        antiBoringFilter: 'active',
        riskGuard: 'active',
        copyJudge: 'active',
      },
      prompt_preview: { system_length: systemPrompt.length, user_length: userPrompt.length, user_preview: userPrompt.substring(0, 300) + '...' },
    };
  }

  // 8. GPT API 호출
  try {
    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: 4000,
      }),
    });
    if (!gptRes.ok) {
      const errData = await gptRes.json() as any;
      return { success: false, error: `GPT API error: ${errData.error?.message || 'unknown'}`, fake_copy_generated: false };
    }
    const gptData = await gptRes.json() as any;
    const content = gptData.choices?.[0]?.message?.content || '';

    // JSON 파싱
    let parsed: any = null;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return { success: false, error: 'GPT 응답 JSON 파싱 실패', raw_preview: content.substring(0, 200), fake_copy_generated: false };
    }

    if (!parsed || !parsed.copies || !Array.isArray(parsed.copies)) {
      return { success: false, error: 'GPT 응답에 copies 배열 없음', fake_copy_generated: false };
    }

    // 9. Anti-Boring Filter + Risk Guard + Copy Judge
    const scoredCopies = parsed.copies.map((copy: any, idx: number) => {
      const text = String(copy.generated_text || '');
      const score = judgeCopyServer(text, platform, productTruth, buyerDesires);
      const copyId = `CB-${Date.now()}-${idx}`;
      return {
        copy_id: copyId,
        product,
        platform,
        output_type: copy.output_type || outputTypes[idx % outputTypes.length],
        source_keyword: sourceKeyword,
        generated_text: text,
        angle: copy.angle || '',
        hook_type: copy.hook_type || 'sensory_hook',
        buyer_desire: copy.buyer_desire || 'sensory_imagination',
        product_truth_used: copy.product_truth_used || '',
        score,
      };
    });

    // 10. Summary
    const recommended = scoredCopies.filter((c: any) => c.score.recommended);
    const rewriteRequired = scoredCopies.filter((c: any) => c.score.rewrite_required);
    const riskWarnings = scoredCopies.filter((c: any) => c.score.risk_score >= 40);
    const boringFiltered = scoredCopies.filter((c: any) => c.score.boring_score >= 30);
    const hookTypes = [...new Set(scoredCopies.map((c: any) => c.hook_type))];
    const desires = [...new Set(scoredCopies.map((c: any) => c.buyer_desire))];

    // 11. copy_generation_log 저장 — dna_source, used_viral_content_count 포함
    const now = new Date().toISOString();
    const copyDnaSummary = extractedDNAs.length > 0
      ? `hook_types:${[...new Set(extractedDNAs.map(d => d.hook_type))].join(',')};desires:${[...new Set(extractedDNAs.map(d => d.buyer_desire))].join(',')}`
      : 'none';
    const logRows = scoredCopies.map((c: any) => [
      c.copy_id, c.product, c.platform, c.output_type, c.source_keyword,
      c.generated_text, c.product_truth_used, c.buyer_desire, copyDnaSummary, c.hook_type,
      String(c.score.hook_score), String(c.score.sensory_score), String(c.score.buyer_desire_score),
      String(c.score.product_truth_score), String(c.score.platform_fit_score),
      String(c.score.mawi_voice_score), String(c.score.originality_score), String(c.score.action_score),
      String(c.score.risk_score), String(c.score.boring_score), String(c.score.final_score),
      String(c.score.recommended), (c.score.risk_flags || []).join(','),
      String(c.score.rewrite_required), dnaSource, String(usedViralContentCount), usedContentIds.join(','), copyDnaSummary, now, '',
    ]);

    try {
      await ensureHeaders('copy_generation_log');
      await sheetsAppend('copy_generation_log', logRows);
    } catch (e: any) {
      // 저장 실패해도 생성 결과는 반환
      console.error('[copy_brain] copy_generation_log 저장 실패:', e.message);
    }

    return {
      success: true, dryRun: false, product, platform,
      dna_source: dnaSource,
      used_viral_content_count: usedViralContentCount,
      used_content_ids: usedContentIds,
      no_hot_content_available: viralContents.length === 0,
      copies: scoredCopies,
      summary: {
        total: scoredCopies.length,
        recommended: recommended.length,
        rewrite_required: rewriteRequired.length,
        risk_warnings: riskWarnings.length,
        boring_filtered: boringFiltered.length,
        top_hook_types: hookTypes,
        top_buyer_desires: desires,
      },
    };
  } catch (e: any) {
    return { success: false, error: `Copy Brain 생성 실패: ${e.message}`, fake_copy_generated: false };
  }
}

// ═══ handleCopyBrainScore: 기존 카피 점수 재계산 ═══
async function handleCopyBrainScore(params: any) {
  const { text, product, platform = 'threads' } = params;
  if (!text) return { success: false, error: 'text required' };

  const productTruth = resolveProductTruth(product || '기타');
  const buyerDesires = resolveBuyerDesires(product || '기타', platform);
  const score = judgeCopyServer(text, platform, productTruth, buyerDesires);

  return { success: true, text: text.substring(0, 100) + '...', product, platform, score };
}

// ═══ handleCopyBrainFeedbackSave: 피드백 저장 ═══
async function handleCopyBrainFeedbackSave(params: any) {
  const { copy_id, feedback, reason, edited_text, product, platform } = params;
  if (!copy_id || !feedback) return { success: false, error: 'copy_id and feedback required' };

  const feedbackId = `FB-${Date.now()}`;
  const now = new Date().toISOString();
  const row = [feedbackId, copy_id, feedback, reason || '', edited_text || '', product || '', platform || '', now, ''];

  try {
    await ensureHeaders('copy_feedback_log');
    await sheetsAppend('copy_feedback_log', [row]);
    return { success: true, feedback_id: feedbackId, copy_id, saved: true };
  } catch (e: any) {
    return { success: false, error: `피드백 저장 실패: ${e.message}` };
  }
}

// ═══ handleCopyBrainList: 생성 로그 조회 ═══
async function handleCopyBrainList(params: any) {
  const { product, platform, limit = 20, recommendedOnly = false } = params;

  try {
    await ensureHeaders('copy_generation_log');
    const data = await sheetsRead('copy_generation_log');
    const values = data?.values || [];
    if (!values || values.length <= 1) return { success: true, items: [], total: 0, source: 'google_sheets', sheet: 'copy_generation_log' };

    const headers = values[0];
    let rows = values.slice(1).map((row: any[]) => {
      const obj: any = {};
      headers.forEach((h: string, i: number) => { obj[h] = row[i] || ''; });
      return obj;
    });

    if (product) rows = rows.filter((r: any) => r.product === product);
    if (platform) rows = rows.filter((r: any) => r.platform === platform);
    if (recommendedOnly) rows = rows.filter((r: any) => r.recommended === 'true');

    // 최신순, limit 적용
    rows = rows.reverse().slice(0, limit);

    return {
      success: true,
      items: rows,
      total: rows.length,
      source: 'google_sheets',
      sheet: 'copy_generation_log',
      summary: {
        recommended: rows.filter((r: any) => r.recommended === 'true').length,
        rewrite_required: rows.filter((r: any) => r.rewrite_required === 'true').length,
        risk_warnings: rows.filter((r: any) => parseInt(r.score_risk) >= 40).length,
        boring_filtered: rows.filter((r: any) => parseInt(r.boring_score) >= 30).length,
        avg_final_score: rows.length > 0 ? Math.round(rows.reduce((a: number, r: any) => a + (parseInt(r.final_score) || 0), 0) / rows.length) : 0,
        top_hook_types: [...new Set(rows.map((r: any) => r.hook_type).filter(Boolean))],
        top_buyer_desires: [...new Set(rows.map((r: any) => r.buyer_desire).filter(Boolean))],
        dna_sources: {
          viral_content_swipe: rows.filter((r: any) => r.dna_source === 'viral_content_swipe').length,
          rules_only: rows.filter((r: any) => r.dna_source === 'rules_only' || !r.dna_source).length,
        },
      },
    };
  } catch (e: any) {
    const msg = e.message || '';
    if (msg.includes('403') || msg.includes('permission')) {
      return { success: false, errorCode: 'SHEETS_PERMISSION_ERROR', errorMessage: 'copy_generation_log 조회 권한 확인 필요' };
    }
    if (msg.includes('404') || msg.includes('Unable to parse range')) {
      return { success: false, errorCode: 'SHEETS_SCOPE_ERROR', errorMessage: 'copy_generation_log 탭 또는 범위 확인 필요' };
    }
    return { success: false, errorCode: 'SHEETS_READ_ERROR', errorMessage: `copy_generation_log 읽기 실패: ${msg.substring(0, 100)}` };
  }
}
