"use strict";
/**
 * InfluencerAgent API Module v1.0
 * 
 * YouTube 인플루언서 스캔 → 분석 → 제휴 이메일 자동 발송 파이프라인
 * 텔레메트리 이벤트를 단계별로 발행하여 시스템 맵과 HUD에 실시간 보고
 * 
 * 엔드포인트: /api/influencer-agent
 * 메서드: POST
 * Body: { keyword, category, maxResults, sendEmail, emailTemplate }
 */

const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YT_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';

// ── 소셜미디어 + 이메일 추출 ──
function extractContactInfo(description, brandDesc = '') {
  const allText = description + '\n' + brandDesc;
  
  // 이메일 추출
  const emailMatches = allText.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
  const businessEmail = emailMatches.find(e => 
    !e.includes('example.com') && !e.includes('noreply') && !e.includes('no-reply')
  ) || '';
  
  // Instagram
  const igMatch = allText.match(/(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9_.]+)/i);
  const instagram = igMatch ? igMatch[1].replace(/\/$/, '') : '';
  
  return { email: businessEmail, instagram };
}

// ── 인플루언서 적합도 점수 계산 ──
function calculateFitScore(channel, targetCategory) {
  let score = 0;
  const subs = channel.subscribers || 0;
  const avgViews = channel.avgViews || 0;
  
  // 구독자 수 기반 점수 (마이크로 인플루언서 선호: 1만~50만)
  if (subs >= 10000 && subs <= 500000) score += 30;
  else if (subs > 500000 && subs <= 1000000) score += 20;
  else if (subs > 1000000) score += 10;
  else score += 5;
  
  // 평균 조회수 대비 구독자 비율 (참여율)
  const engagementRate = subs > 0 ? (avgViews / subs) * 100 : 0;
  if (engagementRate >= 10) score += 30;
  else if (engagementRate >= 5) score += 20;
  else if (engagementRate >= 2) score += 10;
  
  // 이메일 보유 여부
  if (channel.email) score += 20;
  
  // 카테고리 매칭
  const desc = (channel.description || '').toLowerCase();
  if (desc.includes(targetCategory.toLowerCase())) score += 20;
  
  return Math.min(score, 100);
}

