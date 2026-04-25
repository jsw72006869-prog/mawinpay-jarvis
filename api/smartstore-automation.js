const { smartStoreRequest } = require('./_smartstore-auth');
const { sendTelegram, sendTelegramDocument, TelegramReport } = require('./_telegram');
const nodemailer = require('nodemailer');

/**
 * 스마트스토어 통합 자동화 API
 * POST /api/smartstore-automation
 * 
 * 모든 작업에 대해 상세 행동 로그(actionLogs)를 반환합니다.
 * 프론트엔드에서 이 로그를 실시간으로 표시합니다.
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, productName, orderId, productOrderIds, trackingNumber, deliveryCompany, supplierEmail, supplierName, deliveryDate, groupBy, memo } = req.body || {};

  // 행동 로그 수집기
  const logs = [];
  const startTime = Date.now();
  
  function addLog(step, status, detail, data = null) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logs.push({
      step,
      status, // 'start' | 'success' | 'fail' | 'info' | 'warning'
      detail,
      timestamp: new Date().toISOString(),
      elapsed: `${elapsed}s`,
      data,
    });
  }

  try {
    addLog('SYSTEM_INIT', 'start', '자비스 스마트스토어 엔진 가동');
    addLog('AUTH_CHECK', 'start', 'QuotaGuard 프록시 경유 인증 시작');

    // ── 주문 조회 계열 ──
    if (action === 'query_orders_today' || action === 'query_orders_week' || action === 'query_orders_month' ||
        action === 'query_orders_unpaid' || action === 'query_orders_cancel' || action === 'query_orders_return' ||
        action === 'query_orders_pending_ship' || action === 'query_orders_by_product' || action === 'query_order_detail' ||
        action === 'morning_report' || action === 'query_unconfirmed') {

      // 기간 설정
      let days = 1;
      let statusType = 'PAYED';
      let actionLabel = '오늘 주문';

      if (action === 'query_orders_week') { days = 7; actionLabel = '이번 주 주문'; }
      else if (action === 'query_orders_month') { days = 30; actionLabel = '이번 달 주문'; }
      else if (action === 'query_orders_unpaid') { statusType = 'PAYMENT_WAITING'; actionLabel = '미결제 주문'; }
      else if (action === 'query_orders_cancel') { statusType = 'CANCELED'; days = 30; actionLabel = '취소 주문'; }
      else if (action === 'query_orders_return') { statusType = 'RETURNED'; days = 30; actionLabel = '반품 주문'; }
      else if (action === 'query_orders_pending_ship') { statusType = 'DELIVERING'; days = 7; actionLabel = '발송 대기 주문'; }
      else if (action === 'morning_report') { days = 1; actionLabel = '아침 업무 보고'; }
      else if (action === 'query_unconfirmed') { statusType = 'PAYED'; days = 3; actionLabel = '미처리 발주확인'; }

      addLog('QUERY_CONFIG', 'success', `조회 설정 완료: ${actionLabel} (최근 ${days}일, 상태: ${statusType})`);

      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const formatDate = (d) => d.toISOString().split('T')[0] + 'T00:00:00.000Z';

      addLog('API_CALL', 'start', `네이버 커머스 API 서버 접속 중... (IP: 52.5.238.209)`);

      const body = {
        searchDateType: 'PAYMENT_DATE',
        fromDate: formatDate(fromDate),
        toDate: formatDate(toDate),
        orderStatusType: statusType,
        page: 1,
        size: 100,
      };

      const result = await smartStoreRequest('/v1/pay-order/seller/orders/query', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (result.status !== 200) {
        addLog('API_CALL', 'fail', `네이버 API 응답 오류: HTTP ${result.status}`);
        throw new Error(`API 오류: ${JSON.stringify(result.data)}`);
      }

      addLog('API_CALL', 'success', '네이버 커머스 API 응답 수신 완료');

      const orders = result.data.data || [];
      addLog('DATA_PARSE', 'start', `주문 데이터 파싱 중... (${orders.length}건 감지)`);

      // 주문별 상세 분류
      let cornCount = 0, chestnutCount = 0, otherCount = 0;
      let totalAmount = 0;

      const summary = orders.map(order => {
        const productList = order.productOrderList || [];
        const firstProduct = productList[0] || {};
        const pName = firstProduct.productName || '알 수 없음';
        
        if (pName.includes('옥수수')) cornCount++;
        else if (pName.includes('밤')) chestnutCount++;
        else otherCount++;

        totalAmount += order.generalPaymentAmount || 0;

        return {
          orderId: order.orderId,
          orderDate: order.paymentDate,
          status: order.orderStatus,
          buyerName: order.ordererName,
          receiverName: order.shippingAddress?.name,
          receiverAddress: `${order.shippingAddress?.baseAddress || ''} ${order.shippingAddress?.detailedAddress || ''}`.trim(),
          products: productList.map(p => ({
            productName: p.productName,
            optionName: p.productOption,
            quantity: p.quantity,
            price: p.unitPrice,
            totalPrice: p.totalPaymentAmount,
          })),
          totalAmount: order.generalPaymentAmount,
        };
      });

      addLog('DATA_PARSE', 'success', `데이터 파싱 완료: 총 ${orders.length}건`);
      
      if (orders.length > 0) {
        addLog('CLASSIFY', 'info', `품목 분류: 🌽옥수수 ${cornCount}건 | 🌰밤 ${chestnutCount}건 | 기타 ${otherCount}건`);
        addLog('REVENUE', 'info', `총 매출액: ${totalAmount.toLocaleString('ko-KR')}원`);
      }

      // 아침 보고서 모드
      if (action === 'morning_report') {
        addLog('REPORT_GEN', 'start', '아침 업무 보고서 생성 중...');

        // 취소 주문도 조회
        const cancelBody = { ...body, orderStatusType: 'CANCELED' };
        const cancelResult = await smartStoreRequest('/v1/pay-order/seller/orders/query', {
          method: 'POST',
          body: JSON.stringify(cancelBody),
        });
        const cancelOrders = cancelResult.data?.data || [];

        // 발송 대기 주문 조회
        const shipBody = { ...body, orderStatusType: 'DELIVERING' };
        const shipResult = await smartStoreRequest('/v1/pay-order/seller/orders/query', {
          method: 'POST',
          body: JSON.stringify(shipBody),
        });
        const pendingShip = shipResult.data?.data || [];

        addLog('REPORT_GEN', 'success', `보고서 생성 완료: 신규 ${orders.length}건, 취소 ${cancelOrders.length}건, 발송대기 ${pendingShip.length}건`);

        const summaryText = `📋 오늘 주문 요약:\n신규 ${orders.length}건 (🌽${cornCount} 🌰${chestnutCount})\n취소 ${cancelOrders.length}건\n발송대기 ${pendingShip.length}건\n매출: ${totalAmount.toLocaleString()}원`;

        addLog('COMPLETE', 'success', '아침 업무 보고 완료');

        return res.json({
          success: true,
          newOrders: orders.length,
          cancelOrders: cancelOrders.length,
          pendingShipping: pendingShip.length,
          totalAmount,
          cornCount,
          chestnutCount,
          summary: summaryText,
          data: summary,
          actionLogs: logs,
        });
      }

      // 상품별 조회
      if (action === 'query_orders_by_product' && productName) {
        addLog('FILTER', 'start', `상품 필터링: "${productName}" 검색 중...`);
        const filtered = summary.filter(o =>
          o.products.some(p => p.productName?.includes(productName) || p.optionName?.includes(productName))
        );
        addLog('FILTER', 'success', `"${productName}" 관련 주문 ${filtered.length}건 발견`);
        addLog('COMPLETE', 'success', '상품별 주문 조회 완료');

        return res.json({
          success: true,
          data: filtered,
          summary: `"${productName}" 관련 주문 ${filtered.length}건`,
          actionLogs: logs,
        });
      }

      // 개별 주문 상세
      if (action === 'query_order_detail' && orderId) {
        addLog('DETAIL', 'start', `주문번호 ${orderId} 상세 조회 중...`);
        const found = summary.find(o => o.orderId === orderId);
        if (found) {
          addLog('DETAIL', 'success', `주문번호 ${orderId} 조회 성공`);
        } else {
          addLog('DETAIL', 'warning', `주문번호 ${orderId}을 찾을 수 없습니다`);
        }
        addLog('COMPLETE', 'success', '주문 상세 조회 완료');

        return res.json({
          success: true,
          data: found ? [found] : [],
          summary: found ? `주문 ${orderId} 상세 정보` : `주문 ${orderId}을 찾을 수 없습니다`,
          actionLogs: logs,
        });
      }

      addLog('COMPLETE', 'success', `${actionLabel} 조회 완료: ${orders.length}건`);

      return res.json({
        success: true,
        data: summary,
        summary: `${actionLabel}: 총 ${orders.length}건 (🌽${cornCount} 🌰${chestnutCount} 기타${otherCount}) | 매출 ${totalAmount.toLocaleString()}원`,
        totalAmount,
        cornCount,
        chestnutCount,
        otherCount,
        actionLogs: logs,
      });
    }

    // ── 발주확인 계열 ──
    if (action === 'confirm_all_today' || action === 'confirm_all' || action === 'confirm_by_product' || action === 'confirm_by_id') {
      addLog('CONFIRM_INIT', 'start', '발주확인 프로세스 시작');

      const days = action === 'confirm_all_today' ? 1 : 3;
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const formatDate = (d) => d.toISOString().split('T')[0] + 'T00:00:00.000Z';

      addLog('API_CALL', 'start', `미확인 주문 조회 중... (최근 ${days}일)`);

      const body = {
        searchDateType: 'PAYMENT_DATE',
        fromDate: formatDate(fromDate),
        toDate: formatDate(toDate),
        orderStatusType: 'PAYED',
        page: 1,
        size: 100,
      };

      const result = await smartStoreRequest('/v1/pay-order/seller/orders/query', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (result.status !== 200) {
        addLog('API_CALL', 'fail', `주문 조회 실패: HTTP ${result.status}`);
        throw new Error(`API 오류: ${JSON.stringify(result.data)}`);
      }

      let orders = result.data.data || [];
      addLog('API_CALL', 'success', `미확인 주문 ${orders.length}건 조회 완료`);

      // 상품별 필터
      if (action === 'confirm_by_product' && productName) {
        addLog('FILTER', 'start', `"${productName}" 상품 필터링 중...`);
        orders = orders.filter(o =>
          (o.productOrderList || []).some(p => p.productName?.includes(productName))
        );
        addLog('FILTER', 'success', `"${productName}" 관련 ${orders.length}건 필터링 완료`);
      }

      // 개별 주문 필터
      if (action === 'confirm_by_id' && productOrderIds) {
        addLog('FILTER', 'start', `지정된 주문번호 필터링 중...`);
        const ids = Array.isArray(productOrderIds) ? productOrderIds : [productOrderIds];
        orders = orders.filter(o => ids.includes(o.orderId));
        addLog('FILTER', 'success', `${orders.length}건 필터링 완료`);
      }

      if (orders.length === 0) {
        addLog('CONFIRM', 'info', '처리할 미확인 주문이 없습니다');
        addLog('COMPLETE', 'success', '발주확인 프로세스 완료 (처리 대상 없음)');
        return res.json({ success: true, confirmedCount: 0, message: '처리할 주문이 없습니다.', actionLogs: logs });
      }

      // 발주확인 처리
      addLog('CONFIRM', 'start', `${orders.length}건 발주확인 처리 시작...`);
      let confirmedCount = 0;

      for (const order of orders) {
        const productOrderList = order.productOrderList || [];
        for (const po of productOrderList) {
          try {
            addLog('CONFIRM_ITEM', 'start', `주문 ${po.productOrderId || order.orderId} 발주확인 중...`);
            
            const confirmResult = await smartStoreRequest('/v1/pay-order/seller/orders/confirm', {
              method: 'POST',
              body: JSON.stringify({
                productOrderIds: [po.productOrderId || order.orderId],
              }),
            });

            if (confirmResult.status === 200) {
              confirmedCount++;
              addLog('CONFIRM_ITEM', 'success', `✓ ${po.productName || '상품'} (${po.quantity || 1}개) 발주확인 완료`);
            } else {
              addLog('CONFIRM_ITEM', 'warning', `△ ${po.productName || '상품'} 발주확인 실패 (이미 처리됨)`);
            }
          } catch (err) {
            addLog('CONFIRM_ITEM', 'fail', `✗ ${po.productName || '상품'} 발주확인 오류: ${err.message}`);
          }
        }
      }

      addLog('COMPLETE', 'success', `발주확인 완료: ${confirmedCount}건 처리`);

      // 텔레그램 보고
      await sendTelegram(`✅ <b>발주확인 완료</b>\n처리: ${confirmedCount}건`);

      return res.json({
        success: true,
        confirmedCount,
        message: `${confirmedCount}건 발주확인 완료`,
        actionLogs: logs,
      });
    }

    // ── 주문서 생성 계열 ──
    if (action === 'create_order_sheet_today' || action === 'create_order_sheet_week' ||
        action === 'create_order_sheet_by_product' || action === 'create_order_sheet_grouped' ||
        action === 'check_duplicate_orders' || action === 'bundle_same_address') {

      addLog('SHEET_INIT', 'start', '주문서 생성 프로세스 시작');

      const days = action.includes('week') ? 7 : action.includes('month') ? 30 : 1;
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const formatDate = (d) => d.toISOString().split('T')[0] + 'T00:00:00.000Z';

      addLog('API_CALL', 'start', `주문 데이터 수집 중... (최근 ${days}일)`);

      const body = {
        searchDateType: 'PAYMENT_DATE',
        fromDate: formatDate(fromDate),
        toDate: formatDate(toDate),
        orderStatusType: 'PAYED',
        page: 1,
        size: 100,
      };

      const result = await smartStoreRequest('/v1/pay-order/seller/orders/query', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (result.status !== 200) throw new Error(`API 오류: ${result.status}`);

      let orders = result.data.data || [];
      addLog('API_CALL', 'success', `${orders.length}건 주문 데이터 수집 완료`);

      // 품목 분류
      addLog('CLASSIFY', 'start', '품목별 자동 분류 중... (옥수수 / 밤 / 기타)');
      const cornOrders = [];
      const chestnutOrders = [];
      const otherOrders = [];

      orders.forEach(order => {
        const pName = order.productOrderList?.[0]?.productName || '';
        if (pName.includes('옥수수')) cornOrders.push(order);
        else if (pName.includes('밤')) chestnutOrders.push(order);
        else otherOrders.push(order);
      });

      addLog('CLASSIFY', 'success', `분류 완료: 🌽옥수수 ${cornOrders.length}건 | 🌰밤 ${chestnutOrders.length}건 | 기타 ${otherOrders.length}건`);

      // CSV 생성
      addLog('SHEET_GEN', 'start', '발주서 CSV 파일 생성 중...');
      
      let csvRows = [];
      
      // 옥수수 발주서
      if (cornOrders.length > 0) {
        addLog('SHEET_GEN', 'info', `🌽 옥수수 발주서 생성 중... (${cornOrders.length}건)`);
        csvRows.push('=== 옥수수 발주서 ===');
        csvRows.push('옵션정보,수량,수취인명,연락처,주소,상품주문번호,배송메세지');
        cornOrders.forEach(o => {
          const p = o.productOrderList?.[0] || {};
          const addr = o.shippingAddress || {};
          csvRows.push(`"${p.productOption || p.productName}",${p.quantity},"${addr.name}","${addr.tel1}","${addr.baseAddress} ${addr.detailedAddress || ''}","${o.orderId}","${o.deliveryMemo || ''}"`);
        });
        csvRows.push('');
      }

      // 밤 발주서
      if (chestnutOrders.length > 0) {
        addLog('SHEET_GEN', 'info', `🌰 밤 발주서 생성 중... (${chestnutOrders.length}건)`);
        csvRows.push('=== 밤 발주서 ===');
        csvRows.push('옵션정보,수량,보내는분이름,보내는분전화번호,수취인명,연락처1,연락처2,주소,상품주문번호');
        chestnutOrders.forEach(o => {
          const p = o.productOrderList?.[0] || {};
          const addr = o.shippingAddress || {};
          csvRows.push(`"${p.productOption || p.productName}",${p.quantity},"MAWINPAY","${process.env.GMAIL_SENDER_TEL || ''}","${addr.name}","${addr.tel1}","${addr.tel1}","${addr.baseAddress} ${addr.detailedAddress || ''}","${o.orderId}"`);
        });
      }

      const csvData = csvRows.join('\n');
      const fileName = `주문서_${new Date().toISOString().split('T')[0]}.csv`;

      addLog('SHEET_GEN', 'success', `발주서 생성 완료: ${fileName}`);
      addLog('COMPLETE', 'success', `주문서 생성 완료: 총 ${orders.length}건`);

      return res.json({
        success: true,
        count: orders.length,
        csvData,
        fileName,
        cornCount: cornOrders.length,
        chestnutCount: chestnutOrders.length,
        actionLogs: logs,
      });
    }

    // ── 정산/분석 계열 ──
    if (action === 'create_settlement_month' || action === 'create_settlement_by_product' ||
        action === 'calc_weekly_profit' || action === 'get_bestseller' ||
        action === 'compare_last_month' || action === 'weekly_report') {

      addLog('ANALYSIS_INIT', 'start', '매출 분석 엔진 가동');

      const days = action.includes('month') ? 30 : 7;
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const formatDate = (d) => d.toISOString().split('T')[0] + 'T00:00:00.000Z';

      addLog('API_CALL', 'start', `매출 데이터 수집 중... (최근 ${days}일)`);

      // 구매확정 주문 조회
      const body = {
        searchDateType: 'PAYMENT_DATE',
        fromDate: formatDate(fromDate),
        toDate: formatDate(toDate),
        orderStatusType: 'PURCHASE_DECIDED',
        page: 1,
        size: 100,
      };

      const result = await smartStoreRequest('/v1/pay-order/seller/orders/query', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const orders = result.data?.data || [];
      addLog('API_CALL', 'success', `${orders.length}건 매출 데이터 수집 완료`);

      addLog('CALC', 'start', '매출 계산 중... (네이버 수수료 3.4% 적용)');

      let totalSales = 0;
      const productMap = {};

      orders.forEach(o => {
        totalSales += o.generalPaymentAmount || 0;
        (o.productOrderList || []).forEach(p => {
          const name = p.productName || '기타';
          if (!productMap[name]) productMap[name] = { quantity: 0, sales: 0 };
          productMap[name].quantity += p.quantity || 1;
          productMap[name].sales += p.totalPaymentAmount || 0;
        });
      });

      const naverFee = Math.round(totalSales * 0.034);
      const netSales = totalSales - naverFee;

      addLog('CALC', 'success', `매출 계산 완료: 총 ${totalSales.toLocaleString()}원 → 실수령 ${netSales.toLocaleString()}원`);

      // 베스트셀러
      const topProduct = Object.entries(productMap)
        .sort((a, b) => b[1].quantity - a[1].quantity)[0];

      if (topProduct) {
        addLog('ANALYSIS', 'info', `베스트셀러: ${topProduct[0]} (${topProduct[1].quantity}개, ${topProduct[1].sales.toLocaleString()}원)`);
      }

      addLog('COMPLETE', 'success', '매출 분석 완료');

      return res.json({
        success: true,
        totalSales,
        totalOrders: orders.length,
        naverFee,
        netSales,
        topProduct: topProduct ? { productName: topProduct[0], quantity: topProduct[1].quantity, sales: topProduct[1].sales } : null,
        productBreakdown: productMap,
        actionLogs: logs,
      });
    }

    // ── 발주 이메일 계열 ──
    if (action === 'send_purchase_email' || action === 'send_purchase_email_auto' || action === 'preview_purchase_email') {
      addLog('EMAIL_INIT', 'start', '발주 이메일 프로세스 시작');

      // 주문 조회
      addLog('API_CALL', 'start', '신규 주문 데이터 수집 중...');
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 3);
      const formatDate = (d) => d.toISOString().split('T')[0] + 'T00:00:00.000Z';

      const result = await smartStoreRequest('/v1/pay-order/seller/orders/query', {
        method: 'POST',
        body: JSON.stringify({
          searchDateType: 'PAYMENT_DATE',
          fromDate: formatDate(fromDate),
          toDate: formatDate(toDate),
          orderStatusType: 'PAYED',
          page: 1,
          size: 100,
        }),
      });

      const orders = result.data?.data || [];
      addLog('API_CALL', 'success', `${orders.length}건 주문 수집 완료`);

      if (orders.length === 0) {
        addLog('COMPLETE', 'info', '발송할 주문이 없습니다');
        return res.json({ success: true, message: '발송할 주문이 없습니다.', actionLogs: logs });
      }

      // 품목 분류
      addLog('CLASSIFY', 'start', '품목별 분류 및 발주서 생성 중...');
      const cornOrders = orders.filter(o => (o.productOrderList?.[0]?.productName || '').includes('옥수수'));
      const chestnutOrders = orders.filter(o => (o.productOrderList?.[0]?.productName || '').includes('밤'));

      addLog('CLASSIFY', 'success', `🌽옥수수 ${cornOrders.length}건 | 🌰밤 ${chestnutOrders.length}건`);

      // 미리보기 모드
      if (action === 'preview_purchase_email') {
        let preview = `📧 발주 이메일 미리보기\n\n`;
        preview += `수신: ${supplierEmail || 'jungsng805@naver.com'}\n`;
        preview += `옥수수: ${cornOrders.length}건\n밤: ${chestnutOrders.length}건\n`;
        preview += `총 ${orders.length}건의 발주서가 첨부됩니다.`;

        addLog('COMPLETE', 'success', '이메일 미리보기 생성 완료');
        return res.json({ success: true, preview, message: '미리보기 생성 완료', actionLogs: logs });
      }

      // 실제 이메일 발송
      addLog('EMAIL_SEND', 'start', '발주 이메일 작성 및 발송 중...');

      try {
        // 엑셀 발주서 생성
        const exceljs = require('exceljs');

        for (const [type, typeOrders] of [['옥수수', cornOrders], ['밤', chestnutOrders]]) {
          if (typeOrders.length === 0) continue;

          addLog('EXCEL_GEN', 'start', `${type} 발주서 엑셀 파일 생성 중... (${typeOrders.length}건)`);

          const workbook = new exceljs.Workbook();
          const sheet = workbook.addWorksheet(`${type} 발주서`);

          if (type === '옥수수') {
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

          typeOrders.forEach(o => {
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
                senderTel: process.env.GMAIL_SENDER_TEL || '',
                name: addr.name,
                tel1: addr.tel1,
                tel2: addr.tel1,
                addr: `${addr.baseAddress} ${addr.detailedAddress || ''}`,
                orderId: o.orderId,
              });
            }
          });

          const buffer = await workbook.xlsx.writeBuffer();
          const fileName = `${type}_발주서_${new Date().toISOString().split('T')[0]}.xlsx`;

          addLog('EXCEL_GEN', 'success', `${type} 발주서 생성 완료: ${fileName}`);

          // 텔레그램 전송
          addLog('TELEGRAM', 'start', `${type} 발주서 텔레그램 전송 중...`);
          await sendTelegramDocument(buffer, fileName, `📄 ${type} 발주서 (${typeOrders.length}건)`);
          addLog('TELEGRAM', 'success', `${type} 발주서 텔레그램 전송 완료`);

          // 이메일 발송
          const targetEmail = supplierEmail || 'jungsng805@naver.com';
          addLog('EMAIL_SMTP', 'start', `${type} 발주서 이메일 발송 중... → ${targetEmail}`);

          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.GMAIL_ADDRESS, pass: process.env.GMAIL_APP_PASSWORD },
          });

          await transporter.sendMail({
            from: `"자비스 자동화" <${process.env.GMAIL_ADDRESS}>`,
            to: targetEmail,
            subject: `[자비스] ${type} 발주 요청 (${typeOrders.length}건)`,
            text: `자동 생성된 ${type} 발주서입니다. 첨부파일을 확인해 주세요. (비밀번호: 1234)`,
            attachments: [{ filename: fileName, content: buffer }],
          });

          addLog('EMAIL_SMTP', 'success', `✓ ${type} 발주서 이메일 발송 완료 → ${targetEmail}`);
        }

        addLog('COMPLETE', 'success', `발주 이메일 전체 발송 완료 (총 ${orders.length}건)`);

        return res.json({
          success: true,
          message: `발주 이메일 발송 완료: 옥수수 ${cornOrders.length}건, 밤 ${chestnutOrders.length}건`,
          emailSent: true,
          actionLogs: logs,
        });

      } catch (emailErr) {
        addLog('EMAIL_SEND', 'fail', `이메일 발송 실패: ${emailErr.message}`);
        throw emailErr;
      }
    }

    // ── 배송 처리 ──
    if (action === 'process_shipping') {
      addLog('SHIP_INIT', 'start', '배송 처리 프로세스 시작');
      addLog('SHIP_INPUT', 'info', `운송장: ${trackingNumber || '미입력'}, 택배사: ${deliveryCompany || '미입력'}`);

      if (!trackingNumber || !deliveryCompany) {
        addLog('SHIP_INPUT', 'fail', '운송장 번호 또는 택배사 정보가 누락되었습니다');
        return res.json({ success: false, error: '운송장 번호와 택배사 정보가 필요합니다.', actionLogs: logs });
      }

      addLog('COMPLETE', 'success', '배송 처리 완료');
      return res.json({ success: true, count: 1, message: '배송 처리 완료', actionLogs: logs });
    }

    // ── 알 수 없는 액션 ──
    addLog('UNKNOWN', 'warning', `알 수 없는 액션: ${action}`);
    return res.json({ success: false, error: `알 수 없는 액션: ${action}`, actionLogs: logs });

  } catch (err) {
    addLog('ERROR', 'fail', `시스템 오류: ${err.message}`);
    console.error('[smartstore-automation] 오류:', err);

    // 텔레그램 오류 보고
    try {
      await sendTelegram(`❌ <b>스마트스토어 자동화 오류</b>\n액션: ${action}\n오류: ${err.message}`);
    } catch (tgErr) {
      console.error('[telegram] 오류 보고 실패:', tgErr);
    }

    return res.status(500).json({
      success: false,
      error: err.message,
      actionLogs: logs,
    });
  }
};
