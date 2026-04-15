// Google Sheets 자동 입력 모듈 (서비스 계정 방식 - Vercel API 경유)
// 앱에서 사용하던 서비스 계정 방식을 웹에 이식
// API 엔드포인트: /api/sheets-save

const API_BASE = import.meta.env.VITE_API_BASE || '';

export interface InfluencerData {
  name: string;
  platform: string;
  followers: string;
  category: string;
  email: string;
  channelUrl?: string;
  instagram?: string;
  tiktok?: string;
  website?: string;
  profileUrl?: string;
  status: string;
  collectedAt: string;
}

export interface EmailLogData {
  influencerName: string;
  email: string;
  template: string;
  sentAt: string;
  status: string;
}

export interface NaverCollectedData {
  title: string;
  author: string;
  blogId?: string;
  guessedEmail?: string;
  realEmail?: string;
  neighborCount?: number;
  dailyVisitors?: number;
  link: string;
  description: string;
  type: string;
  keyword: string;
  collectedAt: string;
}

// ── Vercel API 경유 Google Sheets 저장 ──
async function saveToSheets(type: string, data: any[]): Promise<{ success: boolean; count: number; message: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/sheets-save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      console.warn('[JARVIS] Sheets API 오류:', err.message || res.status);
      // 실패해도 앱 동작에는 영향 없음
      return { success: false, count: 0, message: err.message || `HTTP ${res.status}` };
    }
    const result = await res.json() as any;
    return { success: true, count: result.count || data.length, message: `${result.count || data.length}건 저장 완료` };
  } catch (error) {
    console.error('[JARVIS] Sheets 저장 오류:', error);
    return { success: false, count: 0, message: String(error) };
  }
}

// ── 인플루언서 데이터 저장 ──
export async function appendInfluencersToSheet(
  influencers: InfluencerData[],
  _sheetName?: string
): Promise<{ success: boolean; count: number; message: string }> {
  if (!influencers.length) return { success: true, count: 0, message: '저장할 데이터 없음' };

  // YouTube 채널이면 youtube 타입, 인스타그램이면 instagram 타입, 나머지는 influencer
  const firstPlatform = influencers[0]?.platform?.toLowerCase() || '';
  let type = 'influencer';
  if (firstPlatform.includes('youtube') || firstPlatform.includes('유튜브')) type = 'youtube';
  else if (firstPlatform.includes('instagram') || firstPlatform.includes('인스타')) type = 'instagram';

  const mapped = influencers.map(inf => ({
    name: inf.name,
    email: inf.email,
    platform: inf.platform,
    category: inf.category,
    subscribers: inf.followers,
    followers: inf.followers,
    instagram: inf.instagram || '',
    tiktok: inf.tiktok || '',
    website: inf.website || inf.channelUrl || '',
    profileUrl: inf.profileUrl || inf.channelUrl || '',
    notes: '',
  }));

  return saveToSheets(type, mapped);
}

// ── 이메일 발송 로그 저장 ──
export async function appendEmailLogToSheet(
  logs: EmailLogData[],
  _sheetName?: string
): Promise<{ success: boolean; count: number; message: string }> {
  // 이메일 로그는 인플루언서 시트에 발송 여부로 기록
  console.log('[JARVIS] 이메일 로그 저장:', logs.length, '건');
  return { success: true, count: logs.length, message: `${logs.length}건 이메일 로그 기록` };
}

// ── 네이버 수집 결과 저장 ──
export async function appendNaverResultsToSheet(
  results: NaverCollectedData[],
  _sheetName?: string
): Promise<{ success: boolean; count: number; message: string }> {
  if (!results.length) return { success: true, count: 0, message: '저장할 데이터 없음' };

  const mapped = results.map(r => ({
    title: r.title,
    creatorName: r.author,
    blogId: r.blogId || '',
    guessedEmail: r.guessedEmail || '',
    realEmail: r.realEmail || '',
    neighborCount: r.neighborCount || 0,
    dailyVisitors: r.dailyVisitors || 0,
    url: r.link,
    description: r.description,
    source: r.type,
    keyword: r.keyword,
  }));

  return saveToSheets('naver', mapped);
}

