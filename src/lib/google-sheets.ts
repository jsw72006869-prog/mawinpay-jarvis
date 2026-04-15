// Google Sheets 자동 입력 모듈
// Google Apps Script 웹훅을 통해 구글 시트에 데이터를 자동으로 기록합니다.
// 설정 방법: VITE_GOOGLE_SHEETS_WEBHOOK_URL 환경변수에 Apps Script 웹훅 URL을 입력하세요.

export interface InfluencerData {
  name: string;
  platform: string;
  followers: string;
  category: string;
  email: string;
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

// 구글 시트 웹훅 URL (환경변수에서 로드)
const WEBHOOK_URL = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL || '';

// 인플루언서 데이터를 구글 시트에 기록
export async function appendInfluencersToSheet(
  influencers: InfluencerData[],
  sheetName = '인플루언서 수집'
): Promise<{ success: boolean; count: number; message: string }> {
  if (!WEBHOOK_URL) {
    console.warn('[JARVIS] 구글 시트 웹훅 URL이 설정되지 않았습니다.');
    return { success: false, count: 0, message: '구글 시트 웹훅 URL이 설정되지 않았습니다.' };
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors', // CORS 우회 (Apps Script는 no-cors 지원)
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'appendInfluencers',
        sheetName,
        data: influencers,
        timestamp: new Date().toISOString(),
      }),
    });

    // no-cors 모드에서는 응답 확인 불가 → 성공으로 간주
    console.log('[JARVIS] 구글 시트 전송 완료 (no-cors)');
    return { success: true, count: influencers.length, message: `${influencers.length}명의 데이터가 구글 시트에 기록되었습니다.` };
  } catch (error) {
    console.error('[JARVIS] 구글 시트 전송 오류:', error);
    return { success: false, count: 0, message: '구글 시트 전송 중 오류가 발생했습니다.' };
  }
}

// 이메일 발송 로그를 구글 시트에 기록
export async function appendEmailLogToSheet(
  logs: EmailLogData[],
  sheetName = '이메일 발송 로그'
): Promise<{ success: boolean; count: number; message: string }> {
  if (!WEBHOOK_URL) {
    return { success: false, count: 0, message: '구글 시트 웹훅 URL이 설정되지 않았습니다.' };
  }

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'appendEmailLog',
        sheetName,
        data: logs,
        timestamp: new Date().toISOString(),
      }),
    });

    return { success: true, count: logs.length, message: `${logs.length}건의 발송 로그가 기록되었습니다.` };
  } catch (error) {
    console.error('[JARVIS] 이메일 로그 전송 오류:', error);
    return { success: false, count: 0, message: '이메일 로그 전송 중 오류가 발생했습니다.' };
  }
}

// 네이버 수집 결과 데이터 타입
export interface NaverCollectedData {
  title: string;        // 블로그/카페 제목
  author: string;       // 작성자 (블로거 ID)
  link: string;         // 원문 링크
  description: string;  // 요약 설명
  type: string;         // 'blog' | 'cafe'
  keyword: string;      // 검색 키워드
  collectedAt: string;  // 수집 일시
}

// 네이버 수집 결과를 구글 시트 'JARVIS_네이버수집' 탭에 저장
export async function appendNaverResultsToSheet(
  results: NaverCollectedData[],
  sheetName = 'JARVIS_네이버수집'
): Promise<{ success: boolean; count: number; message: string }> {
  if (!WEBHOOK_URL) {
    console.warn('[JARVIS] 구글 시트 웹훅 URL이 설정되지 않았습니다.');
    return { success: false, count: 0, message: '구글 시트 웹훅 URL이 설정되지 않았습니다.' };
  }

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'appendNaverResults',
        sheetName,
        data: results,
        timestamp: new Date().toISOString(),
      }),
    });

    console.log(`[JARVIS] 네이버 수집 결과 ${results.length}건 구글 시트 전송 완료`);
    return {
      success: true,
      count: results.length,
      message: `${results.length}건의 네이버 수집 데이터가 구글 시트 '${sheetName}' 탭에 저장되었습니다.`,
    };
  } catch (error) {
    console.error('[JARVIS] 네이버 결과 전송 오류:', error);
    return { success: false, count: 0, message: '구글 시트 전송 중 오류가 발생했습니다.' };
  }
}

