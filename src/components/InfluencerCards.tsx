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

const PLATFORM_THEME: Record<string, { primary: string; secondary: string; glow: string; label: string; bg: string }> = {
  YouTube: {
    primary: '#FF3333',
    secondary: '#FF6B6B',
    glow: 'rgba(255,51,51,0.5)',
    label: '▶',
    bg: 'linear-gradient(160deg, #0d0000 0%, #1f0000 40%, #0d0000 100%)',
  },
  Instagram: {
    primary: '#E1306C',
    secondary: '#F77737',
    glow: 'rgba(225,48,108,0.5)',
    label: '◈',
    bg: 'linear-gradient(160deg, #0d0008 0%, #1f0015 40%, #0d0008 100%)',
  },
  Naver: {
    primary: '#03C75A',
    secondary: '#00FF88',
    glow: 'rgba(3,199,90,0.5)',
    label: '◉',
    bg: 'linear-gradient(160deg, #000d04 0%, #001f0a 40%, #000d04 100%)',
  },
  TikTok: {
    primary: '#69C9D0',
    secondary: '#EE1D52',
    glow: 'rgba(105,201,208,0.5)',
    label: '♪',
    bg: 'linear-gradient(160deg, #000d0d 0%, #001f1f 40%, #000d0d 100%)',
  },
  default: {
    primary: '#00F5FF',
    secondary: '#0066FF',
    glow: 'rgba(0,245,255,0.5)',
    label: '◆',
    bg: 'linear-gradient(160deg, #000d0d 0%, #001f1f 40%, #000d0d 100%)',
  },
};

function getPlatformTheme(platform: string) {
  for (const key of Object.keys(PLATFORM_THEME)) {
    if (platform.toLowerCase().includes(key.toLowerCase())) return PLATFORM_THEME[key];
  }
  return PLATFORM_THEME.default;
}

