// youtube-analyze.js
// 유튜브 영상 지능형 분석 API
// 1단계: YouTube API로 영상 데이터 수집
// 2단계: 마누스 AI에게 영상 분석 미션 위임 (콘텐츠 분석, 트렌드 파악, 비즈니스 인사이트)
// 3단계: GPT로 최종 요약 및 맞춤 추천 생성

const YT_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YT_COMMENTS_URL = 'https://www.googleapis.com/youtube/v3/commentThreads';

// ── 조회수 포맷팅 ──
function formatViews(count) {
  if (count >= 100000000) return `${(count / 100000000).toFixed(1)}억회`;
  if (count >= 10000) return `${(count / 10000).toFixed(1)}만회`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}천회`;
  return `${count}회`;
}

function timeAgo(dateStr) {
  const now = new Date();
  const published = new Date(dateStr);
  const diffDay = Math.floor((now - published) / 86400000);
  if (diffDay < 1) return '오늘';
  if (diffDay < 7) return `${diffDay}일 전`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}주 전`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}개월 전`;
  return `${Math.floor(diffDay / 365)}년 전`;
}

// ── YouTube API: 키워드 인기 영상 수집 ──
async function fetchPopularVideos(apiKey, keyword, maxResults = 10, publishedAfter = '') {
  const searchParams = new URLSearchParams({
    part: 'snippet',
    q: keyword,
    type: 'video',
    order: 'viewCount',
    regionCode: 'KR',
    hl: 'ko',
    maxResults: String(Math.min(maxResults, 50)),
    key: apiKey,
  });
  if (publishedAfter) searchParams.set('publishedAfter', publishedAfter);

  const searchRes = await fetch(`${YT_SEARCH_URL}?${searchParams}`);
  if (!searchRes.ok) throw new Error(`YouTube Search API 오류: ${searchRes.status}`);
  const searchData = await searchRes.json();
  const videoIds = (searchData.items || []).map(i => i.id.videoId).filter(Boolean);
  if (videoIds.length === 0) return [];

  // 상세 정보 조회
  const detailParams = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(','),
    hl: 'ko',
    key: apiKey,
  });
  const detailRes = await fetch(`${YT_VIDEOS_URL}?${detailParams}`);
  if (!detailRes.ok) throw new Error(`YouTube Videos API 오류: ${detailRes.status}`);
  const detailData = await detailRes.json();

  return (detailData.items || []).map(item => ({
    videoId: item.id,
    title: item.snippet.title,
    channelName: item.snippet.channelTitle,
    channelId: item.snippet.channelId,
    description: (item.snippet.description || '').slice(0, 500),
    publishedAt: item.snippet.publishedAt,
    publishedAgo: timeAgo(item.snippet.publishedAt),
    viewCount: parseInt(item.statistics?.viewCount || '0', 10),
    viewCountFormatted: formatViews(parseInt(item.statistics?.viewCount || '0', 10)),
    likeCount: parseInt(item.statistics?.likeCount || '0', 10),
    commentCount: parseInt(item.statistics?.commentCount || '0', 10),
    tags: (item.snippet.tags || []).slice(0, 10),
    url: `https://www.youtube.com/watch?v=${item.id}`,
    thumbnail: item.snippet.thumbnails?.high?.url || '',
  })).sort((a, b) => b.viewCount - a.viewCount);
}

