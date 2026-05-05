/**
 * /api/task 라우트 모듈
 * Cloud PC jarvis-persistent-server에 추가
 * 
 * 지원 taskType:
 * - smartstore-orders: 스마트스토어 주문/매출 조회 (Naver Commerce API)
 * - daily-briefing: 일일 브리핑
 * - purchase-order-draft: 발주서 초안 생성
 * - creative-content: Creative Director (마케팅 문구 생성)
 * - growth-link: Growth Link (인스타/스레드용 링크 추천)
 */

const crypto = require('crypto');

// ============================================
// 결과 캐시 (60초 TTL) - 연속 요청 시 동일 결과 보장
// ============================================
let _orderCache = null;
let _orderCacheTime = 0;
const CACHE_TTL = 60000; // 60초

function getCachedOrders() {
  if (_orderCache && (Date.now() - _orderCacheTime) < CACHE_TTL) {
    return _orderCache;
  }
  return null;
}

function setCachedOrders(data) {
  _orderCache = data;
  _orderCacheTime = Date.now();
}

// ============================================
// Concurrency Limiter (동시 요청 수 제한)
// ============================================
async function parallelLimit(tasks, limit) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array(Math.min(limit, tasks.length)).fill(null).map(() => worker());
  await Promise.all(workers);
  return results;
}

// ============================================
// 환경변수 (alias 지원)
// ============================================
const CLIENT_ID = process.env.SMARTSTORE_CLIENT_ID || process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.SMARTSTORE_CLIENT_SECRET || process.env.NAVER_CLIENT_SECRET;
const PROXY_URL = process.env.QUOTAGUARD_URL || process.env.QUOTAGUARDSTATIC_URL || process.env.PROXY_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
const API_BASE = 'https://api.commerce.naver.com/external';

// ============================================
// 설정 상태 확인
// ============================================
function getConfigStatus() {
  return {
    clientId: !!CLIENT_ID,
    clientSecret: !!CLIENT_SECRET,
    proxy: !!PROXY_URL,
    openai: !!OPENAI_API_KEY,
  };
}

// ============================================
// Naver Commerce API 인증
// ============================================
async function getSmartStoreToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('SMARTSTORE credentials not configured');
  }

  const timestamp = String(Date.now());
  const pwd = `${CLIENT_ID}_${timestamp}`;

  let hashed;
  try {
    const bcrypt = require('bcryptjs');
    hashed = bcrypt.hashSync(pwd, CLIENT_SECRET);
  } catch (e) {
    hashed = crypto.createHmac('sha256', CLIENT_SECRET).update(pwd).digest('hex');
  }

  const clientSecretSign = Buffer.from(hashed).toString('base64');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    timestamp: timestamp,
    client_secret_sign: clientSecretSign,
    grant_type: 'client_credentials',
    type: 'SELF',
  });

  const fetchOptions = {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  };

  // 프록시 설정 (있는 경우에만)
  if (PROXY_URL) {
    try {
      const HttpsProxyAgent = require('https-proxy-agent');
      fetchOptions.agent = new HttpsProxyAgent(PROXY_URL);
    } catch (e) {
      console.warn('[task-router] https-proxy-agent not available, direct connection');
    }
  }

  const nodeFetch = require('node-fetch');
  const res = await nodeFetch(`${API_BASE}/v1/oauth2/token?${params.toString()}`, fetchOptions);
  const data = await res.json();

  if (!data.access_token) {
    throw new Error(`Token failed: ${data.error || data.message || 'unknown'}`);
  }
  return data.access_token;
}

// ============================================
// Naver Commerce API 요청 래퍼
// ============================================
async function smartStoreRequest(path, options = {}) {
  const token = await getSmartStoreToken();
  const url = `${API_BASE}${path}`;

  const fetchOptions = {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  };

  if (PROXY_URL) {
    try {
      const HttpsProxyAgent = require('https-proxy-agent');
      fetchOptions.agent = new HttpsProxyAgent(PROXY_URL);
    } catch (e) { /* direct */ }
  }

  const nodeFetch = require('node-fetch');
  const res = await nodeFetch(url, fetchOptions);
  return { status: res.status, data: await res.json() };
}

