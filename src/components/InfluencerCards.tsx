import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';

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
  subscriberCount?: number;
  collectedAt?: string;
}

interface InfluencerCardsProps {
  influencers: InfluencerData[];
  visible: boolean;
  onClose: () => void;
}

const PLATFORM_THEME: Record<string, {
  primary: string; secondary: string; glow: string; label: string;
  bg: string; holoBg: string; accent: string;
}> = {
  YouTube: {
    primary: '#FF3333',
    secondary: '#FF8C00',
    glow: 'rgba(255,51,51,0.7)',
    label: '▶',
    bg: 'linear-gradient(160deg, #0a0000 0%, #1a0000 50%, #0a0000 100%)',
    holoBg: 'linear-gradient(135deg, rgba(255,51,51,0.15) 0%, rgba(255,140,0,0.08) 100%)',
    accent: '#FF6B35',
  },
  Instagram: {
    primary: '#E1306C',
    secondary: '#F77737',
    glow: 'rgba(225,48,108,0.7)',
    label: '◈',
    bg: 'linear-gradient(160deg, #0a0005 0%, #1a000e 50%, #0a0005 100%)',
    holoBg: 'linear-gradient(135deg, rgba(225,48,108,0.15) 0%, rgba(247,119,55,0.08) 100%)',
    accent: '#C13584',
  },
  Naver: {
    primary: '#03C75A',
    secondary: '#00FF88',
    glow: 'rgba(3,199,90,0.7)',
    label: '◉',
    bg: 'linear-gradient(160deg, #000a03 0%, #001a08 50%, #000a03 100%)',
    holoBg: 'linear-gradient(135deg, rgba(3,199,90,0.15) 0%, rgba(0,255,136,0.08) 100%)',
    accent: '#00E676',
  },
  TikTok: {
    primary: '#69C9D0',
    secondary: '#EE1D52',
    glow: 'rgba(105,201,208,0.7)',
    label: '♪',
    bg: 'linear-gradient(160deg, #000a0a 0%, #001a1a 50%, #000a0a 100%)',
    holoBg: 'linear-gradient(135deg, rgba(105,201,208,0.15) 0%, rgba(238,29,82,0.08) 100%)',
    accent: '#40E0D0',
  },
  default: {
    primary: '#00F5FF',
    secondary: '#0066FF',
    glow: 'rgba(0,245,255,0.7)',
    label: '◆',
    bg: 'linear-gradient(160deg, #000a0a 0%, #001a1a 50%, #000a0a 100%)',
    holoBg: 'linear-gradient(135deg, rgba(0,245,255,0.15) 0%, rgba(0,102,255,0.08) 100%)',
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
  if (influencer.channelId) return `https://www.youtube.com/channel/${influencer.channelId}`;
  if (influencer.profileUrl) return ensureHttps(influencer.profileUrl);
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(influencer.name)}`;
}

// ── 3D 공중 부양 카드 ──
function FloatingCard({ influencer, index, visible }: { influencer: InfluencerData; index: number; visible: boolean }) {
  const theme = getPlatformTheme(influencer.platform);
  const channelUrl = getChannelUrl(influencer);
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  // 마우스 위치에 따른 3D 기울기
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setMousePos({ x: 0, y: 0 });
  };

  // 카드별 부유 애니메이션 오프셋 (자연스러운 랜덤 느낌)
  const floatOffset = (index % 3) * 0.4;
  const floatDuration = 2.8 + (index % 4) * 0.3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 80, rotateY: -30, scale: 0.6, z: -100 }}
      animate={visible
        ? { opacity: 1, y: 0, rotateY: 0, scale: 1, z: 0 }
        : { opacity: 0, y: 80, rotateY: -30, scale: 0.6, z: -100 }
      }
      exit={{ opacity: 0, y: 40, scale: 0.7, rotateY: 20 }}
      transition={{
        delay: index * 0.08,
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{
        flexShrink: 0,
        width: '150px',
        perspective: '800px',
        perspectiveOrigin: '50% 50%',
      }}
    >
      {/* 공중 부유 애니메이션 래퍼 */}
      <motion.div
        animate={{
          y: [0, -10, 0, -6, 0],
          rotateZ: [0, 0.5, 0, -0.5, 0],
        }}
        transition={{
          duration: floatDuration,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: floatOffset,
        }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* 카드 그림자 (공중 부유 효과 강조) */}
        <motion.div
          animate={{
            scaleX: [1, 0.85, 1, 0.9, 1],
            opacity: [0.4, 0.2, 0.4, 0.25, 0.4],
          }}
          transition={{
            duration: floatDuration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: floatOffset,
          }}
          style={{
            position: 'absolute',
            bottom: '-18px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80%',
            height: '12px',
            background: `radial-gradient(ellipse, ${theme.glow} 0%, transparent 70%)`,
            borderRadius: '50%',
            filter: 'blur(4px)',
            zIndex: 0,
          }}
        />

        {/* 메인 카드 */}
        <motion.div
          ref={cardRef}
          animate={hovered
            ? {
                rotateY: mousePos.x * 20,
                rotateX: -mousePos.y * 15,
                scale: 1.08,
                z: 40,
              }
            : { rotateY: 0, rotateX: 0, scale: 1, z: 0 }
          }
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={handleMouseLeave}
          style={{
            cursor: 'pointer',
            position: 'relative',
            transformStyle: 'preserve-3d',
            borderRadius: '14px',
            overflow: 'hidden',
            background: theme.bg,
            border: `1.5px solid ${theme.primary}55`,
            boxShadow: hovered
              ? `
                0 0 60px ${theme.glow},
                0 20px 60px rgba(0,0,0,0.8),
                0 0 120px ${theme.glow}33,
                inset 0 0 30px rgba(255,255,255,0.03)
              `
              : `
                0 0 25px ${theme.glow}55,
                0 10px 40px rgba(0,0,0,0.7),
                inset 0 0 15px rgba(255,255,255,0.01)
              `,
            transition: 'box-shadow 0.3s ease',
          }}
          onClick={() => window.open(channelUrl, '_blank')}
        >
          {/* 홀로그램 배경 */}
          <div style={{
            position: 'absolute', inset: 0,
            background: theme.holoBg,
            pointerEvents: 'none',
          }} />

          {/* 홀로그램 shimmer (호버 시) */}
          <motion.div
            animate={hovered
              ? { opacity: [0, 0.3, 0], x: ['-120%', '220%'] }
              : { opacity: 0 }
            }
            transition={{ duration: 0.6, ease: 'linear' }}
            style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(105deg, transparent 25%, rgba(255,255,255,0.6) 50%, transparent 75%)',
              pointerEvents: 'none',
              zIndex: 20,
            }}
          />

          {/* 스캔 라인 효과 */}
          <motion.div
            animate={{ y: ['-100%', '200%'] }}
            transition={{ duration: 4, repeat: Infinity, delay: index * 0.15, ease: 'linear' }}
            style={{
              position: 'absolute', left: 0, right: 0,
              height: '2px',
              background: `linear-gradient(90deg, transparent, ${theme.primary}66, transparent)`,
              pointerEvents: 'none',
              zIndex: 15,
            }}
          />

          {/* 상단 플랫폼 배지 */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 10px 6px',
            background: `linear-gradient(90deg, ${theme.primary}20, transparent)`,
            borderBottom: `1px solid ${theme.primary}30`,
            position: 'relative', zIndex: 5,
          }}>
            <span style={{
              fontSize: '8px',
              color: theme.primary,
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: '2px',
              textShadow: `0 0 8px ${theme.primary}`,
            }}>
              {influencer.platform.toUpperCase().replace(' BLOG', '')}
            </span>
            <motion.div
              animate={{ opacity: [1, 0.2, 1], scale: [1, 1.4, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: index * 0.25 }}
              style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: theme.primary,
                boxShadow: `0 0 10px ${theme.primary}, 0 0 20px ${theme.primary}66`,
              }}
            />
          </div>

          {/* 프로필 이미지 영역 */}
          <div style={{
            width: '100%',
            height: '105px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            background: `radial-gradient(ellipse at center, ${theme.primary}15 0%, transparent 65%)`,
            overflow: 'hidden',
          }}>
            {/* 회전 링 */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
              style={{
                position: 'absolute',
                width: '90px', height: '90px',
                borderRadius: '50%',
                border: `1px dashed ${theme.primary}30`,
              }}
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
              style={{
                position: 'absolute',
                width: '75px', height: '75px',
                borderRadius: '50%',
                border: `1px solid ${theme.secondary}20`,
              }}
            />

            {/* 펄스 글로우 */}
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2.2, repeat: Infinity, delay: index * 0.35 }}
              style={{
                position: 'absolute',
                width: '72px', height: '72px',
                borderRadius: '50%',
                background: `radial-gradient(circle, ${theme.primary}25 0%, transparent 70%)`,
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
                  width: '70px', height: '70px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2.5px solid ${theme.primary}99`,
                  boxShadow: `
                    0 0 20px ${theme.glow},
                    0 0 40px ${theme.glow}55,
                    0 0 60px ${theme.glow}22
                  `,
                  position: 'relative', zIndex: 3,
                }}
              />
            ) : (
              <div style={{
                width: '70px', height: '70px',
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${theme.primary}40, ${theme.secondary}25)`,
                border: `2.5px solid ${theme.primary}99`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '26px',
                boxShadow: `0 0 25px ${theme.glow}, 0 0 50px ${theme.glow}44`,
                position: 'relative', zIndex: 3,
                color: theme.primary,
                textShadow: `0 0 15px ${theme.primary}`,
              }}>
                {theme.label}
              </div>
            )}

            {/* 구독자 배지 */}
            {influencer.followers && influencer.followers !== '-' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5, y: 5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: index * 0.08 + 0.5 }}
                style={{
                  position: 'absolute',
                  bottom: '4px', right: '6px',
                  background: `rgba(0,0,0,0.85)`,
                  border: `1px solid ${theme.primary}66`,
                  borderRadius: '10px',
                  padding: '2px 7px',
                  fontSize: '7.5px',
                  color: theme.primary,
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  backdropFilter: 'blur(6px)',
                  textShadow: `0 0 6px ${theme.primary}`,
                  zIndex: 4,
                }}
              >
                {influencer.followers}
              </motion.div>
            )}
          </div>

          {/* 이름 + 정보 */}
          <div style={{
            padding: '8px 10px 6px',
            borderTop: `1px solid ${theme.primary}25`,
            background: `linear-gradient(180deg, ${theme.primary}10, transparent)`,
            position: 'relative', zIndex: 5,
          }}>
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#FFFFFF',
              fontFamily: 'monospace',
              letterSpacing: '0.3px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginBottom: '3px',
              textShadow: `0 0 12px ${theme.primary}55`,
            }}>
              {influencer.name}
            </div>

            <div style={{
              fontSize: '7.5px',
              color: `${theme.primary}99`,
              fontFamily: 'monospace',
              marginBottom: '6px',
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
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: '5px',
                padding: '3px 6px',
                marginBottom: '6px',
              }}>
                <span style={{ fontSize: '7.5px', color: '#22C55E', flexShrink: 0 }}>✉</span>
                <span style={{
                  fontSize: '7.5px',
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
                marginBottom: '6px',
              }}>
                <span style={{ fontSize: '7.5px', color: '#333' }}>✉</span>
                <span style={{ fontSize: '7.5px', color: '#333', fontFamily: 'monospace' }}>NO EMAIL</span>
              </div>
            )}
          </div>

          {/* 하단 버튼 */}
          <div style={{ padding: '0 10px 10px', display: 'flex', gap: '5px', position: 'relative', zIndex: 5 }}>
            <button
              onClick={(e) => { e.stopPropagation(); window.open(channelUrl, '_blank'); }}
              style={{
                flex: 1,
                background: `${theme.primary}15`,
                border: `1px solid ${theme.primary}55`,
                borderRadius: '6px',
                color: theme.primary,
                fontSize: '7.5px',
                fontFamily: 'monospace',
                fontWeight: 700,
                padding: '5px 0',
                cursor: 'pointer',
                letterSpacing: '1px',
                textShadow: `0 0 6px ${theme.primary}66`,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                (e.target as HTMLButtonElement).style.background = `${theme.primary}30`;
                (e.target as HTMLButtonElement).style.boxShadow = `0 0 12px ${theme.glow}55`;
              }}
              onMouseLeave={e => {
                (e.target as HTMLButtonElement).style.background = `${theme.primary}15`;
                (e.target as HTMLButtonElement).style.boxShadow = 'none';
              }}
            >
              OPEN →
            </button>
            {influencer.email && (
              <button
                onClick={(e) => { e.stopPropagation(); window.open(`mailto:${influencer.email}`, '_blank'); }}
                style={{
                  flex: 1,
                  background: 'rgba(34,197,94,0.1)',
                  border: '1px solid rgba(34,197,94,0.4)',
                  borderRadius: '6px',
                  color: '#22C55E',
                  fontSize: '7.5px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  padding: '5px 0',
                  cursor: 'pointer',
                  letterSpacing: '1px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  (e.target as HTMLButtonElement).style.background = 'rgba(34,197,94,0.2)';
                  (e.target as HTMLButtonElement).style.boxShadow = '0 0 12px rgba(34,197,94,0.4)';
                }}
                onMouseLeave={e => {
                  (e.target as HTMLButtonElement).style.background = 'rgba(34,197,94,0.1)';
                  (e.target as HTMLButtonElement).style.boxShadow = 'none';
                }}
              >
                EMAIL ✓
              </button>
            )}
          </div>

          {/* 하단 수평 스캔 라인 */}
          <motion.div
            animate={{ x: ['-100%', '250%'] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: index * 0.1, ease: 'linear' }}
            style={{
              position: 'absolute',
              bottom: '3px', left: 0,
              width: '40%', height: '1px',
              background: `linear-gradient(90deg, transparent, ${theme.primary}99, transparent)`,
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />

          {/* 코너 장식 */}
          {[
            { top: '0', left: '0', borderTop: `2px solid ${theme.primary}88`, borderLeft: `2px solid ${theme.primary}88` },
            { top: '0', right: '0', borderTop: `2px solid ${theme.primary}88`, borderRight: `2px solid ${theme.primary}88` },
            { bottom: '0', left: '0', borderBottom: `2px solid ${theme.primary}88`, borderLeft: `2px solid ${theme.primary}88` },
            { bottom: '0', right: '0', borderBottom: `2px solid ${theme.primary}88`, borderRight: `2px solid ${theme.primary}88` },
          ].map((style, i) => (
            <div key={i} style={{
              position: 'absolute',
              width: '10px', height: '10px',
              ...style,
              zIndex: 10,
            }} />
          ))}
        </motion.div>
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

  // 플랫폼별 통계
  const ytCount = influencers.filter(i => i.platform?.toLowerCase().includes('youtube')).length;
  const naverCount = influencers.filter(i => i.platform?.toLowerCase().includes('naver')).length;
  const igCount = influencers.filter(i => i.platform?.toLowerCase().includes('instagram')).length;
  const emailCount = influencers.filter(i => i.email).length;

  return (
    <AnimatePresence>
      {visible && influencers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35 }}
          style={{
            position: 'absolute',
            top: '55px',
            left: 0,
            right: 0,
            zIndex: 50,
            padding: '12px 14px 16px',
            background: 'rgba(0,0,0,0.92)',
            borderTop: '1px solid rgba(0,245,255,0.15)',
            borderBottom: '1px solid rgba(0,245,255,0.15)',
            backdropFilter: 'blur(24px)',
          }}
        >
          {/* 헤더 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <motion.div
                animate={{ opacity: [1, 0.2, 1], scale: [1, 1.3, 1] }}
                transition={{ duration: 1.0, repeat: Infinity }}
                style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: '#00F5FF',
                  boxShadow: '0 0 12px #00F5FF, 0 0 24px #00F5FF55',
                }}
              />
              <span style={{
                fontSize: '10px', color: '#00F5FF',
                fontFamily: 'monospace', fontWeight: 700, letterSpacing: '2.5px',
                textShadow: '0 0 10px #00F5FF',
              }}>
                INFLUENCER SCAN COMPLETE
              </span>
              <span style={{
                fontSize: '10px', color: '#00F5FF44',
                fontFamily: 'monospace', letterSpacing: '1px',
              }}>
                [{influencers.length} FOUND]
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,50,50,0.08)',
                border: '1px solid rgba(255,80,80,0.35)',
                color: '#FF6666',
                cursor: 'pointer',
                fontSize: '9px',
                padding: '4px 12px',
                borderRadius: '5px',
                fontFamily: 'monospace',
                letterSpacing: '1px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                (e.target as HTMLButtonElement).style.background = 'rgba(255,50,50,0.2)';
                (e.target as HTMLButtonElement).style.boxShadow = '0 0 10px rgba(255,80,80,0.4)';
              }}
              onMouseLeave={e => {
                (e.target as HTMLButtonElement).style.background = 'rgba(255,50,50,0.08)';
                (e.target as HTMLButtonElement).style.boxShadow = 'none';
              }}
            >
              ✕ CLOSE
            </button>
          </div>

          {/* 3D 공중 부양 카드 가로 스크롤 */}
          <div style={{
            display: 'flex',
            gap: '14px',
            overflowX: 'auto',
            paddingBottom: '20px', // 그림자 공간
            paddingTop: '8px',
            paddingLeft: '4px',
            paddingRight: '4px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            // 3D 원근감 적용
            perspective: '1200px',
            perspectiveOrigin: '50% 100%',
          }}>
            {displayList.map((inf, i) => (
              <FloatingCard key={`${inf.name}-${inf.platform}-${i}`} influencer={inf} index={i} visible={visible} />
            ))}

            {/* 더보기 카드 */}
            {!showAll && influencers.length > 20 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 20 * 0.08 + 0.4 }}
              >
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  onClick={() => setShowAll(true)}
                  style={{
                    width: '150px',
                    height: '270px',
                    background: 'rgba(0,245,255,0.02)',
                    border: '1.5px dashed rgba(0,245,255,0.25)',
                    borderRadius: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    gap: '10px',
                    boxShadow: '0 0 20px rgba(0,245,255,0.08)',
                  }}
                >
                  <motion.span
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    style={{ fontSize: '32px', color: '#00F5FF55' }}
                  >
                    +
                  </motion.span>
                  <span style={{
                    fontSize: '9px', color: '#00F5FF66',
                    fontFamily: 'monospace', textAlign: 'center',
                    letterSpacing: '1.5px',
                  }}>
                    {influencers.length - 20} MORE
                  </span>
                </motion.div>
              </motion.div>
            )}
          </div>

          {/* 하단 통계 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            style={{
              marginTop: '8px',
              padding: '8px 16px',
              background: 'rgba(0,245,255,0.02)',
              border: '1px solid rgba(0,245,255,0.1)',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-around',
            }}
          >
            {[
              { value: influencers.length, label: 'TOTAL', color: '#00F5FF' },
              { value: emailCount, label: 'EMAIL', color: '#22C55E' },
              { value: ytCount, label: 'YOUTUBE', color: '#FF4444' },
              { value: naverCount, label: 'NAVER', color: '#03C75A' },
              ...(igCount > 0 ? [{ value: igCount, label: 'INSTA', color: '#E1306C' }] : []),
            ].map(stat => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 }}
                  style={{
                    fontSize: '15px', fontWeight: 700,
                    color: stat.color, fontFamily: 'monospace',
                    textShadow: `0 0 12px ${stat.color}88`,
                  }}
                >
                  {stat.value}
                </motion.div>
                <div style={{
                  fontSize: '7.5px', color: '#444',
                  fontFamily: 'monospace', letterSpacing: '1px',
                }}>
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
