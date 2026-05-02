// 스마트스토어 주문 조회 API
// GET /api/smartstore-orders?status=payed&days=7
// 2단계 조회: 1) 목록 조회 → 2) 상세 조회
const { smartStoreRequest } = require('./_smartstore-auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { status, days = 1, page = 1, size = 300 } = req.query;
    const daysNum = parseInt(days);

    // 네이버 API 날짜 형식
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

    // ── 1단계: 상품 주문 목록 조회 (productOrderId 수집) ──
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    let allProductOrderIds = [];
    let currentFrom = new Date(startDate);
    const maxIterations = Math.min(daysNum, 7);

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
              if (po.productOrderId) {
                allProductOrderIds.push(po.productOrderId);
              }
            });
          }
        }
      } catch (err) {
        console.warn(`[smartstore-orders] ${formatNaverDate(currentFrom)} 조회 실패:`, err.message);
      }

      currentFrom = new Date(currentTo);
      if (currentFrom >= now) break;
    }

    // 중복 제거
    allProductOrderIds = [...new Set(allProductOrderIds)];

    if (allProductOrderIds.length === 0) {
      return res.json({
        success: true,
        total: 0,
        page: parseInt(page),
        pageSize: parseInt(size),
        orders: [],
        queryInfo: {
          from: formatNaverDate(startDate),
          to: formatNaverDate(now),
          statuses: productOrderStatuses,
          days: daysNum,
        }
      });
    }

    // ── 2단계: 상품 주문 상세 내역 조회 ──
    // POST /v1/pay-order/seller/product-orders/query (최대 300개)
    let allDetailOrders = [];

    for (let i = 0; i < allProductOrderIds.length; i += 300) {
      const batch = allProductOrderIds.slice(i, i + 300);
      try {
        const detailResult = await smartStoreRequest(
          '/v1/pay-order/seller/product-orders/query',
          {
            method: 'POST',
            body: JSON.stringify({ productOrderIds: batch }),
          }
        );

        if (detailResult.status === 200) {
          const detailData = detailResult.data.data || detailResult.data;
          if (Array.isArray(detailData)) {
            allDetailOrders = allDetailOrders.concat(detailData);
          }
        }
      } catch (err) {
        console.warn(`[smartstore-orders] 상세 조회 실패 (batch ${i}):`, err.message);
      }
    }

    // 주문 상세 정보 가공
    const summary = allDetailOrders.map(item => {
      const po = item.productOrder || item;
      const order = item.order || {};
      return {
        productOrderId: po.productOrderId,
        orderId: po.orderId || order.orderId,
        orderDate: po.paymentDate || order.paymentDate,
        status: po.productOrderStatus,
        statusKo: getStatusKo(po.productOrderStatus),
        placeOrderStatus: po.placeOrderStatus,
        buyerName: order.ordererName || po.ordererName,
        buyerTel: order.ordererTel,
        productName: po.productName,
        optionContent: po.optionContent || '',
        quantity: po.quantity,
        unitPrice: po.unitPrice,
        totalPaymentAmount: po.totalPaymentAmount,
        receiverName: po.shippingAddress?.name,
        receiverPhone1: po.shippingAddress?.tel1,
        receiverPhone2: po.shippingAddress?.tel2,
        receiverAddress: `${po.shippingAddress?.baseAddress || ''} ${po.shippingAddress?.detailedAddress || ''}`.trim(),
        receiverZipCode: po.shippingAddress?.zipCode,
        deliveryMemo: po.shippingMemo || '',
        senderName: order.ordererName || po.ordererName,
        senderPhone: order.ordererTel,
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
        productOrderIdsCollected: allProductOrderIds.length,
        detailsFetched: allDetailOrders.length,
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
