import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

export interface InfluencerData {
  name: string;
  platform: string;
  followers: string;
  category: string;
  email: string;
  profileUrl: string;
  thumbnailUrl?: string;
  channelId?: string;
  status?: string;
}

interface InfluencerCardsProps {
  influencers: InfluencerData[];
  visible: boolean;
  onClose: () => void;
}

const PLATFORM_COLOR: Record<string, { primary: string; secondary: string; icon: string }> = {
  YouTube: { primary: '#FF0000', secondary: '#FF6B6B', icon: '▶' },
  Instagram: { primary: '#E1306C', secondary: '#F77737', icon: '◈' },
  Naver: { primary: '#03C75A', secondary: '#00B851', icon: '◉' },
  TikTok: { primary: '#69C9D0', secondary: '#EE1D52', icon: '♪' },
  default: { primary: '#00F5FF', secondary: '#0066FF', icon: '◆' },
};

function getPlatformStyle(platform: string) {
  for (const key of Object.keys(PLATFORM_COLOR)) {
    if (platform.toLowerCase().includes(key.toLowerCase())) return PLATFORM_COLOR[key];
  }
  return PLATFORM_COLOR.default;
}

function getYouTubeChannelUrl(influencer: InfluencerData): string {
  if (influencer.channelId) return `https://www.youtube.com/channel/${influencer.channelId}`;
  if (influencer.profileUrl) return influencer.profileUrl;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(influencer.name)}`;
}

function InfluencerCard({ influencer, index, visible }: { influencer: InfluencerData; index: number; visible: boolean }) {
  const style = getPlatformStyle(influencer.platform);
  const channelUrl = getYouTubeChannelUrl(influencer);
  const [imgError, setImgError] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: -60, scale: 0.85 }}
      animate={visible ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -60, scale: 0.85 }}
      transition={{
        delay: index * 0.08,
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{
        background: `linear-gradient(135deg, rgba(0,0,0,0.85) 0%, rgba(${style.primary === '#FF0000' ? '255,0,0' : '0,102,255'},0.08) 100%)`,
        border: `1px solid ${style.primary}33`,
        borderLeft: `3px solid ${style.primary}`,
        borderRadius: '8px',
        padding: '10px 12px',
        marginBottom: '6px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        backdropFilter: 'blur(10px)',
      }}
      whileHover={{ scale: 1.02, borderLeftWidth: '4px' }}
      onClick={() => window.open(channelUrl, '_blank')}
    >
      {/* 배경 글로우 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: `radial-gradient(ellipse at left center, ${style.primary}08 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* 프로필 이미지 */}
      <div style={{
        width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${style.primary}66`,
        overflow: 'hidden', position: 'relative',
        background: `linear-gradient(135deg, ${style.primary}22, ${style.secondary}22)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 12px ${style.primary}44`,
      }}>
        {influencer.thumbnailUrl && !imgError ? (
          <img
            src={influencer.thumbnailUrl}
            alt={influencer.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setImgError(true)}
          />
        ) : (
          <span style={{ fontSize: '18px', color: style.primary }}>{style.icon}</span>
        )}
      </div>

      {/* 채널 정보 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <span style={{
            fontSize: '13px', fontWeight: 700, color: '#FFFFFF',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: '140px', fontFamily: 'monospace',
          }}>{influencer.name}</span>
          <span style={{
            fontSize: '9px', padding: '1px 5px', borderRadius: '3px',
            background: `${style.primary}22`, color: style.primary,
            border: `1px solid ${style.primary}44`, fontFamily: 'monospace', fontWeight: 700,
          }}>{influencer.platform.toUpperCase()}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: style.primary, fontFamily: 'monospace', fontWeight: 700 }}>
            ◉ {influencer.followers}
          </span>
          {influencer.category && (
            <span style={{ fontSize: '10px', color: '#666', fontFamily: 'monospace' }}>
              #{influencer.category}
            </span>
          )}
        </div>
        {influencer.email && (
          <div style={{ fontSize: '10px', color: '#00F5FF99', fontFamily: 'monospace', marginTop: '2px',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
            ✉ {influencer.email}
          </div>
        )}
      </div>

      {/* 우측 URL 버튼 */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0,
      }}>
        <div style={{
          fontSize: '9px', color: style.primary, fontFamily: 'monospace',
          padding: '2px 6px', border: `1px solid ${style.primary}44`, borderRadius: '3px',
          background: `${style.primary}11`,
        }}>OPEN →</div>
        {influencer.email && (
          <div style={{
            fontSize: '9px', color: '#00F5FF', fontFamily: 'monospace',
            padding: '2px 6px', border: '1px solid #00F5FF44', borderRadius: '3px',
            background: '#00F5FF11',
          }}>EMAIL ✓</div>
        )}
      </div>

      {/* 스캔 라인 애니메이션 */}
      <motion.div
        style={{
          position: 'absolute', top: 0, left: '-100%', width: '60%', height: '100%',
          background: `linear-gradient(90deg, transparent, ${style.primary}15, transparent)`,
          pointerEvents: 'none',
        }}
        animate={{ left: ['−100%', '200%'] }}
        transition={{ duration: 2, delay: index * 0.08 + 0.3, ease: 'linear' }}
      />
    </motion.div>
  );
}

export default function InfluencerCards({ influencers, visible, onClose }: InfluencerCardsProps) {
  const [showAll, setShowAll] = useState(false);
  const displayList = showAll ? influencers : influencers.slice(0, 8);

  useEffect(() => {
    if (!visible) setShowAll(false);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && influencers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'absolute',
            bottom: '120px',
            left: '8px',
            right: '8px',
            maxHeight: '55vh',
            overflowY: 'auto',
            zIndex: 50,
            padding: '12px',
            background: 'rgba(0,0,0,0.92)',
            border: '1px solid #00F5FF33',
            borderRadius: '12px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 0 40px rgba(0,245,255,0.1), inset 0 0 40px rgba(0,0,0,0.5)',
          }}
        >
          {/* 헤더 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00F5FF' }}
              />
              <span style={{ fontSize: '11px', color: '#00F5FF', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '2px' }}>
                INFLUENCER SCAN COMPLETE
              </span>
              <span style={{ fontSize: '11px', color: '#00F5FF88', fontFamily: 'monospace' }}>
                [{influencers.length} FOUND]
              </span>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: '1px solid #FF000044', color: '#FF6666', cursor: 'pointer',
                fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}
            >✕ CLOSE</button>
          </div>

          {/* 구분선 */}
          <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, #00F5FF44, transparent)', marginBottom: '10px' }} />

          {/* 카드 목록 */}
          {displayList.map((inf, i) => (
            <InfluencerCard key={`${inf.name}-${i}`} influencer={inf} index={i} visible={visible} />
          ))}

          {/* 더보기 버튼 */}
          {!showAll && influencers.length > 8 && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 8 * 0.08 + 0.3 }}
              onClick={() => setShowAll(true)}
              style={{
                width: '100%', marginTop: '6px', padding: '8px',
                background: 'rgba(0,245,255,0.05)', border: '1px solid #00F5FF33',
                color: '#00F5FF', cursor: 'pointer', borderRadius: '6px',
                fontFamily: 'monospace', fontSize: '11px', letterSpacing: '1px',
              }}
            >
              + {influencers.length - 8} MORE PROFILES ↓
            </motion.button>
          )}

          {/* 하단 통계 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: displayList.length * 0.08 + 0.5 }}
            style={{
              marginTop: '10px', padding: '8px 12px',
              background: 'rgba(0,245,255,0.03)', border: '1px solid #00F5FF22', borderRadius: '6px',
              display: 'flex', justifyContent: 'space-around',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#00F5FF', fontFamily: 'monospace' }}>
                {influencers.length}
              </div>
              <div style={{ fontSize: '9px', color: '#666', fontFamily: 'monospace' }}>COLLECTED</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#22C55E', fontFamily: 'monospace' }}>
                {influencers.filter(i => i.email).length}
              </div>
              <div style={{ fontSize: '9px', color: '#666', fontFamily: 'monospace' }}>WITH EMAIL</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#FF6B6B', fontFamily: 'monospace' }}>
                {influencers.filter(i => i.platform === 'YouTube').length}
              </div>
              <div style={{ fontSize: '9px', color: '#666', fontFamily: 'monospace' }}>YOUTUBE</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
