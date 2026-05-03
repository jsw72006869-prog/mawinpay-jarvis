import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef, useCallback } from 'react';

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
  engagementRate?: number;
}

interface InfluencerCardsProps {
  influencers: InfluencerData[];
  visible: boolean;
  onClose: () => void;
  onSendEmail?: (influencers: InfluencerData[]) => void;
  onAiProposal?: (influencers: InfluencerData[]) => void;
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

function formatFollowers(inf: InfluencerData): string {
  const count = inf.subscriberCount || inf.subscribers || 0;
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  if (count > 0) return count.toLocaleString();
  if (inf.followers && inf.followers !== '-') return inf.followers;
  return '-';
}

function getEngageRate(inf: InfluencerData): string {
  if (inf.engagementRate) return `${inf.engagementRate.toFixed(1)}%`;
  const subs = inf.subscriberCount || inf.subscribers || 0;
  const views = inf.avgViews || 0;
  if (subs > 0 && views > 0) return `${((views / subs) * 100).toFixed(1)}%`;
  return '-';
}

function getScore(inf: InfluencerData): string {
  if (inf.fitScore) {
    if (inf.fitScore >= 90) return 'A+';
    if (inf.fitScore >= 80) return 'A';
    if (inf.fitScore >= 70) return 'B+';
    if (inf.fitScore >= 60) return 'B';
    return 'C';
  }
  return '-';
}

function getCategoryTags(inf: InfluencerData): string[] {
  const tags: string[] = [];
  if (inf.category) {
    inf.category.split(/[,/·]/).forEach(t => {
      const trimmed = t.trim();
      if (trimmed && tags.length < 3) tags.push(trimmed);
    });
  }
  if (tags.length === 0) {
    const platform = inf.platform?.toLowerCase() || '';
    if (platform.includes('youtube')) tags.push('유튜브');
    if (platform.includes('naver')) tags.push('네이버');
    if (platform.includes('instagram')) tags.push('인스타');
  }
  return tags;
}

// ── 3D 홀로그램 카드 ──
function HoloCard({ influencer, index, visible, selected, onSelect, onSendEmail }: {
  influencer: InfluencerData; index: number; visible: boolean;
  selected: boolean; onSelect: (i: number) => void;
  onSendEmail?: (inf: InfluencerData[]) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const channelUrl = getChannelUrl(influencer);
  const followers = formatFollowers(influencer);
  const engage = getEngageRate(influencer);
  const score = getScore(influencer);
  const tags = getCategoryTags(influencer);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (y - 0.5) * -20, y: (x - 0.5) * 20 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  }, []);

