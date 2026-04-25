// smartstore-scheduler.js
// 매일 아침 9시 자동 실행: 스마트스토어 주문 조회 → 밤/옥수수 분리 → 텔레그램 보고 → 승인 대기
// Vercel Cron Job으로 실행 (vercel.json에 cron 설정 필요)

const { HttpsProxyAgent } = require('https-proxy-agent');
const PROXY_URL = process.env.QUOTAGUARDSTATIC_URL || 'http://6ddy9l3zmc2hbj:oso2bxcjx009edn2v7yu7k7u0hs3z@us-east-static-02.quotaguard.com:9293';
const ExcelJS = require('exceljs');
const nodemailer = require('nodemailer');

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SUPPLY_EMAIL = process.env.SUPPLY_EMAIL || 'jungsng805@naver.com';
const SENDER_NAME = 'selen 셀렌';
const SENDER_PHONE = '010-9943-3201';
const MANAGER_NAME = '이혜안';
const DELIVERY_FEE = 3000;

const BAM_SUPPLY = {
  '공주알밤 대(1kg)': 8000, '공주알밤 대(2kg)이상': 14000,
  '공주알밤 특(1kg)': 10000, '공주알밤 특(2kg)이상': 17000,
  '포르단칼집밤 대(1kg)': 11000, '포르단칼집밤 대(2kg)이상': 20000,
  '포르단칼집밤 특(1kg)': 12000, '포르단칼집밤 특(2kg)이상': 22000,
  '옥광밤 대(1kg)': 15000, '옥광밤 대(2kg)이상': 28000,
  '대보밤 특(1kg)': 11000, '대보밤 특(2kg)이상': 20000,
};
const BAM_SALE = {
  '공주알밤 대(1kg)': 13800, '공주알밤 대(2kg)이상': 24800,
  '공주알밤 특(1kg)': 16800, '공주알밤 특(2kg)이상': 27800,
  '포르단칼집밤 대(1kg)': 19800, '포르단칼집밤 대(2kg)이상': 30800,
  '포르단칼집밤 특(1kg)': 22800, '포르단칼집밤 특(2kg)이상': 32800,
  '대보밤 특(1kg)': 20800, '대보밤 특(2kg)이상': 30800,
};
const OKSU_SUPPLY = {
  '냉동 대학찰옥수수 3X5 15개': 15000,
  '냉동 대학찰옥수수 3X7 21개': 21000,
  '냉동 대학찰옥수수 3X10 30개': 30000,
};
const OKSU_SALE = {
  '냉동 대학찰옥수수 3X5 15개': 28500,
  '냉동 대학찰옥수수 3X7 21개': 36500,
  '냉동 대학찰옥수수 3X10 30개': 52500,
};

async function sendTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: 'HTML' }),
    });
  } catch (e) { console.error('TG error:', e.message); }
}

function normalizeOption(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const src = s.includes(':') ? s.split(':').pop().trim() : s;
  const bamMatch = src.match(/(공주알밤|포르단칼집밤|옥광밤|대보밤)\s*(대|특)\s*(\d+)\s*kg/i);
  if (bamMatch) {
    const kg = parseInt(bamMatch[3]);
    return `${bamMatch[1]} ${bamMatch[2]}(${kg}kg)${kg >= 2 ? '이상' : ''}`;
  }
  if (src.includes('3X5') || src.includes('15개')) return '냉동 대학찰옥수수 3X5 15개';
  if (src.includes('3X7') || src.includes('21개')) return '냉동 대학찰옥수수 3X7 21개';
  if (src.includes('3X10') || src.includes('30개')) return '냉동 대학찰옥수수 3X10 30개';
  return src;
}

function detectType(option) {
  if (['공주알밤','포르단','칼집밤','옥광밤','대보밤'].some(k => option.includes(k))) return 'bam';
  if (['옥수수','찰옥수수','3X5','3X7','3X10'].some(k => option.includes(k))) return 'oksu';
  return 'unknown';
}

