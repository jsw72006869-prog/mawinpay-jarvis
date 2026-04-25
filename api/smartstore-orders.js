// 스마트스토어 주문 조회 API
// GET /api/smartstore-orders?status=payed&days=7
// 네이버 커머스 API: GET /v1/pay-order/seller/product-orders
const { smartStoreRequest } = require('./_smartstore-auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { status, days = 7, page = 1, size = 300 } = req.query;

    // 조회 기간 설정 (네이버 API는 ISO 8601 + timezone offset 형식)
    const now = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(days));

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

    // 쿼리 파라미터 구성
    const params = new URLSearchParams();
    params.append('from', formatNaverDate(fromDate));
    params.append('to', formatNaverDate(now));
    params.append('rangeType', 'PAYED_DATETIME');
    params.append('pageSize', String(Math.min(parseInt(size), 300)));
    params.append('page', String(parseInt(page)));

    // productOrderStatuses는 배열이므로 각각 추가
    productOrderStatuses.forEach(s => {
      params.append('productOrderStatuses', s);
    });

    // GET 요청으로 주문 조회
    const result = await smartStoreRequest(
      `/v1/pay-order/seller/product-orders?${params.toString()}`,
      { method: 'GET' }
    );

    if (result.status !== 200) {
      return res.status(result.status).json({
        success: false,
        error: `API 오류: ${JSON.stringify(result.data)}`,
        debug: {
          endpoint: `/v1/pay-order/seller/product-orders`,
          params: Object.fromEntries(params.entries()),
          status: result.status,
        }
      });
    }

    const responseData = result.data.data || result.data;
    const orders = responseData.contents || responseData || [];

    // 주문 요약 정보 가공
    const summary = (Array.isArray(orders) ? orders : []).map(order => {
      const po = order.productOrder || order;
      return {
        productOrderId: po.productOrderId,
        orderId: po.orderId,
        orderDate: po.paymentDate || po.orderDate,
        status: po.productOrderStatus,
        statusKo: getStatusKo(po.productOrderStatus),
        placeOrderStatus: po.placeOrderStatus,
        buyerName: po.ordererName,
        productName: po.productName,
        optionName: po.optionManageCode || po.productOption || '',
        optionContent: po.optionContent || '',
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
      total: responseData.totalElements || responseData.totalCount || summary.length,
      page: parseInt(page),
      pageSize: parseInt(size),
      orders: summary,
      queryInfo: {
        from: formatNaverDate(fromDate),
        to: formatNaverDate(now),
        statuses: productOrderStatuses,
        days: parseInt(days),
      }
    });

  } catch (err) {
    console.error('[smartstore-orders] 오류:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
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
