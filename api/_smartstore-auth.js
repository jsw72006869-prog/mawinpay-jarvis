// 네이버 스마트스토어 커머스 API 인증 토큰 발급 공통 모듈
// 인증 방식: bcrypt 서명 (네이버 커머스 API 공식 인증 방식)
// QuotaGuard 프록시를 경유하여 고정 IP(52.5.238.209 / 52.6.13.167)로 요청
const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');

const CLIENT_ID = process.env.SMARTSTORE_CLIENT_ID;
const CLIENT_SECRET = process.env.SMARTSTORE_CLIENT_SECRET;
const PROXY_URL = process.env.QUOTAGUARDSTATIC_URL || 'http://6ddy9l3zmc2hbj:oso2bxcjx009edn2v7yu7k7u0hs3z@us-east-static-02.quotaguard.com:9293';
const API_BASE = 'https://api.commerce.naver.com/external';

// QuotaGuard 프록시 에이전트 생성
function getProxyAgent() {
  return new HttpsProxyAgent(PROXY_URL);
}

/**
 * 스마트스토어 커머스 API 인증 토큰 발급
 * @param {string} type - 'SELF' (자체 판매자) | 'SELLER' (솔루션 판매자)
 * @returns {Promise<string>} access_token
 */
async function getSmartStoreToken(type = 'SELF') {
  const clientId = CLIENT_ID;
  const clientSecret = CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('SMARTSTORE_CLIENT_ID 또는 SMARTSTORE_CLIENT_SECRET 환경변수가 설정되지 않았습니다.');
  }
  // 타임스탬프 (밀리초)
  const timestamp = String(Date.now());
  // 패스워드 생성: client_id_timestamp
  const pwd = `${clientId}_${timestamp}`;
  // bcrypt 해싱 (client_secret을 salt로 사용)
  let hashed;
  try {
    const bcrypt = require('bcryptjs');
    hashed = bcrypt.hashSync(pwd, clientSecret);
  } catch (e) {
    // bcryptjs 없을 때 fallback
    console.warn('[smartstore-auth] bcryptjs 없음, HMAC fallback 사용');
    hashed = crypto.createHmac('sha256', clientSecret).update(pwd).digest('hex');
  }
  // Base64 인코딩
  const clientSecretSign = Buffer.from(hashed).toString('base64');
  const params = new URLSearchParams({
    client_id: clientId,
    timestamp: timestamp,
    client_secret_sign: clientSecretSign,
    grant_type: 'client_credentials',
    type: type,
  });

  // QuotaGuard 프록시를 경유하여 토큰 요청
  const agent = getProxyAgent();
  const res = await fetch(`${API_BASE}/v1/oauth2/token?${params.toString()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    agent: agent,
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`토큰 발급 실패: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

/**
 * 인증 헤더 포함 스마트스토어 API 요청 (QuotaGuard 프록시 경유)
 */
async function smartStoreRequest(path, options = {}) {
  const token = await getSmartStoreToken();
  const url = `${API_BASE}${path}`;
  const agent = getProxyAgent();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    agent: agent,
  });
  const data = await res.json();
  return { status: res.status, data };
}

module.exports = { getSmartStoreToken, smartStoreRequest, API_BASE, getProxyAgent };
