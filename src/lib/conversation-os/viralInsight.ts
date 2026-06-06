import type { YouTubeViralInsight } from './types';

type VideoLike = {
  title?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  channelTitle?: string;
};

type ChannelLike = {
  title?: string;
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
  contact_email_exists?: boolean;
};

const HOOK_WORDS = [
  '추천',
  '리뷰',
  '루틴',
  '비교',
  '꿀팁',
  '먹방',
  '브이로그',
  '언박싱',
  'best',
  'review',
  'routine',
  'tips',
];

function cleanTitle(title: string): string {
  return title
    .replace(/\s+/g, ' ')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 80);
}

function rankVideos(videos: VideoLike[]): VideoLike[] {
  return [...videos].sort((a, b) => {
    const aScore = Number(a.viewCount || 0) + Number(a.commentCount || 0) * 30 + Number(a.likeCount || 0) * 5;
    const bScore = Number(b.viewCount || 0) + Number(b.commentCount || 0) * 30 + Number(b.likeCount || 0) * 5;
    return bScore - aScore;
  });
}

export function buildViralInsightFromYouTubeCollection(input: {
  keyword?: string;
  categoryLabel?: string;
  videos?: VideoLike[];
  channels?: ChannelLike[];
  candidates?: ChannelLike[];
}): YouTubeViralInsight {
  const keyword = input.keyword || input.categoryLabel || 'YouTube';
  const ranked = rankVideos(input.videos || []);
  const titleHooks = ranked
    .map(video => cleanTitle(String(video.title || '')))
    .filter(Boolean)
    .slice(0, 5);
  const titles = titleHooks.join(' ').toLowerCase();
  const matchedHooks = HOOK_WORDS.filter(word => titles.includes(word.toLowerCase())).slice(0, 5);
  const channels = input.channels || input.candidates || [];
  const contactable = channels.filter(channel => channel.contact_email_exists).length;
  const established = channels.filter(channel => Number(channel.subscriberCount || 0) >= 50000).length;
  const rising = channels.filter(channel => {
    const subs = Number(channel.subscriberCount || 0);
    const views = Number(channel.viewCount || 0);
    const count = Math.max(1, Number(channel.videoCount || 1));
    return subs > 0 && subs < 50000 && views / count > 3000;
  }).length;

  const topVideoPatterns = [
    titleHooks.length ? '상위 영상 제목은 문제 해결형/추천형 키워드가 잘 반응합니다.' : '실제 영상 데이터를 더 모으면 제목 패턴을 더 정확히 볼 수 있습니다.',
    matchedHooks.length ? `반복되는 후킹 단어: ${matchedHooks.join(', ')}` : '현재 샘플에서는 반복 후킹 단어가 강하게 잡히지 않았습니다.',
    ranked.length ? '조회수와 댓글 반응을 같이 보면서 단순 조회수 높은 채널만 고르지 않는 편이 좋습니다.' : '영상 상세 통계가 없으면 우선 채널 후보 검토부터 진행합니다.',
  ];

  return {
    headline: `${keyword} 수집 결과는 후보 수보다 콘텐츠 반응 패턴을 같이 봐야 합니다.`,
    topVideoPatterns,
    titleHooks,
    creatorBuckets: {
      contactable,
      established,
      rising,
      reviewNeeded: Math.max(0, channels.length - contactable),
    },
    contentIdeas: [
      `${keyword} 상위 영상 제목을 참고해 15초 숏폼 후킹 문장 10개 만들기`,
      `${keyword} 리뷰/추천형 썸네일 문구 A/B 테스트`,
      `${keyword} 후보 채널별 맞춤 제안 메일 초안 만들기`,
    ],
    outreachSuggestions: [
      '공개 이메일이 있는 후보만 실제 발송 후보로 분리합니다.',
      '조회수만 높은 채널보다 최근 반응과 카테고리 적합도를 같이 봅니다.',
      '상위 후보 1명에게 dryRun 초안을 먼저 확인한 뒤 승인 발송으로 진행합니다.',
    ],
  };
}
