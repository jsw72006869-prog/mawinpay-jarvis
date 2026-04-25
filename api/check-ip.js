// 임시 IP 확인 엔드포인트 - Vercel Serverless Function의 실제 외부 IP를 확인
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    // 외부 서비스를 통해 이 서버의 실제 공인 IP 확인
    const ipRes = await fetch('https://api.ipify.org?format=json');
    const ipData = await ipRes.json();
    
    return res.json({
      success: true,
      serverIP: ipData.ip,
      message: '이 IP를 네이버 커머스 API 센터의 API호출IP에 등록해주세요.',
      requestHeaders: {
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip'],
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
