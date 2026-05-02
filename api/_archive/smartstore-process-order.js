// smartstore-process-order.js
// 통합 발주서 → 밤/옥수수 자동 분리 → 각각 발주서+정산서 생성 → 텔레그램 보고 → 승인 후 이메일 발송
const ExcelJS = require('exceljs');
const nodemailer = require('nodemailer');

// ── 상수 정의 ──────────────────────────────────────────────────
const SENDER_NAME = 'selen 셀렌';
const SENDER_PHONE = '010-9943-3201';
const MANAGER_NAME = '이혜안';
const DELIVERY_FEE = 3000;
const SUPPLY_EMAIL = process.env.SUPPLY_EMAIL || 'jungsng805@naver.com';

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ── 밤 공급단가 ──
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

// ── 옥수수 공급단가 ──
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

// ── 옵션명 정규화 ──
function normalizeOption(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const src = s.includes(':') ? s.split(':').pop().trim() : s;

  // 밤 패턴
  const bamMatch = src.match(/(공주알밤|포르단칼집밤|옥광밤|대보밤)\s*(대|특)\s*(\d+)\s*kg/i);
  if (bamMatch) {
    const kg = parseInt(bamMatch[3]);
    return `${bamMatch[1]} ${bamMatch[2]}(${kg}kg)${kg >= 2 ? '이상' : ''}`;
  }

  // 옥수수 패턴
  const oksuMatch = src.match(/(\d+)[Xx×](\d+)\s*(\d+)개?/);
  if (oksuMatch) {
    return `냉동 대학찰옥수수 ${oksuMatch[1]}X${oksuMatch[2]} ${oksuMatch[3]}개`;
  }
  if (src.includes('3X5') || src.includes('15개')) return '냉동 대학찰옥수수 3X5 15개';
  if (src.includes('3X7') || src.includes('21개')) return '냉동 대학찰옥수수 3X7 21개';
  if (src.includes('3X10') || src.includes('30개')) return '냉동 대학찰옥수수 3X10 30개';

  return src;
}

// ── 상품 타입 판별 ──
function detectProductType(option) {
  const BAM_KEYWORDS = ['공주알밤', '포르단', '칼집밤', '옥광밤', '대보밤'];
  const OKSU_KEYWORDS = ['옥수수', '찰옥수수', '3X5', '3X7', '3X10'];
  if (BAM_KEYWORDS.some(k => option.includes(k))) return 'bam';
  if (OKSU_KEYWORDS.some(k => option.includes(k))) return 'oksu';
  return 'unknown';
}

// ── 텔레그램 메시지 발송 ──
async function sendTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: 'HTML' }),
    });
    return await res.json();
  } catch (e) { console.error('TG error:', e.message); }
}

