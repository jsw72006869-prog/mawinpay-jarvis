// 스마트스토어 주문 조회 API
// GET /api/smartstore-orders?status=payed&days=7
// 네이버 커머스 API: GET /v1/pay-order/seller/product-orders (24시간 제한)
// 7일/30일 조회 시 24시간 단위로 반복 조회
const { smartStoreRequest } = require('./_smartstore-auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { status, days = 1, page = 1, size = 300 } = req.query;
    const daysNum = parseInt(days);

    // 네이버 API 날짜 형식: 2024-06-07T19:00:00.000+09:00
    const formatNaverDate = (d) => {
      const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      const yyyy = kst.getUTCFullYear();
      const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(kst.getUTCDate()).padStart(2, '0');
      const hh = String(kst.getUTCHours()).padStart(2, '0');
      const mi = String(kst.getUTCMinutes()).padStart(2, '0');
      const ss = String(kst.getUTCSeconds()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.000+09:00`;
    };

    // 주문 상태 매핑
    const statusMap = {
      'new': ['PAYED'],
      'payed': ['PAYED'],
      'delivering': ['DELIVERING'],
      'delivered': ['DELIVERED'],
      'decided': ['PURCHASE_DECIDED'],
      'canceled': ['CANCELED'],
      'all': ['PAYMENT_WAITING', 'PAYED', 'DELIVERING', 'DELIVERED', 'PURCHASE_DECIDED'],
    };

    const productOrderStatuses = statusMap[status?.toLowerCase()] || ['PAYED'];

    // 24시간 단위로 분할 조회
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    let allOrders = [];
    let currentFrom = new Date(startDate);

    // 최대 반복 횟수 제한 (Vercel 10초 타임아웃 고려)
    const maxIterations = Math.min(daysNum, 7); // 최대 7일까지 반복 조회

    for (let i = 0; i < maxIterations; i++) {
      const currentTo = new Date(currentFrom.getTime() + 24 * 60 * 60 * 1000);
      if (currentTo > now) currentTo.setTime(now.getTime());

      const params = new URLSearchParams();
      params.append('from', formatNaverDate(currentFrom));
      params.append('to', formatNaverDate(currentTo));
      params.append('rangeType', 'PAYED_DATETIME');
      params.append('pageSize', String(Math.min(parseInt(size), 300)));
      params.append('page', '1');

      productOrderStatuses.forEach(s => {
        params.append('productOrderStatuses', s);
      });

      const result = await smartStoreRequest(
        `/v1/pay-order/seller/product-orders?${params.toString()}`,
        { method: 'GET' }
      );

      if (result.status === 200) {
        const responseData = result.data.data || result.data;
        const contents = responseData.contents || responseData || [];
        if (Array.isArray(contents)) {
          allOrders = allOrders.concat(contents);
        }
      }

      currentFrom = new Date(currentTo);
      if (currentFrom >= now) break;
    }

    // 주문 요약 정보 가공
    const summary = allOrders.map(item => {
      const po = item.productOrder || item;
      return {
        productOrderId: po.productOrderId,
        orderId: po.orderId,
        orderDate: po.paymentDate || po.orderDate,
        status: po.productOrderStatus,
        statusKo: getStatusKo(po.productOrderStatus),
        placeOrderStatus: po.placeOrderStatus,
        buyerName: po.ordererName,
        productName: po.productName,
        optionContent: po.optionContent || po.productOption || '',
        quantity: po.quantity,
        unitPrice: po.unitPrice,
        totalPaymentAmount: po.totalPaymentAmount,
        receiverName: po.shippingAddress?.name,
        receiverPhone1: po.shippingAddress?.tel1,
        receiverPhone2: po.shippingAddress?.tel2,
        receiverAddress: `${po.shippingAddress?.baseAddress || ''} ${po.shippingAddress?.detailedAddress || ''}`.trim(),
        receiverZipCode: po.shippingAddress?.zipCode,
        deliveryMemo: po.shippingMemo || po.shippingAddress?.deliveryMemo || '',
        senderName: po.ordererName,
        senderPhone: po.ordererTel,
        trackingNumber: po.trackingNumber,
        deliveryCompany: po.deliveryCompanyCode,
      };
    });

    return res.json({
      success: true,
      total: summary.length,
      page: parseInt(page),
      pageSize: parseInt(size),
      orders: summary,
      queryInfo: {
        from: formatNaverDate(startDate),
        to: formatNaverDate(now),
        statuses: productOrderStatuses,
        days: daysNum,
        iterationsUsed: Math.min(maxIterations, daysNum),
      }
    });

  } catch (err) {
    console.error('[smartstore-orders] 오류:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

function getStatusKo(status) {
  const map = {
    PAYMENT_WAITING: '입금대기',
    PAYED: '결제완료',
    DELIVERING: '배송중',
    DELIVERED: '배송완료',
    PURCHASE_DECIDED: '구매확정',
    EXCHANGED: '교환완료',
    CANCELED: '취소',
    RETURNED: '반품',
    CANCELED_BY_NOPAYMENT: '미결제취소',
  };
  return map[status] || status;
}
