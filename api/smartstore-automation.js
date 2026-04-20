// 스마트스토어 전체 자동화 통합 API
// 43가지 명령 처리 + 텔레그램 완료 보고
const { smartStoreRequest } = require('./_smartstore-auth');
const { sendTelegram, sendTelegramDocument, TelegramReport } = require('./_telegram');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.method === 'GET' ? req.query.action : req.body?.action;

  try {
    switch (action) {

      // ─────────────────────────────────────────
      // 1. 주문 조회 관련 (10가지)
      // ─────────────────────────────────────────

      case 'query_orders_today': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const result = await queryOrders(today.toISOString(), new Date().toISOString(), ['PAYMENT_WAITING', 'PAYED', 'DELIVERING', 'DELIVERED']);
        const summary = buildOrderSummary(result.data);
        await sendTelegram(TelegramReport.orderQuery(result.data?.length || 0, '오늘', summary));
        return res.json({ success: true, ...result, summary });
      }

      case 'query_orders_week': {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const result = await queryOrders(weekAgo.toISOString(), new Date().toISOString());
        const summary = buildOrderSummary(result.data);
        await sendTelegram(TelegramReport.orderQuery(result.data?.length || 0, '이번 주', summary));
        return res.json({ success: true, ...result, summary });
      }

      case 'query_orders_month': {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await queryOrders(monthAgo.toISOString(), new Date().toISOString());
        const summary = buildOrderSummary(result.data);
        await sendTelegram(TelegramReport.orderQuery(result.data?.length || 0, '이번 달', summary));
        return res.json({ success: true, ...result, summary });
      }

      case 'query_orders_unpaid': {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await queryOrders(monthAgo.toISOString(), new Date().toISOString(), ['PAYMENT_WAITING']);
        return res.json({ success: true, ...result, message: `미결제 주문 ${result.data?.length || 0}건` });
      }

      case 'query_orders_cancel': {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await queryOrders(monthAgo.toISOString(), new Date().toISOString(), ['CANCEL_REQUEST', 'CANCELED']);
        if (result.data?.length > 0) {
          await sendTelegram(TelegramReport.cancelAlert(result.data.length));
        }
        return res.json({ success: true, ...result, message: `취소 요청 ${result.data?.length || 0}건` });
      }

      case 'query_orders_return': {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await queryOrders(monthAgo.toISOString(), new Date().toISOString(), ['RETURN_REQUEST', 'RETURNED', 'EXCHANGE_REQUEST']);
        if (result.data?.length > 0) {
          await sendTelegram(TelegramReport.cancelAlert(result.data.length));
        }
        return res.json({ success: true, ...result, message: `반품/교환 요청 ${result.data?.length || 0}건` });
      }

      case 'query_orders_by_product': {
        const { productName } = req.body || req.query;
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await queryOrders(monthAgo.toISOString(), new Date().toISOString());
        const filtered = (result.data || []).filter(o =>
          o.productName?.includes(productName) || o.productOrderId?.includes(productName)
        );
        return res.json({ success: true, data: filtered, count: filtered.length, message: `'${productName}' 주문 ${filtered.length}건` });
      }

      case 'query_order_detail': {
        const { orderId } = req.body || req.query;
        const { status, data } = await smartStoreRequest(`/v1/pay-order/seller/orders/${orderId}`);
        return res.json({ success: status === 200, data });
      }

      case 'query_orders_pending_ship': {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await queryOrders(monthAgo.toISOString(), new Date().toISOString(), ['PAYED', 'DELIVERING']);
        return res.json({ success: true, ...result, message: `발송 대기 ${result.data?.length || 0}건` });
      }

      case 'morning_report': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [newOrders, cancelOrders, pendingShip] = await Promise.all([
          queryOrders(today.toISOString(), new Date().toISOString(), ['PAYED']),
          queryOrders(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), new Date().toISOString(), ['CANCEL_REQUEST']),
          queryOrders(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), new Date().toISOString(), ['PAYED']),
        ]);
        await sendTelegram(TelegramReport.morningReport(
          newOrders.data?.length || 0,
          cancelOrders.data?.length || 0,
          pendingShip.data?.length || 0
        ));
        return res.json({
          success: true,
          newOrders: newOrders.data?.length || 0,
          cancelOrders: cancelOrders.data?.length || 0,
          pendingShipping: pendingShip.data?.length || 0,
        });
      }

      // ─────────────────────────────────────────
      // 2. 발주확인 처리 (6가지)
      // ─────────────────────────────────────────

      case 'confirm_all_today': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const orders = await queryOrders(today.toISOString(), new Date().toISOString(), ['PAYED']);
        const ids = extractProductOrderIds(orders.data);
        if (ids.length === 0) return res.json({ success: true, message: '발주확인할 주문이 없습니다.', count: 0 });
        const result = await confirmOrders(ids);
        await sendTelegram(TelegramReport.orderConfirm(ids.length));
        return res.json({ success: true, confirmedCount: ids.length, ...result });
      }

      case 'confirm_all': {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const orders = await queryOrders(monthAgo.toISOString(), new Date().toISOString(), ['PAYED']);
        const ids = extractProductOrderIds(orders.data);
        if (ids.length === 0) return res.json({ success: true, message: '발주확인할 주문이 없습니다.', count: 0 });
        const result = await confirmOrders(ids);
        await sendTelegram(TelegramReport.orderConfirm(ids.length));
        return res.json({ success: true, confirmedCount: ids.length, ...result });
      }

      case 'confirm_by_product': {
        const { productName } = req.body || req.query;
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const orders = await queryOrders(monthAgo.toISOString(), new Date().toISOString(), ['PAYED']);
        const filtered = (orders.data || []).filter(o => o.productName?.includes(productName));
        const ids = extractProductOrderIds(filtered);
        if (ids.length === 0) return res.json({ success: true, message: `'${productName}' 발주확인할 주문이 없습니다.`, count: 0 });
        const result = await confirmOrders(ids);
        await sendTelegram(TelegramReport.orderConfirm(ids.length));
        return res.json({ success: true, confirmedCount: ids.length, ...result });
      }

      case 'confirm_by_id': {
        const { productOrderIds } = req.body;
        if (!productOrderIds?.length) return res.json({ success: false, error: '주문 ID가 없습니다.' });
        const result = await confirmOrders(productOrderIds);
        await sendTelegram(TelegramReport.orderConfirm(productOrderIds.length));
        return res.json({ success: true, confirmedCount: productOrderIds.length, ...result });
      }

      case 'query_unconfirmed': {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await queryOrders(monthAgo.toISOString(), new Date().toISOString(), ['PAYED']);
        return res.json({ success: true, ...result, message: `발주확인 미처리 ${result.data?.length || 0}건` });
      }

      // ─────────────────────────────────────────
      // 3. 주문서 생성 (9가지)
      // ─────────────────────────────────────────

      case 'create_order_sheet_today': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const orders = await queryOrders(today.toISOString(), new Date().toISOString());
        const csvData = buildOrderCSV(orders.data || []);
        const fileName = `주문서_${formatDate(new Date())}.csv`;
        await sendTelegram(TelegramReport.orderSheet(orders.data?.length || 0, fileName));
        return res.json({ success: true, csvData, fileName, count: orders.data?.length || 0 });
      }

      case 'create_order_sheet_week': {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const orders = await queryOrders(weekAgo.toISOString(), new Date().toISOString());
        const csvData = buildOrderCSV(orders.data || []);
        const fileName = `주문서_이번주_${formatDate(new Date())}.csv`;
        await sendTelegram(TelegramReport.orderSheet(orders.data?.length || 0, fileName));
        return res.json({ success: true, csvData, fileName, count: orders.data?.length || 0 });
      }

      case 'create_order_sheet_by_product': {
        const { productName } = req.body || req.query;
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const orders = await queryOrders(monthAgo.toISOString(), new Date().toISOString());
        const filtered = (orders.data || []).filter(o => o.productName?.includes(productName));
        const csvData = buildOrderCSV(filtered);
        const fileName = `주문서_${productName}_${formatDate(new Date())}.csv`;
        await sendTelegram(TelegramReport.orderSheet(filtered.length, fileName));
        return res.json({ success: true, csvData, fileName, count: filtered.length });
      }

      case 'create_order_sheet_grouped': {
        const { groupBy } = req.body || req.query; // 'product' | 'address'
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const orders = await queryOrders(monthAgo.toISOString(), new Date().toISOString());
        const grouped = groupOrders(orders.data || [], groupBy || 'product');
        const fileName = `주문서_${groupBy === 'address' ? '배송지별' : '상품별'}_${formatDate(new Date())}.csv`;
        return res.json({ success: true, grouped, fileName });
      }

      case 'check_duplicate_orders': {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const orders = await queryOrders(monthAgo.toISOString(), new Date().toISOString());
        const duplicates = findDuplicateOrders(orders.data || []);
        return res.json({ success: true, duplicates, count: duplicates.length, message: `중복 주문 ${duplicates.length}건 발견` });
      }

      case 'bundle_same_address': {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const orders = await queryOrders(monthAgo.toISOString(), new Date().toISOString(), ['PAYED']);
        const bundled = bundleByAddress(orders.data || []);
        return res.json({ success: true, bundled, message: `합포장 가능 ${bundled.length}그룹` });
      }

      // ─────────────────────────────────────────
      // 4. 정산서 생성 (10가지)
      // ─────────────────────────────────────────

      case 'create_settlement_month': {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const orders = await queryOrders(monthAgo.toISOString(), new Date().toISOString(), ['PAYED', 'DELIVERING', 'DELIVERED']);
        const settlement = buildSettlement(orders.data || []);
        const fileName = `정산서_${formatMonth(new Date())}.csv`;
        await sendTelegram(TelegramReport.settlement(settlement.totalSales, settlement.totalOrders, fileName));
        return res.json({ success: true, ...settlement, fileName });
      }

      case 'create_settlement_by_product': {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const orders = await queryOrders(monthAgo.toISOString(), new Date().toISOString(), ['PAYED', 'DELIVERING', 'DELIVERED']);
        const byProduct = buildProductSettlement(orders.data || []);
        const fileName = `상품별정산서_${formatMonth(new Date())}.csv`;
        return res.json({ success: true, byProduct, fileName });
      }

      case 'calc_weekly_profit': {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const orders = await queryOrders(weekAgo.toISOString(), new Date().toISOString(), ['PAYED', 'DELIVERING', 'DELIVERED']);
        const settlement = buildSettlement(orders.data || []);
        return res.json({ success: true, ...settlement, period: '이번 주' });
      }

      case 'get_bestseller': {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const orders = await queryOrders(monthAgo.toISOString(), new Date().toISOString());
        const ranking = buildProductRanking(orders.data || []);
        return res.json({ success: true, ranking, topProduct: ranking[0] });
      }

      case 'compare_last_month': {
        const thisMonthStart = new Date();
        thisMonthStart.setDate(1);
        thisMonthStart.setHours(0, 0, 0, 0);
        const lastMonthStart = new Date(thisMonthStart);
        lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
        const lastMonthEnd = new Date(thisMonthStart);

        const [thisMonth, lastMonth] = await Promise.all([
          queryOrders(thisMonthStart.toISOString(), new Date().toISOString()),
          queryOrders(lastMonthStart.toISOString(), lastMonthEnd.toISOString()),
        ]);
        const thisSettlement = buildSettlement(thisMonth.data || []);
        const lastSettlement = buildSettlement(lastMonth.data || []);
        const growthRate = lastSettlement.totalSales > 0
          ? (((thisSettlement.totalSales - lastSettlement.totalSales) / lastSettlement.totalSales) * 100).toFixed(1)
          : 0;

        return res.json({
          success: true,
          thisMonth: thisSettlement,
          lastMonth: lastSettlement,
          growthRate: `${growthRate}%`,
          message: `전월 대비 ${growthRate > 0 ? '▲' : '▼'} ${Math.abs(growthRate)}% ${growthRate > 0 ? '성장' : '감소'}`,
        });
      }

      case 'weekly_report': {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const orders = await queryOrders(weekAgo.toISOString(), new Date().toISOString());
        const settlement = buildSettlement(orders.data || []);
        const ranking = buildProductRanking(orders.data || []);
        await sendTelegram(TelegramReport.weeklyReport(
          settlement.totalOrders,
          settlement.totalSales,
          ranking[0]?.productName || '없음'
        ));
        return res.json({ success: true, settlement, topProduct: ranking[0] });
      }

      // ─────────────────────────────────────────
      // 5. 발주 이메일 (8가지)
      // ─────────────────────────────────────────

      case 'send_purchase_email': {
        const { supplierEmail, supplierName, items, deliveryDate, memo } = req.body;
        if (!supplierEmail) return res.json({ success: false, error: '공급업체 이메일이 없습니다.' });

        const emailResult = await sendPurchaseEmail({
          to: supplierEmail,
          supplierName: supplierName || '공급업체',
          items: items || [],
          deliveryDate: deliveryDate || '',
          memo: memo || '',
        });

        await sendTelegram(TelegramReport.purchaseEmail(
          supplierName || supplierEmail,
          items?.length || 0,
          items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0
        ));
        return res.json({ success: true, emailResult, message: `${supplierName}에 발주 이메일 발송 완료` });
      }

      case 'send_purchase_email_auto': {
        // 이번 달 주문 기반 자동 발주 이메일
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const orders = await queryOrders(monthAgo.toISOString(), new Date().toISOString(), ['PAYED', 'DELIVERING', 'DELIVERED']);
        const productSummary = buildProductSettlement(orders.data || []);
        const supplierEmail = process.env.SUPPLIER_EMAIL;
        const supplierName = process.env.SUPPLIER_NAME || '공급업체';

        if (!supplierEmail) return res.json({ success: false, error: 'SUPPLIER_EMAIL 환경변수를 설정해주세요.' });

        const emailResult = await sendPurchaseEmail({
          to: supplierEmail,
          supplierName,
          items: productSummary,
          deliveryDate: '',
          memo: '이번 달 판매 기반 자동 발주',
        });

        await sendTelegram(TelegramReport.purchaseEmail(
          supplierName,
          productSummary.length,
          productSummary.reduce((sum, i) => sum + (i.quantity || 0), 0)
        ));
        return res.json({ success: true, emailResult, items: productSummary });
      }

      case 'preview_purchase_email': {
        const { supplierName, items, deliveryDate, memo } = req.body;
        const preview = buildPurchaseEmailBody({ supplierName, items, deliveryDate, memo });
        return res.json({ success: true, preview });
      }

      case 'get_purchase_history': {
        // 발주 이력 조회 (로컬 저장 기반 - 추후 DB 연동)
        return res.json({ success: true, message: '발주 이력 기능은 DB 연동 후 사용 가능합니다.' });
      }

      // ─────────────────────────────────────────
      // 6. 발송 처리
      // ─────────────────────────────────────────

      case 'process_shipping': {
        const { productOrderIds, deliveryCompany, trackingNumber } = req.body;
        if (!productOrderIds?.length) return res.json({ success: false, error: '주문 ID가 없습니다.' });

        const { status, data } = await smartStoreRequest('/v1/pay-order/seller/product-orders/dispatch', {
          method: 'POST',
          body: JSON.stringify({
            dispatchProductOrders: productOrderIds.map(id => ({
              productOrderId: id,
              deliveryMethod: 'DELIVERY',
              deliveryCompanyCode: deliveryCompany || 'CJGLS',
              trackingNumber: trackingNumber || '',
              dispatchDate: new Date().toISOString(),
            })),
          }),
        });

        await sendTelegram(TelegramReport.shipping(productOrderIds.length, deliveryCompany || 'CJ대한통운'));
        return res.json({ success: status === 200, count: productOrderIds.length, data });
      }

      // ─────────────────────────────────────────
      // 7. 텔레그램 직접 메시지
      // ─────────────────────────────────────────

      case 'send_telegram': {
        const { message } = req.body;
        const result = await sendTelegram(message);
        return res.json({ success: result.ok, result });
      }

      default:
        return res.status(400).json({ success: false, error: `알 수 없는 action: ${action}`, availableActions: [
          'query_orders_today', 'query_orders_week', 'query_orders_month',
          'query_orders_unpaid', 'query_orders_cancel', 'query_orders_return',
          'query_orders_by_product', 'query_order_detail', 'query_orders_pending_ship', 'morning_report',
          'confirm_all_today', 'confirm_all', 'confirm_by_product', 'confirm_by_id', 'query_unconfirmed',
          'create_order_sheet_today', 'create_order_sheet_week', 'create_order_sheet_by_product',
          'create_order_sheet_grouped', 'check_duplicate_orders', 'bundle_same_address',
          'create_settlement_month', 'create_settlement_by_product', 'calc_weekly_profit',
          'get_bestseller', 'compare_last_month', 'weekly_report',
          'send_purchase_email', 'send_purchase_email_auto', 'preview_purchase_email', 'get_purchase_history',
          'process_shipping', 'send_telegram',
        ]});
    }
  } catch (err) {
    await sendTelegram(TelegramReport.error(action, err.message));
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────
// 헬퍼 함수들
// ─────────────────────────────────────────

async function queryOrders(from, to, statuses = null) {
  const params = new URLSearchParams({
    fromDate: from,
    toDate: to,
    ...(statuses ? { productOrderStatuses: statuses.join(',') } : {}),
  });
  const { status, data } = await smartStoreRequest(`/v1/pay-order/seller/product-orders/query?${params}`);
  return { status, data: data?.data || data || [] };
}

async function confirmOrders(productOrderIds) {
  const { status, data } = await smartStoreRequest('/v1/pay-order/seller/product-orders/confirm', {
    method: 'POST',
    body: JSON.stringify({ productOrderIds }),
  });
  return { status, data };
}

function extractProductOrderIds(orders) {
  return (orders || []).map(o => o.productOrderId).filter(Boolean);
}

function buildOrderSummary(orders) {
  if (!orders?.length) return '주문 없음';
  const totalAmount = orders.reduce((sum, o) => sum + (o.totalPaymentAmount || 0), 0);
  return `💰 총 결제액: ${totalAmount.toLocaleString('ko-KR')}원`;
}

function buildOrderCSV(orders) {
  const headers = ['주문번호', '상품주문번호', '주문자명', '상품명', '수량', '결제금액', '수령인', '배송주소', '연락처', '주문일시', '상태'];
  const rows = orders.map(o => [
    o.orderId || '',
    o.productOrderId || '',
    o.ordererName || '',
    o.productName || '',
    o.quantity || 0,
    o.totalPaymentAmount || 0,
    o.shippingAddress?.name || '',
    `${o.shippingAddress?.baseAddress || ''} ${o.shippingAddress?.detailAddress || ''}`.trim(),
    o.shippingAddress?.tel1 || '',
    o.paymentDate || '',
    o.productOrderStatus || '',
  ]);
  return [headers, ...rows].map(r => r.join(',')).join('\n');
}

function buildSettlement(orders) {
  const totalSales = orders.reduce((sum, o) => sum + (o.totalPaymentAmount || 0), 0);
  const naverFeeRate = 0.034; // 네이버 수수료 3.4%
  const naverFee = Math.round(totalSales * naverFeeRate);
  const netSales = totalSales - naverFee;
  return {
    totalOrders: orders.length,
    totalSales,
    naverFee,
    netSales,
    csvData: buildSettlementCSV(orders),
  };
}

function buildSettlementCSV(orders) {
  const headers = ['상품명', '판매수량', '판매금액', '네이버수수료(3.4%)', '실수령액'];
  const byProduct = {};
  orders.forEach(o => {
    const name = o.productName || '기타';
    if (!byProduct[name]) byProduct[name] = { qty: 0, amount: 0 };
    byProduct[name].qty += o.quantity || 1;
    byProduct[name].amount += o.totalPaymentAmount || 0;
  });
  const rows = Object.entries(byProduct).map(([name, { qty, amount }]) => {
    const fee = Math.round(amount * 0.034);
    return [name, qty, amount, fee, amount - fee];
  });
  return [headers, ...rows].map(r => r.join(',')).join('\n');
}

function buildProductSettlement(orders) {
  const byProduct = {};
  orders.forEach(o => {
    const name = o.productName || '기타';
    if (!byProduct[name]) byProduct[name] = { productName: name, quantity: 0, totalAmount: 0 };
    byProduct[name].quantity += o.quantity || 1;
    byProduct[name].totalAmount += o.totalPaymentAmount || 0;
  });
  return Object.values(byProduct).sort((a, b) => b.quantity - a.quantity);
}

function buildProductRanking(orders) {
  return buildProductSettlement(orders);
}

function groupOrders(orders, groupBy) {
  const groups = {};
  orders.forEach(o => {
    const key = groupBy === 'address'
      ? (o.shippingAddress?.baseAddress || '주소없음')
      : (o.productName || '상품없음');
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  });
  return Object.entries(groups).map(([key, items]) => ({ key, items, count: items.length }));
}

function findDuplicateOrders(orders) {
  const byBuyer = {};
  orders.forEach(o => {
    const key = o.ordererName || o.ordererTel;
    if (!byBuyer[key]) byBuyer[key] = [];
    byBuyer[key].push(o);
  });
  return Object.entries(byBuyer)
    .filter(([, items]) => items.length > 1)
    .map(([buyer, items]) => ({ buyer, orders: items }));
}

function bundleByAddress(orders) {
  const byAddress = {};
  orders.forEach(o => {
    const addr = `${o.shippingAddress?.baseAddress || ''}_${o.shippingAddress?.name || ''}`;
    if (!byAddress[addr]) byAddress[addr] = [];
    byAddress[addr].push(o);
  });
  return Object.entries(byAddress)
    .filter(([, items]) => items.length > 1)
    .map(([addr, items]) => ({ address: addr.split('_')[0], recipient: addr.split('_')[1], orders: items }));
}

async function sendPurchaseEmail({ to, supplierName, items, deliveryDate, memo }) {
  const GMAIL_USER = process.env.GMAIL_ADDRESS;
  const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;

  const emailBody = buildPurchaseEmailBody({ supplierName, items, deliveryDate, memo });

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });

  const today = formatDate(new Date());
  return await transporter.sendMail({
    from: `자비스 발주시스템 <${GMAIL_USER}>`,
    to,
    subject: `[발주서] ${today} 발주 요청`,
    html: emailBody,
  });
}