// ============================================
// 날짜 포맷 유틸 (네이버 API용 KST)
// ============================================
function formatNaverDate(d) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.000+09:00`;
}

// ============================================
// 주문 목록 조회 (GET API, 24시간 단위 병렬)
// ============================================
async function fetchOrderIds(token, days, statuses = ['PAYED']) {
  const nodeFetch = require('node-fetch');
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  let agent;
  if (PROXY_URL) {
    try {
      const HttpsProxyAgent = require('https-proxy-agent');
      agent = new HttpsProxyAgent(PROXY_URL);
    } catch (e) { /* direct */ }
  }

  const now = new Date();

  // 동시 요청 수 제한 (concurrency=2) + 재시도 1회
  const tasks = [];
  for (let i = 0; i < days; i++) {
    const dayStart = new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000);
    const dayEnd = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);

    const queryParams = new URLSearchParams();
    queryParams.append('from', formatNaverDate(dayStart));
    queryParams.append('to', formatNaverDate(dayEnd));
    queryParams.append('rangeType', 'PAYED_DATETIME');
    queryParams.append('pageSize', '300');
    queryParams.append('page', '1');
    statuses.forEach(s => queryParams.append('productOrderStatuses', s));

    const url = `${API_BASE}/v1/pay-order/seller/product-orders?${queryParams.toString()}`;

    tasks.push(() => fetchOneDayWithRetry(nodeFetch, url, headers, agent, i));
  }

  const results = await parallelLimit(tasks, 2);
  const allProductOrderIds = results.flat();
  return [...new Set(allProductOrderIds)];
}

// 1일 조회 + 1회 재시도
async function fetchOneDayWithRetry(nodeFetch, url, headers, agent, dayIndex) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const opts = { method: 'GET', headers };
      if (agent) opts.agent = agent;
      const res = await nodeFetch(url, opts);
      if (res.status === 200) {
        const data = await res.json();
        const responseData = data.data || data;
        const contents = responseData.contents || responseData || [];
        if (Array.isArray(contents)) {
          return contents.map(item => (item.productOrder || item).productOrderId).filter(Boolean);
        }
        return [];
      } else if (attempt === 0) {
        // 첫 시도 실패 → 500ms 대기 후 재시도
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      return [];
    } catch (err) {
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      console.warn(`[task-router] fetchOrderIds day-${dayIndex+1} error:`, err.message);
      return [];
    }
  }
  return [];
}

// ============================================
// 주문 상세 조회 (POST /v1/pay-order/seller/product-orders/query)
// ============================================
async function fetchOrderDetails(token, productOrderIds) {
  if (!productOrderIds || productOrderIds.length === 0) return [];

  const nodeFetch = require('node-fetch');
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  let agent;
  if (PROXY_URL) {
    try {
      const HttpsProxyAgent = require('https-proxy-agent');
      agent = new HttpsProxyAgent(PROXY_URL);
    } catch (e) { /* direct */ }
  }

  let allDetails = [];
  // 300건씩 배치 조회
  for (let i = 0; i < productOrderIds.length; i += 300) {
    const batch = productOrderIds.slice(i, i + 300);
    try {
      const opts = {
        method: 'POST',
        headers,
        body: JSON.stringify({ productOrderIds: batch }),
      };
      if (agent) opts.agent = agent;
      const res = await nodeFetch(`${API_BASE}/v1/pay-order/seller/product-orders/query`, opts);
      if (res.status === 200) {
        const data = await res.json();
        const details = data.data || data;
        if (Array.isArray(details)) {
          allDetails = allDetails.concat(details);
        }
      }
    } catch (err) {
      console.warn(`[task-router] fetchOrderDetails batch error:`, err.message);
    }
  }

  return allDetails;
}

// ============================================
// taskType: smartstore-orders (v3 - GET API + 상세조회)
// ============================================
async function handleSmartstoreOrders(params = {}) {
  // 60초 캐시 확인 - 연속 요청 시 동일 결과 보장
  const cached = getCachedOrders();
  if (cached) {
    console.log("[task-router] Using cached order data (TTL 60s)");
    return cached;
  }

  const actionLogs = [];
  const log = (step, status, detail) => {
    actionLogs.push({ step, status, detail, timestamp: new Date().toISOString() });
  };
  log('AUTH', 'processing', 'Naver Commerce API 인증 중...');
  try {
    const token = await getSmartStoreToken();
    log('AUTH', 'success', '토큰 발급 완료');

    // KST 기준 오늘 날짜 계산
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);
    const todayStart = new Date(kstNow);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartUTC = new Date(todayStart.getTime() - kstOffset);

    // ===== 1. 배송 전 처리 대상 전체 (PAYED 상태, 최근 7일) =====
    log('QUERY', 'processing', '배송 전 처리 대상 조회 중 (PAYED, 7일, 병렬)...');
    const payedIds = await fetchOrderIds(token, 7, ['PAYED']);
    log('QUERY', 'success', `PAYED 주문 ID ${payedIds.length}건 수집`);

    // 상세 조회로 placeOrderStatus 구분
    log('QUERY', 'processing', '상세 조회 중 (신규주문/배송준비 구분)...');
    const payedDetails = await fetchOrderDetails(token, payedIds);

    let newOrders = 0;       // PAYED + placeOrderStatus=NOT_YET (현재 신규주문)
    let pendingShipping = 0; // PAYED + placeOrderStatus=OK (배송준비)
    let todayOrders = 0;     // 오늘 결제된 주문
    let todaySales = 0;      // 오늘 매출

    payedDetails.forEach(item => {
      const po = item.productOrder || item;
      const placeStatus = po.placeOrderStatus || 'NOT_YET';

      if (placeStatus === 'NOT_YET') {
        newOrders++;
      } else if (placeStatus === 'OK') {
        pendingShipping++;
      }

      // 오늘 결제 여부 확인
      const payDate = new Date(po.paymentDate || po.orderDate || 0);
      if (payDate >= todayStartUTC) {
        todayOrders++;
        todaySales += po.totalPaymentAmount || 0;
      }
    });

    log('QUERY', 'success', `현재 신규주문: ${newOrders}건, 배송준비: ${pendingShipping}건`);
    log('QUERY', 'success', `오늘 신규주문: ${todayOrders}건, 오늘 매출: ${todaySales.toLocaleString()}원`);

    // ===== 2. 배송중/배송완료/구매확정/취소 (최근 7일, 순차) =====
    log('QUERY', 'processing', '배송중/배송완료/구매확정/취소 순차 조회 중...');
    const deliveringIds = await fetchOrderIds(token, 7, ['DELIVERING']);
    const deliveredIds = await fetchOrderIds(token, 7, ['DELIVERED']);
    const purchaseDecidedIds = await fetchOrderIds(token, 7, ['PURCHASE_DECIDED']);
    const cancelIds = await fetchOrderIds(token, 7, ['CANCEL_REQUESTED']);
    const delivering = deliveringIds.length;
    const delivered = deliveredIds.length;
    const purchaseDecided = purchaseDecidedIds.length;
    const cancelRequests = cancelIds.length;
    log('COMPLETE', 'success', '전체 조회 완료');

    // 배송 전 처리 대상 전체 = 현재 신규주문 + 배송준비
    const totalPreShipping = newOrders + pendingShipping;

    // 결과 캐싱 (60초 TTL) - 연속 요청 시 동일 결과 보장
    const resultData = {
      success: true,
      result: {
        smartstore: {
          newOrders,
          pendingShipping,
          totalPreShipping,
          todayNewOrders: todayOrders,
          todayOrders,
          todaySales,
          totalAmount: todaySales,
          delivering,
          delivered,
          purchaseDecided,
          cancelRequests,
          settlementAmount: 0,
          sellingProducts: 0,
          soldOutProducts: 0,
        },
        actionLogs,
      },
    };
    setCachedOrders(resultData);
    return resultData;
  } catch (error) {
    log('ERROR', 'fail', error.message);
    return { success: false, error: error.message, actionLogs };
  }
}

// ============================================
// taskType: daily-briefing
// ============================================
async function handleDailyBriefing(params = {}) {
  const actionLogs = [];
  const log = (step, status, detail) => {
    actionLogs.push({ step, status, detail, timestamp: new Date().toISOString() });
  };

  try {
    log('INIT', 'processing', '일일 브리핑 데이터 수집 중...');
    
    // 스마트스토어 데이터 가져오기
    const ssResult = await handleSmartstoreOrders({});
    if (!ssResult.success) {
      throw new Error(ssResult.error || '스마트스토어 데이터 조회 실패');
    }

    const ss = ssResult.result.smartstore;
    log('DATA', 'success', '스마트스토어 데이터 수집 완료');

    // 브리핑 텍스트 생성
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = kstNow.toISOString().split('T')[0];
    const timeStr = kstNow.toTimeString().split(' ')[0].substring(0, 5);

    const briefing = {
      date: dateStr,
      time: timeStr,
      summary: `[오늘 브리핑 - ${dateStr} ${timeStr}]\n\n` +
        `■ 현재 기준 (대시보드)\n` +
        `  - 현재 신규주문: ${ss.newOrders}건\n` +
        `  - 배송준비: ${ss.pendingShipping}건\n` +
        `  - 배송 전 처리 대상 전체: ${ss.newOrders + ss.pendingShipping}건\n` +
        `  - 배송중: ${ss.delivering}건\n` +
        `  - 배송완료: ${ss.delivered}건\n` +
        `  - 구매확정: ${ss.purchaseDecided}건\n\n` +
        `■ 오늘 기준 (KST ${dateStr})\n` +
        `  - 오늘 신규주문: ${ss.todayOrders}건\n` +
        `  - 오늘 매출: ${ss.todaySales.toLocaleString()}원\n`,
      smartstore: ss,
    };

    log('COMPLETE', 'success', '브리핑 생성 완료');

    return {
      success: true,
      result: {
        briefing,
        smartstore: ss,
        actionLogs,
      },
    };
  } catch (error) {
    log('ERROR', 'fail', error.message);
    return { success: false, error: error.message, actionLogs };
  }
}

// ============================================
// taskType: purchase-order-draft
// ============================================
async function handlePurchaseOrderDraft(params = {}) {
  const actionLogs = [];
  const log = (step, status, detail) => {
    actionLogs.push({ step, status, detail, timestamp: new Date().toISOString() });
  };

  try {
    log('INIT', 'processing', '발주서 초안 생성 중...');
    
    // 현재 PAYED 상태 주문 조회 (14일)
    const token = await getSmartStoreToken();
    const payedIds = await fetchOrderIds(token, 14, ['PAYED']);

    if (payedIds.length === 0) {
      log('COMPLETE', 'success', '발주 대상 주문 없음');
      return { success: true, result: { orders: [], count: 0, message: '현재 발주 대상 주문이 없습니다.', actionLogs } };
    }

    log('QUERY', 'processing', `${payedIds.length}건 상세 조회 중...`);
    const details = await fetchOrderDetails(token, payedIds);

    // 발주서 형식으로 변환 (개인정보 마스킹)
    const orders = details.map(item => {
      const po = item.productOrder || {};
      return {
        productOrderId: po.productOrderId ? po.productOrderId.substring(0, 8) + '****' : '',
        productName: po.productName || '',
        optionInfo: po.optionManageCode || po.optionCode || '',
        quantity: po.quantity || 1,
        totalAmount: po.totalPaymentAmount || 0,
        orderDate: po.orderDate || '',
      };
    });

    log('COMPLETE', 'success', `발주서 초안 ${orders.length}건 생성 완료`);

    return {
      success: true,
      result: {
        orders,
        count: orders.length,
        message: `발주서 초안 ${orders.length}건 생성 완료 (execute_disabled: 실제 발주확인은 대표 승인 필요)`,
        actionLogs,
      },
    };
  } catch (error) {
    log('ERROR', 'fail', error.message);
    return { success: false, error: error.message, actionLogs };
  }
}

// ============================================
// taskType: creative-content
// ============================================
async function handleCreativeContent(params = {}) {
  const actionLogs = [];
  const log = (step, status, detail) => {
    actionLogs.push({ step, status, detail, timestamp: new Date().toISOString() });
  };

  try {
    const { product, platform, style } = params;
    if (!product) {
      return { success: false, error: '상품명(product)을 지정해주세요.', actionLogs };
    }

    log('INIT', 'processing', `"${product}" 마케팅 콘텐츠 생성 중...`);

    if (!OPENAI_API_KEY) {
      return { success: false, error: 'OPENAI_API_KEY not configured', actionLogs };
    }

    const nodeFetch = require('node-fetch');
    const prompt = `당신은 농산물/식품 바이럴 마케팅 전문가입니다.

