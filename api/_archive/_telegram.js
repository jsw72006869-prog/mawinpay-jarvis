// 텔레그램 알림 공통 모듈
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * 텔레그램으로 메시지 발송
 * @param {string} message - 발송할 메시지 (HTML 형식 지원)
 * @param {string} [chatId] - 특정 chat_id (없으면 기본값 사용)
 */
async function sendTelegram(message, chatId = null) {
  const token = TELEGRAM_TOKEN;
  const chat = chatId || TELEGRAM_CHAT_ID;

  if (!token || !chat) {
    console.warn('[Telegram] 환경변수 TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 미설정');
    return { ok: false, error: '텔레그램 설정 없음' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('[Telegram] 발송 실패:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * 텔레그램 파일(문서) 발송
 * @param {Buffer} fileBuffer - 파일 버퍼
 * @param {string} fileName - 파일명
 * @param {string} caption - 파일 설명
 */
async function sendTelegramDocument(fileBuffer, fileName, caption = '') {
  const token = TELEGRAM_TOKEN;
  const chat = TELEGRAM_CHAT_ID;

  if (!token || !chat) return { ok: false, error: '텔레그램 설정 없음' };

  try {
    const { FormData, Blob } = await import('node:buffer').catch(() => {
      // Node 18 이하 fallback
      return { FormData: global.FormData, Blob: global.Blob };
    });

    const form = new FormData();
    form.append('chat_id', chat);
    form.append('caption', caption);
    form.append('document', new Blob([fileBuffer]), fileName);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    return await res.json();
  } catch (err) {
    console.error('[Telegram] 파일 발송 실패:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * 작업 완료 보고 메시지 포맷
 */
const TelegramReport = {
  // 주문 조회 완료
  orderQuery: (count, period, summary) =>
    `📦 <b>주문 조회 완료</b>\n\n` +
    `📅 기간: ${period}\n` +
    `📊 총 주문: <b>${count}건</b>\n` +
    `${summary}\n\n` +
    `⏰ ${new Date().toLocaleString('ko-KR')}`,

  // 발주확인 완료
  orderConfirm: (count) =>
    `✅ <b>발주확인 처리 완료</b>\n\n` +
    `📦 처리 건수: <b>${count}건</b>\n` +
    `⏰ ${new Date().toLocaleString('ko-KR')}`,

  // 주문서 생성 완료
  orderSheet: (count, fileName) =>
    `📋 <b>주문서 생성 완료</b>\n\n` +
    `📊 주문 수: <b>${count}건</b>\n` +
    `📁 파일명: ${fileName}\n` +
    `⏰ ${new Date().toLocaleString('ko-KR')}`,

  // 정산서 생성 완료
  settlement: (totalSales, totalOrders, fileName) =>
    `💰 <b>정산서 생성 완료</b>\n\n` +
    `📊 총 주문: <b>${totalOrders}건</b>\n` +
    `💵 총 매출: <b>${Number(totalSales).toLocaleString('ko-KR')}원</b>\n` +
    `📁 파일명: ${fileName}\n` +
    `⏰ ${new Date().toLocaleString('ko-KR')}`,

  // 발주 이메일 발송 완료
  purchaseEmail: (supplier, itemCount, totalQty) =>
    `📧 <b>발주 이메일 발송 완료</b>\n\n` +
    `🏭 공급업체: <b>${supplier}</b>\n` +
    `📦 상품 종류: ${itemCount}종\n` +
    `📊 총 발주 수량: <b>${totalQty}개</b>\n` +
    `⏰ ${new Date().toLocaleString('ko-KR')}`,

  // 발송 처리 완료
  shipping: (count, courier) =>
    `🚚 <b>발송 처리 완료</b>\n\n` +
    `📦 처리 건수: <b>${count}건</b>\n` +
    `🏢 택배사: ${courier}\n` +
    `⏰ ${new Date().toLocaleString('ko-KR')}`,

  // 취소/반품 알림
  cancelAlert: (count) =>
    `⚠️ <b>취소/반품 요청 알림</b>\n\n` +
    `📦 요청 건수: <b>${count}건</b>\n` +
    `확인이 필요합니다.\n` +
    `⏰ ${new Date().toLocaleString('ko-KR')}`,

  // 오류 알림
  error: (action, errorMsg) =>
    `❌ <b>작업 실패 알림</b>\n\n` +
    `🔧 작업: ${action}\n` +
    `💬 오류: ${errorMsg}\n` +
    `⏰ ${new Date().toLocaleString('ko-KR')}`,

  // 아침 업무 시작 보고
  morningReport: (newOrders, cancelOrders, pendingShipping) =>
    `🌅 <b>아침 업무 보고</b>\n\n` +
    `📦 신규 주문: <b>${newOrders}건</b>\n` +
    `❌ 취소 요청: <b>${cancelOrders}건</b>\n` +
    `🚚 발송 대기: <b>${pendingShipping}건</b>\n` +
    `⏰ ${new Date().toLocaleString('ko-KR')}`,

  // 주간 마감 보고
  weeklyReport: (totalOrders, totalSales, topProduct) =>
    `📊 <b>주간 마감 보고</b>\n\n` +
    `📦 총 주문: <b>${totalOrders}건</b>\n` +
    `💰 총 매출: <b>${Number(totalSales).toLocaleString('ko-KR')}원</b>\n` +
    `🏆 베스트 상품: ${topProduct}\n` +
    `⏰ ${new Date().toLocaleString('ko-KR')}`,
};

module.exports = { sendTelegram, sendTelegramDocument, TelegramReport };