// ── YouTube API: 영상 댓글 수집 ──
async function fetchTopComments(apiKey, videoId, maxResults = 10) {
  try {
    const params = new URLSearchParams({
      part: 'snippet',
      videoId,
      order: 'relevance',
      maxResults: String(maxResults),
      key: apiKey,
    });
    const res = await fetch(`${YT_COMMENTS_URL}?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map(item => ({
      author: item.snippet.topLevelComment.snippet.authorDisplayName,
      text: item.snippet.topLevelComment.snippet.textDisplay.replace(/<[^>]*>/g, '').slice(0, 200),
      likeCount: item.snippet.topLevelComment.snippet.likeCount || 0,
    }));
  } catch {
    return [];
  }
}

// ── 마누스 AI에게 영상 분석 미션 위임 ──
async function analyzeWithManus(manusApiKey, analysisData) {
  const { keyword, videos, topComments, businessContext } = analysisData;

  const videoSummary = videos.slice(0, 5).map((v, i) =>
    `${i + 1}. "${v.title}" (${v.channelName}) - 조회수: ${v.viewCountFormatted}, 좋아요: ${v.likeCount.toLocaleString()}, 댓글: ${v.commentCount.toLocaleString()}\n   설명: ${v.description.slice(0, 150)}...\n   태그: ${v.tags.join(', ')}\n   URL: ${v.url}`
  ).join('\n\n');

  const commentSummary = topComments.length > 0
    ? topComments.map(c => `- "${c.text}" (좋아요 ${c.likeCount})`).join('\n')
    : '댓글 데이터 없음';

  const prompt = `당신은 유튜브 마케팅 전문가입니다. 아래 데이터를 분석하고 비즈니스 인사이트를 제공해주세요.

## 분석 요청
키워드: "${keyword}"
비즈니스 컨텍스트: ${businessContext || '농산물 스마트스토어 운영 (밤, 옥수수 등)'}

## 수집된 인기 영상 TOP 5
${videoSummary}

## 인기 영상 댓글 반응
${commentSummary}

## 분석 요청 사항
1. **트렌드 분석**: 이 키워드의 유튜브 트렌드는 어떤 방향인가? (상승/하락/안정)
2. **성공 요인 분석**: 조회수가 높은 영상들의 공통 성공 요인은?
3. **콘텐츠 전략**: 이 키워드로 영상을 만든다면 어떤 포맷/스타일이 효과적인가?
4. **비즈니스 활용**: 스마트스토어 마케팅에 이 트렌드를 어떻게 활용할 수 있는가?
5. **추천 영상 TOP 3**: 비즈니스 참고용으로 가장 유용한 영상 3개를 선정하고 이유를 설명

반드시 한국어로 답변하고, 실행 가능한 구체적 조언을 포함해주세요.`;

  try {
    const response = await fetch('https://api.manus.ai/v2/task.create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manus-api-key': manusApiKey,
      },
      body: JSON.stringify({
        message: { content: prompt },
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error?.message || '마누스 태스크 생성 실패');
    }

    const taskId = data.task?.task_id || data.task_id;

    // 폴링으로 결과 대기 (최대 90초)
    let result = null;
    for (let i = 0; i < 18; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const statusRes = await fetch(`https://api.manus.ai/v2/task.listMessages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manus-api-key': manusApiKey,
        },
        body: JSON.stringify({ task_id: taskId }),
      });

      const statusData = await statusRes.json();
      if (statusData.ok && statusData.messages) {
        // 마누스의 마지막 assistant 메시지 찾기
        const assistantMsgs = statusData.messages.filter(m =>
          m.role === 'assistant' && m.content && m.content.length > 100
        );
        if (assistantMsgs.length > 0) {
          const lastMsg = assistantMsgs[assistantMsgs.length - 1];
          // content가 배열인 경우 텍스트 추출
          if (typeof lastMsg.content === 'string') {
            result = lastMsg.content;
          } else if (Array.isArray(lastMsg.content)) {
            result = lastMsg.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('\n');
          }
          if (result && result.length > 200) break;
        }
      }
    }

    return {
      success: !!result,
      taskId,
      analysis: result || '마누스 AI 분석이 아직 진행 중입니다. 잠시 후 다시 확인해주세요.',
      taskUrl: data.task?.task_url,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      analysis: null,
    };
  }
}

