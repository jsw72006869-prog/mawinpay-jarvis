// 스마트스토어 상품 조회 API
// GET /api/smartstore-products?page=1&size=50&status=SALE
const { smartStoreRequest } = require('./_smartstore-auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { page = 1, size = 50, status, productId } = req.query;

    // 특정 상품 조회
    if (productId) {
      const result = await smartStoreRequest(`/v2/products/${productId}`, { method: 'GET' });
      if (result.status !== 200) {
        return res.status(result.status).json({ success: false, error: JSON.stringify(result.data) });
      }
      return res.json({ success: true, product: formatProduct(result.data) });
    }

    // 상품 목록 조회
    const params = new URLSearchParams({
      page: String(page),
      size: String(size),
    });

    if (status) {
      // SALE: 판매중, SUSPENSION: 판매중지, OUTOFSTOCK: 품절, WAIT: 판매대기
      params.append('sellerManagementCode', '');
    }

    const result = await smartStoreRequest(`/v2/products/search?${params.toString()}`, {
      method: 'POST',
      body: JSON.stringify({
        searchKeywordType: 'ALL',
        saleStatusTypes: status ? [status.toUpperCase()] : ['SALE', 'OUTOFSTOCK'],
        page: parseInt(page),
        size: parseInt(size),
      }),
    });

    if (result.status !== 200) {
      return res.status(result.status).json({
        success: false,
        error: `상품 조회 실패: ${JSON.stringify(result.data)}`,
      });
    }

    const products = (result.data.simpleProducts || []).map(formatProduct);

    return res.json({
      success: true,
      total: result.data.totalCount || products.length,
      page: parseInt(page),
      products,
    });

  } catch (err) {
    console.error('[smartstore-products] 오류:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

function formatProduct(p) {
  return {
    productId: p.id || p.productId,
    name: p.name,
    salePrice: p.salePrice,
    stockQuantity: p.stockQuantity,
    status: p.saleStatusType || p.status,
    statusKo: getStatusKo(p.saleStatusType || p.status),
    category: p.categoryName,
    imageUrl: p.representativeImageUrl,
    url: p.smartstoreChannelProductUrl,
  };
}

function getStatusKo(status) {
  const map = {
    SALE: '판매중',
    SUSPENSION: '판매중지',
    OUTOFSTOCK: '품절',
    WAIT: '판매대기',
    PROHIBITION: '판매금지',
  };
  return map[status] || status;
}
