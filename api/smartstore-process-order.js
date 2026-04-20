/**
 * 스마트스토어 발주서 처리 API
 * - 스마트스토어 발주발송관리 엑셀 파일 파싱 (비밀번호 1234 자동 해제)
 * - 셀렌 발주서 생성 (공급처 양식)
 * - 정산서 생성 (새벽장터용 + 공급자용 2시트)
 * - 공급처 이메일 발송
 * - 텔레그램 완료 보고
 */

import ExcelJS from 'exceljs';
import nodemailer from 'nodemailer';

const SUPPLY_PRICE = {
  '공주알밤 대(1kg)':         8000,
  '공주알밤 대(2kg)이상':     14000,
  '공주알밤 특(1kg)':         10000,
  '공주알밤 특(2kg)이상':     17000,
  '포르단칼집밤 대(1kg)':     11000,
  '포르단칼집밤 대(2kg)이상': 20000,
  '포르단칼집밤 특(1kg)':     12000,
  '포르단칼집밤 특(2kg)이상': 22000,
  '옥광밤 대(1kg)':           15000,
  '옥광밤 대(2kg)이상':       28000,
  '대보밤 특(1kg)':           11000,
  '대보밤 특(2kg)이상':       20000,
};

const DELIVERY_FEE = 3000;
const SENDER_NAME = 'selen 셀렌';
const SENDER_PHONE = '010-9943-3201';
const MANAGER_NAME = '이혜안';
const SUPPLIER_EMAIL = 'jungsng805@naver.com';

async function sendTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
  } catch (e) { /* 무시 */ }
}

function normalizeOption(optionStr) {
  if (!optionStr) return optionStr;
  const s = String(optionStr).trim();
  if (s.includes(':')) {
    const after = s.split(':').slice(1).join(':').trim();
    const m = after.match(/(공주알밤|포르단칼집밤|옥광밤|대보밤)\s*(대|특)\s*(\d+)\s*kg/i);
    if (m) {
      const kg = parseInt(m[3]);
      return `${m[1]} ${m[2]}(${kg}kg)${kg >= 2 ? '이상' : ''}`;
    }
    return after || s;
  }
  const m = s.match(/(공주알밤|포르단칼집밤|옥광밤|대보밤)\s*(대|특)\s*(\d+)\s*kg/i);
  if (m) {
    const kg = parseInt(m[3]);
    return `${m[1]} ${m[2]}(${kg}kg)${kg >= 2 ? '이상' : ''}`;
  }
  return s;
}

async function parseSmartStoreExcel(buffer) {
  let decryptedBuffer = buffer;
  try {
    const msoffcrypto = await import('msoffcrypto-tool');
    const MSOffCrypto = msoffcrypto.default || msoffcrypto;
    const crypto = new MSOffCrypto(buffer);
    const isEnc = await crypto.isEncrypted();
    if (isEnc) {
      const decrypted = await crypto.decrypt('1234');
      const chunks = [];
      for await (const chunk of decrypted) chunks.push(chunk);
      decryptedBuffer = Buffer.concat(chunks);
    }
  } catch (e) {
    console.log('[parse] 비밀번호 해제 스킵:', e.message);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(decryptedBuffer);
  const sheet = workbook.worksheets[0];
  const orders = [];

  sheet.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const vals = [];
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      vals[colNum - 1] = cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : '';
    });
    if (!vals[0] || vals[0] === '') return;
    orders.push({
      productOrderId: vals[0],
      recipientName: vals[7] || '',
      optionInfo: vals[9] || '',
      quantity: parseInt(vals[10]) || 1,
      recipientPhone: vals[13] || '',
      address: vals[17] || '',
    });
  });

  return orders;
}

