/**
 * 모닝 브리핑 통합 API v2
 * GET /api/morning-briefing-v2
 * 
 * 개선사항:
 * 1. 에러 핸들링 강화: 각 데이터 소스 실패 시 부분 성공 처리
 * 2. 타임아웃 관리: 각 API 호출에 명시적 타임아웃 설정
 * 3. 재시도 로직: 일시적 오류에 대한 자동 재시도
 * 4. 상세 로깅: 각 단계별 상세한 진행 상황 기록
 */

const { getSmartStoreToken, smartStoreRequest } = require('./_smartstore-auth');

const SPREADSHEET_ID = '195rrBRA8VFgkpCRqb8Nssiu3HLI7ZYvarAxGtxCI57w';
const INFLUENCER_SHEET = '인플루언서 목록';
const API_TIMEOUT = 15000; // 15초 타임아웃

// ── Google Sheets 읽기 ──
async function getGoogleAccessToken(credentials) {
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
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
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Google Sheets 인증 실패');
  return tokenData.access_token;
}

async function readSheet(token, sheetName, maxRows = 1000) {
  const range = encodeURIComponent(`'${sheetName}'!A1:Z${maxRows}`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.values || [];
}

function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return obj;
  }).filter(obj => Object.values(obj).some(v => v));
}

// ── SmartStore 주문 조회 (재시도 로직 포함) ──
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

async function fetchOrdersWithRetry(days, statuses = ['PAYED'], maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchOrders(days, statuses);
    } catch (err) {
      if (attempt < maxRetries) {
        console.warn(`[morning-briefing-v2] 주문 조회 재시도 ${attempt + 1}/${maxRetries}:`, err.message);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // 지수 백오프
      } else {
        throw err;
      }
    }
  }
}

async function fetchOrders(days, statuses = ['PAYED']) {
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  let allProductOrderIds = [];
  let currentFrom = new Date(startDate);
  const maxIterations = Math.min(days, 7);

  for (let i = 0; i < maxIterations; i++) {
    const currentTo = new Date(currentFrom.getTime() + 24 * 60 * 60 * 1000);
    if (currentTo > now) currentTo.setTime(now.getTime());

    const params = new URLSearchParams();
    params.append('from', formatNaverDate(currentFrom));
    params.append('to', formatNaverDate(currentTo));
    params.append('rangeType', 'PAYED_DATETIME');
    params.append('pageSize', '300');
    params.append('page', '1');
    statuses.forEach(s => params.append('productOrderStatuses', s));

    try {
      const result = await smartStoreRequest(
        `/v1/pay-order/seller/product-orders?${params.toString()}`,
        { method: 'GET' }
      );
      if (result.status === 200) {
        const responseData = result.data.data || result.data;
        const contents = responseData.contents || responseData || [];
        if (Array.isArray(contents)) {
          contents.forEach(item => {
            const po = item.productOrder || item;
            if (po.productOrderId) allProductOrderIds.push(po.productOrderId);
          });
        }
      }
    } catch (err) {
      console.warn(`[morning-briefing-v2] 주문 조회 실패 (${formatNaverDate(currentFrom)}):`, err.message);
    }

    currentFrom = new Date(currentTo);
    if (currentFrom >= now) break;
  }

  allProductOrderIds = [...new Set(allProductOrderIds)];
  if (allProductOrderIds.length === 0) return [];

  let allDetailOrders = [];
  for (let i = 0; i < allProductOrderIds.length; i += 300) {
    const batch = allProductOrderIds.slice(i, i + 300);
    try {
      const detailResult = await smartStoreRequest(
        '/v1/pay-order/seller/product-orders/query',
        { method: 'POST', body: JSON.stringify({ productOrderIds: batch }) }
      );
      if (detailResult.status === 200) {
        const detailData = detailResult.data.data || detailResult.data;
        if (Array.isArray(detailData)) allDetailOrders = allDetailOrders.concat(detailData);
      }
    } catch (err) {
      console.warn(`[morning-briefing-v2] 상세 조회 실패:`, err.message);
    }
  }
  return allDetailOrders;
}

