import { useRef, useState } from 'react';
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
  reviewCount?: number;
  rating?: number;
  visitorCount?: number;
  isBookable?: boolean;
}

interface LocalBusinessCardsProps {
  businesses: LocalBusinessData[];
  visible: boolean;
  onBook?: (biz: LocalBusinessData) => void;
  onRecommendMore?: () => void;
}

// 카테고리별 테마 색상
function getCategoryTheme(category: string): { primary: string; secondary: string; accent: string; icon: string } {
  const cat = (category || '').toLowerCase();
  if (cat.includes('산부인과') || cat.includes('여성') || cat.includes('산부')) {
    return { primary: '#FF69B4', secondary: '#FF1493', accent: '#FFB6C1', icon: '🏥' };
  }
  if (cat.includes('병원') || cat.includes('의원') || cat.includes('클리닉') || cat.includes('내과') || cat.includes('외과') || cat.includes('치과') || cat.includes('한의')) {
    return { primary: '#00BFFF', secondary: '#1E90FF', accent: '#87CEEB', icon: '🏥' };
  }
  if (cat.includes('피부') || cat.includes('성형')) {
    return { primary: '#DA70D6', secondary: '#BA55D3', accent: '#EE82EE', icon: '💉' };
  }
  if (cat.includes('약국')) {
    return { primary: '#32CD32', secondary: '#228B22', accent: '#90EE90', icon: '💊' };
  }
  if (cat.includes('고기') || cat.includes('구이') || cat.includes('삼겹') || cat.includes('갈비')) {
    return { primary: '#FF4500', secondary: '#FF8C00', accent: '#FFD700', icon: '🥩' };
  }
  if (cat.includes('카페') || cat.includes('커피') || cat.includes('디저트')) {
    return { primary: '#8B4513', secondary: '#D2691E', accent: '#F5DEB3', icon: '☕' };
  }
  if (cat.includes('미용') || cat.includes('헤어') || cat.includes('네일')) {
    return { primary: '#FF69B4', secondary: '#FF1493', accent: '#FFB6C1', icon: '💇' };
  }
  if (cat.includes('헬스') || cat.includes('피트니스') || cat.includes('운동')) {
    return { primary: '#00CED1', secondary: '#20B2AA', accent: '#7FFFD4', icon: '💪' };
  }
  return { primary: '#4A90E2', secondary: '#7B68EE', accent: '#B0C4DE', icon: '🍽️' };
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ fontSize: 10, color: i <= Math.round(rating) ? '#FFD700' : '#444' }}>★</span>
      ))}
      <span style={{ color: '#FFD700', fontSize: 10, marginLeft: 2 }}>{rating.toFixed(1)}</span>
    </div>
  );
}