// URL에 프로토콜이 없으면 https:// 추가
function ensureHttps(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

function getChannelUrl(influencer: InfluencerData): string {
  if (influencer.channelId) return `https://www.youtube.com/channel/${influencer.channelId}`;
  if (influencer.profileUrl) return ensureHttps(influencer.profileUrl);
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(influencer.name)}`;
}

// 포켓몬 카드 스타일 단일 카드
function PokemonCard({ influencer, index, visible }: { influencer: InfluencerData; index: number; visible: boolean }) {
  const theme = getPlatformTheme(influencer.platform);
  const channelUrl = getChannelUrl(influencer);
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 60, rotateY: -20, scale: 0.75 }}
      animate={visible
        ? { opacity: 1, y: 0, rotateY: 0, scale: 1 }
        : { opacity: 0, y: 60, rotateY: -20, scale: 0.75 }
      }
      exit={{ opacity: 0, y: 40, scale: 0.8 }}
      transition={{
        delay: index * 0.09,
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{ flexShrink: 0, width: '118px', perspective: '800px' }}
    >
      <motion.div
        animate={hovered
          ? { rotateY: 10, rotateX: -6, scale: 1.07 }
          : { rotateY: 0, rotateX: 0, scale: 1 }
        }
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        style={{
          cursor: 'pointer',
          background: theme.bg,
          border: `1.5px solid ${theme.primary}44`,
          borderRadius: '12px',
          overflow: 'hidden',
          position: 'relative',
          transformStyle: 'preserve-3d',
          boxShadow: hovered
            ? `0 0 40px ${theme.glow}, 0 8px 32px rgba(0,0,0,0.6), inset 0 0 20px rgba(255,255,255,0.03)`
            : `0 0 16px ${theme.glow}55, 0 4px 16px rgba(0,0,0,0.5)`,
          transition: 'box-shadow 0.3s ease',
        }}
        onClick={() => window.open(channelUrl, '_blank')}
      >
        {/* 홀로그램 shimmer */}
        <motion.div
          animate={hovered ? { opacity: [0, 0.2, 0], x: ['-100%', '200%'] } : { opacity: 0 }}
          transition={{ duration: 0.7, ease: 'linear' }}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        />

        {/* 상단 플랫폼 배지 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 10px 5px',
          background: `linear-gradient(90deg, ${theme.primary}18, transparent)`,
          borderBottom: `1px solid ${theme.primary}22`,
        }}>
          <span style={{
            fontSize: '8.5px',
            color: theme.primary,
            fontFamily: 'monospace',
            fontWeight: 700,
            letterSpacing: '1.5px',
          }}>
            {influencer.platform.toUpperCase()}
          </span>
          <motion.div
            animate={{ opacity: [1, 0.3, 1], scale: [1, 1.2, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: index * 0.2 }}
            style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: theme.primary,
              boxShadow: `0 0 8px ${theme.primary}`,
            }}
          />
        </div>

        {/* 프로필 이미지 영역 */}
        <div style={{
          width: '100%',
          height: '78px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          background: `radial-gradient(ellipse at center, ${theme.primary}12 0%, transparent 70%)`,
          overflow: 'hidden',
        }}>
          {/* 배경 원형 링 */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
            style={{
              position: 'absolute',
              width: '66px', height: '66px',
              borderRadius: '50%',
              border: `1px dashed ${theme.primary}22`,
            }}
          />
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: index * 0.3 }}
            style={{
              position: 'absolute',
              width: '52px', height: '52px',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${theme.primary}18 0%, transparent 70%)`,
            }}
          />

          {influencer.thumbnailUrl && !imgError ? (
            <img
              src={influencer.thumbnailUrl}
              alt={influencer.name}
              onError={() => setImgError(true)}
              style={{
                width: '52px', height: '52px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: `2.5px solid ${theme.primary}77`,
                boxShadow: `0 0 20px ${theme.glow}, 0 0 40px ${theme.glow}44`,
                position: 'relative', zIndex: 2,
              }}
            />
          ) : (
            <div style={{
              width: '52px', height: '52px',
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${theme.primary}33, ${theme.secondary}22)`,
              border: `2px solid ${theme.primary}77`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '20px',
              boxShadow: `0 0 20px ${theme.glow}`,
              position: 'relative', zIndex: 2,
              color: theme.primary,
            }}>
              {theme.label}
            </div>
          )}

          {/* 구독자수 배지 */}
          {influencer.followers && influencer.followers !== '-' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.09 + 0.4 }}
              style={{
                position: 'absolute',
                bottom: '5px', right: '8px',
                background: `rgba(0,0,0,0.7)`,
                border: `1px solid ${theme.primary}55`,
                borderRadius: '10px',
                padding: '2px 7px',
                fontSize: '8px',
                color: theme.primary,
                fontFamily: 'monospace',
                fontWeight: 700,
                backdropFilter: 'blur(4px)',
              }}
            >
              {influencer.followers}
            </motion.div>
          )}
        </div>

        {/* 이름 + 정보 영역 */}
        <div style={{
          padding: '8px 10px 5px',
          borderTop: `1px solid ${theme.primary}22`,
          background: `linear-gradient(180deg, ${theme.primary}08, transparent)`,
        }}>
          <div style={{
            fontSize: '9.5px',
            fontWeight: 700,
            color: '#FFFFFF',
            fontFamily: 'monospace',
            letterSpacing: '0.3px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: '3px',
            textShadow: `0 0 10px ${theme.primary}44`,
          }}>
            {influencer.name}
          </div>

          <div style={{
            fontSize: '7.5px',
            color: `${theme.primary}88`,
            fontFamily: 'monospace',
            marginBottom: '4px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            # {influencer.category}
          </div>

          {/* 이메일 */}
          {influencer.email ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: '5px',
              padding: '3px 6px',
              marginBottom: '5px',
            }}>
              <span style={{ fontSize: '8px', color: '#22C55E', flexShrink: 0 }}>✉</span>
              <span style={{
                fontSize: '8px',
                color: '#22C55E',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {influencer.email}
              </span>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '5px',
              padding: '3px 6px',
              marginBottom: '5px',
            }}>
              <span style={{ fontSize: '8px', color: '#444' }}>✉</span>
              <span style={{ fontSize: '8px', color: '#444', fontFamily: 'monospace' }}>NO EMAIL</span>
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div style={{ padding: '0 10px 10px', display: 'flex', gap: '5px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); window.open(channelUrl, '_blank'); }}
            style={{
              flex: 1,
              background: `${theme.primary}12`,
              border: `1px solid ${theme.primary}44`,
              borderRadius: '6px',
              color: theme.primary,
              fontSize: '8px',
              fontFamily: 'monospace',
              fontWeight: 700,
              padding: '5px 0',
              cursor: 'pointer',
              letterSpacing: '1px',
              transition: 'all 0.2s',
            }}
          >
            OPEN →
          </button>
          {influencer.email && (
            <button
              onClick={(e) => { e.stopPropagation(); window.open(`mailto:${influencer.email}`, '_blank'); }}
              style={{
                flex: 1,
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.35)',
                borderRadius: '6px',
                color: '#22C55E',
                fontSize: '8px',
                fontFamily: 'monospace',
                fontWeight: 700,
                padding: '5px 0',
                cursor: 'pointer',
                letterSpacing: '1px',
              }}
            >
              EMAIL ✓
            </button>
          )}
        </div>

        {/* 하단 스캔 라인 */}
        <motion.div
          animate={{ x: ['-100%', '250%'] }}
          transition={{ duration: 3, repeat: Infinity, delay: index * 0.12, ease: 'linear' }}
          style={{
            position: 'absolute',
            bottom: '2px', left: 0,
            width: '35%', height: '1px',
            background: `linear-gradient(90deg, transparent, ${theme.primary}88, transparent)`,
            pointerEvents: 'none',
          }}
        />
      </motion.div>
    </motion.div>
  );
}

export default function InfluencerCards({ influencers, visible, onClose }: InfluencerCardsProps) {
  const [showAll, setShowAll] = useState(false);
  const displayList = showAll ? influencers : influencers.slice(0, 20);

  useEffect(() => {
    if (!visible) setShowAll(false);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && influencers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'absolute',
            top: '60px',
            left: 0,
            right: 0,
            zIndex: 50,
            padding: '10px 12px 8px',
            background: 'rgba(0,0,0,0.88)',
            borderTop: '1px solid rgba(0,245,255,0.1)',
            borderBottom: '1px solid rgba(0,245,255,0.1)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* 헤더 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: '#00F5FF',
                  boxShadow: '0 0 8px #00F5FF',
                }}
              />
              <span style={{
                fontSize: '10.5px', color: '#00F5FF',
                fontFamily: 'monospace', fontWeight: 700, letterSpacing: '2px',
              }}>
                INFLUENCER SCAN COMPLETE
              </span>
              <span style={{ fontSize: '10.5px', color: '#00F5FF55', fontFamily: 'monospace' }}>
                [{influencers.length} FOUND]
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: '1px solid rgba(255,80,80,0.3)',
                color: '#FF6666',
                cursor: 'pointer',
                fontSize: '10px',
                padding: '3px 10px',
                borderRadius: '5px',
                fontFamily: 'monospace',
              }}
            >
              ✕ CLOSE
            </button>
          </div>

          {/* 포켓몬 카드 가로 스크롤 */}
          <div style={{
            display: 'flex',
            gap: '10px',
            overflowX: 'auto',
            paddingBottom: '8px',
            paddingTop: '4px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}>
            {displayList.map((inf, i) => (
              <PokemonCard key={`${inf.name}-${i}`} influencer={inf} index={i} visible={visible} />
            ))}

            {/* 더보기 카드 */}
            {!showAll && influencers.length > 20 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 20 * 0.09 + 0.3 }}
                onClick={() => setShowAll(true)}
                style={{
                  flexShrink: 0,
                  width: '118px',
                  height: '210px',
                  background: 'rgba(0,245,255,0.02)',
                  border: '1.5px dashed rgba(0,245,255,0.2)',
                  borderRadius: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '28px', color: '#00F5FF44' }}>+</span>
                <span style={{ fontSize: '10px', color: '#00F5FF66', fontFamily: 'monospace', textAlign: 'center', letterSpacing: '1px' }}>
                  {influencers.length - 20} MORE
                </span>
              </motion.div>
            )}
          </div>

          {/* 하단 통계 */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              background: 'rgba(0,245,255,0.02)',
              border: '1px solid rgba(0,245,255,0.1)',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-around',
            }}
          >
            {[
              { value: influencers.length, label: 'COLLECTED', color: '#00F5FF' },
              { value: influencers.filter(i => i.email).length, label: 'WITH EMAIL', color: '#22C55E' },
              { value: influencers.filter(i => i.platform?.toLowerCase().includes('youtube')).length, label: 'YOUTUBE', color: '#FF4444' },
              { value: influencers.filter(i => i.platform?.toLowerCase().includes('naver')).length, label: 'NAVER', color: '#03C75A' },
            ].map(stat => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '14px', fontWeight: 700,
                  color: stat.color, fontFamily: 'monospace',
                  textShadow: `0 0 10px ${stat.color}66`,
                }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: '8px', color: '#444', fontFamily: 'monospace', letterSpacing: '1px' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
