import type { VercelRequest, VercelResponse } from '@vercel/node';
import mysql from 'mysql2/promise';

export const config = {
  maxDuration: 60,
};

const CLOUD_SERVER = process.env.CLOUD_SERVER_URL || 'http://35.243.215.119:3001';

// ── 스마트스토어 API 직접 처리 ──
const SS_CLIENT_ID = process.env.SMARTSTORE_CLIENT_ID || process.env.NAVER_CLIENT_ID || '';
const SS_CLIENT_SECRET = process.env.SMARTSTORE_CLIENT_SECRET || process.env.NAVER_CLIENT_SECRET || '';
const SS_API_BASE = 'https://api.commerce.naver.com/external';

let ssOrderCache: { data: any; ts: number } | null = null;
const SS_CACHE_TTL = 60000;

async function getSmartStoreTokenDirect(): Promise<string> {
  if (!SS_CLIENT_ID || !SS_CLIENT_SECRET) {
    throw new Error('SMARTSTORE credentials not configured');
  }
  const bcrypt = await import('bcryptjs');
  const timestamp = String(Date.now());
  const pwd = `${SS_CLIENT_ID}_${timestamp}`;
  const hashed = bcrypt.hashSync(pwd, SS_CLIENT_SECRET);
  const clientSecretSign = Buffer.from(hashed).toString('base64');
  const params = new URLSearchParams({
    client_id: SS_CLIENT_ID,
    timestamp,
    client_secret_sign: clientSecretSign,
    grant_type: 'client_credentials',
    type: 'SELF',
  });
  const resp = await fetch(`${SS_API_BASE}/v1/oauth2/token?${params.toString()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  const data = await resp.json() as any;
  if (!data.access_token) {
    throw new Error(`Token failed: ${data.error || data.message || 'unknown'}`);
  }
  return data.access_token;
}

function formatNaverDate(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd2 = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss2 = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd2}T${hh}:${mi}:${ss2}.000+09:00`;
}

async function fetchOrderIdsDirect(token: string, days: number, statuses: string[] = ['PAYED']): Promise<string[]> {
  const now = new Date();
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  const allIds: string[] = [];
  for (let i = 0; i < days; i++) {
    const dayStart = new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000);
    const dayEnd = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const qp = new URLSearchParams();
    qp.append('from', formatNaverDate(dayStart));
    qp.append('to', formatNaverDate(dayEnd));
    qp.append('rangeType', 'PAYED_DATETIME');
    qp.append('pageSize', '300');
    qp.append('page', '1');
    statuses.forEach(s => qp.append('productOrderStatuses', s));
    try {
      const resp = await fetch(`${SS_API_BASE}/v1/pay-order/seller/product-orders?${qp.toString()}`, { method: 'GET', headers });
      if (resp.status === 200) {
        const data = await resp.json() as any;
        const responseData = data.data || data;
        const contents = responseData.contents || responseData || [];
        if (Array.isArray(contents)) {
          contents.forEach((item: any) => {
            const id = (item.productOrder || item).productOrderId;
            if (id) allIds.push(id);
          });
        }
      }
    } catch (e) { /* skip day */ }
  }
  return [...new Set(allIds)];
}