function BusinessCard({ biz, index, onBook, rank }: { biz: LocalBusinessData; index: number; onBook?: (b: LocalBusinessData) => void; rank?: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const theme = getCategoryTheme(biz.category || '');
  const floatDelay = (index % 5) * 0.4;

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

  const isHospital = (biz.category || '').includes('의원') || (biz.category || '').includes('병원') || (biz.category || '').includes('클리닉') || (biz.category || '').includes('산부');

  return (
    <motion.div
      initial={{ opacity: 0, y: 60, scale: 0.8, rotateY: -30 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotateY: 0 }}
      transition={{ delay: index * 0.08, type: 'spring', stiffness: 200, damping: 20 }}
      style={{ perspective: 1000 }}
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3 + (index % 3) * 0.5, repeat: Infinity, ease: 'easeInOut', delay: floatDelay }}
      >
        <motion.div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={handleMouseLeave}
          animate={{ rotateX: tilt.x, rotateY: tilt.y }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{
            width: 230,
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

          {/* 순위 배지 */}
          {rank !== undefined && rank < 3 && (
            <div style={{
              position: 'absolute', top: 8, right: 8, zIndex: 20,
              width: 22, height: 22, borderRadius: '50%',
              background: rank === 0 ? '#FFD700' : rank === 1 ? '#C0C0C0' : '#CD7F32',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 900, color: '#000',
            }}>
              {rank + 1}
            </div>
          )}

          {/* 상단 카테고리 배너 */}
          <div style={{
            background: `linear-gradient(135deg, ${theme.primary}cc, ${theme.secondary}99)`,
            padding: '10px 14px 8px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 18 }}>{theme.icon}</span>
              <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.9 }}>
                {(biz.category || '').split('>').pop()?.trim() || '업체'}
              </span>
            </div>
            {biz.is24Hours && (
              <motion.div
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                style={{ background: '#00FF88', color: '#000', fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}
              >24H</motion.div>
            )}
          </div>

          {/* 업체명 */}
          <div style={{ padding: '10px 14px 6px' }}>
            <div style={{
              color: '#fff', fontSize: 14, fontWeight: 800, lineHeight: 1.3,
              textShadow: `0 0 10px ${theme.primary}88`, marginBottom: 4,
            }}>
              {biz.name}
            </div>

            {/* 별점 */}
            {biz.rating && biz.rating > 0 && (
              <div style={{ marginBottom: 4 }}>
                <StarRating rating={biz.rating} />
              </div>
            )}

            {/* 리뷰/방문자 수 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              {biz.reviewCount !== undefined && biz.reviewCount > 0 && (
                <span style={{ color: '#9BA1A6', fontSize: 9 }}>💬 리뷰 {biz.reviewCount.toLocaleString()}개</span>
              )}
              {biz.visitorCount !== undefined && biz.visitorCount > 0 && (
                <span style={{ color: '#9BA1A6', fontSize: 9 }}>👥 방문 {biz.visitorCount.toLocaleString()}명</span>
              )}
            </div>

            {biz.description && (
              <div style={{ color: '#9BA1A6', fontSize: 9, lineHeight: 1.4, marginBottom: 4 }}>
                {biz.description.replace(/<[^>]*>/g, '').slice(0, 50)}{biz.description.length > 50 ? '...' : ''}
              </div>
            )}
          </div>

          <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${theme.primary}66, transparent)`, margin: '0 14px' }} />

          {/* 정보 섹션 */}
          <div style={{ padding: '8px 14px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(biz.roadAddress || biz.address) && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{ color: theme.accent, fontSize: 10, flexShrink: 0, marginTop: 1 }}>📍</span>
                <span style={{ color: '#B0C4DE', fontSize: 9, lineHeight: 1.4 }}>
                  {(biz.roadAddress || biz.address || '').replace(/<[^>]*>/g, '').slice(0, 55)}
                </span>
              </div>
            )}
            {biz.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: theme.accent, fontSize: 10 }}>📞</span>
                <span style={{ color: '#7FFFD4', fontSize: 10, fontWeight: 600 }}>{biz.phone}</span>
              </div>
            )}
            {biz.businessHours && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: theme.accent, fontSize: 10 }}>🕐</span>
                <span style={{ color: '#FFD700', fontSize: 9 }}>{biz.businessHours.slice(0, 35)}</span>
              </div>
            )}
          </div>

          {/* 버튼 영역 */}
          <div style={{ padding: '0 14px 12px', display: 'flex', gap: 6 }}>
            {/* 예약 버튼 (병원/예약 가능한 경우) */}
            {(isHospital || biz.isBookable) && onBook && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => { e.stopPropagation(); onBook(biz); }}
                style={{
                  flex: 1,
                  background: `linear-gradient(135deg, ${theme.primary}99, ${theme.secondary}77)`,
                  border: `1px solid ${theme.primary}88`,
                  color: '#fff', fontSize: 10, padding: '7px 0', borderRadius: 8,
                  cursor: 'pointer', fontWeight: 700, letterSpacing: 0.5,
                  boxShadow: `0 0 12px ${theme.primary}44`,
                }}
              >
                📅 예약하기
              </motion.button>
            )}
            {/* 네이버 지도 버튼 */}
            {biz.link && (
              <a
                href={biz.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  flex: biz.isBookable || isHospital ? '0 0 auto' : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(74,144,226,0.15)',
                  border: '1px solid rgba(74,144,226,0.4)',
                  color: '#7BB3F0', fontSize: 9, padding: '7px 10px', borderRadius: 8,
                  textDecoration: 'none', fontWeight: 600,
                }}
              >
                🗺️ 지도
              </a>
            )}
          </div>

          {/* 코너 장식 */}
          {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map(pos => (
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
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

type SortType = 'default' | 'review' | 'visitor' | 'rating';

export default function LocalBusinessCards({ businesses, visible, onBook, onRecommendMore }: LocalBusinessCardsProps) {
  const [sortType, setSortType] = useState<SortType>('default');

  if (!visible || businesses.length === 0) return null;

  const sorted = [...businesses].sort((a, b) => {
    if (sortType === 'review') return (b.reviewCount || 0) - (a.reviewCount || 0);
    if (sortType === 'visitor') return (b.visitorCount || 0) - (a.visitorCount || 0);
    if (sortType === 'rating') return (b.rating || 0) - (a.rating || 0);
    return 0;
  });

  const SORT_BUTTONS: { key: SortType; label: string }[] = [
    { key: 'default', label: '기본순' },
    { key: 'review', label: '리뷰순' },
    { key: 'visitor', label: '방문자순' },
    { key: 'rating', label: '별점순' },
  ];

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
          style={{ textAlign: 'center', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}
        >
          <div style={{ height: 1, flex: 1, background: 'linear-gradient(90deg, transparent, #4A90E244)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <motion.span animate={{ rotate: [0, 360] }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} style={{ fontSize: 14 }}>⚙️</motion.span>
            <span style={{ color: '#4A90E2', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
              추천 업체 — {businesses.length}곳
            </span>
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              style={{ width: 6, height: 6, borderRadius: '50%', background: '#00FF88' }}
            />
          </div>
          <div style={{ height: 1, flex: 1, background: 'linear-gradient(90deg, #4A90E244, transparent)' }} />
        </motion.div>

        {/* 정렬 필터 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
          {SORT_BUTTONS.map(btn => (
            <motion.button
              key={btn.key}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSortType(btn.key)}
              style={{
                background: sortType === btn.key ? 'rgba(74,144,226,0.4)' : 'rgba(74,144,226,0.1)',
                border: `1px solid ${sortType === btn.key ? '#4A90E2' : 'rgba(74,144,226,0.3)'}`,
                color: sortType === btn.key ? '#7BB3F0' : '#5A6A7A',
                fontSize: 10, padding: '5px 12px', borderRadius: 20,
                cursor: 'pointer', fontWeight: sortType === btn.key ? 700 : 400,
                transition: 'all 0.2s',
              }}
            >
              {btn.label}
            </motion.button>
          ))}
        </div>

        {/* 카드 그리드 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center', padding: '10px 20px 20px' }}>
          {sorted.map((biz, i) => (
            <BusinessCard
              key={biz.id || `${biz.name}-${i}`}
              biz={biz}
              index={i}
              onBook={onBook}
              rank={sortType !== 'default' ? i : undefined}
            />
          ))}
        </div>

        {/* 더 추천 받기 버튼 */}
        {onRecommendMore && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8, marginBottom: 10 }}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onRecommendMore}
              style={{
                background: 'rgba(200,169,110,0.15)',
                border: '1px solid rgba(200,169,110,0.4)',
                color: '#C8A96E', fontSize: 11, padding: '8px 24px', borderRadius: 20,
                cursor: 'pointer', fontWeight: 600, letterSpacing: 1,
              }}
            >
              🔄 다른 곳 추천받기
            </motion.button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
