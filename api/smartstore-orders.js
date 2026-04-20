// 스마트스토어 주문 조회 API
// GET /api/smartstore-orders?status=NEW&days=7
const { smartStoreRequest } = require('./_smartstore-auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { status, days = 7, page = 1, size = 50 } = req.query;

    // 조회 기간 설정
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(days));

    const formatDate = (d) => d.toISOString().split('T')[0] + 'T00:00:00.000Z';

    // 주문 상태 매핑
    // PAYMENT_WAITING: 입금대기, PAYED: 결제완료, DELIVERING: 배송중
    // DELIVERED: 배송완료, PURCHASE_DECIDED: 구매확정, EXCHANGED: 교환, CANCELED: 취소
    const statusMap = {
      'new': 'PAYED',
      'payed': 'PAYED',
      'delivering': 'DELIVERING',
      'delivered': 'DELIVERED',
      'decided': 'PURCHASE_DECIDED',
      'canceled': 'CANCELED',
      'all': null,
    };

    const orderStatus = statusMap[status?.toLowerCase()] || 'PAYED';

    // 주문 목록 조회
    const body = {
      searchDateType: 'PAYMENT_DATE',
      fromDate: formatDate(fromDate),
      toDate: formatDate(toDate),
      orderStatusType: orderStatus,
      page: parseInt(page),
      size: parseInt(size),
    };

    const result = await smartStoreRequest('/v1/pay-order/seller/orders/query', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (result.status !== 200) {
      return res.status(result.status).json({
        success: false,
        error: `API 오류: ${JSON.stringify(result.data)}`,
      });
    }

    const orders = result.data.data || [];

    // 주문 요약 정보 가공
    const summary = orders.map(order => ({
      orderId: order.orderId,
      orderDate: order.paymentDate,
      status: order.orderStatus,
      statusKo: getStatusKo(order.orderStatus),
      buyerName: order.ordererName,
      buyerPhone: order.ordererTel,
      receiverName: order.shippingAddress?.name,
      receiverPhone: order.shippingAddress?.tel1,
      receiverAddress: `${order.shippingAddress?.baseAddress || ''} ${order.shippingAddress?.detailedAddress || ''}`.trim(),
      products: (order.productOrderList || []).map(p => ({
        productId: p.productId,
        productName: p.productName,
        optionName: p.productOption,
        quantity: p.quantity,
        price: p.unitPrice,
        totalPrice: p.totalPaymentAmount,
      })),
      totalAmount: order.generalPaymentAmount,
      deliveryFee: order.deliveryFeeAmount,
      trackingNumber: order.trackingNumber,
      deliveryCompany: order.deliveryCompanyCode,
    }));

    return res.json({
      success: true,
      total: result.data.totalCount || orders.length,
      page: parseInt(page),
      orders: summary,
      rawTotal: result.data.totalCount,
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
  };
  return map[status] || status;
}