// ── 이메일 발송 (Gmail API 또는 Nodemailer) ──
async function sendCollaborationEmail(influencer, template, senderInfo) {
  // Gmail API를 통한 발송 시뮬레이션
  // 실제 구현 시 GMAIL_ACCESS_TOKEN 또는 SMTP 설정 필요
  const emailBody = template
    .replace('{{name}}', influencer.name)
    .replace('{{channel}}', influencer.customUrl || influencer.profileUrl)
    .replace('{{subscribers}}', influencer.subscribersFormatted)
    .replace('{{category}}', influencer.category);
  
  // 실제 발송 로직 (환경변수 확인)
  const gmailToken = process.env.GMAIL_ACCESS_TOKEN;
  if (!gmailToken) {
    return { sent: false, reason: 'GMAIL_ACCESS_TOKEN not configured', email: influencer.email };
  }
  
  try {
    // Gmail API를 통한 발송
    const message = [
      `To: ${influencer.email}`,
      `Subject: [협업 제안] ${influencer.name}님, 함께 성장할 기회를 드립니다`,
      'Content-Type: text/html; charset=utf-8',
      '',
      emailBody,
    ].join('\r\n');
    
    const encodedMessage = Buffer.from(message).toString('base64url');
    
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gmailToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
    });
    
    if (response.ok) {
      return { sent: true, email: influencer.email };
    } else {
      const err = await response.text();
      return { sent: false, reason: err, email: influencer.email };
    }
  } catch (error) {
    return { sent: false, reason: error.message, email: influencer.email };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'YouTube API key not configured',
      telemetry: { nodeId: 'influencer', state: 'error', message: 'YOUTUBE_API_KEY 미설정' }
    });
  }
  
  const { 
    keyword = '농산물', 
    category = '맛집', 
    maxResults = 20, 
    sendEmail = false,
    emailTemplate = '',
    minSubscribers = 5000,
    maxSubscribers = 1000000,
  } = req.body || req.query || {};
  
  const count = Math.min(Number(maxResults) || 20, 50);
  const results = {
    phase: 'scanning',
    scannedVideos: 0,
    selectedInfluencers: [],
    emailsSent: 0,
    emailsFailed: 0,
    telemetryEvents: [],
  };
  
  try {
    // ═══════════════════════════════════════════
    // Phase 1: YouTube 채널 스캔
    // ═══════════════════════════════════════════
    results.telemetryEvents.push({
      type: 'function_start',
      nodeId: 'influencer',
      message: `인플루언서 스캔 시작: "${keyword}" (카테고리: ${category})`,
    });
    
    const CATEGORY_KEYWORDS = {
      '맛집': ['맛집 리뷰', '먹방 유튜버', '맛집 추천'],
      '농산물': ['농산물 리뷰', '농가 유튜버', '로컬푸드 리뷰', '산지직송'],
      '캠핑': ['캠핑 유튜버', '차박 브이로그'],
      '뷰티': ['뷰티 유튜버', '화장품 리뷰'],
      '여행': ['여행 브이로그', '여행 유튜버'],
    };
    
    const keywords = CATEGORY_KEYWORDS[category] || [keyword];
    const allChannels = [];
    
    for (const kw of keywords) {
      if (allChannels.length >= count) break;
      
      const searchUrl = `${YT_SEARCH_URL}?part=snippet&q=${encodeURIComponent(kw)}&type=channel&maxResults=50&regionCode=KR&hl=ko&key=${apiKey}`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) continue;
      
      const searchData = await searchRes.json();
      const channelIds = (searchData.items || [])
        .map(item => item?.snippet?.channelId || item?.id?.channelId)
        .filter(Boolean);
      
      if (channelIds.length === 0) continue;
      
      // 채널 상세 정보 조회
      const channelsUrl = `${YT_CHANNELS_URL}?part=snippet,statistics,brandingSettings&id=${channelIds.join(',')}&key=${apiKey}`;
      const channelsRes = await fetch(channelsUrl);
      if (!channelsRes.ok) continue;
      
      const channelsData = await channelsRes.json();
      
      for (const ch of (channelsData.items || [])) {
        const stats = ch.statistics || {};
        const snippet = ch.snippet || {};
        const branding = ch.brandingSettings?.channel || {};
        const subs = parseInt(stats.subscriberCount || '0', 10);
        const views = parseInt(stats.viewCount || '0', 10);
        const videos = parseInt(stats.videoCount || '1', 10);
        const avgViews = videos > 0 ? Math.round(views / videos) : 0;
        
        // 구독자 필터링
        if (subs < Number(minSubscribers) || subs > Number(maxSubscribers)) continue;
        
        const contact = extractContactInfo(snippet.description || '', branding.description || '');
        
        const subsFormatted = subs >= 10000
          ? `${(subs / 10000).toFixed(1)}만`
          : subs >= 1000
            ? `${(subs / 1000).toFixed(1)}K`
            : String(subs);
        
        const channel = {
          channelId: ch.id,
          name: snippet.title || 'Unknown',
          description: (snippet.description || '').substring(0, 200),
          thumbnailUrl: snippet.thumbnails?.medium?.url || '',
          subscribers: subs,
          subscribersFormatted: subsFormatted,
          videoCount: videos,
          viewCount: views,
          avgViews,
          profileUrl: `https://youtube.com/channel/${ch.id}`,
          customUrl: snippet.customUrl ? `https://youtube.com/@${snippet.customUrl.replace('@', '')}` : '',
          email: contact.email,
          instagram: contact.instagram,
          category,
        };
        
        channel.fitScore = calculateFitScore(channel, category);
        allChannels.push(channel);
      }
      
      results.scannedVideos += (searchData.items || []).length;
    }
    
    // ═══════════════════════════════════════════
    // Phase 2: 적합도 분석 및 선별
    // ═══════════════════════════════════════════
    results.phase = 'analyzing';
    results.telemetryEvents.push({
      type: 'progress',
      nodeId: 'influencer',
      message: `${allChannels.length}개 채널 분석 중... 적합도 점수 계산`,
    });
    
    // 적합도 점수 기준 정렬 후 상위 선별
    const sorted = allChannels.sort((a, b) => b.fitScore - a.fitScore);
    const selected = sorted.slice(0, count);
    results.selectedInfluencers = selected;
    
    // ═══════════════════════════════════════════
    // Phase 3: 이메일 발송 (옵션)
    // ═══════════════════════════════════════════
    if (sendEmail && emailTemplate) {
      results.phase = 'emailing';
      results.telemetryEvents.push({
        type: 'progress',
        nodeId: 'influencer',
        message: `이메일 발송 시작: ${selected.filter(s => s.email).length}명 대상`,
      });
      
      const emailTargets = selected.filter(s => s.email);
      
      for (const influencer of emailTargets) {
        const result = await sendCollaborationEmail(influencer, emailTemplate, {});
        if (result.sent) {
          results.emailsSent++;
        } else {
          results.emailsFailed++;
        }
      }
    }
    
    // ═══════════════════════════════════════════
    // Phase 4: 완료 보고
    // ═══════════════════════════════════════════
    results.phase = 'complete';
    results.telemetryEvents.push({
      type: 'function_success',
      nodeId: 'influencer',
      message: `인플루언서 분석 완료`,
      data: {
        scannedVideos: results.scannedVideos,
        selectedInfluencers: selected.length,
        emailsSent: results.emailsSent,
        topInfluencer: selected[0]?.name || 'N/A',
        avgFitScore: selected.length > 0 
          ? Math.round(selected.reduce((sum, s) => sum + s.fitScore, 0) / selected.length) 
          : 0,
      },
    });
    
    return res.status(200).json({
      success: true,
      summary: {
        keyword,
        category,
        scannedChannels: allChannels.length,
        selectedCount: selected.length,
        emailsSent: results.emailsSent,
        emailsFailed: results.emailsFailed,
        avgFitScore: selected.length > 0 
          ? Math.round(selected.reduce((sum, s) => sum + s.fitScore, 0) / selected.length) 
          : 0,
      },
      influencers: selected,
      telemetryEvents: results.telemetryEvents,
    });
    
  } catch (error) {
    results.telemetryEvents.push({
      type: 'function_error',
      nodeId: 'influencer',
      message: `인플루언서 에이전트 오류: ${error.message}`,
    });
    
    return res.status(500).json({
      success: false,
      error: error.message,
      telemetryEvents: results.telemetryEvents,
    });
  }
};