// ── 텔레그램 파일 발송 ──
async function sendTelegramDocument(fileBuffer, filename, caption) {
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  try {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('chat_id', TG_CHAT_ID);
    form.append('caption', caption || '');
    form.append('document', fileBuffer, { filename });
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendDocument`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });
    return await res.json();
  } catch (e) {
    console.error('TG doc error:', e.message);
  }
}

// ── 엑셀 발주서 생성 (밤) ──
async function createBamOrderExcel(orders) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('발주서');
  const GOLD = 'FFD4A017';
  ws.columns = [
    { header: '제품', key: 'product', width: 30 },
    { header: '수량', key: 'qty', width: 8 },
    { header: '보내시는분이름', key: 'senderName', width: 16 },
    { header: '보내시는분 전화번호', key: 'senderPhone', width: 20 },
    { header: '받는분이름', key: 'recvName', width: 14 },
    { header: '받는분전화번호', key: 'recvPhone1', width: 16 },
    { header: '받는분핸드폰번호', key: 'recvPhone2', width: 16 },
    { header: '주소', key: 'address', width: 45 },
  ];
  ws.getRow(1).eachCell(cell => {
    cell.font = { bold: true, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
    cell.alignment = { horizontal: 'center' };
  });
  for (const o of orders) {
    ws.addRow({
      product: o.option, qty: o.quantity,
      senderName: SENDER_NAME, senderPhone: SENDER_PHONE,
      recvName: o.recipientName, recvPhone1: o.recipientPhone, recvPhone2: o.recipientPhone,
      address: o.address,
    });
  }
  return await wb.xlsx.writeBuffer();
}

// ── 엑셀 발주서 생성 (옥수수) ──
async function createOksuOrderExcel(orders) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('발주서');
  const BLUE = 'FF1E90FF';
  ws.columns = [
    { header: '제품', key: 'product', width: 30 },
    { header: '수량', key: 'qty', width: 8 },
    { header: '보내시는분이름', key: 'senderName', width: 16 },
    { header: '보내시는분 전화번호', key: 'senderPhone', width: 20 },
    { header: '받는분이름', key: 'recvName', width: 14 },
    { header: '받는분전화번호', key: 'recvPhone1', width: 16 },
    { header: '받는분핸드폰번호', key: 'recvPhone2', width: 16 },
    { header: '주소', key: 'address', width: 45 },
  ];
  ws.getRow(1).eachCell(cell => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.alignment = { horizontal: 'center' };
  });
  for (const o of orders) {
    ws.addRow({
      product: o.option, qty: o.quantity,
      senderName: SENDER_NAME, senderPhone: SENDER_PHONE,
      recvName: o.recipientName, recvPhone1: o.recipientPhone, recvPhone2: o.recipientPhone,
      address: o.address,
    });
  }
  return await wb.xlsx.writeBuffer();
}

// ── 정산서 생성 ──
async function createSettlementExcel(qtyMap, supplyMap, saleMap, productType, today) {
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
  supWs.addRow(['날짜', today, '', '담당자', MANAGER_NAME]);
  supWs.addRow([`배송비: ${DELIVERY_FEE.toLocaleString()}원/건`]);
  supWs.addRow([]);
  supWs.addRow(['제품명', '수량', '제품원가', '배송비', '제품원가+배송비']);
  const hRow = supWs.lastRow;
  hRow.eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
    cell.alignment = { horizontal: 'center' };
  });

  let totalSupply = 0, totalDelivery = 0, totalSettlement = 0;
  const unknownOptions = [];

  for (const [option, qty] of Object.entries(qtyMap)) {
    const sp = supplyMap[option] || 0;
    if (!supplyMap[option]) unknownOptions.push(option);
    const dt = qty * DELIVERY_FEE;
    const st = qty * sp;
    const total = st + dt;
    totalSupply += st; totalDelivery += dt; totalSettlement += total;
    const row = supWs.addRow([option, qty, st, dt, total]);
    [3,4,5].forEach(c => { row.getCell(c).numFmt = '#,##0'; });
  }
  supWs.addRow([]);
  const totRow = supWs.addRow(['합계', '', totalSupply, totalDelivery, totalSettlement]);
  [3,4,5].forEach(c => { totRow.getCell(c).numFmt = '#,##0'; totRow.getCell(c).font = { bold: true }; });
  supWs.addRow([]);
  supWs.addRow([`담당자: ${MANAGER_NAME}`]);

  // 새벽장터용 시트 (내부용)
  const intWs = wb.addWorksheet('새벽장터용');
  intWs.columns = [
    { key: 'A', width: 32 }, { key: 'B', width: 8 },
    { key: 'C', width: 14 }, { key: 'D', width: 14 },
    { key: 'E', width: 16 }, { key: 'F', width: 14 }, { key: 'G', width: 14 },
  ];
  intWs.addRow([`새벽장터 ${typeName} 정산서 (내부용)`]);
  intWs.getCell('A1').font = { bold: true, size: 13 };
  intWs.addRow(['날짜', today, '', '담당자', MANAGER_NAME]);
  intWs.addRow([]);
  intWs.addRow(['제품명', '수량', '제품원가', '배송비', '원가+배송', '매출액', '순수익']);
  const hRow2 = intWs.lastRow;
  hRow2.eachCell(cell => {
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
    [3,4,5,6,7].forEach(c => { row.getCell(c).numFmt = '#,##0'; });
  }
  intWs.addRow([]);
  const totRow2 = intWs.addRow(['합계', '', totalSupply, totalDelivery, totalSettlement, totalRevenue, totalProfit]);
  [3,4,5,6,7].forEach(c => { totRow2.getCell(c).numFmt = '#,##0'; totRow2.getCell(c).font = { bold: true }; });

  const buffer = await wb.xlsx.writeBuffer();
  return { buffer, totalSupply, totalDelivery, totalSettlement, totalRevenue, totalProfit, unknownOptions };
}

// ── 이메일 발송 ──
async function sendEmail(to, subject, html, attachments) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_ADDRESS,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return await transporter.sendMail({
    from: `새벽장터 셀렌 <${process.env.GMAIL_ADDRESS}>`,
    to, subject, html, attachments,
  });
}

// ── 메인 핸들러 ──
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 텔레그램 webhook 승인 처리
  if (req.method === 'GET' && req.query.action === 'approve') {
    const sessionId = req.query.session;
    // 세션 스토어에서 데이터 가져오기 (간단히 global 사용)
    const session = global._orderSessions && global._orderSessions[sessionId];
    if (!session) return res.status(404).json({ error: '세션 없음 또는 만료' });

    try {
      const { bamOrders, oksuOrders, bamQty, oksuQty, today, sendEmail: doSendEmail } = session;
      const results = [];

      if (bamOrders.length > 0) {
        const bamOrderBuf = await createBamOrderExcel(bamOrders);
        const bamSettle = await createSettlementExcel(bamQty, BAM_SUPPLY, BAM_SALE, 'bam', today);
        if (doSendEmail) {
          await sendEmail(
            SUPPLY_EMAIL,
            `[새벽장터 셀렌] 밤 발주서 - ${today}`,
            `<p>안녕하세요. 새벽장터 셀렌입니다.</p><p>${today} 밤 발주서와 정산서를 첨부드립니다.</p><p>담당자: ${MANAGER_NAME}</p>`,
            [
              { filename: `셀렌_밤발주서_${today}.xlsx`, content: bamOrderBuf },
              { filename: `밤정산서_${today}.xlsx`, content: bamSettle.buffer },
            ]
          );
        }
        results.push({ type: 'bam', ...bamSettle });
      }

      if (oksuOrders.length > 0) {
        const oksuOrderBuf = await createOksuOrderExcel(oksuOrders);
        const oksuSettle = await createSettlementExcel(oksuQty, OKSU_SUPPLY, OKSU_SALE, 'oksu', today);
        if (doSendEmail) {
          await sendEmail(
            SUPPLY_EMAIL,
            `[새벽장터 셀렌] 옥수수 발주서 - ${today}`,
            `<p>안녕하세요. 새벽장터 셀렌입니다.</p><p>${today} 옥수수 발주서와 정산서를 첨부드립니다.</p><p>담당자: ${MANAGER_NAME}</p>`,
            [
              { filename: `셀렌_옥수수발주서_${today}.xlsx`, content: oksuOrderBuf },
              { filename: `옥수수정산서_${today}.xlsx`, content: oksuSettle.buffer },
            ]
          );
        }
        results.push({ type: 'oksu', ...oksuSettle });
      }

      // 완료 텔레그램 보고
      let completionMsg = `✅ <b>발주서 전송 완료!</b>\n📅 ${today}\n\n`;
      for (const r of results) {
        const typeName = r.type === 'bam' ? '🌰 밤' : '🌽 옥수수';
        completionMsg += `${typeName}\n`;
        completionMsg += `  💰 입금 필요액: ${r.totalSettlement.toLocaleString()}원\n`;
        completionMsg += `  📈 예상 매출: ${r.totalRevenue.toLocaleString()}원\n`;
        completionMsg += `  💵 예상 순수익: ${r.totalProfit.toLocaleString()}원\n\n`;
      }
      if (doSendEmail) completionMsg += `✉️ 공급처 이메일 발송 완료 (${SUPPLY_EMAIL})`;
      else completionMsg += `📋 이메일 미발송 (확인만)`;

      await sendTelegram(completionMsg);
      delete global._orderSessions[sessionId];

      return res.status(200).json({ success: true, results });
    } catch (err) {
      await sendTelegram(`❌ 발주서 처리 실패: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileBase64, sendEmail: doSendEmail = true, autoMode = false } = req.body;
    if (!fileBase64) return res.status(400).json({ error: '파일 데이터 없음' });

    // 파일 파싱
    let msoffcrypto, openpyxl;
    const fileBuffer = Buffer.from(fileBase64, 'base64');

    // ExcelJS로 직접 파싱 (비밀번호 해제는 Python 스크립트로 처리)
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(fileBuffer);
    } catch (e) {
      return res.status(400).json({ error: '파일 열기 실패. 비밀번호가 1234인지 확인하세요.' });
    }

    const ws = wb.worksheets[0];
    const orders = [];
    let rowIdx = 0;

    ws.eachRow((row, rn) => {
      if (rn < 3) return; // 1~2행 헤더 스킵
      const vals = row.values; // 1-indexed
      const orderId = vals[1];
      if (!orderId) return;
      orders.push({
        productOrderId: String(orderId).trim(),
        recipientName: String(vals[8] || '').trim(),
        optionRaw: String(vals[10] || '').trim(),
        quantity: parseInt(vals[11]) || 1,
        recipientPhone: String(vals[14] || '').trim(),
        address: String(vals[18] || '').trim(),
      });
    });

    if (orders.length === 0) return res.status(400).json({ error: '주문 데이터 없음' });

    // 밤/옥수수 분리
    const bamOrders = [], oksuOrders = [], unknownOrders = [];
    for (const o of orders) {
      o.option = normalizeOption(o.optionRaw);
      const type = detectProductType(o.option);
      if (type === 'bam') bamOrders.push(o);
      else if (type === 'oksu') oksuOrders.push(o);
      else unknownOrders.push(o);
    }

    // 수량 집계
    const bamQty = {}, oksuQty = {};
    bamOrders.forEach(o => { bamQty[o.option] = (bamQty[o.option] || 0) + o.quantity; });
    oksuOrders.forEach(o => { oksuQty[o.option] = (oksuQty[o.option] || 0) + o.quantity; });

    const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

    // 세션 저장 (승인 대기)
    if (!global._orderSessions) global._orderSessions = {};
    const sessionId = Date.now().toString(36);
    global._orderSessions[sessionId] = { bamOrders, oksuOrders, bamQty, oksuQty, today, sendEmail: doSendEmail };

    // 텔레그램 보고 메시지 생성
    let tgMsg = `📦 <b>발주서 처리 준비 완료</b>\n📅 ${today}\n📋 총 주문: ${orders.length}건\n\n`;

    if (bamOrders.length > 0) {
      tgMsg += `🌰 <b>밤 주문 (${bamOrders.length}건)</b>\n`;
      for (const [opt, qty] of Object.entries(bamQty)) {
        const sp = BAM_SUPPLY[opt] || 0;
        tgMsg += `  • ${opt}: ${qty}개 (공급가 ${(qty * sp).toLocaleString()}원)\n`;
      }
      const bamTotal = Object.entries(bamQty).reduce((s, [opt, qty]) => s + qty * (BAM_SUPPLY[opt] || 0) + qty * DELIVERY_FEE, 0);
      tgMsg += `  💰 입금 필요: ${bamTotal.toLocaleString()}원\n\n`;
    }

    if (oksuOrders.length > 0) {
      tgMsg += `🌽 <b>옥수수 주문 (${oksuOrders.length}건)</b>\n`;
      for (const [opt, qty] of Object.entries(oksuQty)) {
        const sp = OKSU_SUPPLY[opt] || 0;
        tgMsg += `  • ${opt}: ${qty}개 (공급가 ${(qty * sp).toLocaleString()}원)\n`;
      }
      const oksuTotal = Object.entries(oksuQty).reduce((s, [opt, qty]) => s + qty * (OKSU_SUPPLY[opt] || 0) + qty * DELIVERY_FEE, 0);
      tgMsg += `  💰 입금 필요: ${oksuTotal.toLocaleString()}원\n\n`;
    }

    if (unknownOrders.length > 0) {
      tgMsg += `⚠️ <b>인식 불가 주문 (${unknownOrders.length}건)</b>\n`;
      unknownOrders.forEach(o => { tgMsg += `  • ${o.optionRaw}\n`; });
      tgMsg += '\n';
    }

    const approveUrl = `https://mawinpay-jarvis.vercel.app/api/smartstore-process-order?action=approve&session=${sessionId}`;
    tgMsg += `✅ <b>이메일 발송 승인하려면:</b>\n${approveUrl}\n\n`;
    tgMsg += `📋 <b>확인만 (이메일 미발송):</b>\n${approveUrl}&noEmail=1`;

    await sendTelegram(tgMsg);

    // 자동 모드면 바로 처리
    if (autoMode) {
      // 자동 승인 처리
      const bamOrderBuf = bamOrders.length > 0 ? await createBamOrderExcel(bamOrders) : null;
      const oksuOrderBuf = oksuOrders.length > 0 ? await createOksuOrderExcel(oksuOrders) : null;
      const bamSettle = bamOrders.length > 0 ? await createSettlementExcel(bamQty, BAM_SUPPLY, BAM_SALE, 'bam', today) : null;
      const oksuSettle = oksuOrders.length > 0 ? await createSettlementExcel(oksuQty, OKSU_SUPPLY, OKSU_SALE, 'oksu', today) : null;

      const results = [];
      if (bamOrders.length > 0 && doSendEmail) {
        await sendEmail(SUPPLY_EMAIL, `[새벽장터 셀렌] 밤 발주서 - ${today}`,
          `<p>안녕하세요. 새벽장터 셀렌입니다.</p><p>${today} 밤 발주서와 정산서를 첨부드립니다.</p>`,
          [
            { filename: `셀렌_밤발주서_${today}.xlsx`, content: bamOrderBuf },
            { filename: `밤정산서_${today}.xlsx`, content: bamSettle.buffer },
          ]
        );
        results.push({ type: 'bam', ...bamSettle });
      }
      if (oksuOrders.length > 0 && doSendEmail) {
        await sendEmail(SUPPLY_EMAIL, `[새벽장터 셀렌] 옥수수 발주서 - ${today}`,
          `<p>안녕하세요. 새벽장터 셀렌입니다.</p><p>${today} 옥수수 발주서와 정산서를 첨부드립니다.</p>`,
          [
            { filename: `셀렌_옥수수발주서_${today}.xlsx`, content: oksuOrderBuf },
            { filename: `옥수수정산서_${today}.xlsx`, content: oksuSettle.buffer },
          ]
        );
        results.push({ type: 'oksu', ...oksuSettle });
      }
      delete global._orderSessions[sessionId];
      return res.status(200).json({ success: true, results, message: '자동 처리 완료' });
    }

    return res.status(200).json({
      success: true,
      message: '텔레그램으로 보고 완료. 승인 링크를 확인하세요.',
      sessionId,
      summary: {
        total: orders.length,
        bam: bamOrders.length,
        oksu: oksuOrders.length,
        unknown: unknownOrders.length,
      }
    });

  } catch (err) {
    console.error('처리 오류:', err);
    await sendTelegram(`❌ 발주서 처리 오류: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
};