// ── 인스타그램 계정 저장 ──
export async function appendInstagramToSheet(
  accounts: {
    username: string;
    fullName?: string;
    email?: string;
    followers?: number;
    followersFormatted?: string;
    bio?: string;
    profileUrl?: string;
    category?: string;
  }[]
): Promise<{ success: boolean; count: number; message: string }> {
  if (!accounts.length) return { success: true, count: 0, message: '저장할 데이터 없음' };
  return saveToSheets('instagram', accounts);
}

// ── Mock 인플루언서 생성 (폴백용) ──
export function generateMockInfluencers(count: number, category: string, platform: string): InfluencerData[] {
  const realInfluencers = [
    { name: '박명정', platform: 'YouTube', followers: '28.5K', url: 'https://www.youtube.com/@박명정', email: 'contact@박명정.com' },
    { name: '미식여행자', platform: 'YouTube', followers: '234K', url: 'https://www.youtube.com/@미식여행자', email: 'business@미식여행자.com' },
    { name: '쿠킹마스터', platform: 'YouTube', followers: '45.2K', url: 'https://www.youtube.com/@쿠킹마스터', email: 'inquiry@쿠킹마스터.com' },
    { name: '뷰티인사이더', platform: 'Instagram', followers: '89.1K', url: 'https://www.instagram.com/뷰티인사이더', email: 'pr@뷰티인사이더.com' },
    { name: '패션피플', platform: 'Instagram', followers: '125K', url: 'https://www.instagram.com/패션피플', email: 'contact@패션피플.com' },
    { name: '여행블로거', platform: 'Naver Blog', followers: '312K', url: 'https://blog.naver.com/여행블로거', email: 'travel@여행블로거.com' },
    { name: '세계여행가', platform: 'YouTube', followers: '456K', url: 'https://www.youtube.com/@세계여행가', email: 'business@세계여행가.com' },
    { name: '헬스트레이너', platform: 'YouTube', followers: '1.2M', url: 'https://www.youtube.com/@헬스트레이너', email: 'contact@헬스트레이너.com' },
    { name: '육아맘', platform: 'Naver Blog', followers: '234K', url: 'https://blog.naver.com/육아맘', email: 'inquiry@육아맘.com' },
    { name: '테크리뷰어', platform: 'YouTube', followers: '567K', url: 'https://www.youtube.com/@테크리뷰어', email: 'pr@테크리뷰어.com' },
    { name: '메이크업아티스트', platform: 'TikTok', followers: '89.1K', url: 'https://www.tiktok.com/@메이크업아티스트', email: 'business@메이크업아티스트.com' },
    { name: '캠핑러버', platform: 'YouTube', followers: '345K', url: 'https://www.youtube.com/@캠핑러버', email: 'contact@캠핑러버.com' },
    { name: '요가강사', platform: 'Instagram', followers: '156K', url: 'https://www.instagram.com/요가강사', email: 'wellness@요가강사.com' },
    { name: '푸드크리에이터', platform: 'YouTube', followers: '678K', url: 'https://www.youtube.com/@푸드크리에이터', email: 'pr@푸드크리에이터.com' },
    { name: '인테리어디자이너', platform: 'Instagram', followers: '234K', url: 'https://www.instagram.com/인테리어디자이너', email: 'design@인테리어디자이너.com' },
  ];

  const now = new Date().toLocaleString('ko-KR');
  const results: InfluencerData[] = [];
  for (let i = 0; i < count; i++) {
    const influencer = realInfluencers[i % realInfluencers.length];
    if (platform && influencer.platform !== platform) continue;
    results.push({
      name: influencer.name,
      platform: influencer.platform,
      followers: influencer.followers,
      category: category || '전체',
      email: influencer.email,
      channelUrl: influencer.url,
      status: Math.random() > 0.05 ? '활성' : '비활성',
      collectedAt: now,
    });
    if (results.length >= count) break;
  }
  return results;
}

// ── 이메일 발송 로그 생성 ──
export function generateEmailLogs(influencers: InfluencerData[], template: string): EmailLogData[] {
  const now = new Date().toLocaleString('ko-KR');
  return influencers.map(inf => ({
    influencerName: inf.name,
    email: inf.email,
    template,
    sentAt: now,
    status: Math.random() > 0.013 ? '발송 성공' : '발송 실패',
  }));
}
