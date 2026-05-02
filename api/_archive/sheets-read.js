// api/sheets-read.js
// 구글 시트에서 수집된 데이터를 읽어오는 API
// JARVIS GPT 컨텍스트에 수집 데이터를 주입하기 위해 사용

const SPREADSHEET_ID = '195rrBRA8VFgkpCRqb8Nssiu3HLI7ZYvarAxGtxCI57w';
const INFLUENCER_SHEET = '인플루언서 목록';
const NAVER_SHEET = 'JARVIS 네이버수집';
const LOCAL_SHEET = 'JARVIS 지역업체';

// Google Sheets API 토큰 발급 (서비스 계정)
async function getAccessToken(credentials) {
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(credentials.private_key, 'base64url');
  const jwt = `${header}.${payload}.${signature}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Failed to get access token');
  return tokenData.access_token;
}

// 시트 데이터 읽기
async function readSheet(token, sheetName, maxRows = 500) {
  const range = encodeURIComponent(`'${sheetName}'!A1:Z${maxRows}`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.values || [];
}

// 행 배열을 객체로 변환
function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] || '';
    });
    return obj;
  }).filter(obj => Object.values(obj).some(v => v)); // 빈 행 제거
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const credentialsStr = process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!credentialsStr) {
    return res.status(500).json({ error: 'GOOGLE_SHEETS_CREDENTIALS not configured' });
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsStr);
  } catch {
    return res.status(500).json({ error: 'Invalid GOOGLE_SHEETS_CREDENTIALS JSON' });
  }

  try {
    const token = await getAccessToken(credentials);

    // 모든 시트 병렬 읽기
    const [influencerRows, naverRows, localRows] = await Promise.all([
      readSheet(token, INFLUENCER_SHEET, 1000),
      readSheet(token, NAVER_SHEET, 1000),
      readSheet(token, LOCAL_SHEET, 1000),
    ]);

    const influencers = rowsToObjects(influencerRows || []);
    const naverData = rowsToObjects(naverRows || []);
    const localData = rowsToObjects(localRows || []);

    // GPT 컨텍스트용 요약 생성
    const summary = {
      totalInfluencers: influencers.length,
      totalNaverData: naverData.length,
      totalLocalData: localData.length,
      // 플랫폼별 통계
      platformStats: influencers.reduce((acc, inf) => {
        const p = inf['플랫폼'] || '기타';
        acc[p] = (acc[p] || 0) + 1;
        return acc;
      }, {}),
      // 카테고리별 통계
      categoryStats: influencers.reduce((acc, inf) => {
        const c = inf['카테고리'] || '기타';
        acc[c] = (acc[c] || 0) + 1;
        return acc;
      }, {}),
      // 상태별 통계
      statusStats: influencers.reduce((acc, inf) => {
        const s = inf['상태'] || '미접촉';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {}),
      // 최근 수집일
      lastCollected: influencers.length > 0 ? influencers[influencers.length - 1]['수집일시'] : null,
      // 네이버 키워드 통계
      naverKeywords: naverData.reduce((acc, item) => {
        const k = item['키워드'] || '기타';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
      // 지역 업체 카테고리 통계
      localCategories: localData.reduce((acc, item) => {
        const c = item['카테고리'] || '기타';
        acc[c] = (acc[c] || 0) + 1;
        return acc;
      }, {}),
    };

    // GPT에게 전달할 컨텍스트 텍스트 생성 (토큰 절약을 위해 요약 형태)
    let contextText = `=== JARVIS 수집 데이터 현황 (${new Date().toLocaleDateString('ko-KR')}) ===\n\n`;

    // 인플루언서 요약
    if (influencers.length > 0) {
      contextText += `[인플루언서/유튜버 목록] 총 ${influencers.length}명\n`;
      contextText += `플랫폼별: ${Object.entries(summary.platformStats).map(([k,v]) => `${k}(${v}명)`).join(', ')}\n`;
      contextText += `카테고리별: ${Object.entries(summary.categoryStats).slice(0, 10).map(([k,v]) => `${k}(${v}명)`).join(', ')}\n`;
      contextText += `상태별: ${Object.entries(summary.statusStats).map(([k,v]) => `${k}(${v}명)`).join(', ')}\n`;
      // 최근 10명 목록
      const recent10 = influencers.slice(-10);
      contextText += `\n최근 수집 인플루언서 (최대 10명):\n`;
      recent10.forEach(inf => {
        contextText += `- ${inf['채널명'] || '이름없음'} | ${inf['플랫폼'] || ''} | 구독자: ${inf['구독자수'] || '?'} | 카테고리: ${inf['카테고리'] || '?'} | 상태: ${inf['상태'] || '미접촉'}\n`;
      });
      contextText += '\n';
    }

    // 네이버 블로거 요약
    if (naverData.length > 0) {
      contextText += `[네이버 블로거/카페] 총 ${naverData.length}명\n`;
      contextText += `키워드별: ${Object.entries(summary.naverKeywords).slice(0, 10).map(([k,v]) => `${k}(${v}개)`).join(', ')}\n`;
      const recent5Naver = naverData.slice(-5);
      contextText += `최근 수집:\n`;
      recent5Naver.forEach(item => {
        contextText += `- ${item['작성자'] || '이름없음'} | 이웃수: ${item['이웃수'] || '?'} | 키워드: ${item['키워드'] || '?'}\n`;
      });
      contextText += '\n';
    }

    // 지역 업체 요약
    if (localData.length > 0) {
      contextText += `[지역 업체] 총 ${localData.length}개\n`;
      contextText += `카테고리별: ${Object.entries(summary.localCategories).slice(0, 10).map(([k,v]) => `${k}(${v}개)`).join(', ')}\n`;
      const recent5Local = localData.slice(-5);
      contextText += `최근 수집:\n`;
      recent5Local.forEach(item => {
        contextText += `- ${item['업체명'] || '이름없음'} | ${item['주소'] || ''} | ${item['전화번호'] || ''}\n`;
      });
      contextText += '\n';
    }

    if (influencers.length === 0 && naverData.length === 0 && localData.length === 0) {
      contextText += '아직 수집된 데이터가 없습니다.\n';
    }

    return res.status(200).json({
      success: true,
      summary,
      contextText,
      // 상세 데이터 (분석 요청 시 사용)
      influencers: influencers.slice(-100), // 최근 100개
      naverData: naverData.slice(-100),
      localData: localData.slice(-100),
    });

  } catch (error) {
    console.error('[sheets-read] 오류:', error);
    return res.status(500).json({ error: 'Failed to read from Google Sheets', message: error.message });
  }
};