상품: ${product}
플랫폼: ${platform || '인스타그램, 스레드, 카카오톡'}
스타일: ${style || '친근하고 말하듯 툭 던지는 문장, 강한 첫 문장, 계절감, 식감, 수확 타이밍, 스토리, 댓글/DM 유도, 여운 있는 마무리'}

아래 형식으로 마케팅 콘텐츠를 만들어주세요:

1. 후킹 문구 (3개)
2. 인스타그램/스레드 본문 (1개, 200자 이내)
3. 카카오톡 공지문 (1개)
4. 릴스/숏폼 영상 구성 (촬영 컷 3-5개)
5. 해시태그 추천 (10개)

주의: 과장 광고, 허위 효능, 매출 보장, 성공 보장 표현은 금지합니다.`;

    const gptRes = await nodeFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.8,
      }),
    });
    const gptData = await gptRes.json();
    const content = gptData.choices?.[0]?.message?.content || '생성 실패';

    log('COMPLETE', 'success', `"${product}" 콘텐츠 생성 완료`);

    return {
      success: true,
      result: {
        product,
        content,
        platform: platform || '인스타그램, 스레드, 카카오톡',
        actionLogs,
      },
    };
  } catch (error) {
    log('ERROR', 'fail', error.message);
    return { success: false, error: error.message, actionLogs };
  }
}

// ============================================
// taskType: growth-link
// ============================================
async function handleGrowthLink(params = {}) {
  const actionLogs = [];
  const log = (step, status, detail) => {
    actionLogs.push({ step, status, detail, timestamp: new Date().toISOString() });
  };

  try {
    const { url, platform } = params;
    if (!url) {
      return { success: false, error: '스마트스토어 링크(url)를 지정해주세요.', actionLogs };
    }

    log('INIT', 'processing', `Growth Link 생성 중... (${platform || 'instagram'})`);

    if (!OPENAI_API_KEY) {
      return { success: false, error: 'OPENAI_API_KEY not configured', actionLogs };
    }

    const nodeFetch = require('node-fetch');
    const targetPlatform = platform || 'instagram';

    const prompt = `당신은 SNS 마케팅 링크 전략 전문가입니다.