  // 3D 등장 애니메이션 - 각 카드가 다른 방향에서 날아옴
  const directions = [
    { x: -200, y: -100, rotateY: -45 },
    { x: 200, y: -50, rotateY: 45 },
    { x: -100, y: 200, rotateY: -30 },
    { x: 150, y: 150, rotateY: 35 },
    { x: 0, y: -200, rotateY: 0 },
    { x: -250, y: 0, rotateY: -50 },
  ];
  const dir = directions[index % directions.length];

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, x: dir.x, y: dir.y, rotateY: dir.rotateY, rotateX: 15, scale: 0.6 }}
      animate={visible ? {
        opacity: 1, x: 0, y: 0, rotateY: tilt.y, rotateX: tilt.x, scale: 1,
      } : { opacity: 0, x: dir.x, y: dir.y, rotateY: dir.rotateY, scale: 0.6 }}
      exit={{ opacity: 0, scale: 0.5, rotateY: -30, y: 100 }}
      transition={{
        delay: index * 0.08,
        duration: 0.8,
        ease: [0.16, 1, 0.3, 1],
        rotateX: { duration: 0.15, ease: 'linear' },
        rotateY: { duration: 0.15, ease: 'linear' },
      }}
      onClick={() => onSelect(index)}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        width: '280px',
        perspective: '1000px',
        transformStyle: 'preserve-3d',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {/* 카드 본체 */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(10,20,40,0.95), rgba(6,12,28,0.98))',
        borderRadius: '14px',
        border: selected
          ? '1px solid rgba(0,245,255,0.8)'
          : isHovered
            ? '1px solid rgba(0,245,255,0.4)'
            : '1px solid rgba(0,245,255,0.1)',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: selected
          ? '0 0 30px rgba(0,245,255,0.25), inset 0 0 30px rgba(0,245,255,0.03)'
          : isHovered
            ? '0 0 20px rgba(0,245,255,0.12), inset 0 0 20px rgba(0,245,255,0.02)'
            : '0 4px 20px rgba(0,0,0,0.4)',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}>
        {/* 홀로그램 스캔라인 오버레이 */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,245,255,0.015) 2px,
            rgba(0,245,255,0.015) 4px
          )`,
          pointerEvents: 'none',
          opacity: isHovered ? 0.8 : 0.3,
          transition: 'opacity 0.3s',
        }} />

        {/* 상단 글로우 라인 */}
        <motion.div
          animate={{ x: isHovered ? ['-100%', '200%'] : '-100%' }}
          transition={{ duration: 1.5, ease: 'linear', repeat: isHovered ? Infinity : 0 }}
          style={{
            position: 'absolute', top: 0, left: 0, zIndex: 2,
            width: '50%', height: '1px',
            background: 'linear-gradient(90deg, transparent, #00f5ff, transparent)',
          }}
        />

        {/* 선택 체크 */}
        {selected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              position: 'absolute', top: '10px', right: '10px', zIndex: 5,
              width: '22px', height: '22px', borderRadius: '50%',
              background: '#00f5ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', color: '#000', fontWeight: 700,
              boxShadow: '0 0 12px rgba(0,245,255,0.5)',
            }}
          >✓</motion.div>
        )}

        {/* 프로필 영역 */}
        <div style={{ padding: '20px 20px 12px', position: 'relative', zIndex: 3 }}>
          {/* 프로필 이미지 + 글로우 링 */}
          <div style={{ marginBottom: '12px', position: 'relative', width: '52px', height: '52px' }}>
            <motion.div
              animate={isHovered ? { rotate: 360 } : { rotate: 0 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              style={{
                position: 'absolute', inset: '-3px',
                borderRadius: '50%',
                border: '1px solid transparent',
                borderTopColor: '#00f5ff',
                borderRightColor: 'rgba(0,245,255,0.3)',
                opacity: isHovered ? 1 : 0,
                transition: 'opacity 0.3s',
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
                  width: '48px', height: '48px', borderRadius: '50%',
                  objectFit: 'cover', border: '2px solid rgba(0,245,255,0.3)',
                  position: 'relative',
                }}
              />
            ) : (
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #1e3a5f, #0d2137)',
                border: '2px solid rgba(0,245,255,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px',
              }}>
                {influencer.platform?.toLowerCase().includes('youtube') ? '▶' : '👤'}
              </div>
            )}
          </div>

          {/* 이름 */}
          <div style={{
            fontSize: '15px', fontWeight: 700, color: '#ffffff',
            marginBottom: '2px', letterSpacing: '0.3px',
            textShadow: isHovered ? '0 0 8px rgba(0,245,255,0.3)' : 'none',
            transition: 'text-shadow 0.3s',
          }}>
            {influencer.name}
          </div>

          {/* 핸들 */}
          <div style={{
            fontSize: '12px', color: '#00f5ff',
            marginBottom: '16px',
            fontFamily: 'monospace',
          }}>
            @{influencer.email?.split('@')[0] || influencer.name.toLowerCase().replace(/\s/g, '_')}
          </div>

          {/* 통계 3개 - 홀로그램 스타일 */}
          <div style={{
            display: 'flex', gap: '16px', marginBottom: '16px', width: '100%',
            padding: '10px 0',
            borderTop: '1px solid rgba(0,245,255,0.08)',
            borderBottom: '1px solid rgba(0,245,255,0.08)',
          }}>
            {[
              { value: followers, label: 'FOLLOWERS' },
              { value: engage, label: 'ENGAGE' },
              { value: score, label: 'SCORE' },
            ].map((stat, si) => (
              <motion.div
                key={si}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 + si * 0.1 + 0.3 }}
              >
                <div style={{
                  fontSize: '16px', fontWeight: 700, color: '#ffffff',
                  letterSpacing: '0.5px',
                  fontFamily: "'Orbitron', monospace",
                }}>
                  {stat.value}
                </div>
                <div style={{
                  fontSize: '9px', color: 'rgba(0,245,255,0.5)',
                  letterSpacing: '1.5px', marginTop: '3px',
                  fontFamily: "'Orbitron', monospace",
                }}>
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>

          {/* 태그 */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {tags.map((tag, i) => (
              <span key={i} style={{
                fontSize: '10px', color: '#00f5ff',
                border: '1px solid rgba(0,245,255,0.25)',
                borderRadius: '3px', padding: '3px 10px',
                background: 'rgba(0,245,255,0.04)',
                fontFamily: "'Orbitron', monospace",
                letterSpacing: '0.5px',
              }}>
                {tag}
              </span>
            ))}
          </div>

          {/* 버튼 2개 */}
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <motion.button
              whileHover={{ scale: 1.03, boxShadow: '0 0 15px rgba(0,245,255,0.3)' }}
              whileTap={{ scale: 0.97 }}
              onClick={(e) => {
                e.stopPropagation();
                if (onSendEmail && influencer.email) onSendEmail([influencer]);
                else if (influencer.email) window.open(`mailto:${influencer.email}`, '_blank');
              }}
              style={{
                flex: 1, padding: '9px 0',
                background: 'linear-gradient(135deg, #00f5ff, #00c8ff)',
                color: '#000000',
                border: 'none', borderRadius: '6px',
                fontSize: '11px', fontWeight: 700,
                cursor: 'pointer',
                fontFamily: "'Orbitron', monospace",
                letterSpacing: '0.5px',
              }}
            >
              이메일 발송
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03, borderColor: '#00f5ff' }}
              whileTap={{ scale: 0.97 }}
              onClick={(e) => { e.stopPropagation(); window.open(channelUrl, '_blank'); }}
              style={{
                flex: 1, padding: '9px 0',
                background: 'transparent', color: '#00f5ff',
                border: '1px solid rgba(0,245,255,0.3)', borderRadius: '6px',
                fontSize: '11px', fontWeight: 700,
                cursor: 'pointer',
                fontFamily: "'Orbitron', monospace",
                letterSpacing: '0.5px',
              }}
            >
              프로필 보기
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── 메인 컴포넌트: 풀스크린 3D 홀로그램 패널 ──
export default function InfluencerCards({ influencers, visible, onClose, onSendEmail, onAiProposal }: InfluencerCardsProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterEmail, setFilterEmail] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'subscribers' | 'views'>('default');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) {
      setSelectedIndices(new Set());
      setFilterPlatform('all');
      setFilterEmail(false);
      setSortBy('default');
    }
  }, [visible, influencers]);

  const toggleSelect = (i: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
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

  let filteredList = [...influencers];
  if (filterPlatform !== 'all') {
    filteredList = filteredList.filter(i => i.platform?.toLowerCase().includes(filterPlatform));
  }
  if (filterEmail) {
    filteredList = filteredList.filter(i => i.email && i.email.includes('@'));
  }
  if (sortBy === 'subscribers') {
    filteredList.sort((a, b) => ((b.subscriberCount || b.subscribers || 0) - (a.subscriberCount || a.subscribers || 0)));
  } else if (sortBy === 'views') {
    filteredList.sort((a, b) => ((b.viewCount || 0) - (a.viewCount || 0)));
  }

  const stats = {
    total: influencers.length,
    filtered: filteredList.length,
    emailCount: influencers.filter(i => i.email && i.email.includes('@')).length,
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
          transition={{ duration: 0.4 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'radial-gradient(ellipse at center, rgba(0,20,40,0.98) 0%, rgba(2,6,15,0.99) 70%)',
            backdropFilter: 'blur(30px)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* 배경 그리드 */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 0,
            backgroundImage: `
              linear-gradient(rgba(0,245,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,245,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
            pointerEvents: 'none',
          }} />

          {/* 배경 글로우 */}
          <motion.div
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 4, repeat: Infinity }}
            style={{
              position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
              width: '600px', height: '400px',
              background: 'radial-gradient(ellipse, rgba(0,245,255,0.06), transparent 70%)',
              pointerEvents: 'none', zIndex: 0,
            }}
          />

          {/* ═══ 상단 헤더 ═══ */}
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid rgba(0,245,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0, position: 'relative', zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: 'rgba(0,245,255,0.08)',
                  border: '1px solid rgba(0,245,255,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px',
                }}
              >◈</motion.div>
              <span style={{
                fontSize: '14px', color: '#00f5ff', fontWeight: 700,
                letterSpacing: '3px',
                fontFamily: "'Orbitron', monospace",
                textShadow: '0 0 10px rgba(0,245,255,0.3)',
              }}>
                CARD UI
              </span>
              <span style={{
                fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginLeft: '8px',
                fontFamily: "'Orbitron', monospace",
              }}>
                {stats.total}명 · {stats.emailCount} EMAIL
              </span>
            </div>

            <motion.button
              whileHover={{ scale: 1.05, borderColor: '#ff4444' }}
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              style={{
                background: 'rgba(255,50,50,0.06)', border: '1px solid rgba(255,80,80,0.25)',
                color: '#FF6666', cursor: 'pointer', fontSize: '11px',
                padding: '6px 16px', borderRadius: '4px',
                fontFamily: "'Orbitron', monospace",
                letterSpacing: '1px',
              }}
            >
              CLOSE ✕
            </motion.button>
          </motion.div>

          {/* ═══ 필터/액션 바 ═══ */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            style={{
              padding: '10px 24px',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0, flexWrap: 'wrap', gap: '8px',
              position: 'relative', zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: 'ALL', color: '#00F5FF' },
                { key: 'youtube', label: 'YOUTUBE', color: '#FF3333' },
                { key: 'naver', label: 'NAVER', color: '#03C75A' },
                { key: 'instagram', label: 'INSTA', color: '#E1306C' },
              ].map(f => (
                <motion.button
                  key={f.key}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setFilterPlatform(f.key)}
                  style={{
                    background: filterPlatform === f.key ? `${f.color}15` : 'transparent',
                    border: `1px solid ${filterPlatform === f.key ? f.color : 'rgba(255,255,255,0.08)'}`,
                    color: filterPlatform === f.key ? f.color : '#555',
                    fontSize: '10px', fontWeight: 600,
                    padding: '5px 12px', borderRadius: '3px', cursor: 'pointer',
                    letterSpacing: '1px',
                    fontFamily: "'Orbitron', monospace",
                    transition: 'all 0.2s',
                  }}
                >
                  {f.label}
                </motion.button>
              ))}

              <div style={{ width: '1px', height: '16px', background: 'rgba(0,245,255,0.1)', margin: '0 4px' }} />

              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={() => setFilterEmail(!filterEmail)}
                style={{
                  background: filterEmail ? 'rgba(34,197,94,0.1)' : 'transparent',
                  border: `1px solid ${filterEmail ? '#22C55E' : 'rgba(255,255,255,0.08)'}`,
                  color: filterEmail ? '#22C55E' : '#555',
                  fontSize: '10px', fontWeight: 600,
                  padding: '5px 12px', borderRadius: '3px', cursor: 'pointer',
                  fontFamily: "'Orbitron', monospace",
                  letterSpacing: '0.5px',
                }}
              >
                ✉ EMAIL
              </motion.button>

              <div style={{ width: '1px', height: '16px', background: 'rgba(0,245,255,0.1)', margin: '0 4px' }} />

              {[
                { key: 'default', label: 'DEFAULT' },
                { key: 'subscribers', label: 'SUBS↓' },
                { key: 'views', label: 'VIEWS↓' },
              ].map(s => (
                <motion.button
                  key={s.key}
                  whileHover={{ scale: 1.05 }}
                  onClick={() => setSortBy(s.key as any)}
                  style={{
                    background: sortBy === s.key ? 'rgba(0,245,255,0.06)' : 'transparent',
                    border: `1px solid ${sortBy === s.key ? '#00F5FF33' : 'rgba(255,255,255,0.05)'}`,
                    color: sortBy === s.key ? '#00F5FF' : '#444',
                    fontSize: '10px',
                    padding: '5px 10px', borderRadius: '3px', cursor: 'pointer',
                    fontFamily: "'Orbitron', monospace",
                    letterSpacing: '0.5px',
                  }}
                >
                  {s.label}
                </motion.button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={selectAll}
                style={{
                  background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.2)',
                  color: '#00F5FF', fontSize: '10px', fontWeight: 600,
                  padding: '5px 14px', borderRadius: '3px', cursor: 'pointer',
                  fontFamily: "'Orbitron', monospace",
                  letterSpacing: '0.5px',
                }}
              >
                {selectedIndices.size === filteredList.length ? '✓ DESELECT' : '☐ SELECT ALL'}
              </motion.button>

              {stats.selected > 0 && (
                <>
                  <motion.button
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(0,245,255,0.3)' }}
                    onClick={() => onSendEmail?.(selectedInfluencers)}
                    style={{
                      background: 'linear-gradient(135deg, #00f5ff, #00c8ff)',
                      border: 'none',
                      color: '#000', fontSize: '10px', fontWeight: 700,
                      padding: '6px 16px', borderRadius: '3px', cursor: 'pointer',
                      fontFamily: "'Orbitron', monospace",
                      letterSpacing: '0.5px',
                    }}
                  >
                    ✉ SEND ({stats.selected})
                  </motion.button>

                  <motion.button
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    whileHover={{ scale: 1.05 }}
                    onClick={() => onAiProposal?.(selectedInfluencers)}
                    style={{
                      background: 'transparent', border: '1px solid rgba(0,245,255,0.35)',
                      color: '#00f5ff', fontSize: '10px', fontWeight: 700,
                      padding: '6px 16px', borderRadius: '3px', cursor: 'pointer',
                      fontFamily: "'Orbitron', monospace",
                      letterSpacing: '0.5px',
                    }}
                  >
                    ⚡ AI PROPOSAL ({stats.selected})
                  </motion.button>
                </>
              )}
            </div>
          </motion.div>

          {/* ═══ 3D 카드 그리드 ═══ */}
          <div
            ref={scrollRef}
            style={{
              flex: 1, overflowY: 'auto', overflowX: 'hidden',
              padding: '24px',
              perspective: '1200px',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(0,245,255,0.15) transparent',
              position: 'relative', zIndex: 5,
            }}
          >
            {filteredList.length === 0 ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '200px', color: '#444', fontSize: '13px',
                fontFamily: "'Orbitron', monospace",
                letterSpacing: '2px',
              }}>
                NO RESULTS FOUND
              </div>
            ) : (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '20px',
                justifyContent: 'center',
              }}>
                {filteredList.map((inf, i) => (
                  <HoloCard
                    key={`${inf.name}-${inf.platform}-${i}`}
                    influencer={inf}
                    index={i}
                    visible={visible}
                    selected={selectedIndices.has(i)}
                    onSelect={toggleSelect}
                    onSendEmail={onSendEmail}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ═══ 하단 상태바 ═══ */}
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            style={{
              padding: '10px 24px',
              borderTop: '1px solid rgba(0,245,255,0.08)',
              background: 'rgba(0,245,255,0.015)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0, position: 'relative', zIndex: 10,
            }}
          >
            <span style={{
              fontSize: '11px', color: 'rgba(255,255,255,0.3)',
              fontFamily: "'Orbitron', monospace",
              letterSpacing: '1px',
            }}>
              {filteredList.length} / {stats.total} DISPLAYED
              {stats.selected > 0 && (
                <span style={{ color: '#00f5ff', marginLeft: '12px' }}>
                  · {stats.selected} SELECTED
                </span>
              )}
            </span>
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: '#00f5ff',
                boxShadow: '0 0 8px #00f5ff',
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