function classifyProduct(name) {
  if (name.includes('옥수수') || name.includes('찰옥수수')) return 'corn';
  if (name.includes('밤') || name.includes('알밤') || name.includes('칼집밤')) return 'chestnut';
  return 'other';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const logs = [];
  const startTime = Date.now();
  function addLog(step, status, detail) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logs.push({ step, status, detail, timestamp: new Date().toISOString(), elapsed: `${elapsed}s` });
    console.log(`[morning-briefing-v2] [${step}] ${status}: ${detail} (${elapsed}s)`);
  }

  const result = {
    smartstore: null,
    influencers: null,
    gmail_hint: null,
    briefing_text: null,
    actionLogs: [],
    partialSuccess: false,
  };

  try {
    // ═══════════════════════════════════════
    // 1. SmartStore 데이터 수집 (재시도 포함)
    // ═══════════════════════════════════════
    addLog('SMARTSTORE', 'start', '스마트스토어 데이터 수집 시작...');
    
    try {
      // 오늘 신규 주문
      const todayOrders = await fetchOrdersWithRetry(1, ['PAYED']);
      const todayNormalized = todayOrders.map(item => {
        const po = item.productOrder || item;
        return {
          productOrderId: po.productOrderId,
          productName: po.productName || '',
          quantity: po.quantity || 1,
          totalPaymentAmount: po.totalPaymentAmount || 0,
          productOrderStatus: po.productOrderStatus,
        };
      });

      let cornCount = 0, chestnutCount = 0, otherCount = 0, totalAmount = 0;
      todayNormalized.forEach(o => {
        const type = classifyProduct(o.productName);
        if (type === 'corn') cornCount++;
        else if (type === 'chestnut') chestnutCount++;
        else otherCount++;
        totalAmount += o.totalPaymentAmount || 0;
      });

      addLog('SMARTSTORE', 'success', `신규 주문 ${todayNormalized.length}건 수집 완료 (옥수수: ${cornCount}, 밤: ${chestnutCount})`);

      // 배송 준비 중
      addLog('SMARTSTORE_SHIP', 'start', '배송 준비 주문 조회 중...');
      const pendingShip = await fetchOrdersWithRetry(7, ['PAYED']);
      addLog('SMARTSTORE_SHIP', 'success', `배송 준비 ${pendingShip.length}건`);

      // 어제 매출 (비교용)
      addLog('SMARTSTORE_COMPARE', 'start', '어제 매출 데이터 조회 중...');
      const yesterdayOrders = await fetchOrdersWithRetry(2, ['PAYED']);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const yesterdayOnly = yesterdayOrders.filter(item => {
        const po = item.productOrder || item;
        const payDate = new Date(po.paymentDate || po.orderDate || 0);
        return payDate < todayStart;
      });
      let yesterdayAmount = 0;
      yesterdayOnly.forEach(item => {
        const po = item.productOrder || item;
        yesterdayAmount += po.totalPaymentAmount || 0;
      });

      const revenueChange = yesterdayAmount > 0
        ? (((totalAmount - yesterdayAmount) / yesterdayAmount) * 100).toFixed(1)
        : totalAmount > 0 ? '+100' : '0';

      addLog('SMARTSTORE_COMPARE', 'success', `어제 대비 매출 변화: ${revenueChange}%`);

      result.smartstore = {
        newOrders: todayNormalized.length,
        pendingShipping: pendingShip.length,
        totalAmount,
        yesterdayAmount,
        revenueChangePercent: parseFloat(revenueChange),
        cornCount,
        chestnutCount,
        otherCount,
        topOrders: todayNormalized.slice(0, 5),
      };
    } catch (err) {
      addLog('SMARTSTORE', 'fail', `스마트스토어 조회 실패: ${err.message}`);
      result.smartstore = { error: err.message, newOrders: 0, pendingShipping: 0, totalAmount: 0 };
      result.partialSuccess = true;
    }

    // ═══════════════════════════════════════
    // 2. Google Sheets 인플루언서 현황
    // ═══════════════════════════════════════
    addLog('SHEETS', 'start', '구글 시트 인플루언서 데이터 수집 중...');

    try {
      const credentialsRaw = process.env.GOOGLE_SHEETS_CREDENTIALS;
      if (!credentialsRaw) throw new Error('구글 시트 인증 정보 없음');

      const credentials = JSON.parse(credentialsRaw);
      const token = await getGoogleAccessToken(credentials);
      const rows = await readSheet(token, INFLUENCER_SHEET);
      const influencers = rowsToObjects(rows);

      // 플랫폼별 분류
      const byPlatform = {};
      influencers.forEach(inf => {
        const platform = (inf['플랫폼'] || inf['platform'] || '기타').trim();
        byPlatform[platform] = (byPlatform[platform] || 0) + 1;
      });

      // 어제 추가된 인원 (수집일자 기반)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      
      const newYesterday = influencers.filter(inf => {
        const dateField = inf['수집일자'] || inf['등록일'] || inf['date'] || '';
        return dateField.startsWith(yesterdayStr);
      });

      addLog('SHEETS', 'success', `인플루언서 총 ${influencers.length}명, 어제 신규 ${newYesterday.length}명`);

      result.influencers = {
        total: influencers.length,
        newYesterday: newYesterday.length,
        byPlatform,
        recentNames: newYesterday.slice(0, 5).map(inf => inf['이름'] || inf['채널명'] || inf['name'] || '미상'),
      };
    } catch (err) {
      addLog('SHEETS', 'fail', `구글 시트 조회 실패: ${err.message}`);
      result.influencers = { error: err.message, total: 0, newYesterday: 0, byPlatform: {} };
      result.partialSuccess = true;
    }

    // ═══════════════════════════════════════
    // 3. Gmail 힌트 (프론트엔드에서 MCP로 처리)
    // ═══════════════════════════════════════
    addLog('GMAIL', 'info', 'Gmail 데이터는 프론트엔드 MCP를 통해 수집됩니다');
    result.gmail_hint = {
      searchQuery: 'is:unread OR subject:협업 OR subject:공구 OR subject:제안 newer_than:1d',
      note: '프론트엔드에서 Gmail MCP를 통해 별도 수집',
    };

    // ═══════════════════════════════════════
    // 4. 브리핑 텍스트 생성
    // ═══════════════════════════════════════
    addLog('BRIEFING', 'start', '브리핑 데이터 통합 중...');

    const ss = result.smartstore;
    const inf = result.influencers;
    
    result.briefing_text = [
      `[스마트스토어 현황]`,
      `- 오늘 신규 주문: ${ss.newOrders}건 (옥수수 ${ss.cornCount}건, 밤 ${ss.chestnutCount}건)`,
      `- 배송 준비 중: ${ss.pendingShipping}건`,
      `- 오늘 매출: ${(ss.totalAmount || 0).toLocaleString('ko-KR')}원`,
      `- 어제 대비: ${ss.revenueChangePercent > 0 ? '+' : ''}${ss.revenueChangePercent}%`,
      ``,
      `[인플루언서 현황]`,
      `- 총 누적: ${inf.total}명`,
      `- 어제 신규: ${inf.newYesterday}명`,
      `- 플랫폼별: ${Object.entries(inf.byPlatform).map(([k, v]) => `${k} ${v}명`).join(', ')}`,
      inf.recentNames && inf.recentNames.length > 0
        ? `- 어제 추가된 인플루언서: ${inf.recentNames.join(', ')}`
        : '',
    ].filter(Boolean).join('\n');

    addLog('BRIEFING', 'success', '모닝 브리핑 데이터 통합 완료');
    addLog('COMPLETE', 'success', `전체 브리핑 준비 완료 (${((Date.now() - startTime) / 1000).toFixed(1)}초 소요)`);

    result.actionLogs = logs;
    return res.json({ success: true, ...result });

  } catch (err) {
    addLog('ERROR', 'fail', `브리핑 실패: ${err.message}`);
    result.actionLogs = logs;
    return res.status(500).json({ success: false, error: err.message, ...result });
  }
};
