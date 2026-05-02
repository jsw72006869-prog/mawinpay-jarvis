import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';

export interface InfluencerData {
  name: string;
  platform: string;
  followers?: string;
  category: string;
  email: string;
  profileUrl: string;
  channelUrl?: string;
  thumbnailUrl?: string;
  channelId?: string;
  status?: string;
  subscriberCount?: number;
  subscribers?: number;
  viewCount?: number;
  viewCountFormatted?: string;
  videoCount?: number;
  description?: string;
  address?: string;
  phone?: string;
  mapx?: string;
  mapy?: string;
  collectedAt?: string;
  topVideoTitle?: string;
  topVideoUrl?: string;
  instagramUsername?: string;
  tiktokUsername?: string;
  website?: string;
  instagram?: string;
  tiktok?: string;
  avgViews?: number;
  fitScore?: number;
}

interface InfluencerCardsProps {
  influencers: InfluencerData[];
  visible: boolean;
  onClose: () => void;
  onSendEmail?: (influencers: InfluencerData[]) => void;
  onAiProposal?: (influencers: InfluencerData[]) => void;
}

const PLATFORM_THEME: Record<string, {
  primary: string; secondary: string; glow: string; label: string;
  bg: string; holoBg: string; accent: string; icon: string;
}> = {
  YouTube: {
    primary: '#FF3333', secondary: '#FF8C00', glow: 'rgba(255,51,51,0.7)',
    label: '▶', icon: '▶',
    bg: 'linear-gradient(160deg, #0a0000 0%, #1a0000 50%, #0a0000 100%)',
    holoBg: 'linear-gradient(135deg, rgba(255,51,51,0.12) 0%, rgba(255,140,0,0.06) 100%)',
    accent: '#FF6B35',
  },
  Instagram: {
    primary: '#E1306C', secondary: '#F77737', glow: 'rgba(225,48,108,0.7)',
    label: '◈', icon: '◈',
    bg: 'linear-gradient(160deg, #0a0005 0%, #1a000e 50%, #0a0005 100%)',
    holoBg: 'linear-gradient(135deg, rgba(225,48,108,0.12) 0%, rgba(247,119,55,0.06) 100%)',
    accent: '#C13584',
  },
  Naver: {
    primary: '#03C75A', secondary: '#00FF88', glow: 'rgba(3,199,90,0.7)',
    label: '◉', icon: 'N',
    bg: 'linear-gradient(160deg, #000a03 0%, #001a08 50%, #000a03 100%)',
    holoBg: 'linear-gradient(135deg, rgba(3,199,90,0.12) 0%, rgba(0,255,136,0.06) 100%)',
    accent: '#00E676',
  },
  TikTok: {
    primary: '#69C9D0', secondary: '#EE1D52', glow: 'rgba(105,201,208,0.7)',
    label: '♪', icon: '♪',
    bg: 'linear-gradient(160deg, #000a0a 0%, #001a1a 50%, #000a0a 100%)',
    holoBg: 'linear-gradient(135deg, rgba(105,201,208,0.12) 0%, rgba(238,29,82,0.06) 100%)',
    accent: '#40E0D0',
  },
  default: {
    primary: '#00F5FF', secondary: '#0066FF', glow: 'rgba(0,245,255,0.7)',
    label: '◆', icon: '◆',
    bg: 'linear-gradient(160deg, #000a0a 0%, #001a1a 50%, #000a0a 100%)',
    holoBg: 'linear-gradient(135deg, rgba(0,245,255,0.12) 0%, rgba(0,102,255,0.06) 100%)',
    accent: '#00BFFF',
  },
};

function getPlatformTheme(platform: string) {
  for (const key of Object.keys(PLATFORM_THEME)) {
    if (platform.toLowerCase().includes(key.toLowerCase())) return PLATFORM_THEME[key];
  }
  return PLATFORM_THEME.default;
}

