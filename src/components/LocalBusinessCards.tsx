import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface LocalBusinessData {
  id?: string;
  name: string;
  category: string;
  address: string;
  roadAddress?: string;
  phone?: string;
  link?: string;
  description?: string;
  mapx?: string;
  mapy?: string;
  businessHours?: string;
  is24Hours?: boolean;
  keyword?: string;
  collectedAt?: string;
}

interface LocalBusinessCardsProps {
  businesses: LocalBusinessData[];
  visible: boolean;
}

// 카테고리별 테마 색상
function getCategoryTheme(category: string): { primary: string; secondary: string; accent: string; icon: string } {
  const cat = category.toLowerCase();
  if (cat.includes('고기') || cat.includes('구이') || cat.includes('삼겹') || cat.includes('갈비')) {
    return { primary: '#FF4500', secondary: '#FF8C00', accent: '#FFD700', icon: '🥩' };
  }
  if (cat.includes('샤브') || cat.includes('전골') || cat.includes('찌개') || cat.includes('국밥')) {
    return { primary: '#FF6B35', secondary: '#F7C59F', accent: '#EFEFD0', icon: '🍲' };
  }
  if (cat.includes('카페') || cat.includes('커피') || cat.includes('디저트')) {
    return { primary: '#8B4513', secondary: '#D2691E', accent: '#F5DEB3', icon: '☕' };
  }
  if (cat.includes('일식') || cat.includes('초밥') || cat.includes('라멘') || cat.includes('스시')) {
    return { primary: '#DC143C', secondary: '#FF69B4', accent: '#FFB6C1', icon: '🍣' };
  }
  if (cat.includes('중식') || cat.includes('중국') || cat.includes('짜장') || cat.includes('짬뽕')) {
    return { primary: '#FF0000', secondary: '#FFD700', accent: '#FF6347', icon: '🥡' };
  }
  if (cat.includes('양식') || cat.includes('파스타') || cat.includes('피자') || cat.includes('스테이크')) {
    return { primary: '#228B22', secondary: '#32CD32', accent: '#90EE90', icon: '🍝' };
  }
  if (cat.includes('치킨') || cat.includes('닭')) {
    return { primary: '#FF8C00', secondary: '#FFA500', accent: '#FFD700', icon: '🍗' };
  }
  if (cat.includes('해산물') || cat.includes('횟집') || cat.includes('해물')) {
    return { primary: '#006994', secondary: '#0099CC', accent: '#87CEEB', icon: '🦞' };
  }
  if (cat.includes('미용') || cat.includes('헤어') || cat.includes('네일')) {
    return { primary: '#FF69B4', secondary: '#FF1493', accent: '#FFB6C1', icon: '💇' };
  }
  if (cat.includes('헬스') || cat.includes('피트니스') || cat.includes('운동')) {
    return { primary: '#00CED1', secondary: '#20B2AA', accent: '#7FFFD4', icon: '💪' };
  }
  // 기본 (한식)
  return { primary: '#4A90E2', secondary: '#7B68EE', accent: '#B0C4DE', icon: '🍽️' };
}