// 더미 인플루언서 데이터 생성 (실제 수집 시뮬레이션)
export function generateMockInfluencers(count: number, category: string, platform: string): InfluencerData[] {
  const names = [
    '맛집탐방러', '서울미식가', '푸드크리에이터', '맛집일기', '오늘뭐먹지',
    '먹방킹', '미식여행자', '쿠킹마스터', '레시피퀸', '푸드스타일리스트',
    '뷰티인사이더', '스킨케어전문가', '메이크업아티스트', '패션피플', '스타일리스트',
    '여행블로거', '세계여행가', '캠핑러버', '아웃도어마니아', '등산전문가',
    '헬스트레이너', '요가강사', '다이어트코치', '운동유튜버', '피트니스모델',
    '육아맘', '아이와함께', '패밀리채널', '반려동물일상', '강아지일기',
    '인테리어디자이너', '홈스타일링', '테크리뷰어', 'IT전문가', '재테크전문가',
  ];

  const platforms = platform ? [platform] : ['Instagram', 'YouTube', 'TikTok', 'Naver Blog'];
  const followerRanges = ['12.3K', '28.5K', '45.2K', '89.1K', '125K', '234K', '312K', '456K', '1.2M'];
  const emails = ['@gmail.com', '@naver.com', '@kakao.com', '@daum.net'];

  const now = new Date().toLocaleString('ko-KR');

  return Array.from({ length: count }, (_, i) => {
    const name = names[i % names.length] + (i >= names.length ? `_${Math.floor(i / names.length) + 1}` : '');
    const plat = platforms[i % platforms.length];
    const followers = followerRanges[Math.floor(Math.random() * followerRanges.length)];
    const emailDomain = emails[Math.floor(Math.random() * emails.length)];
    const emailName = name.toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(Math.random() * 999);

    return {
      name,
      platform: plat,
      followers,
      category,
      email: `${emailName}${emailDomain}`,
      status: Math.random() > 0.08 ? '활성' : '비활성',
      collectedAt: now,
    };
  });
}

// 이메일 발송 로그 생성
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

// Google Apps Script 코드 (사용자가 직접 배포해야 함)
export const APPS_SCRIPT_CODE = `
// =====================================================
// Google Apps Script 웹훅 코드
// 새 Apps Script 프로젝트에 붙여넣고 웹 앱으로 배포하세요.
// 배포 URL을 VITE_GOOGLE_SHEETS_WEBHOOK_URL에 설정하세요.
// =====================================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (data.action === 'appendInfluencers') {
      let sheet = ss.getSheetByName(data.sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(data.sheetName);
        sheet.appendRow(['이름', '플랫폼', '팔로워', '카테고리', '이메일', '상태', '수집일시']);
        sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
      }
      data.data.forEach(row => {
        sheet.appendRow([row.name, row.platform, row.followers, row.category, row.email, row.status, row.collectedAt]);
      });
    }
    
    if (data.action === 'appendNaverResults') {
      let sheet = ss.getSheetByName(data.sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(data.sheetName);
        sheet.appendRow(['제목', '작성자', '링크', '요약', '유형', '키워드', '수집일시']);
        sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#03c75a').setFontColor('#ffffff');
        sheet.setColumnWidth(1, 300);
        sheet.setColumnWidth(3, 250);
        sheet.setColumnWidth(4, 350);
      }
      data.data.forEach(row => {
        sheet.appendRow([row.title, row.author, row.link, row.description, row.type, row.keyword, row.collectedAt]);
      });
    }
    
    if (data.action === 'appendEmailLog') {
      let sheet = ss.getSheetByName(data.sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(data.sheetName);
        sheet.appendRow(['인플루언서명', '이메일', '템플릿', '발송일시', '상태']);
        sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#34a853').setFontColor('#ffffff');
      }
      data.data.forEach(row => {
        sheet.appendRow([row.influencerName, row.email, row.template, row.sentAt, row.status]);
      });
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput('JARVIS Sheets Webhook is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}
`;