async function createOrderSheet(orders, date) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('발주서');
  sheet.columns = [
    { width: 30 }, { width: 8 }, { width: 16 }, { width: 18 },
    { width: 14 }, { width: 16 }, { width: 16 }, { width: 40 },
    { width: 10 }, { width: 12 },
  ];

  const headers = ['제품', '수량', '보내시는분이름', '보내시는분 전화번호', '받는분이름', '받는분전화번호', '받는분핸드폰번호', '주소', '비고', '우편번호'];
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, size: 11 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4A017' } };
  headerRow.alignment = { horizontal: 'center' };

  for (const order of orders) {
    const option = normalizeOption(order.optionInfo);
    sheet.addRow([
      option, order.quantity,
      SENDER_NAME, SENDER_PHONE,
      order.recipientName, order.recipientPhone, order.recipientPhone,
      order.address, '', '',
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function createSettlementSheet(orders, date) {
  const qtySummary = {};
  for (const order of orders) {
    const option = normalizeOption(order.optionInfo);
    qtySummary[option] = (qtySummary[option] || 0) + order.quantity;
  }

  const workbook = new ExcelJS.Workbook();

  // 공급자용 시트
  const supSheet = workbook.addWorksheet('공급자용');
  supSheet.columns = [{ width: 30 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }];

  const t1 = supSheet.addRow([`${date} 정산서`]);
  t1.font = { bold: true, size: 14 };
  supSheet.mergeCells('A1:F1');
  t1.alignment = { horizontal: 'center' };
  supSheet.addRow([]);

  const h1 = supSheet.addRow(['제품명', '수량', '제품원가', '배송비', '정산금', '비고']);
  h1.font = { bold: true };
  h1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4A017' } };
  h1.alignment = { horizontal: 'center' };

  let totalSupply = 0, totalDelivery = 0, totalSettlement = 0;

  for (const [option, qty] of Object.entries(qtySummary)) {
    const supplyPrice = SUPPLY_PRICE[option] || 0;
    const deliveryTotal = qty * DELIVERY_FEE;
    const supplyTotal = qty * supplyPrice;
    const settlement = supplyTotal + deliveryTotal;
    totalSupply += supplyTotal;
    totalDelivery += deliveryTotal;
    totalSettlement += settlement;

    const row = supSheet.addRow([option, qty, supplyTotal, deliveryTotal, settlement, '']);
    [3,4,5].forEach(c => { row.getCell(c).numFmt = '#,##0'; });
  }

  supSheet.addRow([]);
  const totRow = supSheet.addRow(['합계', '', totalSupply, totalDelivery, totalSettlement, '']);
  totRow.font = { bold: true };
  totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
  [3,4,5].forEach(c => { totRow.getCell(c).numFmt = '#,##0'; });
  supSheet.addRow([]);
  supSheet.addRow([`담당자: ${MANAGER_NAME}`]);

  // 새벽장터용 시트
  const intSheet = workbook.addWorksheet('새벽장터용');
  intSheet.columns = [{ width: 30 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];

  const t2 = intSheet.addRow([`${date} 정산서 (내부용)`]);
  t2.font = { bold: true, size: 14 };
  intSheet.mergeCells('A1:G1');
  t2.alignment = { horizontal: 'center' };
  intSheet.addRow([]);

  const h2 = intSheet.addRow(['제품명', '수량', '공급가', '배송비', '원가합계', '판매가(추정)', '순수익(추정)']);
  h2.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  h2.alignment = { horizontal: 'center' };

  for (const [option, qty] of Object.entries(qtySummary)) {
    const supplyPrice = SUPPLY_PRICE[option] || 0;
    const deliveryTotal = qty * DELIVERY_FEE;
    const supplyTotal = qty * supplyPrice;
    const costTotal = supplyTotal + deliveryTotal;
    const salePrice = Math.round(supplyPrice * 1.5) * qty;
    const profit = salePrice - costTotal;
    const row = intSheet.addRow([option, qty, supplyTotal, deliveryTotal, costTotal, salePrice, profit]);
    [3,4,5,6,7].forEach(c => { row.getCell(c).numFmt = '#,##0'; });
  }

  intSheet.addRow([]);
  const t3 = intSheet.addRow(['합계', '', totalSupply, totalDelivery, totalSupply + totalDelivery, '', '']);
  t3.font = { bold: true };
  [3,4,5].forEach(c => { t3.getCell(c).numFmt = '#,##0'; });

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(buffer), totalSettlement, qtySummary };
}

async function sendEmail(orderSheetBuffer, settlementBuffer, date, orderCount, totalSettlement) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) throw new Error('이메일 설정이 없습니다. EMAIL_USER, EMAIL_PASS 환경변수를 설정해주세요.');

  const transporter = nodemailer.createTransport({
    service: 'naver',
    auth: { user, pass },
  });

  const subject = `[셀렌] ${date} 발주서 및 정산서`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2 style="color: #333; border-bottom: 2px solid #D4A017; padding-bottom: 10px;">📦 ${date} 발주서 및 정산서</h2>
      <p>안녕하세요,</p>
      <p><strong>셀렌 (담당자: ${MANAGER_NAME})</strong>입니다.</p>
      <p>${date} 발주서와 정산서를 첨부하여 보내드립니다.</p>
      <table style="width:100%; border-collapse:collapse; margin:20px 0;">
        <tr style="background:#f5f5f5;">
          <td style="padding:10px; border:1px solid #ddd; font-weight:bold;">총 주문 건수</td>
          <td style="padding:10px; border:1px solid #ddd;">${orderCount}건</td>
        </tr>
        <tr>
          <td style="padding:10px; border:1px solid #ddd; font-weight:bold;">정산 금액</td>
          <td style="padding:10px; border:1px solid #ddd; color:#D4A017; font-weight:bold;">${Number(totalSettlement).toLocaleString('ko-KR')}원</td>
        </tr>
      </table>
      <p>첨부 파일을 확인해 주시기 바랍니다. 감사합니다.</p>
      <hr style="border:none; border-top:1px solid #eee; margin:20px 0;">
      <p style="color:#999; font-size:12px;">셀렌 | ${MANAGER_NAME} | ${SENDER_PHONE}</p>
    </div>
  `;

  await transporter.sendMail({
    from: `셀렌 <${user}>`,
    to: SUPPLIER_EMAIL,
    subject,
    html,
    attachments: [
      { filename: `셀렌_발주서_${date.replace(/\s/g,'')}.xlsx`, content: orderSheetBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { filename: `정산서_${date.replace(/\s/g,'')}.xlsx`, content: settlementBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    ],
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, fileBase64, fileName, date } = req.body;
  if (!fileBase64) return res.status(400).json({ success: false, error: '파일이 없습니다.' });

  try {
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const today = date || new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

    const orders = await parseSmartStoreExcel(fileBuffer);
    if (!orders || orders.length === 0) {
      return res.status(400).json({ success: false, error: '주문 데이터를 찾을 수 없습니다.' });
    }

    const orderSheetBuffer = await createOrderSheet(orders, today);
    const { buffer: settlementBuffer, totalSettlement, qtySummary } = await createSettlementSheet(orders, today);

    const orderFileName = `셀렌_발주서_${today.replace(/\s/g,'')}.xlsx`;
    const settlementFileName = `정산서_${today.replace(/\s/g,'')}.xlsx`;

    let emailSent = false;
    if (action === 'full_process') {
      try {
        await sendEmail(orderSheetBuffer, settlementBuffer, today, orders.length, totalSettlement);
        emailSent = true;
      } catch (emailErr) {
        console.error('[email] 발송 실패:', emailErr.message);
      }
    }

    const qtyLines = Object.entries(qtySummary).filter(([,q]) => q > 0).map(([n,q]) => `  • ${n}: ${q}개`).join('\n');
    await sendTelegram(`📦 <b>발주서 처리 완료</b>\n\n📅 날짜: ${today}\n📋 총 주문: ${orders.length}건\n\n<b>물품별 수량:</b>\n${qtyLines}\n\n💰 입금 필요액: <b>${Number(totalSettlement).toLocaleString('ko-KR')}원</b>${emailSent ? '\n\n✉️ 공급처 이메일 발송 완료' : ''}\n\n✅ 셀렌 발주서 + 정산서 생성 완료`);

    return res.status(200).json({
      success: true,
      orderCount: orders.length,
      qtySummary,
      totalSettlement,
      orderSheet: orderSheetBuffer.toString('base64'),
      settlementSheet: settlementBuffer.toString('base64'),
      orderFileName,
      settlementFileName,
      emailSent,
    });

  } catch (err) {
    console.error('[smartstore-process-order] 오류:', err);
    await sendTelegram(`❌ 발주서 처리 실패\n오류: ${String(err)}`);
    return res.status(500).json({ success: false, error: String(err) });
  }
}