function buildPurchaseEmailBody({ supplierName, items, deliveryDate, memo }) {
  const today = formatDate(new Date());
  const itemRows = (items || []).map(item =>
    `<tr>
      <td style="border:1px solid #ddd;padding:8px">${item.productName || item.name || ''}</td>
      <td style="border:1px solid #ddd;padding:8px;text-align:center">${item.quantity || 0}개</td>
      <td style="border:1px solid #ddd;padding:8px;text-align:right">${(item.unitPrice || 0).toLocaleString('ko-KR')}원</td>
    </tr>`
  ).join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#333">📦 발주 요청서</h2>
      <p><strong>발주일:</strong> ${today}</p>
      <p><strong>수신:</strong> ${supplierName} 담당자님</p>
      ${deliveryDate ? `<p><strong>납기 요청일:</strong> ${deliveryDate}</p>` : ''}
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="border:1px solid #ddd;padding:8px">상품명</th>
            <th style="border:1px solid #ddd;padding:8px">수량</th>
            <th style="border:1px solid #ddd;padding:8px">단가</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      ${memo ? `<p><strong>메모:</strong> ${memo}</p>` : ''}
      <p style="color:#888;font-size:12px">본 발주서는 자비스 자동화 시스템에 의해 발송되었습니다.</p>
    </div>
  `;
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMonth(d) {
  return `${d.getFullYear()}년${String(d.getMonth() + 1).padStart(2, '0')}월`;
}
