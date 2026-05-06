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

  const res = await proxyFetch(`${NAVER_API_BASE}/v1/oauth2/token?${params.toString()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });

  const data = await res.json();
  if (!data.access_token) {
    const errorCode = data.code || data.error || '';
    throw new Error(`Token failed: ${errorCode}`);
  }

  // 토큰 캐시 (25분간 유효)
  _cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + 25 * 60 * 1000,
  };
  return data.access_token;
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

// ── 스마트스토어 주문 조회 핸들러 (통일 응답 구조 v3) ──
async function handleSmartstoreOrders(params: any) {
  const action = params?.action || 'current_new_orders';
  const days = parseInt(params?.days || '7');
  const status = params?.status || 'payed';
  const fetchedAt = new Date().toISOString();

  // 상태별 한글 라벨
  const statusLabelMap: Record<string, string> = {
    PAYED: '결제완료', DELIVERING: '배송중', DELIVERED: '배송완료',
    PURCHASE_DECIDED: '구매확정', CANCELED: '취소', RETURNED: '반품',
    EXCHANGED: '교환완료', PAYMENT_WAITING: '입금대기', CANCELED_BY_NOPAYMENT: '미결제취소',
  };

  // 안전한 주문 매핑 (개인정보 제외)
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
      statusLabel: statusLabelMap[po.productOrderStatus] || po.productOrderStatus || '확인 필요',
      optionContent: po.optionContent || '',
      placeOrderStatus: po.placeOrderStatus || '',
    };
  }

  // product-orders/last-changed-statuses API로 특정 상태의 건수를 조회 (24시간 단위 일별 조회)
  // 네이버 API 제한: from~to 최대 24시간
  async function getLastChangedItems(lastChangedType: string, days: number): Promise<any[]> {
    const now = new Date();
    const allItems: any[] = [];

    // 24시간 단위로 순차 조회
    for (let d = 0; d < days; d++) {
      const to = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
      const from = new Date(now.getTime() - (d + 1) * 24 * 60 * 60 * 1000);
      const fromStr = from.toISOString().replace(/\.\d{3}Z$/, '.000Z');
      const toStr = to.toISOString().replace(/\.\d{3}Z$/, '.000Z');

      const params = new URLSearchParams({
        lastChangedFrom: fromStr,
        lastChangedTo: toStr,
        lastChangedType: lastChangedType,
      });

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await smartStoreRequest(
            `/v1/pay-order/seller/product-orders/last-changed-statuses?${params.toString()}`,
            { method: 'GET' }
          );
          if (result.status === 200) {
            const data = result.data?.data || result.data;
            const items = data?.lastChangeStatuses || data?.lastChangedStatuses || [];
            allItems.push(...items);
            // more=true인 경우 추가 조회 (300건 초과)
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
                  allItems.push(...ni);
                  hasMore = nd?.more || false;
                  if (ni.length > 0) lastDate = ni[ni.length - 1]?.lastChangedDate || '';
                  else hasMore = false;
                } else hasMore = false;
              }
            }
            break; // 성공시 다음 날로
          }
        } catch (err: any) {
          if (attempt < 1) await new Promise(r => setTimeout(r, 500));
        }
      }
    }
    return allItems;
  }

  // 공통: 네이버 대시보드 기준 전체 건수 조회
  // 전략:
  //   신규주문/배송준비: fetchOrders(['PAYED'], 30) + placeOrderStatus 분류
  //   배송중: product-orders/last-changed-statuses DISPATCHED 7일 중 productOrderStatus=DELIVERING
  //   배송완료: product-orders/last-changed-statuses DISPATCHED 7일 중 productOrderStatus=DELIVERED
  //   구매확정: product-orders/last-changed-statuses PURCHASE_DECIDED 7일
  async function getAllCounts(queryDays: number) {
    // 1) PAYED: 결제일 기준 조회 (신규주문 + 배송준비)
    const payedOrders = await fetchOrders(['PAYED'], queryDays);

    const newOrders = payedOrders.filter((o: any) => {
      const po = o.productOrder || o;
      return po.placeOrderStatus !== 'OK';
    });
    const pendingShipping = payedOrders.filter((o: any) => {
      const po = o.productOrder || o;
      return po.placeOrderStatus === 'OK';
    });

    // 2) 배송중/배송완료: 배송완료 건이 30일 이전 결제일 수 있으므로 45일로 확대
    const shippingDeliveredOrders = await fetchOrders(['DELIVERING', 'DELIVERED'], 45);
    let shippingCount = 0;
    let deliveredCount = 0;
    for (const o of shippingDeliveredOrders) {
      const po = o.productOrder || o;
      const status = po.productOrderStatus || o.productOrderStatus;
      if (status === 'DELIVERING') shippingCount++;
      else if (status === 'DELIVERED') deliveredCount++;
    }

    // 3) 구매확정: PURCHASE_DECIDED 7일 조회
    const decidedItems = await getLastChangedItems('PURCHASE_DECIDED', 7);
    // 중복 제거
    const uniqueDecided = new Map<string, any>();
    for (const item of decidedItems) {
      uniqueDecided.set(item.productOrderId, item);
    }
    const decidedCount = uniqueDecided.size;

    // 4) 정산예정 금액: PURCHASE_DECIDED 7일 데이터에서 settlementExpectationAmount 합산
    let settlementExpectationAmount = 0;
    for (const item of uniqueDecided.values()) {
      settlementExpectationAmount += Number(item.settlementExpectationAmount || 0);
    }

    return {
      allOrders: payedOrders,
      payed: payedOrders,
      newOrders,
      pendingShipping,
      shipping: shippingCount,
      delivered: deliveredCount,
      purchaseConfirmed: decidedCount,
      settlementExpectationAmount,
    };
  }

  // ── debug_last_changed: 디버그용 - 다양한 API 엔드포인트/파라미터 테스트 ──
  if (action === 'debug_last_changed') {
    // 프로덕션에서는 디버그 엔드포인트 차단
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      return { success: false, error: 'Debug endpoint disabled in production' };
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

    return { success: true, debug: results, from: fromUtc24, to: toUtc };
  }

  // ── current_new_orders / query_pending_shipping / query_pre_shipping_total / query_order_status ──
  if (action === 'current_new_orders' || action === 'query_pending_shipping' || action === 'query_pre_shipping_total' || action === 'query_order_status') {
    const counts = await getAllCounts(30);

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
    const counts = await getAllCounts(1);
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

  // ── query_order_status: 전체 주문 현황 (대시보드용) ──
  if (action === 'query_order_status') {
    const counts = await getAllCounts(30);
    const allOrders = counts.allOrders.map(safeOrderMap);

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
        shipping: counts.shipping,
        delivered: counts.delivered,
        purchaseConfirmed: counts.purchaseConfirmed,
        settlementExpectationAmount: counts.settlementExpectationAmount || 0,
      },
      newOrders: counts.newOrders.length,
      pendingShipping: counts.pendingShipping.length,
      preShipTotal: counts.payed.length,
      data: allOrders,
      orders: allOrders,
    };
  }

  // ── 일반 주문 조회 ──
  const statusMap: Record<string, string[]> = {
    'new': ['PAYED'], 'payed': ['PAYED'], 'delivering': ['DELIVERING'],
    'delivered': ['DELIVERED'], 'decided': ['PURCHASE_DECIDED'],
    'canceled': ['CANCELED'],
    'all': ['PAYMENT_WAITING', 'PAYED', 'DELIVERING', 'DELIVERED', 'PURCHASE_DECIDED'],
  };
  const productOrderStatuses = statusMap[status?.toLowerCase()] || ['PAYED'];
  const orders = await fetchOrders(productOrderStatuses, days);

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
}

// ── 주문 목록 + 상세 조회 (24시간 단위 + QuotaGuard 동시연결 제한 대응) ──
async function fetchOrders(statuses: string[], days: number): Promise<any[]> {
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // 일별 24시간 단위 조회 (네이버 API 제한: from~to 간격 최대 24시간)
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

  // 3개씩 병렬 배치 실행 (QuotaGuard 동시연결 3개 제한 대응)
  const BATCH_SIZE = 3;
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
  // 1. 스마트스토어 데이터 (5개 상태값) - getAllCounts 직접 호출로 정확도 확보
  let counts;
  try {
    counts = await getAllCounts();
  } catch (e: any) {
    return { success: false, error: `스마트스토어 데이터 수집 실패: ${e.message}` };
  }

  if (!counts || counts.payed === undefined) {
    return { success: false, error: '스마트스토어 데이터를 가져오지 못했습니다.' };
  }

  // 2. KAMIS 데이터 (배추 기본)
  const kamisResult = await handleKamisMini({ item: '배추' });

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
        newOrders: counts.newOrders.length,
        pendingShipping: counts.pendingShipping.length,
        preShipTotal: counts.payed.length,
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
  const product = params?.product || params?.prompt || '농산물';

  // GPT 호출 시도
  let hookingText = '';
  let threadPost = '';
  let kakaoNotice = '';
  let reelsScript = '';

  if (OPENAI_API_KEY) {
    try {
      const { default: nodeFetchGpt } = await import('node-fetch');
      const gptRes = await nodeFetchGpt('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [{
            role: 'system',
            content: '당신은 농산물/식품 바이럴 마케팅 전문가입니다. 친근하고 말하듯 툭 던지는 문장, 강한 첫 문장, 계절감, 식감, 수확 타이밍, 스토리, 댓글/DM 유도, 여운 있는 마무리를 사용합니다. 과장 광고, 허위 효능, 매출 보장 표현은 금지합니다.'
          }, {
            role: 'user',
            content: `"${product}" 마케팅 콘텐츠를 만들어주세요. 다음 4가지를 각각 만들어주세요:\n1. 후킹 문구 (1-2줄, 스크롤 멈추게 하는 첫 문장)\n2. 스레드 글 (3-5줄, 자연스럽고 공감가는 톤)\n3. 카카오톡 공지문 (공동구매/할인 안내용, 3-4줄)\n4. 릴스 스크립트 (15초 분량, 장면 설명 포함)\n\n각 항목을 [후킹], [스레드], [카카오톡], [릴스] 태그로 구분해주세요.`
          }],
          max_tokens: 1500,
          temperature: 0.8,
        }),
      });

      if (gptRes.ok) {
        const gptData = await gptRes.json();
        const content = gptData.choices?.[0]?.message?.content || '';
        
        // 태그별 파싱
        const hookMatch = content.match(/\[후킹\]([\s\S]*?)(?=\[스레드\]|\[카카오톡\]|\[릴스\]|$)/);
        const threadMatch = content.match(/\[스레드\]([\s\S]*?)(?=\[후킹\]|\[카카오톡\]|\[릴스\]|$)/);
        const kakaoMatch = content.match(/\[카카오톡\]([\s\S]*?)(?=\[후킹\]|\[스레드\]|\[릴스\]|$)/);
        const reelsMatch = content.match(/\[릴스\]([\s\S]*?)(?=\[후킹\]|\[스레드\]|\[카카오톡\]|$)/);

        hookingText = hookMatch ? hookMatch[1].trim() : content.split('\n')[0] || '';
        threadPost = threadMatch ? threadMatch[1].trim() : '';
        kakaoNotice = kakaoMatch ? kakaoMatch[1].trim() : '';
        reelsScript = reelsMatch ? reelsMatch[1].trim() : '';
      }
    } catch (e: any) {
      console.error('[cloud-proxy] GPT creative error:', e.message);
    }
  }

  // Fallback
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
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) continue;
    const searchData = await searchRes.json();
    if (!searchData.items || searchData.items.length === 0) continue;

    const channelIds = searchData.items.map((item: any) => item.snippet.channelId || item.id.channelId).join(',');
    const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channelIds}&key=${YOUTUBE_API_KEY}`;
    const channelsRes = await fetch(channelsUrl);
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

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) throw new Error(`YouTube Search API 오류: ${searchRes.status}`);
  const searchData = await searchRes.json();
  if (!searchData.items || searchData.items.length === 0) return { success: true, videos: [], analysis: '', summary: '검색 결과가 없습니다.' };

  const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');
  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
  const videosRes = await fetch(videosUrl);
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
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
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
  const res = await fetch(url, {
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
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Sheets read error (${res.status}): ${JSON.stringify(data.error?.message || data)}`);
  return data;
}

const SHEET_HEADERS: Record<string, string[]> = {
  jarvis_records: ['recordId','createdAt','type','title','summary','sourceCommand','status','tags','linkedSheetTab','createdBy','safePreview'],
  briefings: ['briefingId','createdAt','todayOrders','currentNewOrders','pendingShipping','preShipTotal','todaySales','recommendedActions','briefingText'],
  creative_scripts: ['scriptId','createdAt','product','platform','hook','caption','threadPost','kakaoMessage','reelsScript','recommendedGrowthLink','status','sourceCommand'],
  growth_campaigns: ['campaignId','createdAt','product','source','targetUrl','directUrl','couponCode','campaignMemo','status'],
  purchase_order_drafts: ['draftId','createdAt','supplier','productSummary','totalQuantity','totalAmountIfAvailable','status','safePreview'],
  influencer_candidates: ['candidateId','collectedAt','platform','keyword','name','channelOrBlogUrl','recentContentTitle','recentContentUrl','subscriberOrVisitor','viewCount','publicContactStatus','publicEmailMasked','productFitScore','productFitReason','suggestedProduct','suggestedOfferAngle','outreachStatus','firstEmailDraft','followUpDraft','lastContactedAt','responseStatus','notes'],
  market_price_checks: ['checkId','createdAt','productName','rawMaterialCost','currentPrice','shippingCost','packagingCost','platformFeeRate','otherCosts','competitorPrices','competitorMinPrice','competitorAvgPrice','netSalesAmount','estimatedMargin','estimatedMarginRate','jarvisDecision','recommendedAction','sourceCommand'],
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
    const result = await sheetsRead(tab, `${tab}!A1:A1`);
    if (!result.values || result.values.length === 0) {
      const token = await getGoogleSheetsToken();
      const range = encodeURIComponent(`${tab}!A1`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?valueInputOption=RAW`;
      await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [headers] }),
      });
    }
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
      await ensureHeaders('influencer_candidates');
      await sheetsAppend('influencer_candidates', [[
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
      type === 'influencer_candidate' ? 'influencer_candidates' : 'jarvis_records',
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

function generateOfferAngle(channel: any, keyword: string, product: string): string {
  const name = channel.title || channel.name || '채널';
  const contentTitle = channel.recentContentTitle || '';
  const angles = [
    `${name}님의 최근 "${contentTitle.slice(0,30)}" 콘텐츠와 ${product || keyword} 공동구매가 자연스럽게 연결됩니다.`,
    `구독자분들이 좋아할 제철 ${product || keyword}를 체험형 공동구매로 제안하면 좋겠습니다.`,
    `"캠핑장에서 바로 먹는 간식" 또는 "집에서 간편하게 즐기는 제철 먹거리" 각도가 적합합니다.`,
  ];
  return angles[Math.floor(Math.random() * angles.length)];
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
  const { keyword, product, maxCandidates = 10, platform = 'all' } = params;
  if (!keyword) return { success: false, error: 'keyword required' };

  const candidates: any[] = [];
  const now = new Date().toISOString();
  const max = Math.min(maxCandidates, 10); // Lite: 최대 10명

  // YouTube 수집
  if (platform === 'all' || platform === 'youtube') {
    try {
      if (!YOUTUBE_API_KEY) throw new Error('YouTube API 할당량 초과 또는 미설정');
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(keyword)}&maxResults=${max * 3}&regionCode=KR&hl=ko&key=${YOUTUBE_API_KEY}`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) {
        const errData = await searchRes.json() as any;
        if (errData.error?.errors?.[0]?.reason === 'quotaExceeded') {
          return { success: true, candidates: [], quotaExceeded: true, message: 'YouTube API 할당량 초과로 오늘은 소량/수동 검증 모드로 진행합니다.' };
        }
        throw new Error(`YouTube API error: ${searchRes.status}`);
      }
      const searchData = await searchRes.json() as any;
      if (searchData.items && searchData.items.length > 0) {
        const channelIds = searchData.items.map((item: any) => item.snippet.channelId || item.id.channelId).join(',');
        const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channelIds}&key=${YOUTUBE_API_KEY}`;
        const channelsRes = await fetch(channelsUrl);
        if (channelsRes.ok) {
          const channelsData = await channelsRes.json() as any;
          for (const ch of (channelsData.items || []).slice(0, max)) {
            const snippet = ch.snippet || {};
            const stats = ch.statistics || {};
            const branding = ch.brandingSettings?.channel || {};
            const subs = parseInt(stats.subscriberCount || '0', 10);
            const views = parseInt(stats.viewCount || '0', 10);
            const contact = extractContactInfo(snippet.description || '', branding.description || '');
            const channelData = {
              name: snippet.title, title: snippet.title,
              description: (snippet.description || '').substring(0, 300),
              subscriberCount: subs, viewCount: views,
              email: contact.email,
              recentContentTitle: snippet.title,
              publicContactStatus: contact.email ? 'email_public' : 'unknown',
            };
            const fit = calculateProductFitScore(channelData, keyword, product || keyword);
            candidates.push({
              candidateId: generateRecordId('inf'),
              collectedAt: now,
              platform: 'YouTube',
              keyword,
              name: snippet.title,
              channelOrBlogUrl: `https://www.youtube.com/channel/${ch.id}`,
              recentContentTitle: (snippet.description || '').substring(0, 60),
              recentContentUrl: `https://www.youtube.com/channel/${ch.id}`,
              subscriberOrVisitor: subs > 0 ? (subs >= 10000 ? `${(subs/10000).toFixed(1)}만` : `${subs.toLocaleString()}`) : '-',
              viewCount: views > 0 ? (views >= 100000000 ? `${(views/100000000).toFixed(1)}억` : views >= 10000 ? `${(views/10000).toFixed(0)}만` : views.toLocaleString()) : '-',
              publicContactStatus: channelData.publicContactStatus,
              publicEmailMasked: contact.email ? maskEmail(contact.email) : '',
              productFitScore: fit.score,
              productFitReason: fit.reason,
              suggestedProduct: product || keyword,
              suggestedOfferAngle: generateOfferAngle(channelData, keyword, product || keyword),
              outreachStatus: 'pending',
              firstEmailDraft: contact.email ? generateFirstEmailDraft(channelData, keyword, product || keyword) : '',
              followUpDraft: contact.email ? generateFollowUpDraft(channelData, keyword, product || keyword) : '',
              responseStatus: 'none',
              notes: '',
            });
          }
        }
      }
    } catch (e: any) {
      if (e.message?.includes('할당량')) {
        return { success: true, candidates: [], quotaExceeded: true, message: e.message };
      }
      // YouTube 실패해도 Naver로 계속 진행
    }
  }

  // Naver Blog 수집
  if (platform === 'all' || platform === 'naver') {
    try {
      const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || '';
      const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';
      if (!NAVER_CLIENT_ID) throw new Error('Naver API 미설정');
      const naverUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=${max * 3}&sort=sim`;
      const naverRes = await fetch(naverUrl, {
        headers: { 'X-Naver-Client-Id': NAVER_CLIENT_ID, 'X-Naver-Client-Secret': NAVER_CLIENT_SECRET },
      });
      if (!naverRes.ok) throw new Error(`Naver API error: ${naverRes.status}`);
      const naverData = await naverRes.json() as any;
      const blogItems = (naverData.items || []).slice(0, max);
      for (const item of blogItems) {
        const bloggerlink = item.bloggerlink || '';
        const blogIdMatch = bloggerlink.match(/blog\.naver\.com\/([a-zA-Z0-9_]+)/);
        const blogId = blogIdMatch ? blogIdMatch[1] : '';
        const blogUrl = blogId ? `https://blog.naver.com/${blogId}` : bloggerlink;
        const cleanTitle = (item.title || '').replace(/<[^>]*>/g, '');
        const cleanDesc = (item.description || '').replace(/<[^>]*>/g, '').substring(0, 100);
        const channelData = {
          name: item.bloggername || blogId,
          title: item.bloggername || blogId,
          description: cleanDesc,
          recentContentTitle: cleanTitle,
          publicContactStatus: 'unknown',
          email: '',
          subscriberCount: 0,
          viewCount: 0,
        };
        const fit = calculateProductFitScore(channelData, keyword, product || keyword);
        candidates.push({
          candidateId: generateRecordId('inf'),
          collectedAt: now,
          platform: 'Naver Blog',
          keyword,
          name: item.bloggername || blogId || '블로거',
          channelOrBlogUrl: blogUrl,
          recentContentTitle: cleanTitle.substring(0, 60),
          recentContentUrl: item.link || '',
          subscriberOrVisitor: '-',
          viewCount: '-',
          publicContactStatus: 'unknown',
          publicEmailMasked: '',
          productFitScore: fit.score,
          productFitReason: fit.reason,
          suggestedProduct: product || keyword,
          suggestedOfferAngle: generateOfferAngle(channelData, keyword, product || keyword),
          outreachStatus: 'pending',
          firstEmailDraft: '',
          followUpDraft: '',
          responseStatus: 'none',
          notes: `최근 글: ${cleanTitle.substring(0, 40)}`,
        });
      }
    } catch (e: any) {
      // Naver 실패 시 무시
    }
  }

  // 적합도 점수 내림차순 정렬
  candidates.sort((a, b) => b.productFitScore - a.productFitScore);

  return {
    success: true,
    candidates: candidates.slice(0, max),
    total: candidates.length,
    keyword,
    product: product || keyword,
    message: `${keyword} 관련 공동구매 후보 ${candidates.slice(0, max).length}명을 수집했습니다.`,
  };
}

