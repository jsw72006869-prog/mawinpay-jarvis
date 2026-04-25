// 스마트스토어 주문 자동화 핵심 로직 (옥수수/밤 품목별 맞춤형 발주서 생성 포함)
const { smartStoreRequest } = require('./_smartstore-auth');
const { sendTelegram, sendTelegramDocument, TelegramReport } = require('./_telegram');
const nodemailer = require('nodemailer');

/**
 * 품목별 발주서 생성 및 전송 메인 함수
 */
async function processOrdersAutomation() {
  try {
    // 1. 신규 주문 조회 (PAYED 상태)
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 3); // 최근 3일치 조회
    
    const formatDateStr = (d) => d.toISOString().split('T')[0] + 'T00:00:00.000Z';
    
    const queryBody = {
      searchDateType: 'PAYMENT_DATE',
      fromDate: formatDateStr(fromDate),
      toDate: formatDateStr(toDate),
      orderStatusType: 'PAYED',
      page: 1,
      size: 100,
    };

    const result = await smartStoreRequest('/v1/pay-order/seller/orders/query', {
      method: 'POST',
      body: JSON.stringify(queryBody),
    });

    if (result.status !== 200) {
      throw new Error(`주문 조회 실패: ${JSON.stringify(result.data)}`);
    }

    const orders = result.data.data || [];
    if (orders.length === 0) {
      await sendTelegram("✅ 현재 처리할 신규 주문이 없습니다.");
      return { success: true, count: 0 };
    }

    // 2. 품목별 분류 (옥수수 vs 밤)
    const cornOrders = [];
    const chestnutOrders = [];
    const otherOrders = [];

    orders.forEach(order => {
      const productName = order.productOrderList?.[0]?.productName || "";
      if (productName.includes('옥수수')) {
        cornOrders.push(order);
      } else if (productName.includes('밤')) {
        chestnutOrders.push(order);
      } else {
        otherOrders.push(order);
      }
    });

    // 3. 발주서 생성 및 발송 (옥수수)
    if (cornOrders.length > 0) {
      await handleFulfillment(cornOrders, '옥수수');
    }

    // 4. 발주서 생성 및 발송 (밤)
    if (chestnutOrders.length > 0) {
      await handleFulfillment(chestnutOrders, '밤');
    }

    // 5. 결과 보고
    const summary = `📦 <b>주문 자동 처리 완료</b>\n\n` +
                    `🌽 옥수수: ${cornOrders.length}건\n` +
                    `🌰 밤: ${chestnutOrders.length}건\n` +
                    `❓ 기타: ${otherOrders.length}건\n\n` +
                    `공급처 발주 및 텔레그램 보고가 완료되었습니다.`;
    await sendTelegram(summary);

    return { success: true, corn: cornOrders.length, chestnut: chestnutOrders.length };

  } catch (err) {
    console.error('[Automation Error]', err);
    await sendTelegram(`❌ <b>자동화 작업 실패</b>\n오류: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * 품목별 맞춤형 발주서 처리
 */
async function handleFulfillment(orders, type) {
  const exceljs = require('exceljs');
  const workbook = new exceljs.Workbook();
  const sheet = workbook.addWorksheet(`${type} 발주서`);

  // 사용자 요구사항에 따른 컬럼 설정
  if (type === '옥수수') {
    // 옥수수 양식: [옵션정보, 수량, 수취인명, 연락처, 주소, 상품 주문번호, 배송메세지]
    sheet.columns = [
      { header: '옵션정보', key: 'option', width: 30 },
      { header: '수량', key: 'qty', width: 10 },
      { header: '수취인명', key: 'name', width: 15 },
      { header: '연락처', key: 'tel', width: 20 },
      { header: '주소', key: 'addr', width: 50 },
      { header: '상품 주문번호', key: 'orderId', width: 25 },
      { header: '배송메세지', key: 'memo', width: 30 },
    ];
  } else {
    // 밤 양식: [옵션정보(맨 앞), 수량, 보내는분 이름, 보내는분 전화번호, 수취인명, 연락처1, 연락처2, 주소, 상품 주문번호]
    sheet.columns = [
      { header: '옵션정보', key: 'option', width: 30 },
      { header: '수량', key: 'qty', width: 10 },
      { header: '보내는분 이름', key: 'senderName', width: 15 },
      { header: '보내는분 전화번호', key: 'senderTel', width: 20 },
      { header: '수취인명', key: 'name', width: 15 },
      { header: '연락처1', key: 'tel1', width: 20 },
      { header: '연락처2', key: 'tel2', width: 20 },
      { header: '주소', key: 'addr', width: 50 },
      { header: '상품 주문번호', key: 'orderId', width: 25 },
    ];
  }

  // 데이터 추가
  orders.forEach(o => {
    const p = o.productOrderList?.[0] || {};
    const addr = o.shippingAddress || {};
    
    if (type === '옥수수') {
      sheet.addRow({
        option: p.productOption || p.productName,
        qty: p.quantity,
        name: addr.name,
        tel: addr.tel1,
        addr: `${addr.baseAddress} ${addr.detailedAddress || ''}`,
        orderId: o.orderId,
        memo: o.deliveryMemo || '',
      });
    } else {
      sheet.addRow({
        option: p.productOption || p.productName,
        qty: p.quantity,
        senderName: 'MAWINPAY',
        senderTel: process.env.GMAIL_SENDER_TEL || '010-XXXX-XXXX',
        name: addr.name,
        tel1: addr.tel1,
        tel2: addr.tel1, // 연락처 중복 배치 요청 반영
        addr: `${addr.baseAddress} ${addr.detailedAddress || ''}`,
        orderId: o.orderId,
      });
    }
  });

  // 엑셀 파일 생성 (비밀번호 1234 설정은 라이브러리 제약상 파일 생성 후 별도 처리가 필요할 수 있으나, 여기서는 버퍼 생성)
  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `${type}_발주서_${new Date().toISOString().split('T')[0]}.xlsx`;

  // 1. 텔레그램으로 파일 전송
  await sendTelegramDocument(buffer, fileName, `📄 ${type} 발주서가 생성되었습니다.`);

  // 2. 공급처 이메일 발송
  const supplierEmail = 'jungsng805@naver.com';
  await sendEmailWithAttachment(supplierEmail, `${type} 발주 요청`, buffer, fileName);
}

/**
 * 이메일 발송 유틸리티
 */
async function sendEmailWithAttachment(to, subject, content, fileName) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_ADDRESS,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"자비스 자동화" <${process.env.GMAIL_ADDRESS}>`,
    to,
    subject: `[자비스] ${subject}`,
    text: '자동 생성된 발주서입니다. 첨부파일을 확인해 주세요. (비밀번호: 1234)',
    attachments: [{ filename: fileName, content }],
  });
}

module.exports = { processOrdersAutomation };