원본 스마트스토어 링크: ${url}
타겟 플랫폼: ${targetPlatform}

아래 형식으로 Growth Link 전략을 만들어주세요:

1. 바이오 링크 추천 문구 (인스타 프로필용, 20자 이내)
2. 스토리/릴스 CTA 문구 (3개)
3. 스레드 게시글 + 링크 조합 (1개)
4. 카카오톡 공유 메시지 (1개)
5. 링크 단축 및 UTM 파라미터 추천
6. DM 자동응답 문구 (댓글에 "가격" 물어볼 때)

주의: 스팸성 문구, 과장 표현은 금지합니다.`;

    const gptRes = await nodeFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1200,
        temperature: 0.7,
      }),
    });
    const gptData = await gptRes.json();
    const content = gptData.choices?.[0]?.message?.content || '생성 실패';

    log('COMPLETE', 'success', `Growth Link 전략 생성 완료 (${targetPlatform})`);

    return {
      success: true,
      result: {
        url,
        platform: targetPlatform,
        content,
        actionLogs,
      },
    };
  } catch (error) {
    log('ERROR', 'fail', error.message);
    return { success: false, error: error.message, actionLogs };
  }
}

// ============================================
// 라우터 등록 함수
// ============================================
function registerTaskRouter(app) {
  app.post('/api/task', async (req, res) => {
    const { taskType, params } = req.body;
    console.log(`[TASK] taskType=${taskType}, params=${JSON.stringify(params || {}).substring(0, 100)}`);

    const config = getConfigStatus();

    try {
      let result;
      switch (taskType) {
        case 'smartstore-orders':
          if (!config.clientId || !config.clientSecret) {
            return res.status(503).json({ success: false, error: 'Smartstore credentials not configured' });
          }
          result = await handleSmartstoreOrders(params);
          break;

        case 'daily-briefing':
          if (!config.clientId || !config.clientSecret) {
            return res.status(503).json({ success: false, error: 'Smartstore credentials not configured' });
          }
          result = await handleDailyBriefing(params);
          break;

        case 'purchase-order-draft':
          if (!config.clientId || !config.clientSecret) {
            return res.status(503).json({ success: false, error: 'Smartstore credentials not configured' });
          }
          result = await handlePurchaseOrderDraft(params);
          break;

        case 'creative-content':
          if (!config.openai) {
            return res.status(503).json({ success: false, error: 'OpenAI API key not configured' });
          }
          result = await handleCreativeContent(params);
          break;

        case 'growth-link':
          if (!config.openai) {
            return res.status(503).json({ success: false, error: 'OpenAI API key not configured' });
          }
          result = await handleGrowthLink(params);
          break;

        default:
          return res.status(400).json({ success: false, error: `Unknown taskType: ${taskType}` });
      }

      return res.json(result);
    } catch (error) {
      console.error(`[TASK ERROR] ${taskType}:`, error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // 설정 상태 확인 엔드포인트
  app.get('/api/task/config', (req, res) => {
    res.json({ configured: getConfigStatus() });
  });

  console.log('[TASK ROUTER] /api/task 라우트 등록 완료');
  console.log('[TASK ROUTER] 지원 taskType: smartstore-orders, daily-briefing, purchase-order-draft, creative-content, growth-link');

  // ============================================
  // proxy-check 엔드포인트
  // ============================================
  app.get('/api/proxy-check', async (req, res) => {
    try {
      const proxyConfigured = !!PROXY_URL;
      let proxyScheme = 'none';
      let agentType = 'none';
      let outboundIp = null;
      let outboundIpMatchedAllowedList = false;
      const allowedIPs = ['52.5.238.209', '52.6.13.167'];

      if (proxyConfigured) {
        try {
          const url = new URL(PROXY_URL);
          proxyScheme = url.protocol.replace(':', '');
        } catch(e) { proxyScheme = 'invalid'; }
        try {
          const HttpsProxyAgent = require('https-proxy-agent');
          const agent = new HttpsProxyAgent(PROXY_URL);
          agentType = 'HttpsProxyAgent';
          // Check outbound IP via proxy
          const nodeFetch = require('node-fetch');
          const ipRes = await nodeFetch('https://api.ipify.org?format=json', { agent, timeout: 10000 });
          const ipData = await ipRes.json();
          outboundIp = ipData.ip;
          outboundIpMatchedAllowedList = allowedIPs.includes(outboundIp);
        } catch(e) {
          agentType = 'error: ' + e.message;
        }
      }

      res.json({
        proxyConfigured,
        proxyScheme,
        agentType,
        outboundIp: outboundIpMatchedAllowedList ? '(matched allowed list)' : outboundIp,
        outboundIpMatchedAllowedList,
        credentialHidden: true
      });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================
  // naver-auth-test 엔드포인트
  // ============================================
  app.get('/api/naver-auth-test', async (req, res) => {
    try {
      const token = await getSmartStoreToken();
      res.json({
        tokenReceived: !!token,
        tokenLength: token ? token.length : 0,
        gwIpNotAllowed: false
      });
    } catch(e) {
      const isIpError = e.message && e.message.includes('IP');
      res.json({
        tokenReceived: false,
        error: e.message ? e.message.substring(0, 100) : 'unknown',
        gwIpNotAllowed: isIpError
      });
    }
  });
}

module.exports = { registerTaskRouter, getConfigStatus };