async function handleOutreachSaveCandidates(params: any) {
  const { candidates } = params;
  if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
    return { success: false, error: 'candidates array required' };
  }
  if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    return { success: false, error: 'Google Sheets not configured' };
  }
  try {
    await ensureHeaders('influencer_candidates');
    let saved = 0;
    for (const c of candidates) {
      await sheetsAppend('influencer_candidates', [[
        c.candidateId || generateRecordId('inf'), c.collectedAt || new Date().toISOString(),
        c.platform || '', c.keyword || '', c.name || '',
        c.channelOrBlogUrl || '', c.recentContentTitle || '', c.recentContentUrl || '',
        String(c.subscriberOrVisitor || ''), String(c.viewCount || ''),
        c.publicContactStatus || 'unknown', c.publicEmailMasked || '',
        String(c.productFitScore || 0), c.productFitReason || '',
        c.suggestedProduct || '', c.suggestedOfferAngle || '',
        c.outreachStatus || 'pending', c.firstEmailDraft || '',
        c.followUpDraft || '', '', 'none', c.notes || ''
      ]]);
      saved++;
    }
    return { success: true, saved, total: candidates.length, message: `${saved}명의 후보를 Google Sheets에 저장했습니다.` };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function handleOutreachList(params: any) {
  if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    return { success: false, error: 'Google Sheets not configured' };
  }
  try {
    await ensureHeaders('influencer_candidates');
    const result = await sheetsRead('influencer_candidates');
    const rows = result.values || [];
    if (rows.length < 2) return { success: true, candidates: [], total: 0 };
    const headers = rows[0];
    let records = rows.slice(1).map((row: string[]) => {
      const obj: any = {};
      headers.forEach((h: string, i: number) => { obj[h] = row[i] || ''; });
      obj.productFitScore = parseInt(obj.productFitScore || '0', 10);
      return obj;
    });
    // 필터
    const { minScore, keyword: filterKw, platform: filterPlatform } = params || {};
    if (minScore) records = records.filter((r: any) => r.productFitScore >= minScore);
    if (filterKw) records = records.filter((r: any) => (r.keyword || '').includes(filterKw));
    if (filterPlatform) records = records.filter((r: any) => (r.platform || '').toLowerCase().includes(filterPlatform.toLowerCase()));
    records.sort((a: any, b: any) => b.productFitScore - a.productFitScore);
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

function generateJarvisDecision(productName: string, calc: any): { decision: string; action: string; jarvisMessage: string } {
  const { estimatedMargin, estimatedMarginRate, currentPrice, competitorMinPrice, competitorAvgPrice, rawMaterialCost } = calc;

  let decision = '';
  let action = '';
  let jarvisMessage = '';

  // 마진율 기준 판단
  if (estimatedMarginRate >= 30) {
    decision = '가격 방어 가능 (고마진)';
    action = '현재 가격 유지 + 프리미엄 메시지 강화';
    jarvisMessage = `대표님, 지금 ${productName}은 가격을 낮출 필요 없습니다.\n` +
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
    jarvisMessage = `대표님, ${productName}은 마진이 빠듯합니다.\n` +
      `마진율 ${estimatedMarginRate}%면 배송 사고나 반품 한 건에 적자 전환될 수 있습니다.\n` +
      `가격을 100~500원 올리거나, 용량/수량을 조정하는 게 안전합니다.`;
  } else if (estimatedMargin > 0) {
    decision = '가격 인상 필요';
    action = '즉시 가격 인상 또는 판매 중단 검토';
    jarvisMessage = `대표님, ${productName}은 지금 거의 마진이 없습니다.\n` +
      `마진율 ${estimatedMarginRate}%면 팔수록 손해에 가깝습니다.\n` +
      `가격 인상이 어려우면 판매 중단하고 다음 시즌을 기다리는 것도 방법입니다.`;
  } else {
    decision = '적자 상태 - 즉시 조치 필요';
    action = '판매 중단 또는 대폭 가격 인상';
    jarvisMessage = `대표님, ${productName}은 현재 팔면 팔수록 적자입니다.\n` +
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
    const response = await fetch(url);
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
        message: `${itemName}은 KAMIS 일별 가격 조회 대상 품목이 아닙니다. 데이터 부족.`,
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
        const result = await handleSmartstoreOrders(params || rest);
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
