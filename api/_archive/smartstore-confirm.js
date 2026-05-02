// 스마트스토어 발주확인 처리 API
const { smartStoreRequest } = require('./_smartstore-auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { orderIds, productOrderIds } = req.body;

    if (!productOrderIds || productOrderIds.length === 0) {
      return res.status(400).json({ success: false, error: '발주확인할 주문 상품 ID가 없습니다.' });
    }

    // 발주확인 처리
    const { status, data } = await smartStoreRequest('/v1/pay-order/seller/product-orders/confirm', {
      method: 'POST',
      body: JSON.stringify({ productOrderIds }),
    });

    if (status !== 200) {
      return res.status(status).json({ success: false, error: data });
    }

    return res.status(200).json({
      success: true,
      confirmedCount: productOrderIds.length,
      message: `${productOrderIds.length}건 발주확인 처리 완료`,
      data,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