function ensureHttps(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

function getChannelUrl(influencer: InfluencerData): string {
  if (influencer.channelUrl) return ensureHttps(influencer.channelUrl);
  if (influencer.profileUrl && influencer.profileUrl.startsWith('http')) return ensureHttps(influencer.profileUrl);
  if (influencer.channelId) return `https://www.youtube.com/channel/${influencer.channelId}`;
  if (influencer.profileUrl) return ensureHttps(influencer.profileUrl);
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(influencer.name)}`;
}

function formatNumber(n: number): string {
  if (!n) return '-';
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── 개별 인플루언서 카드 ──
function InfluencerCard({ influencer, index, visible, selected, onSelect }: {
  influencer: InfluencerData; index: number; visible: boolean;
  selected: boolean; onSelect: (i: number) => void;
}) {
  const theme = getPlatformTheme(influencer.platform);
  const channelUrl = getChannelUrl(influencer);
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const instaId = influencer.instagramUsername || influencer.instagram || '';
  const tiktokId = influencer.tiktokUsername || influencer.tiktok || '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 60, scale: 0.7, rotateX: -15 }}
      animate={visible
        ? { opacity: 1, y: 0, scale: 1, rotateX: 0 }
        : { opacity: 0, y: 60, scale: 0.7, rotateX: -15 }
      }
      exit={{ opacity: 0, scale: 0.8, y: 30 }}
      transition={{ delay: index * 0.04, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{ flexShrink: 0, width: '220px', perspective: '1000px' }}
    >
      <motion.div
        ref={cardRef}
        animate={hovered ? { scale: 1.03, y: -6 } : { scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => onSelect(index)}
        style={{
          cursor: 'pointer',
          position: 'relative',
          borderRadius: '16px',
          overflow: 'hidden',
          background: 'rgba(8,12,20,0.95)',
          border: selected
            ? `2px solid ${theme.primary}`
            : `1px solid ${theme.primary}40`,
          boxShadow: hovered
            ? `0 0 40px ${theme.glow}44, 0 20px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)`
            : selected
              ? `0 0 30px ${theme.glow}33, 0 10px 40px rgba(0,0,0,0.6)`
              : `0 0 15px ${theme.glow}22, 0 8px 30px rgba(0,0,0,0.5)`,
          transition: 'box-shadow 0.3s, border 0.3s',
        }}
      >
        {/* 배경 그라데이션 */}
        <div style={{
          position: 'absolute', inset: 0,
          background: theme.holoBg,
          pointerEvents: 'none',
        }} />

        {/* 스캔라인 */}
        <motion.div
          animate={{ y: ['-100%', '300%'] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear', delay: index * 0.2 }}
          style={{
            position: 'absolute', left: 0, right: 0, height: '1px',
            background: `linear-gradient(90deg, transparent, ${theme.primary}44, transparent)`,
            pointerEvents: 'none', zIndex: 15,
          }}
        />

        {/* 상단 헤더 - 플랫폼 + 체크박스 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 12px 8px',
          background: `linear-gradient(90deg, ${theme.primary}15, transparent)`,
          borderBottom: `1px solid ${theme.primary}25`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              fontSize: '9px', color: theme.primary, fontFamily: 'monospace',
              fontWeight: 800, letterSpacing: '2px',
              textShadow: `0 0 8px ${theme.primary}`,
            }}>
              {influencer.platform.toUpperCase().replace(' BLOG', '')}
            </span>
            {influencer.fitScore && (
              <span style={{
                fontSize: '8px', color: '#FFD700', fontFamily: 'monospace',
                background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)',
                borderRadius: '8px', padding: '1px 5px',
              }}>
                FIT {influencer.fitScore}%
              </span>
            )}
          </div>
          <motion.div
            animate={selected ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 0.3 }}
            onClick={(e) => { e.stopPropagation(); onSelect(index); }}
            style={{
              width: '16px', height: '16px', borderRadius: '4px',
              border: selected ? `2px solid ${theme.primary}` : '1.5px solid rgba(255,255,255,0.2)',
              background: selected ? `${theme.primary}30` : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', color: theme.primary,
            }}
          >
            {selected && '✓'}
          </motion.div>
        </div>

        {/* 프로필 영역 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '12px',
        }}>
          {/* 프로필 이미지 */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
              style={{
                position: 'absolute', inset: '-4px',
                borderRadius: '50%',
                border: `1px dashed ${theme.primary}30`,
              }}
            />
            {influencer.thumbnailUrl && !imgError ? (
              <img
                src={influencer.thumbnailUrl}
                alt={influencer.name}
                onError={() => setImgError(true)}
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                style={{
                  width: '52px', height: '52px', borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2px solid ${theme.primary}88`,
                  boxShadow: `0 0 15px ${theme.glow}55`,
                }}
              />
            ) : (
              <div style={{
                width: '52px', height: '52px', borderRadius: '50%',
                background: `linear-gradient(135deg, ${theme.primary}30, ${theme.secondary}20)`,
                border: `2px solid ${theme.primary}88`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', color: theme.primary,
                boxShadow: `0 0 15px ${theme.glow}55`,
              }}>
                {theme.label}
              </div>
            )}
          </div>

          {/* 이름 + 카테고리 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '12px', fontWeight: 700, color: '#FFF',
              fontFamily: 'monospace', letterSpacing: '0.3px',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              marginBottom: '3px',
              textShadow: `0 0 10px ${theme.primary}44`,
            }}>
              {influencer.name}
            </div>
            <div style={{
              fontSize: '9px', color: `${theme.primary}88`,
              fontFamily: 'monospace', marginBottom: '4px',
            }}>
              # {influencer.category}
            </div>
            {/* 구독자 + 조회수 */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {influencer.followers && influencer.followers !== '-' && (
                <span style={{
                  fontSize: '8px', color: theme.primary, fontFamily: 'monospace',
                  fontWeight: 700, textShadow: `0 0 6px ${theme.primary}66`,
                }}>
                  ⊕ {influencer.followers}
                </span>
              )}
              {influencer.viewCountFormatted && influencer.viewCountFormatted !== '-' && (
                <span style={{
                  fontSize: '8px', color: theme.accent, fontFamily: 'monospace',
                }}>
                  ◎ {influencer.viewCountFormatted}
                </span>
              )}
              {influencer.videoCount && influencer.videoCount > 0 && (
                <span style={{
                  fontSize: '8px', color: '#888', fontFamily: 'monospace',
                }}>
                  ▷ {influencer.videoCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 소셜 ID 영역 */}
        <div style={{
          padding: '0 12px 8px',
          display: 'flex', flexDirection: 'column', gap: '4px',
        }}>
          {/* 이메일 */}
          {influencer.email && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: '6px', padding: '4px 8px',
            }}>
              <span style={{ fontSize: '9px', color: '#22C55E', flexShrink: 0 }}>✉</span>
              <span style={{
                fontSize: '8.5px', color: '#22C55E', fontFamily: 'monospace',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {influencer.email}
              </span>
            </div>
          )}
          {/* 인스타그램 */}
          {instaId && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              background: 'rgba(225,48,108,0.08)',
              border: '1px solid rgba(225,48,108,0.25)',
              borderRadius: '6px', padding: '4px 8px',
            }}>
              <span style={{ fontSize: '9px', color: '#E1306C', flexShrink: 0 }}>◈</span>
              <span style={{
                fontSize: '8.5px', color: '#E1306C', fontFamily: 'monospace',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                cursor: 'pointer',
              }}
                onClick={(e) => { e.stopPropagation(); window.open(`https://instagram.com/${instaId}`, '_blank'); }}
              >
                @{instaId}
              </span>
            </div>
          )}
          {/* 틱톡 */}
          {tiktokId && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              background: 'rgba(105,201,208,0.08)',
              border: '1px solid rgba(105,201,208,0.25)',
              borderRadius: '6px', padding: '4px 8px',
            }}>
              <span style={{ fontSize: '9px', color: '#69C9D0', flexShrink: 0 }}>♪</span>
              <span style={{
                fontSize: '8.5px', color: '#69C9D0', fontFamily: 'monospace',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                cursor: 'pointer',
              }}
                onClick={(e) => { e.stopPropagation(); window.open(`https://tiktok.com/@${tiktokId}`, '_blank'); }}
              >
                @{tiktokId}
              </span>
            </div>
          )}
        </div>

        {/* 인기 영상 */}
        {influencer.topVideoTitle && (
          <div style={{
            padding: '0 12px 8px',
          }}>
            <div
              onClick={(e) => { e.stopPropagation(); if (influencer.topVideoUrl) window.open(influencer.topVideoUrl, '_blank'); }}
              style={{
                fontSize: '8px', color: '#888', fontFamily: 'monospace',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '5px', padding: '5px 8px',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                cursor: influencer.topVideoUrl ? 'pointer' : 'default',
              }}
            >
              🎬 {influencer.topVideoTitle}
            </div>
          </div>
        )}

        {/* 하단 액션 버튼 */}
        <div style={{
          padding: '6px 12px 12px',
          display: 'flex', gap: '6px',
        }}>
          <button
            onClick={(e) => { e.stopPropagation(); window.open(channelUrl, '_blank'); }}
            style={{
              flex: 1, background: `${theme.primary}12`,
              border: `1px solid ${theme.primary}44`,
              borderRadius: '8px', color: theme.primary,
              fontSize: '8px', fontFamily: 'monospace', fontWeight: 700,
              padding: '6px 0', cursor: 'pointer', letterSpacing: '1px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = `${theme.primary}25`; }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = `${theme.primary}12`; }}
          >
            CHANNEL
          </button>
          {influencer.email && (
            <button
              onClick={(e) => { e.stopPropagation(); window.open(`mailto:${influencer.email}`, '_blank'); }}
              style={{
                flex: 1, background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.35)',
                borderRadius: '8px', color: '#22C55E',
                fontSize: '8px', fontFamily: 'monospace', fontWeight: 700,
                padding: '6px 0', cursor: 'pointer', letterSpacing: '1px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = 'rgba(34,197,94,0.18)'; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'rgba(34,197,94,0.08)'; }}
            >
              MAIL
            </button>
          )}
        </div>

        {/* 코너 장식 */}
        {[
          { top: 0, left: 0, borderTop: `2px solid ${theme.primary}66`, borderLeft: `2px solid ${theme.primary}66` },
          { top: 0, right: 0, borderTop: `2px solid ${theme.primary}66`, borderRight: `2px solid ${theme.primary}66` },
          { bottom: 0, left: 0, borderBottom: `2px solid ${theme.primary}66`, borderLeft: `2px solid ${theme.primary}66` },
          { bottom: 0, right: 0, borderBottom: `2px solid ${theme.primary}66`, borderRight: `2px solid ${theme.primary}66` },
        ].map((s, i) => (
          <div key={i} style={{ position: 'absolute', width: '10px', height: '10px', ...s, zIndex: 10 }} />
        ))}
      </motion.div>
    </motion.div>
  );
}

// ── 메인 컴포넌트: 풀스크린 HUD 패널 ──
export default function InfluencerCards({ influencers, visible, onClose, onSendEmail, onAiProposal }: InfluencerCardsProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterEmail, setFilterEmail] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'default' | 'subscribers' | 'views'>('default');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) {
      setSelectedIndices(new Set());
      setFilterPlatform('all');
      setFilterEmail(false);
    }
  }, [visible]);

  const toggleSelect = (idx: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIndices.size === filteredList.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(filteredList.map((_, i) => i)));
    }
  };

  // 필터링
  let filteredList = [...influencers];
  if (filterPlatform !== 'all') {
    filteredList = filteredList.filter(i => i.platform.toLowerCase().includes(filterPlatform));
  }
  if (filterEmail) {
    filteredList = filteredList.filter(i => i.email && i.email.includes('@'));
  }

  // 정렬
  if (sortBy === 'subscribers') {
    filteredList.sort((a, b) => (b.subscriberCount || 0) - (a.subscriberCount || 0));
  } else if (sortBy === 'views') {
    filteredList.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
  }

  // 통계
  const stats = {
    total: influencers.length,
    filtered: filteredList.length,
    emailCount: influencers.filter(i => i.email && i.email.includes('@')).length,
    instaCount: influencers.filter(i => i.instagramUsername || i.instagram).length,
    tiktokCount: influencers.filter(i => i.tiktokUsername || i.tiktok).length,
    ytCount: influencers.filter(i => i.platform?.toLowerCase().includes('youtube')).length,
    naverCount: influencers.filter(i => i.platform?.toLowerCase().includes('naver')).length,
    selected: selectedIndices.size,
  };

  const selectedInfluencers = Array.from(selectedIndices).map(i => filteredList[i]).filter(Boolean);

  return (
    <AnimatePresence>
      {visible && influencers.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(4,8,16,0.96)',
            backdropFilter: 'blur(20px)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* ═══ 상단 HUD 헤더 ═══ */}
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid rgba(0,245,255,0.12)',
              background: 'linear-gradient(180deg, rgba(0,245,255,0.04) 0%, transparent 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            {/* 왼쪽: 타이틀 + 통계 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <motion.div
                  animate={{ opacity: [1, 0.3, 1], scale: [1, 1.3, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: '#00F5FF',
                    boxShadow: '0 0 12px #00F5FF, 0 0 24px #00F5FF55',
                  }}
                />
                <span style={{
                  fontSize: '13px', color: '#00F5FF', fontFamily: 'monospace',
                  fontWeight: 800, letterSpacing: '3px',
                  textShadow: '0 0 12px #00F5FF',
                }}>
                  INFLUENCER DATABASE
                </span>
              </div>

              {/* 미니 통계 */}
              <div style={{ display: 'flex', gap: '12px', marginLeft: '8px' }}>
                {[
                  { v: stats.total, l: 'TOTAL', c: '#00F5FF' },
                  { v: stats.emailCount, l: 'EMAIL', c: '#22C55E' },
                  { v: stats.instaCount, l: 'INSTA', c: '#E1306C' },
                  { v: stats.tiktokCount, l: 'TIKTOK', c: '#69C9D0' },
                ].filter(s => s.v > 0).map(s => (
                  <div key={s.l} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: s.c, fontFamily: 'monospace', textShadow: `0 0 8px ${s.c}66` }}>
                      {s.v}
                    </div>
                    <div style={{ fontSize: '7px', color: '#555', fontFamily: 'monospace', letterSpacing: '1px' }}>
                      {s.l}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 오른쪽: 닫기 */}
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,50,50,0.08)', border: '1px solid rgba(255,80,80,0.3)',
                color: '#FF6666', cursor: 'pointer', fontSize: '10px',
                padding: '6px 16px', borderRadius: '6px', fontFamily: 'monospace',
                letterSpacing: '1px', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = 'rgba(255,50,50,0.2)'; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'rgba(255,50,50,0.08)'; }}
            >
              ✕ CLOSE
            </button>
          </motion.div>

          {/* ═══ 필터/액션 바 ═══ */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            style={{
              padding: '10px 24px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0, flexWrap: 'wrap', gap: '8px',
            }}
          >
            {/* 필터 */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: 'ALL', color: '#00F5FF' },
                { key: 'youtube', label: 'YOUTUBE', color: '#FF3333' },
                { key: 'naver', label: 'NAVER', color: '#03C75A' },
                { key: 'instagram', label: 'INSTA', color: '#E1306C' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilterPlatform(f.key)}
                  style={{
                    background: filterPlatform === f.key ? `${f.color}20` : 'transparent',
                    border: `1px solid ${filterPlatform === f.key ? f.color : 'rgba(255,255,255,0.1)'}`,
                    color: filterPlatform === f.key ? f.color : '#555',
                    fontSize: '8px', fontFamily: 'monospace', fontWeight: 700,
                    padding: '4px 10px', borderRadius: '12px', cursor: 'pointer',
                    letterSpacing: '1px', transition: 'all 0.2s',
                  }}
                >
                  {f.label}
                </button>
              ))}

              <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

              <button
                onClick={() => setFilterEmail(!filterEmail)}
                style={{
                  background: filterEmail ? 'rgba(34,197,94,0.15)' : 'transparent',
                  border: `1px solid ${filterEmail ? '#22C55E' : 'rgba(255,255,255,0.1)'}`,
                  color: filterEmail ? '#22C55E' : '#555',
                  fontSize: '8px', fontFamily: 'monospace', fontWeight: 700,
                  padding: '4px 10px', borderRadius: '12px', cursor: 'pointer',
                  letterSpacing: '1px', transition: 'all 0.2s',
                }}
              >
                ✉ EMAIL ONLY
              </button>

              <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

              {/* 정렬 */}
              {[
                { key: 'default', label: 'DEFAULT' },
                { key: 'subscribers', label: '구독자↓' },
                { key: 'views', label: '조회수↓' },
              ].map(s => (
                <button
                  key={s.key}
                  onClick={() => setSortBy(s.key as any)}
                  style={{
                    background: sortBy === s.key ? 'rgba(0,245,255,0.1)' : 'transparent',
                    border: `1px solid ${sortBy === s.key ? '#00F5FF55' : 'rgba(255,255,255,0.06)'}`,
                    color: sortBy === s.key ? '#00F5FF' : '#444',
                    fontSize: '8px', fontFamily: 'monospace',
                    padding: '4px 8px', borderRadius: '10px', cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* 액션 버튼 */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={selectAll}
                style={{
                  background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.3)',
                  color: '#00F5FF', fontSize: '8px', fontFamily: 'monospace', fontWeight: 700,
                  padding: '5px 12px', borderRadius: '8px', cursor: 'pointer',
                  letterSpacing: '1px', transition: 'all 0.2s',
                }}
              >
                {selectedIndices.size === filteredList.length ? '✓ DESELECT' : '☐ SELECT ALL'}
              </button>

              {stats.selected > 0 && (
                <>
                  <motion.button
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    onClick={() => onSendEmail?.(selectedInfluencers)}
                    style={{
                      background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.08))',
                      border: '1px solid rgba(34,197,94,0.5)',
                      color: '#22C55E', fontSize: '9px', fontFamily: 'monospace', fontWeight: 700,
                      padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
                      letterSpacing: '1px', transition: 'all 0.2s',
                      boxShadow: '0 0 12px rgba(34,197,94,0.2)',
                    }}
                  >
                    ✉ SEND EMAIL ({stats.selected})
                  </motion.button>

                  <motion.button
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    onClick={() => onAiProposal?.(selectedInfluencers)}
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,140,0,0.08))',
                      border: '1px solid rgba(255,215,0,0.5)',
                      color: '#FFD700', fontSize: '9px', fontFamily: 'monospace', fontWeight: 700,
                      padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
                      letterSpacing: '1px', transition: 'all 0.2s',
                      boxShadow: '0 0 12px rgba(255,215,0,0.2)',
                    }}
                  >
                    ⚡ AI PROPOSAL ({stats.selected})
                  </motion.button>
                </>
              )}
            </div>
          </motion.div>

          {/* ═══ 카드 그리드 ═══ */}
          <div
            ref={scrollRef}
            style={{
              flex: 1, overflowY: 'auto', overflowX: 'hidden',
              padding: '20px 24px',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(0,245,255,0.2) transparent',
            }}
          >
            {filteredList.length === 0 ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '200px', color: '#333', fontFamily: 'monospace', fontSize: '12px',
              }}>
                NO RESULTS MATCHING FILTERS
              </div>
            ) : (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '16px',
                justifyContent: 'flex-start',
              }}>
                {filteredList.map((inf, i) => (
                  <InfluencerCard
                    key={`${inf.name}-${inf.platform}-${i}`}
                    influencer={inf}
                    index={i}
                    visible={visible}
                    selected={selectedIndices.has(i)}
                    onSelect={toggleSelect}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ═══ 하단 상태바 ═══ */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            style={{
              padding: '10px 24px',
              borderTop: '1px solid rgba(0,245,255,0.1)',
              background: 'rgba(0,245,255,0.02)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span style={{ fontSize: '9px', color: '#555', fontFamily: 'monospace' }}>
                SHOWING {filteredList.length} / {stats.total}
              </span>
              {stats.selected > 0 && (
                <span style={{ fontSize: '9px', color: '#00F5FF', fontFamily: 'monospace' }}>
                  ● {stats.selected} SELECTED
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {[
                { v: stats.ytCount, l: 'YT', c: '#FF3333' },
                { v: stats.naverCount, l: 'NV', c: '#03C75A' },
                { v: stats.emailCount, l: '✉', c: '#22C55E' },
                { v: stats.instaCount, l: 'IG', c: '#E1306C' },
                { v: stats.tiktokCount, l: 'TT', c: '#69C9D0' },
              ].filter(s => s.v > 0).map(s => (
                <span key={s.l} style={{
                  fontSize: '8px', color: s.c, fontFamily: 'monospace', fontWeight: 700,
                  textShadow: `0 0 6px ${s.c}44`,
                }}>
                  {s.l}:{s.v}
                </span>
              ))}
            </div>
          </motion.div>

          {/* 배경 장식 - 움직이는 그리드 */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: -1,
            opacity: 0.03,
            backgroundImage: `
              linear-gradient(rgba(0,245,255,0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,245,255,0.3) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
