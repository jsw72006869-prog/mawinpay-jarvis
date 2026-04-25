/**
 * 마누스 AI 기반 네이버 예약 자동화 모듈
 */

export async function performNaverBookingWithManus(request: any) {
  try {
    const response = await fetch('/api/manus-agent/naver-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'automate_naver_booking',
        ...request,
      }),
    });
    return await response.json();
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function analyzeRealtimeKeywords(category: string, limit: number = 10) {
  try {
    const response = await fetch('/api/manus-agent/keyword-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'analyze_realtime_keywords', category, limit }),
    });
    return await response.json();
  } catch (error) {
    return { success: false, keywords: [] };
  }
}

export async function generateScriptFromVideoAnalysis(keyword: string, videoCount: number = 5, scriptType: string = 'shorts') {
  try {
    const response = await fetch('/api/manus-agent/video-script-generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate_script_from_video_analysis', keyword, videoCount, scriptType }),
    });
    return await response.json();
  } catch (error) {
    return { success: false, scripts: [] };
  }
}

export async function discoverInfluencersAutomatically(keyword: string, platforms: string[], limit: number = 20) {
  try {
    const response = await fetch('/api/manus-agent/influencer-discovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'discover_influencers_automatically', keyword, platforms, limit }),
    });
    return await response.json();
  } catch (error) {
    return { success: false, influencers: [] };
  }
}
