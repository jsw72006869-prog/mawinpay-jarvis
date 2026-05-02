// 스마트스토어 발송 처리 API
// POST /api/smartstore-shipping
// body: { productOrderIds: [...], deliveryCompanyCode: 'CJGLS', trackingNumber: '1234567890' }
const { smartStoreRequest } = require('./_smartstore-auth');

// 택배사 코드 목록
const DELIVERY_COMPANIES = {
  'CJ대한통운': 'CJGLS',
  '롯데택배': 'LOTTE',
  '한진택배': 'HANJIN',
  '우체국택배': 'EPOST',
  '로젠택배': 'LOGEN',
  '경동택배': 'KDEXP',
  '대신택배': 'DAESIN',
  '일양로지스': 'ILYANG',
  'GS편의점택배': 'GSMNTON',
  '편의점택배': 'CVSNET',
  '직접배송': 'DIRECT',
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST 방식만 허용됩니다.' });

  try {
    const { productOrderIds, deliveryCompany, deliveryCompanyCode, trackingNumber, orderId } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({ success: false, error: '운송장 번호(trackingNumber)가 필요합니다.' });
    }

    // 택배사 코드 결정 (한글명 또는 코드 모두 허용)
    const companyCode = deliveryCompanyCode || DELIVERY_COMPANIES[deliveryCompany] || 'CJGLS';

    // 상품주문번호 목록 (orderId로 조회하거나 직접 전달)
    let orderIds = productOrderIds;

    if (!orderIds || orderIds.length === 0) {
      if (orderId) {
        // orderId로 상품주문번호 조회 (product-orders/query 사용)
        // orderId가 productOrderId일 수도 있으므로 직접 사용 시도
        orderIds = [orderId];
      }
    }

    if (!orderIds || orderIds.length === 0) {
      return res.status(400).json({ success: false, error: '상품주문번호(productOrderIds) 또는 주문번호(orderId)가 필요합니다.' });
    }

    // 발송 처리 요청
    const dispatchBody = {
      dispatchProductOrders: orderIds.map(id => ({
        productOrderId: id,
        deliveryMethod: 'DELIVERY',
        deliveryCompanyCode: companyCode,
        trackingNumber: String(trackingNumber),
      })),
    };

    const result = await smartStoreRequest('/v1/pay-order/seller/product-orders/dispatch', {
      method: 'POST',
      body: JSON.stringify(dispatchBody),
    });

    if (result.status !== 200) {
      return res.status(result.status).json({
        success: false,
        error: `발송 처리 실패: ${JSON.stringify(result.data)}`,
      });
    }

    return res.json({
      success: true,
      message: `${orderIds.length}건 발송 처리 완료`,
      deliveryCompany: deliveryCompany || companyCode,
      trackingNumber,
      processedOrders: orderIds,
      result: result.data,
    });

  } catch (err) {
    console.error('[smartstore-shipping] 오류:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
