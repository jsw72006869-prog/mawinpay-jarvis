"use strict";
// Vercel Serverless Function (CommonJS 방식)
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
const SPREADSHEET_ID = '195rrBRA8VFgkpCRqb8Nssiu3HLI7ZYvarAxGtxCI57w';
const INFLUENCER_SHEET = '인플루언서 목록';
const NAVER_SHEET = 'JARVIS 네이버수집';
const LOCAL_SHEET = 'JARVIS 지역업체수집';
const INFLUENCER_HEADERS = [
    'No', '채널명', '이메일', '플랫폼', '카테고리',
    '구독자수', '평균조회수', 'Instagram', 'TikTok', 'Threads',
    'Twitter/X', '웹사이트', '프로필URL', '상태', '즐겨찾기',
    '발송여부', '발송일시', '회신여부', '회신일시', '수집일시', '메모',
];
const NAVER_HEADERS = [
    'No', '제목', '작성자', '블로그ID', '이메일(추정)', '실제이메일',
    '이웃수', '일방문자', '링크', '설명', '타입', '키워드', '수집일시',
];
const LOCAL_HEADERS = [
    'No', '업체명', '카테고리', '도로명주소', '지번주소', '전화번호',
    '영업시간', '24시간여부', '네이버지도링크', '설명', '키워드', '수집일시',
];
// ── Google Sheets API 토큰 발급 (서비스 계정) ──
async function getAccessToken(credentials) {
    const { createSign } = await Promise.resolve().then(() => __importStar(require('crypto')));
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    })).toString('base64url');
    const sign = createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(credentials.private_key, 'base64url');
    const jwt = `${header}.${payload}.${signature}`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token)
        throw new Error('Failed to get access token: ' + JSON.stringify(tokenData));
    return tokenData.access_token;
}
// ── 시트 범위 문자열 생성 (한글 시트명 안전 처리) ──
function sheetRange(sheetName, range) {
    // 한글/공백이 포함된 시트명은 작은따옴표로 감싸야 함
    return `'${sheetName}'!${range}`;
}
// ── 시트 존재 확인 및 헤더 생성 ──
async function ensureSheet(token, sheetName, headers) {
    const infoRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`, { headers: { Authorization: `Bearer ${token}` } });
    const info = await infoRes.json();
    const sheets = info.sheets || [];
    const exists = sheets.some((s) => s.properties?.title === sheetName);
    if (!exists) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }),
        });
    }
    // 헤더 확인 (A1 셀)
    const headerRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetRange(sheetName, 'A1'))}`, { headers: { Authorization: `Bearer ${token}` } });
    const headerData = await headerRes.json();
    if (!headerData.values || headerData.values.length === 0) {
        const colLetter = String.fromCharCode(64 + headers.length);
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetRange(sheetName, `A1:${colLetter}1`))}?valueInputOption=RAW`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [headers] }),
        });
    }
}
// ── 마지막 행 번호 가져오기 ──
async function getLastRow(token, sheetName) {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetRange(sheetName, 'A:A'))}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return (data.values?.length || 1);
}
// ── 행 추가 (append API 사용 - 가장 안정적) ──
async function appendRows(token, sheetName, rows) {
    const range = encodeURIComponent(sheetRange(sheetName, 'A:A'));
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: rows }),
    });
    const result = await res.json();
    if (result.error) {
        throw new Error(`Sheets append error: ${JSON.stringify(result.error)}`);
    }
    return result;
}
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS')
        return res.status(200).end();
    if (req.method !== 'POST')
        return res.status(405).json({ error: 'Method not allowed' });
    const credentialsStr = process.env.GOOGLE_SHEETS_CREDENTIALS;
    if (!credentialsStr) {
        return res.status(500).json({ error: 'GOOGLE_SHEETS_CREDENTIALS not configured' });
    }
    let credentials;
    try {
        credentials = JSON.parse(credentialsStr);
    }
    catch {
        return res.status(500).json({ error: 'Invalid GOOGLE_SHEETS_CREDENTIALS JSON' });
    }
    const { type, data } = req.body || {};
    if (!type || !data)
        return res.status(400).json({ error: 'type and data are required' });
    try {
        const token = await getAccessToken(credentials);
        const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        if (type === 'influencer' || type === 'instagram') {
            await ensureSheet(token, INFLUENCER_SHEET, INFLUENCER_HEADERS);
            const lastRow = await getLastRow(token, INFLUENCER_SHEET);
            const items = Array.isArray(data) ? data : [data];
            if (type === 'instagram') {
                const rows = items.map((item, i) => [
                    (lastRow + i).toString(),
                    item.fullName || item.username || '',
                    item.email || '',
                    'Instagram',
                    item.category || '',
                    item.followersFormatted || item.followers?.toString() || '-',
                    '-',
                    item.profileUrl || `https://instagram.com/${item.username}`,
                    '', '', '', '', '',
                    '미접촉',
                    '',
                    '', '', '', '',
                    now,
                    item.bio || '',
                ]);
                await appendRows(token, INFLUENCER_SHEET, rows);
                return res.status(200).json({ success: true, count: rows.length, sheet: INFLUENCER_SHEET });
            }
            const rows = items.map((item, i) => [
                (lastRow + i).toString(),
                item.name || '',
                item.email || '',
                item.platform || '',
                item.category || '',
                item.subscribers || item.followers || '0',
                item.avgViews || '0',
                item.instagram || '',
                item.tiktok || '',
                item.threads || '',
                item.twitter || '',
                item.website || '',
                item.profileUrl || '',
                '미접촉',
                '',
                '', '', '', '',
                now,
                item.notes || '',
            ]);
            await appendRows(token, INFLUENCER_SHEET, rows);
            return res.status(200).json({ success: true, count: rows.length, sheet: INFLUENCER_SHEET });
        }
        else if (type === 'youtube') {
            await ensureSheet(token, INFLUENCER_SHEET, INFLUENCER_HEADERS);
            const lastRow = await getLastRow(token, INFLUENCER_SHEET);
            const items = Array.isArray(data) ? data : [data];
            const rows = items.map((item, i) => [
                (lastRow + i).toString(),
                item.name || '',
                item.email || '',
                'YouTube',
                item.category || '',
                item.subscribersFormatted || item.subscribers?.toString() || '0',
                item.avgViews?.toString() || '0',
                item.instagramUsername ? `https://instagram.com/${item.instagramUsername}` : (item.instagram || ''),
                item.tiktok || '',
                '',
                '',
                item.website || '',
                item.customUrl || item.profileUrl || '',
                '미접촉',
                '',
                '', '', '', '',
                now,
                '',
            ]);
            await appendRows(token, INFLUENCER_SHEET, rows);
            return res.status(200).json({ success: true, count: rows.length, sheet: INFLUENCER_SHEET });
        }
        else if (type === 'naver') {
            await ensureSheet(token, NAVER_SHEET, NAVER_HEADERS);
            const lastRow = await getLastRow(token, NAVER_SHEET);
            const items = Array.isArray(data) ? data : [data];
            const rows = items.map((item, i) => [
                (lastRow + i).toString(),
                item.title || '',
                item.creatorName || '',
                item.blogId || '',
                item.guessedEmail || '',
                item.realEmail || '',
                item.neighborCount?.toString() || '0',
                item.dailyVisitors?.toString() || '0',
                item.url || '',
                (item.description || '').substring(0, 200),
                item.source || 'blog',
                item.keyword || '',
                now,
            ]);
            await appendRows(token, NAVER_SHEET, rows);
            return res.status(200).json({ success: true, count: rows.length, sheet: NAVER_SHEET });
        }
        else if (type === 'local') {
            await ensureSheet(token, LOCAL_SHEET, LOCAL_HEADERS);
            const lastRow = await getLastRow(token, LOCAL_SHEET);
            const items = Array.isArray(data) ? data : [data];
            const rows = items.map((item, i) => [
                (lastRow + i).toString(),
                item.name || '',
                item.category || '',
                item.roadAddress || '',
                item.address || '',
                item.phone || '',
                item.businessHours || '',
                item.is24Hours ? 'Y' : '',
                item.link || '',
                (item.description || '').replace(/<[^>]*>/g, '').substring(0, 200),
                item.keyword || '',
                now,
            ]);
            await appendRows(token, LOCAL_SHEET, rows);
            return res.status(200).json({ success: true, count: rows.length, sheet: LOCAL_SHEET });
        }
        return res.status(400).json({ error: `Unknown type: ${type}` });
    }
    catch (error) {
        console.error('[Sheets] Error:', error);
        return res.status(500).json({ error: 'Failed to save to Google Sheets', message: error.message });
    }
};
