// 디버그용: 네이버 커머스 API 토큰 발급 시도 및 상세 오류 반환
// QuotaGuard 프록시를 경유하여 고정 IP로 요청
const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');

const PROXY_URL = process.env.QUOTAGUARDSTATIC_URL || 'http://6ddy9l3zmc2hbj:oso2bxcjx009edn2v7yu7k7u0hs3z@us-east-static-02.quotaguard.com:9293';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const CLIENT_ID = process.env.SMARTSTORE_CLIENT_ID;
  const CLIENT_SECRET = process.env.SMARTSTORE_CLIENT_SECRET;
  
  // 1. 환경변수 확인
  const envCheck = {
    hasClientId: !!CLIENT_ID,
    clientIdPrefix: CLIENT_ID ? CLIENT_ID.substring(0, 6) + '...' : 'NOT SET',
    hasClientSecret: !!CLIENT_SECRET,
    secretLength: CLIENT_SECRET ? CLIENT_SECRET.length : 0,
    hasProxyUrl: !!PROXY_URL,
  };
  
  // 2. 서버 외부 IP 확인 (직접 + 프록시)
  let serverIP = 'unknown';
  let proxyIP = 'unknown';
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json');
    const ipData = await ipRes.json();
    serverIP = ipData.ip;
  } catch (e) {
    serverIP = 'fetch failed: ' + e.message;
  }
  
  try {
    const agent = new HttpsProxyAgent(PROXY_URL);
    const proxyIpRes = await fetch('https://api.ipify.org?format=json', { agent });
    const proxyIpData = await proxyIpRes.json();
    proxyIP = proxyIpData.ip;
  } catch (e) {
    proxyIP = 'proxy fetch failed: ' + e.message;
  }
  
  // 3. 프록시 경유 토큰 발급 시도
  let tokenResult = null;
  if (CLIENT_ID && CLIENT_SECRET) {
    try {
      const timestamp = String(Date.now());
      const pwd = `${CLIENT_ID}_${timestamp}`;
      
      let hashed;
      try {
        const bcrypt = require('bcryptjs');
        hashed = bcrypt.hashSync(pwd, CLIENT_SECRET);
      } catch (e) {
        hashed = crypto.createHmac('sha256', CLIENT_SECRET).update(pwd).digest('hex');
      }
      
      const clientSecretSign = Buffer.from(hashed).toString('base64');
      
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        timestamp: timestamp,
        client_secret_sign: clientSecretSign,
        grant_type: 'client_credentials',
        type: 'SELF',
      });
      
      // QuotaGuard 프록시를 경유하여 토큰 요청
      const agent = new HttpsProxyAgent(PROXY_URL);
      const tokenRes = await fetch(`https://api.commerce.naver.com/external/v1/oauth2/token?${params.toString()}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        agent: agent,
      });
      
      const tokenData = await tokenRes.json();
      tokenResult = {
        status: tokenRes.status,
        success: !!tokenData.access_token,
        data: tokenData.access_token ? { token_prefix: tokenData.access_token.substring(0, 10) + '...' } : tokenData,
      };
    } catch (e) {
      tokenResult = { error: e.message };
    }
  } else {
    tokenResult = { error: '환경변수 미설정' };
  }
  
  return res.json({
    envCheck,
    serverIP_direct: serverIP,
    serverIP_proxy: proxyIP,
    tokenResult,
    timestamp: new Date().toISOString(),
  });
};