// ── GPT로 최종 요약 생성 (마누스 분석 없이도 동작) ──
async function generateGPTSummary(openaiKey, videos, keyword, businessContext) {
  const videoInfo = videos.slice(0, 5).map((v, i) =>
    `${i + 1}. "${v.title}" (${v.channelName}) - 조회수: ${v.viewCountFormatted}, 좋아요: ${v.likeCount.toLocaleString()}`
  ).join('\n');

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: '당신은 유튜브 마케팅 전문가 JARVIS입니다. 영상 데이터를 분석하여 비즈니스에 도움되는 인사이트를 한국어로 제공합니다. 간결하고 실행 가능한 조언을 합니다.'
          },
          {
            role: 'user',
            content: `"${keyword}" 관련 유튜브 인기 영상 TOP 5를 분석해주세요.
비즈니스: ${businessContext || '농산물 스마트스토어 (밤, 옥수수 등)'}

영상 목록:
${videoInfo}

다음을 분석해주세요:
1. 이 영상들의 공통 성공 요인
2. 비즈니스에 활용할 수 있는 포인트
3. 추천 영상 TOP 3와 이유 (간결하게)`
          }
        ],
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!res.ok) throw new Error(`GPT API 오류: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    return `GPT 분석 오류: ${error.message}`;
  }
}

// ── Vercel 서버리스 핸들러 ──
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const ytApiKey = process.env.YOUTUBE_API_KEY;
    const manusApiKey = process.env.MANUS_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;

    if (!ytApiKey) {
      return res.status(500).json({ success: false, error: 'YOUTUBE_API_KEY가 설정되지 않았습니다.' });
    }

    const params = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    const keyword = params.keyword || params.query || '';
    const maxResults = Math.min(parseInt(params.maxResults || params.count || '10', 10), 50);
    const businessContext = params.business_context || params.context || '농산물 스마트스토어 운영 (밤, 옥수수 등)';
    const analyzeMode = params.mode || 'smart'; // smart(GPT+마누스), quick(GPT만), data(데이터만)
    const period = params.period || '';

    if (!keyword) {
      return res.status(400).json({ success: false, error: '키워드(keyword)를 입력해주세요.' });
    }

    const logs = [];
    const startTime = Date.now();

    // ── Step 1: YouTube 데이터 수집 ──
    logs.push({ step: 1, status: 'start', message: `🔍 "${keyword}" 유튜브 인기 영상 수집 시작` });

    let publishedAfter = '';
    if (period === 'week') publishedAfter = new Date(Date.now() - 7 * 86400000).toISOString();
    else if (period === 'month') publishedAfter = new Date(Date.now() - 30 * 86400000).toISOString();
    else if (period === 'year') publishedAfter = new Date(Date.now() - 365 * 86400000).toISOString();

    const videos = await fetchPopularVideos(ytApiKey, keyword, maxResults, publishedAfter);
    logs.push({ step: 2, status: 'done', message: `📊 ${videos.length}개 영상 데이터 수집 완료` });

    if (videos.length === 0) {
      return res.status(200).json({
        success: true,
        keyword,
        videos: [],
        analysis: null,
        summary: `"${keyword}" 관련 유튜브 영상을 찾을 수 없습니다.`,
        logs,
        elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}초`,
      });
    }

    // ── Step 2: 인기 영상 댓글 수집 ──
    logs.push({ step: 3, status: 'running', message: '💬 인기 영상 댓글 반응 수집 중...' });
    const topVideoId = videos[0]?.videoId;
    const topComments = topVideoId ? await fetchTopComments(ytApiKey, topVideoId, 10) : [];
    logs.push({ step: 4, status: 'done', message: `💬 댓글 ${topComments.length}개 수집 완료` });

    // ── Step 3: AI 분석 ──
    let analysis = null;
    let manusTaskId = null;
    let manusTaskUrl = null;

    if (analyzeMode === 'data') {
      // 데이터만 반환 (분석 없음)
      logs.push({ step: 5, status: 'done', message: '📋 데이터 수집 모드 - 분석 생략' });
    } else if (analyzeMode === 'smart' && manusApiKey) {
      // 마누스 AI 분석 (비동기 - 태스크 생성만)
      logs.push({ step: 5, status: 'running', message: '🤖 마누스 AI에게 심층 분석 미션 위임 중...' });

      const manusResult = await analyzeWithManus(manusApiKey, {
        keyword,
        videos,
        topComments,
        businessContext,
      });

      if (manusResult.success) {
        analysis = manusResult.analysis;
        manusTaskId = manusResult.taskId;
        manusTaskUrl = manusResult.taskUrl;
        logs.push({ step: 6, status: 'done', message: '🤖 마누스 AI 심층 분석 완료' });
      } else {
        logs.push({ step: 6, status: 'warning', message: `마누스 분석 실패, GPT 분석으로 전환: ${manusResult.error}` });
        // GPT 폴백
        if (openaiKey) {
          logs.push({ step: 7, status: 'running', message: '🧠 GPT-4o 빠른 분석 진행 중...' });
          analysis = await generateGPTSummary(openaiKey, videos, keyword, businessContext);
          logs.push({ step: 8, status: 'done', message: '🧠 GPT-4o 분석 완료' });
        }
      }
    } else {
      // GPT 빠른 분석
      if (openaiKey) {
        logs.push({ step: 5, status: 'running', message: '🧠 GPT-4o 빠른 분석 진행 중...' });
        analysis = await generateGPTSummary(openaiKey, videos, keyword, businessContext);
        logs.push({ step: 6, status: 'done', message: '🧠 GPT-4o 분석 완료' });
      }
    }

    // ── 최종 요약 생성 ──
    const topVideo = videos[0];
    const summary = analysis
      ? `"${keyword}" 관련 인기 영상 ${videos.length}개를 수집하고 AI 분석을 완료했습니다. 1위: "${topVideo.title}" (${topVideo.viewCountFormatted})`
      : `"${keyword}" 관련 인기 영상 ${videos.length}개를 수집했습니다. 1위: "${topVideo.title}" (${topVideo.viewCountFormatted})`;

    const elapsed = `${((Date.now() - startTime) / 1000).toFixed(1)}초`;
    logs.push({ step: logs.length + 1, status: 'done', message: `✅ 전체 분석 완료 (${elapsed})` });

    return res.status(200).json({
      success: true,
      keyword,
      businessContext,
      analyzeMode,
      count: videos.length,
      videos: videos.slice(0, maxResults),
      topComments,
      analysis,
      manusTaskId,
      manusTaskUrl,
      summary,
      logs,
      elapsed,
    });

  } catch (error) {
    console.error('[youtube-analyze] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '알 수 없는 오류가 발생했습니다.',
    });
  }
};