async function fetchOrderDetailsDirect(token: string, productOrderIds: string[]): Promise<any[]> {
  if (!productOrderIds.length) return [];
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  let allDetails: any[] = [];
  for (let i = 0; i < productOrderIds.length; i += 300) {
    const batch = productOrderIds.slice(i, i + 300);
    try {
      const resp = await fetch(`${SS_API_BASE}/v1/pay-order/seller/product-orders/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ productOrderIds: batch }),
      });
      if (resp.status === 200) {
        const data = await resp.json() as any;
        const details = data.data || data;
        if (Array.isArray(details)) allDetails = allDetails.concat(details);
      }
    } catch (e) { /* skip batch */ }
  }
  return allDetails;
}

async function handleSmartstoreOrdersDirect(): Promise<any> {
  if (ssOrderCache && (Date.now() - ssOrderCache.ts) < SS_CACHE_TTL) {
    console.log('[cloud-proxy] Using cached smartstore data (60s TTL)');
    return ssOrderCache.data;
  }
  const actionLogs: any[] = [];
  const log = (step: string, status: string, detail: string) => {
    actionLogs.push({ step, status, detail, timestamp: new Date().toISOString() });
  };
  log('AUTH', 'processing', 'Naver Commerce API 인증 중...');
  const token = await getSmartStoreTokenDirect();
  log('AUTH', 'success', '토큰 발급 완료');

  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  const todayStart = new Date(kstNow);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayStartUTC = new Date(todayStart.getTime() - kstOffset);

  log('QUERY', 'processing', '배송 전 처리 대상 조회 중 (PAYED, 7일)...');
  const payedIds = await fetchOrderIdsDirect(token, 7, ['PAYED']);
  log('QUERY', 'success', `PAYED 주문 ID ${payedIds.length}건 수집`);

  log('QUERY', 'processing', '상세 조회 중 (신규주문/배송준비 구분)...');
  const payedDetails = await fetchOrderDetailsDirect(token, payedIds);
  let newOrders = 0;
  let pendingShipping = 0;
  let todayOrders = 0;
  let todaySales = 0;
  payedDetails.forEach((item: any) => {
    const po = item.productOrder || item;
    const placeStatus = po.placeOrderStatus || 'NOT_YET';
    if (placeStatus === 'NOT_YET') newOrders++;
    else if (placeStatus === 'OK') pendingShipping++;
    const payDate = new Date(po.paymentDate || po.orderDate || 0);
    if (payDate >= todayStartUTC) {
      todayOrders++;
      todaySales += po.totalPaymentAmount || 0;
    }
  });
  log('QUERY', 'success', `현재 신규주문: ${newOrders}건, 배송준비: ${pendingShipping}건`);

  log('QUERY', 'processing', '배송중/배송완료/구매확정/취소 조회 중...');
  const deliveringIds = await fetchOrderIdsDirect(token, 7, ['DELIVERING']);
  const deliveredIds = await fetchOrderIdsDirect(token, 7, ['DELIVERED']);
  const purchaseDecidedIds = await fetchOrderIdsDirect(token, 7, ['PURCHASE_DECIDED']);
  const cancelIds = await fetchOrderIdsDirect(token, 7, ['CANCEL_REQUESTED']);
  log('COMPLETE', 'success', '전체 조회 완료');

  const totalPreShipping = newOrders + pendingShipping;
  const resultData = {
    success: true,
    result: {
      smartstore: {
        newOrders,
        pendingShipping,
        totalPreShipping,
        todayNewOrders: todayOrders,
        todayOrders,
        todaySales,
        totalAmount: todaySales,
        delivering: deliveringIds.length,
        delivered: deliveredIds.length,
        purchaseDecided: purchaseDecidedIds.length,
        cancelRequests: cancelIds.length,
        settlementAmount: 0,
        sellingProducts: 0,
        soldOutProducts: 0,
      },
      actionLogs,
    },
  };
  ssOrderCache = { data: resultData, ts: Date.now() };
  return resultData;
}

// ── TiDB 연결 설정 ──
function getDbConnection() {
  return mysql.createConnection({
    host: process.env.TIDB_HOST || 'gateway01.us-east-1.prod.aws.tidbcloud.com',
    port: Number(process.env.TIDB_PORT) || 4000,
    user: process.env.TIDB_USER || '2HL5NgXKAWnTBJR.root',
    password: process.env.TIDB_PASSWORD || '8szdX6Ien1aGl2Yq',
    database: process.env.TIDB_DATABASE || 'jarvis',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
  });
}
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// ── 이메일 + 소셜미디어 추출 (채널 설명 + branding 설명에서) ──
function extractContactInfo(description: string, brandDesc: string = '') {
  const allText = description + '\n' + brandDesc;

  // 이메일 추출 (비즈니스 이메일 우선)
  const emailMatches = allText.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
  const businessEmail = emailMatches.find(e =>
    !e.includes('example.com') && !e.includes('noreply') && !e.includes('no-reply')
  ) || '';

  // Instagram
  const igMatch = allText.match(/(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9_.]+)/i);
  const instagram = igMatch ? igMatch[1].replace(/\/$/, '') : '';

  return { email: businessEmail, instagram };
}

// ── 카테고리별 키워드 확장 ──
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '맛집': ['맛집 리뷰', '먹방 유튜버', '맛집 추천'],
  '먹방': ['먹방', '먹방 유튜버', '대식가'],
  '농산물': ['농산물 리뷰', '농가 유튜버', '로컬푸드 리뷰'],
  '캠핑': ['캠핑 유튜버', '차박 브이로그'],
  '뷰티': ['뷰티 유튜버', '화장품 리뷰', '메이크업 튜토리얼'],
  '여행': ['여행 브이로그', '여행 유튜버'],
  '패션': ['패션 유튜버', '코디 추천'],
  '운동': ['운동 유튜버', '홈트레이닝', '피트니스'],
};

// ── YouTube Data API v3 채널 검색 (이메일 추출 + brandingSettings 포함) ──
async function searchYouTubeDirect(keyword: string, maxResults: number = 10) {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  // 카테고리 키워드 확장
  const keywords = CATEGORY_KEYWORDS[keyword] || [keyword];
  const count = Math.min(maxResults, 50);
  const allResults: any[] = [];

  for (const kw of keywords) {
    if (allResults.length >= count) break;

    // 1단계: 채널 검색
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(kw)}&maxResults=50&regionCode=KR&hl=ko&key=${YOUTUBE_API_KEY}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) continue;
    const searchData = await searchRes.json();

    if (!searchData.items || searchData.items.length === 0) continue;

    // 2단계: 채널 상세 정보 (brandingSettings 포함 → 이메일 추출 가능)
    const channelIds = searchData.items.map((item: any) => item.snippet.channelId || item.id.channelId).join(',');
    const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channelIds}&key=${YOUTUBE_API_KEY}`;
    const channelsRes = await fetch(channelsUrl);
    if (!channelsRes.ok) continue;
    const channelsData = await channelsRes.json();

    // 3단계: 결과 포맷팅 + 이메일 추출
    for (const ch of (channelsData.items || [])) {
      if (allResults.length >= count) break;

      const snippet = ch.snippet || {};
      const stats = ch.statistics || {};
      const branding = ch.brandingSettings?.channel || {};
      const subs = parseInt(stats.subscriberCount || '0', 10);
      const views = parseInt(stats.viewCount || '0', 10);
      const videos = parseInt(stats.videoCount || '1', 10);
      const avgViews = videos > 0 ? Math.round(views / videos) : 0;

      // 이메일 + 인스타 추출 (snippet.description + branding.description)
      const contact = extractContactInfo(snippet.description || '', branding.description || '');

      allResults.push({
        channelId: ch.id,
        title: snippet.title,
        description: (snippet.description || '').substring(0, 300),
        customUrl: snippet.customUrl || '',
        thumbnailUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
        subscriberCount: subs,
        subscriberFormatted: formatNumber(subs),
        videoCount: videos,
        viewCount: views,
        avgViews,
        channelUrl: `https://www.youtube.com/channel/${ch.id}`,
        email: contact.email,
        instagram: contact.instagram,
        category: keyword,
        source: 'YouTube Data API v3',
      });
    }
  }

  return { success: true, result: allResults };
}

// ── YouTube 인기 영상 검색 + 바이럴 분석 ──
async function searchPopularVideos(keyword: string, maxResults: number = 5, period: string = '') {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  // 기간 필터
  let publishedAfter = '';
  if (period === 'day') publishedAfter = new Date(Date.now() - 86400000).toISOString();
  else if (period === 'week') publishedAfter = new Date(Date.now() - 7 * 86400000).toISOString();
  else if (period === 'month') publishedAfter = new Date(Date.now() - 30 * 86400000).toISOString();
  else if (period === 'year') publishedAfter = new Date(Date.now() - 365 * 86400000).toISOString();

  const count = Math.min(maxResults, 20);
  let searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(keyword)}&order=viewCount&maxResults=${count}&regionCode=KR&hl=ko&key=${YOUTUBE_API_KEY}`;
  if (publishedAfter) searchUrl += `&publishedAfter=${publishedAfter}`;

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) throw new Error(`YouTube Search API 오류: ${searchRes.status}`);
  const searchData = await searchRes.json();

  if (!searchData.items || searchData.items.length === 0) {
    return { success: true, videos: [], analysis: '', summary: '검색 결과가 없습니다.' };
  }

  // 영상 상세 정보
  const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');
  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
  const videosRes = await fetch(videosUrl);
  if (!videosRes.ok) throw new Error(`YouTube Videos API 오류: ${videosRes.status}`);
  const videosData = await videosRes.json();

  const videos = (videosData.items || []).map((v: any) => {
    const stats = v.statistics || {};
    const viewCount = parseInt(stats.viewCount || '0', 10);
    const likeCount = parseInt(stats.likeCount || '0', 10);
    const commentCount = parseInt(stats.commentCount || '0', 10);
    return {
      videoId: v.id,
      title: v.snippet.title,
      channelName: v.snippet.channelTitle,
      channelId: v.snippet.channelId,
      description: (v.snippet.description || '').substring(0, 200),
      publishedAt: v.snippet.publishedAt,
      publishedAgo: getRelativeTime(v.snippet.publishedAt),
      viewCount,
      viewCountFormatted: formatNumber(viewCount),
      likeCount,
      commentCount,
      engagementRate: viewCount > 0 ? ((likeCount + commentCount) / viewCount * 100).toFixed(2) + '%' : '0%',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnailUrl: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url || '',
    };
  });

  // GPT로 바이럴 분석
  let analysis = '';
  if (OPENAI_API_KEY && videos.length > 0) {
    try {
      const videoSummary = videos.slice(0, 5).map((v: any, i: number) =>
        `${i + 1}. "${v.title}" (${v.channelName}) - 조회수: ${v.viewCountFormatted}, 좋아요: ${v.likeCount.toLocaleString()}, 댓글: ${v.commentCount.toLocaleString()}, 참여율: ${v.engagementRate}, 게시: ${v.publishedAgo}`
      ).join('\n');

      const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [{
            role: 'system',
            content: '당신은 유튜브 트렌드 분석 전문가입니다. 한국어로 답변하세요.'
          }, {
            role: 'user',
            content: `다음 "${keyword}" 관련 인기 영상들을 분석해주세요:\n\n${videoSummary}\n\n다음 항목을 분석해주세요:\n1. **바이럴 이유**: 각 영상이 왜 인기를 끌었는지 (제목, 썸네일 전략, 시의성, 감정 자극 등)\n2. **공통 성공 요인**: 이 영상들의 공통된 성공 패턴\n3. **트렌드 방향**: 이 키워드의 현재 트렌드 방향성\n4. **비즈니스 활용**: 마케팅이나 사업에 어떻게 활용할 수 있는지\n5. **추천 전략**: 유사한 인기 콘텐츠를 만들기 위한 전략\n\n간결하고 실용적으로 분석해주세요.`
          }],
          max_tokens: 1500,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (gptRes.ok) {
        const gptData = await gptRes.json();
        analysis = gptData.choices?.[0]?.message?.content || '';
      }
    } catch (e: any) {
      console.error('[cloud-proxy] GPT 분석 오류:', e.message);
    }
  }

  const summary = `"${keyword}" 관련 인기 영상 ${videos.length}건을 찾았습니다.`;

  return {
    success: true,
    videos,
    analysis,
    summary,
    logs: [
      { step: 1, status: 'done', message: `"${keyword}" 인기 영상 ${videos.length}건 수집 완료` },
      { step: 2, status: analysis ? 'done' : 'skip', message: analysis ? 'AI 바이럴 분석 완료' : 'AI 분석 건너뜀' },
    ],
  };
}

function formatNumber(num: number): string {
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}억`;
  if (num >= 10000) return `${(num / 10000).toFixed(1)}만`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}천`;
  return num.toString();
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return '방금 전';
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const endpoint = req.query.endpoint as string || 'status';

      // ── YouTube 인기 영상 분석 (GET) ──
      if (endpoint === 'youtube-analyze') {
        const keyword = String(req.query.keyword || '');
        const count = Number(req.query.count) || 5;
        const period = String(req.query.period || '');
        if (!keyword) return res.status(400).json({ error: 'keyword is required' });
        const result = await searchPopularVideos(keyword, count, period);
        return res.status(200).json(result);
      }

      // ── YouTube 트렌딩 (GET) ──
      if (endpoint === 'youtube-trending') {
        const action = String(req.query.action || 'trending');
        const keyword = String(req.query.keyword || req.query.channelName || '');
        const count = Number(req.query.maxResults) || 5;
        // 트렌딩은 인기 영상 검색으로 대체
        const searchKeyword = action === 'trending' ? '한국 인기' : keyword;
        const result = await searchPopularVideos(searchKeyword, count);
        return res.status(200).json(result);
      }

      // ── 기타 GET 요청 → 클라우드 서버 프록시 ──
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(req.query)) {
        if (key !== 'endpoint' && value) {
          queryParams.set(key, String(value));
        }
      }
      const qs = queryParams.toString();
      const url = `${CLOUD_SERVER}/api/${endpoint}${qs ? `?${qs}` : ''}`;
      
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000)
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: `Cloud server returned ${response.status}` });
      }
      
      const data = await response.json();
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { endpoint, taskType, params, ...rest } = req.body;

      // ── YouTube 채널 검색 (이메일 추출 포함) ──
      if (taskType === 'youtube-search') {
        console.log('[cloud-proxy] YouTube 직접 검색 (이메일 추출 포함):', params?.keyword, params?.maxResults);
        const result = await searchYouTubeDirect(
          params?.keyword || '',
          params?.maxResults || 10
        );
        return res.status(200).json(result);
      }

      // ── DB 액션 (POST) ──
      if (taskType === 'db') {
        const dbAction = params?.action || rest?.action;
        let conn;
        try {
          conn = await getDbConnection();
          
          switch (dbAction) {
            case 'save_influencers': {
              const { influencers, keyword: sKeyword } = params || rest;
              if (!influencers || !Array.isArray(influencers)) {
                return res.status(400).json({ error: 'influencers array required' });
              }
              let saved = 0, duplicates = 0;
              for (const inf of influencers) {
                try {
                  await conn.execute(
                    `INSERT INTO influencers (channel_id, platform, name, email, subscribers, subscriber_text, views, description, profile_url, thumbnail, category, keyword, instagram)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), subscribers=VALUES(subscribers),
                       subscriber_text=VALUES(subscriber_text), views=VALUES(views), description=VALUES(description),
                       profile_url=VALUES(profile_url), thumbnail=VALUES(thumbnail), category=VALUES(category),
                       instagram=VALUES(instagram), updated_at=CURRENT_TIMESTAMP`,
                    [
                      inf.channelId || inf.channel_id || '', inf.platform || 'YouTube',
                      inf.name || '', inf.email || '', Number(inf.subscribers) || 0,
                      inf.subscriberText || inf.subscriber_text || '', Number(inf.views) || 0,
                      (inf.description || '').substring(0, 2000), inf.profileUrl || inf.profile_url || '',
                      inf.thumbnail || '', inf.category || sKeyword || '', sKeyword || '', inf.instagram || '',
                    ]
                  );
                  saved++;
                } catch (e: any) {
                  if (e.code === 'ER_DUP_ENTRY') duplicates++;
                  else console.error('Save error:', e.message);
                }
              }
              await conn.execute(
                `INSERT INTO collection_history (keyword, platform, total_found, with_email, new_collected, duplicates_skipped) VALUES (?, ?, ?, ?, ?, ?)`,
                [sKeyword || '', 'YouTube', influencers.length, influencers.filter((i: any) => i.email).length, saved, duplicates]
              );
              return res.json({ success: true, saved, duplicates, total: influencers.length });
            }

            case 'query_influencers': {
              const { keyword: qk, platform: qp, min_subscribers, has_email, limit: ql, category: qc } = params || rest;
              let sql = 'SELECT * FROM influencers WHERE 1=1';
              const qParams: any[] = [];
              if (qk) { sql += ' AND (keyword LIKE ? OR name LIKE ? OR category LIKE ?)'; qParams.push(`%${qk}%`, `%${qk}%`, `%${qk}%`); }
              if (qp) { sql += ' AND platform = ?'; qParams.push(qp); }
              if (min_subscribers) { sql += ' AND subscribers >= ?'; qParams.push(Number(min_subscribers)); }
              if (has_email === 'true' || has_email === true) { sql += " AND email != ''"; }
              if (qc) { sql += ' AND category LIKE ?'; qParams.push(`%${qc}%`); }
              sql += ' ORDER BY subscribers DESC LIMIT ?';
              qParams.push(Number(ql) || 50);
              const [rows] = await conn.execute(sql, qParams);
              return res.json({ success: true, total: (rows as any[]).length, influencers: rows });
            }

            case 'get_collected_ids': {
              const [rows] = await conn.execute('SELECT channel_id FROM influencers');
              const ids = (rows as any[]).map((r: any) => r.channel_id);
              return res.json({ success: true, ids });
            }

            case 'collection_history': {
              const [rows] = await conn.execute('SELECT * FROM collection_history ORDER BY collected_at DESC LIMIT 50');
              return res.json({ success: true, history: rows });
            }

            case 'save_viral_videos': {
              const { videos, keyword: vk } = params || rest;
              if (!videos || !Array.isArray(videos)) return res.status(400).json({ error: 'videos array required' });
              let vSaved = 0;
              for (const v of videos) {
                try {
                  await conn.execute(
                    `INSERT INTO viral_videos (video_id, channel_id, title, view_count, like_count, comment_count, published_at, thumbnail, viral_reason, keyword)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE view_count=VALUES(view_count), like_count=VALUES(like_count), comment_count=VALUES(comment_count), viral_reason=VALUES(viral_reason)`,
                    [v.videoId||'', v.channelId||'', v.title||'', Number(v.viewCount)||0, Number(v.likeCount)||0, Number(v.commentCount)||0, v.publishedAt||'', v.thumbnail||'', v.viralReason||'', vk||'']
                  );
                  vSaved++;
                } catch (e: any) { console.error('Save viral error:', e.message); }
              }
              return res.json({ success: true, saved: vSaved });
            }

            case 'query_viral_videos': {
              const { keyword: vqk, limit: vql } = params || rest;
              let sql = 'SELECT * FROM viral_videos WHERE 1=1';
              const vqParams: any[] = [];
              if (vqk) { sql += ' AND (keyword LIKE ? OR title LIKE ?)'; vqParams.push(`%${vqk}%`, `%${vqk}%`); }
              sql += ' ORDER BY view_count DESC LIMIT ?';
              vqParams.push(Number(vql) || 20);
              const [rows] = await conn.execute(sql, vqParams);
              return res.json({ success: true, total: (rows as any[]).length, videos: rows });
            }

            case 'save_memory': {
              const { memory_type, memory_key, memory_value, metadata } = params || rest;
              await conn.execute(
                `INSERT INTO ai_memory (memory_type, memory_key, memory_value, metadata) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE memory_value=VALUES(memory_value), metadata=VALUES(metadata)`,
                [memory_type, memory_key, memory_value, JSON.stringify(metadata || {})]
              );
              return res.json({ success: true });
            }

            case 'query_memory': {
              const { memory_type: mt, memory_key: mk } = params || rest;
              let sql = 'SELECT * FROM ai_memory WHERE 1=1';
              const mParams: any[] = [];
              if (mt) { sql += ' AND memory_type = ?'; mParams.push(mt); }
              if (mk) { sql += ' AND memory_key LIKE ?'; mParams.push(`%${mk}%`); }
              sql += ' ORDER BY updated_at DESC LIMIT 50';
              const [rows] = await conn.execute(sql, mParams);
              return res.json({ success: true, memories: rows });
            }

            case 'stats': {
              const [[totalInf]] = await conn.execute('SELECT COUNT(*) as cnt FROM influencers') as any;
              const [[withEmail]] = await conn.execute("SELECT COUNT(*) as cnt FROM influencers WHERE email != ''") as any;
              const [[totalVideos]] = await conn.execute('SELECT COUNT(*) as cnt FROM viral_videos') as any;
              const [[totalCollections]] = await conn.execute('SELECT COUNT(*) as cnt FROM collection_history') as any;
              const [topKeywords] = await conn.execute('SELECT keyword, COUNT(*) as cnt FROM influencers GROUP BY keyword ORDER BY cnt DESC LIMIT 10');
              const [recentCollections] = await conn.execute('SELECT * FROM collection_history ORDER BY collected_at DESC LIMIT 5');
              return res.json({ success: true, stats: { total_influencers: totalInf.cnt, with_email: withEmail.cnt, total_viral_videos: totalVideos.cnt, total_collections: totalCollections.cnt, top_keywords: topKeywords, recent_collections: recentCollections } });
            }

            default:
              return res.status(400).json({ error: `Unknown db action: ${dbAction}` });
          }
        } catch (error: any) {
          console.error('DB Error:', error);
          return res.status(500).json({ error: error.message });
        } finally {
          if (conn) await conn.end();
        }
      }

      // ── YouTube 인기 영상 분석 (POST) ──
      if (taskType === 'youtube-viral') {
        console.log('[cloud-proxy] YouTube 인기 영상 분석:', params?.keyword);
        const result = await searchPopularVideos(
          params?.keyword || '',
          params?.count || 5,
          params?.period || ''
        );
        return res.status(200).json(result);
      }

      // ── 스마트스토어 주문 조회 (Vercel serverless 직접 처리) ──
      if (taskType === 'smartstore-orders') {
        console.log('[cloud-proxy] smartstore-orders: direct Naver Commerce API call');
        try {
          const ssResult = await handleSmartstoreOrdersDirect();
          return res.status(200).json(ssResult);
        } catch (err: any) {
          console.error('[cloud-proxy] smartstore-orders error:', err.message);
          return res.status(500).json({ success: false, error: err.message });
        }
      }

      // ── 일일 브리핑 (Vercel serverless 직접 처리) ──
      if (taskType === 'daily-briefing') {
        console.log('[cloud-proxy] daily-briefing: direct processing');
        try {
          const ssResult = await handleSmartstoreOrdersDirect();
          if (!ssResult.success) {
            return res.status(500).json({ success: false, error: 'smartstore data fetch failed' });
          }
          const ss = ssResult.result.smartstore;
          const now = new Date();
          const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
          const dateStr = kstNow.toISOString().split('T')[0];
          const timeStr = kstNow.toTimeString().split(' ')[0].substring(0, 5);
          const briefingResult = {
            success: true,
            result: {
              briefing: {
                date: dateStr,
                time: timeStr,
                summary: `${dateStr} ${timeStr} 기준 스마트스토어 현황입니다.\n\n` +
                  `■ 오늘 신규주문: ${ss.todayNewOrders}건 (매출 ${ss.todaySales.toLocaleString()}원)\n` +
                  `■ 현재 신규주문: ${ss.newOrders}건\n` +
                  `■ 배송준비: ${ss.pendingShipping}건\n` +
                  `■ 배송 전 처리 대상 전체: ${ss.totalPreShipping}건\n` +
                  `■ 배송중: ${ss.delivering}건\n` +
                  `■ 배송완료: ${ss.delivered}건\n` +
                  `■ 구매확정: ${ss.purchaseDecided}건\n` +
                  (ss.cancelRequests > 0 ? `■ 취소요청: ${ss.cancelRequests}건\n` : ''),
                smartstore: ss,
              },
              actionLogs: ssResult.result.actionLogs,
            },
          };
          return res.status(200).json(briefingResult);
        } catch (err: any) {
          console.error('[cloud-proxy] daily-briefing error:', err.message);
          return res.status(500).json({ success: false, error: err.message });
        }
      }

      // ── 그 외 작업은 클라우드 서버로 프록시 ──
      const url = `${CLOUD_SERVER}/api/${endpoint || 'task'}`;
      const body = taskType 
        ? JSON.stringify({ taskType, params })
        : JSON.stringify({ ...params, ...rest });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(58000)
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: `Cloud server returned ${response.status}` });
      }
      
      const data = await response.json();
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[cloud-proxy] Error:', error.message);
    return res.status(503).json({ 
      error: 'Cloud server unavailable',
      message: error.message 
    });
  }
}