function BusinessCard({ biz, index }: { biz: LocalBusinessData; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const theme = getCategoryTheme(biz.category || '');

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    setTilt({ x: dy * -12, y: dx * 12 });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  };

  const floatDelay = (index % 5) * 0.4;

  return (
    <motion.div
      initial={{ opacity: 0, y: 60, scale: 0.8, rotateY: -30 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotateY: 0 }}
      transition={{ delay: index * 0.08, type: 'spring', stiffness: 200, damping: 20 }}
      style={{ perspective: 1000 }}
    >
      {/* 공중 부양 애니메이션 */}
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 3 + (index % 3) * 0.5, repeat: Infinity, ease: 'easeInOut', delay: floatDelay }}
      >
        {/* 3D 기울기 카드 */}
        <motion.div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={handleMouseLeave}
          animate={{ rotateX: tilt.x, rotateY: tilt.y }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{
            width: 220,
            borderRadius: 16,
            background: `linear-gradient(135deg, #0a0a1a 0%, #0d1b2a 50%, #0a0a1a 100%)`,
            border: `1.5px solid ${theme.primary}55`,
            boxShadow: isHovered
              ? `0 0 40px ${theme.primary}88, 0 0 80px ${theme.primary}44, 0 20px 60px rgba(0,0,0,0.8), inset 0 0 30px ${theme.primary}11`
              : `0 0 20px ${theme.primary}44, 0 10px 40px rgba(0,0,0,0.6)`,
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
            transformStyle: 'preserve-3d',
            transition: 'box-shadow 0.3s ease',
          }}
        >
          {/* 홀로그램 shimmer */}
          {isHovered && (
            <motion.div
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: '200%', opacity: [0, 0.6, 0] }}
              transition={{ duration: 0.8, ease: 'easeInOut' }}
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: `linear-gradient(105deg, transparent 40%, ${theme.accent}33 50%, transparent 60%)`,
                zIndex: 10, pointerEvents: 'none',
              }}
            />
          )}

          {/* 상단 카테고리 배너 */}
          <div style={{
            background: `linear-gradient(135deg, ${theme.primary}cc, ${theme.secondary}99)`,
            padding: '10px 14px 8px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 20 }}>{theme.icon}</span>
              <span style={{ color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.9 }}>
                {biz.category?.split('>').pop()?.trim() || '업체'}
              </span>
            </div>
            {biz.is24Hours && (
              <motion.div
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                style={{
                  background: '#00FF88', color: '#000', fontSize: 9, fontWeight: 800,
                  padding: '2px 6px', borderRadius: 4, letterSpacing: 0.5,
                }}
              >
                24H
              </motion.div>
            )}
          </div>

          {/* 업체명 */}
          <div style={{ padding: '12px 14px 8px' }}>
            <div style={{
              color: '#fff', fontSize: 15, fontWeight: 800, lineHeight: 1.3,
              textShadow: `0 0 10px ${theme.primary}88`,
              marginBottom: 4,
            }}>
              {biz.name}
            </div>
            {biz.description && (
              <div style={{ color: '#9BA1A6', fontSize: 10, lineHeight: 1.4, marginBottom: 6 }}>
                {biz.description.replace(/<[^>]*>/g, '').slice(0, 50)}{biz.description.length > 50 ? '...' : ''}
              </div>
            )}
          </div>

          {/* 구분선 */}
          <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${theme.primary}66, transparent)`, margin: '0 14px' }} />

          {/* 정보 섹션 */}
          <div style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* 주소 */}
            {(biz.roadAddress || biz.address) && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{ color: theme.accent, fontSize: 11, flexShrink: 0, marginTop: 1 }}>📍</span>
                <span style={{ color: '#B0C4DE', fontSize: 10, lineHeight: 1.4 }}>
                  {(biz.roadAddress || biz.address || '').replace(/<[^>]*>/g, '').slice(0, 60)}
                </span>
              </div>
            )}

            {/* 전화번호 */}
            {biz.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: theme.accent, fontSize: 11 }}>📞</span>
                <span style={{ color: '#7FFFD4', fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>
                  {biz.phone}
                </span>
              </div>
            )}

            {/* 영업시간 */}
            {biz.businessHours && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: theme.accent, fontSize: 11 }}>🕐</span>
                <span style={{ color: '#FFD700', fontSize: 10 }}>
                  {biz.businessHours.slice(0, 40)}
                </span>
              </div>
            )}

            {/* 수집 키워드 */}
            {biz.keyword && (
              <div style={{ marginTop: 4 }}>
                <span style={{
                  background: `${theme.primary}22`, border: `1px solid ${theme.primary}44`,
                  color: theme.accent, fontSize: 9, padding: '2px 8px', borderRadius: 10,
                  letterSpacing: 0.5,
                }}>
                  #{biz.keyword}
                </span>
              </div>
            )}
          </div>

          {/* 하단 링크 버튼 */}
          {biz.link && (
            <div style={{ padding: '0 14px 12px' }}>
              <a
                href={biz.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block', textAlign: 'center',
                  background: `linear-gradient(135deg, ${theme.primary}33, ${theme.secondary}22)`,
                  border: `1px solid ${theme.primary}55`,
                  color: theme.accent, fontSize: 10, padding: '6px 0', borderRadius: 8,
                  textDecoration: 'none', fontWeight: 600, letterSpacing: 0.5,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = `${theme.primary}55`)}
                onMouseLeave={e => (e.currentTarget.style.background = `linear-gradient(135deg, ${theme.primary}33, ${theme.secondary}22)`)}
              >
                네이버 지도 보기 →
              </a>
            </div>
          )}

          {/* 코너 장식 */}
          {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => (
            <div key={pos} style={{
              position: 'absolute',
              top: pos.includes('top') ? 6 : 'auto',
              bottom: pos.includes('bottom') ? 6 : 'auto',
              left: pos.includes('left') ? 6 : 'auto',
              right: pos.includes('right') ? 6 : 'auto',
              width: 8, height: 8,
              borderTop: pos.includes('top') ? `2px solid ${theme.accent}88` : 'none',
              borderBottom: pos.includes('bottom') ? `2px solid ${theme.accent}88` : 'none',
              borderLeft: pos.includes('left') ? `2px solid ${theme.accent}88` : 'none',
              borderRight: pos.includes('right') ? `2px solid ${theme.accent}88` : 'none',
            }} />
          ))}

          {/* 그림자 (공중 부양 효과) */}
          <motion.div
            animate={{ opacity: [0.3, 0.15, 0.3], scaleX: [1, 0.85, 1] }}
            transition={{ duration: 3 + (index % 3) * 0.5, repeat: Infinity, ease: 'easeInOut', delay: floatDelay }}
            style={{
              position: 'absolute', bottom: -18, left: '10%', right: '10%', height: 12,
              background: `radial-gradient(ellipse, ${theme.primary}55 0%, transparent 70%)`,
              borderRadius: '50%', filter: 'blur(4px)', pointerEvents: 'none',
            }}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default function LocalBusinessCards({ businesses, visible }: LocalBusinessCardsProps) {
  if (!visible || businesses.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ width: '100%', padding: '20px 0' }}
      >
        {/* 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            textAlign: 'center', marginBottom: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          }}
        >
          <div style={{ height: 1, flex: 1, background: 'linear-gradient(90deg, transparent, #4A90E244)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <motion.span
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              style={{ fontSize: 16 }}
            >
              ⚙️
            </motion.span>
            <span style={{ color: '#4A90E2', fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
              수집된 업체 — {businesses.length}곳
            </span>
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              style={{ width: 6, height: 6, borderRadius: '50%', background: '#00FF88' }}
            />
          </div>
          <div style={{ height: 1, flex: 1, background: 'linear-gradient(90deg, #4A90E244, transparent)' }} />
        </motion.div>

        {/* 카드 그리드 */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 20,
          justifyContent: 'center', padding: '10px 20px 30px',
        }}>
          {businesses.map((biz, i) => (
            <BusinessCard key={biz.id || `${biz.name}-${i}`} biz={biz} index={i} />
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
