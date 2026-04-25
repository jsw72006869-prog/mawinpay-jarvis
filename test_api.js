const { getSmartStoreToken, smartStoreRequest } = require('./api/_smartstore-auth');

async function test() {
  console.log('--- 스마트스토어 API 연결 테스트 시작 ---');
  try {
    console.log('1. 토큰 발급 시도...');
    const token = await getSmartStoreToken();
    console.log('✅ 토큰 발급 성공 (앞 10자리):', token.substring(0, 10));

    console.log('2. 주문 목록 조회 시도 (최근 1일)...');
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 1);
    const formatDate = (d) => d.toISOString().split('T')[0] + 'T00:00:00.000Z';

    const body = {
      searchDateType: 'PAYMENT_DATE',
      fromDate: formatDate(fromDate),
      toDate: formatDate(toDate),
      orderStatusType: 'PAYED',
      page: 1,
      size: 10,
    };

    const result = await smartStoreRequest('/v1/pay-order/seller/orders/query', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    console.log('✅ API 응답 상태 코드:', result.status);
    if (result.status === 200) {
      console.log('✅ 주문 데이터 수신 성공!');
      console.log('📊 총 주문 건수:', result.data.totalCount || 0);
    } else {
      console.log('❌ API 응답 오류:', JSON.stringify(result.data));
    }
  } catch (err) {
    console.error('❌ 테스트 중 치명적 오류 발생:', err.message);
  }
  console.log('--- 테스트 종료 ---');
}

test();