async function getSmartStoreOrders() {
  // 스마트스토어 커머스 API로 어제~오늘 주문 조회
  const crypto = require('crypto');
  const clientId = process.env.SMARTSTORE_CLIENT_ID;
  const clientSecret = process.env.SMARTSTORE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  try {
    // 토큰 발급
    const timestamp = Date.now();
    const password = `${clientId}_${timestamp}`;
    const hashed = crypto.createHmac('sha256', clientSecret).update(password).digest('base64');
    const proxyAgent = new HttpsProxyAgent(PROXY_URL);
    const tokenRes = await fetch('https://api.commerce.naver.com/external/v1/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        timestamp: timestamp.toString(),
        client_secret_sign: hashed,
        grant_type: 'client_credentials',
        type: 'SELF',
      }),
      agent: proxyAgent,
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return [];

    // 어제 날짜 주문 조회
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const from = yesterday.toISOString().split('T')[0] + 'T00:00:00.000Z';
    const to = new Date().toISOString().split('T')[0] + 'T23:59:59.999Z';

    const ordersRes = await fetch(
      `https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/query-by-time?from=${from}&to=${to}&limitCount=300`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` }, agent: proxyAgent }
    );
    const ordersData = await ordersRes.json();
    return ordersData.data || [];
  } catch (e) {
    console.error('스마트스토어 API 오류:', e.message);
    return [];
  }
}

module.exports = async (req, res) => {
  // Vercel Cron 인증 헤더 확인
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    await sendTelegram(`🌅 <b>아침 9시 자동 주문 조회 시작</b>\n📅 ${today}`);

    // 스마트스토어 주문 조회
    const apiOrders = await getSmartStoreOrders();

    if (apiOrders.length === 0) {
      await sendTelegram(`📭 <b>${today} 신규 주문 없음</b>\n어제 주문이 없습니다.`);
      return res.status(200).json({ message: '주문 없음' });
    }

    // 주문 데이터 정규화
    const orders = apiOrders.map(o => ({
      productOrderId: o.productOrderId || '',
      recipientName: o.shippingAddress?.name || '',
      optionRaw: o.productOption || o.productName || '',
      quantity: o.quantity || 1,
      recipientPhone: o.shippingAddress?.tel1 || o.shippingAddress?.tel2 || '',
      address: [
        o.shippingAddress?.baseAddress,
        o.shippingAddress?.detailAddress,
      ].filter(Boolean).join(' '),
    }));

    // 밤/옥수수 분리
    const bamOrders = [], oksuOrders = [], unknownOrders = [];
    for (const o of orders) {
      o.option = normalizeOption(o.optionRaw);
      const type = detectType(o.option);
      if (type === 'bam') bamOrders.push(o);
      else if (type === 'oksu') oksuOrders.push(o);
      else unknownOrders.push(o);
    }

    const bamQty = {}, oksuQty = {};
    bamOrders.forEach(o => { bamQty[o.option] = (bamQty[o.option] || 0) + o.quantity; });
    oksuOrders.forEach(o => { oksuQty[o.option] = (oksuQty[o.option] || 0) + o.quantity; });

    // 세션 저장
    if (!global._orderSessions) global._orderSessions = {};
    const sessionId = Date.now().toString(36) + '_auto';
    global._orderSessions[sessionId] = { bamOrders, oksuOrders, bamQty, oksuQty, today, sendEmail: true };

    // 텔레그램 보고
    let tgMsg = `📦 <b>오늘의 주문 현황</b>\n📅 ${today}\n📋 총 주문: ${orders.length}건\n\n`;

    if (bamOrders.length > 0) {
      tgMsg += `🌰 <b>밤 주문 (${bamOrders.length}건)</b>\n`;
      for (const [opt, qty] of Object.entries(bamQty)) {
        const sp = BAM_SUPPLY[opt] || 0;
        tgMsg += `  • ${opt}: ${qty}개\n`;
      }
      const bamTotal = Object.entries(bamQty).reduce((s, [opt, qty]) => s + qty * (BAM_SUPPLY[opt] || 0) + qty * DELIVERY_FEE, 0);
      const bamRevenue = Object.entries(bamQty).reduce((s, [opt, qty]) => s + qty * (BAM_SALE[opt] || 0), 0);
      tgMsg += `  💰 입금 필요: <b>${bamTotal.toLocaleString()}원</b>\n`;
      tgMsg += `  📈 예상 매출: ${bamRevenue.toLocaleString()}원\n`;
      tgMsg += `  💵 예상 순수익: ${(bamRevenue - bamTotal).toLocaleString()}원\n\n`;
    }

    if (oksuOrders.length > 0) {
      tgMsg += `🌽 <b>옥수수 주문 (${oksuOrders.length}건)</b>\n`;
      for (const [opt, qty] of Object.entries(oksuQty)) {
        tgMsg += `  • ${opt}: ${qty}개\n`;
      }
      const oksuTotal = Object.entries(oksuQty).reduce((s, [opt, qty]) => s + qty * (OKSU_SUPPLY[opt] || 0) + qty * DELIVERY_FEE, 0);
      const oksuRevenue = Object.entries(oksuQty).reduce((s, [opt, qty]) => s + qty * (OKSU_SALE[opt] || 0), 0);
      tgMsg += `  💰 입금 필요: <b>${oksuTotal.toLocaleString()}원</b>\n`;
      tgMsg += `  📈 예상 매출: ${oksuRevenue.toLocaleString()}원\n`;
      tgMsg += `  💵 예상 순수익: ${(oksuRevenue - oksuTotal).toLocaleString()}원\n\n`;
    }

    if (unknownOrders.length > 0) {
      tgMsg += `⚠️ <b>인식 불가 주문 ${unknownOrders.length}건</b> - 확인 필요\n\n`;
    }

    const baseUrl = 'https://mawinpay-jarvis.vercel.app/api/smartstore-process-order';
    tgMsg += `━━━━━━━━━━━━━━━━━━\n`;
    tgMsg += `📧 <b>발주서+이메일 발송 승인:</b>\n${baseUrl}?action=approve&session=${sessionId}\n\n`;
    tgMsg += `📋 <b>확인만 (이메일 미발송):</b>\n${baseUrl}?action=approve&session=${sessionId}&noEmail=1`;

    await sendTelegram(tgMsg);

    return res.status(200).json({
      success: true,
      message: '텔레그램 보고 완료',
      summary: { total: orders.length, bam: bamOrders.length, oksu: oksuOrders.length, unknown: unknownOrders.length }
    });

  } catch (err) {
    console.error('스케줄러 오류:', err);
    await sendTelegram(`❌ 자동 주문 조회 실패: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
};
