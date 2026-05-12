import React, { useEffect, useState } from 'react';

type JarvisScene =
  | 'home'
  | 'standby'
  | 'briefing'
  | 'orders'
  | 'market'
  | 'outreach'
  | 'files'
  | 'approval'
  | 'voice'
  | 'error'
  | 'copy_research'
  | 'smartstore_brief'
  | 'keyword_radar'
  | 'growth_link'
  | 'cs_copilot'
  | 'approval_gate';

interface JarvisScenePanelProps {
  scene: JarvisScene;
  visible: boolean;
  onQuickCommand?: (cmd: string) => void;
}

/* ── Scene 메타데이터 ── */
interface SceneMeta {
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  quickCommands: { label: string; cmd: string }[];
}

const SCENE_META: Record<string, SceneMeta> = {
  home: {
    icon: '⬡',
    title: 'MISSION CONTROL',
    subtitle: 'All systems nominal. Awaiting your command.',
    color: '#C8A96E',
    quickCommands: [
      { label: '오늘 브리핑', cmd: '오늘 브리핑 해줘' },
      { label: '주문 현황', cmd: '주문 현황 보여줘' },
      { label: '카피 리서치', cmd: '복숭아 카피 만들어줘' },
    ],
  },
  copy_research: {
    icon: '◈',
    title: 'COPY RESEARCH LAB',
    subtitle: 'Viral analysis & content engine activated.',
    color: '#00F5FF',
    quickCommands: [
      { label: '후킹 문구 생성', cmd: '후킹 문구 만들어줘' },
      { label: '릴스 대본', cmd: '릴스 대본 써줘' },
      { label: '스레드 글', cmd: '스레드 글 써줘' },
      { label: '유튜브 조사', cmd: '유튜브 조사해줘' },
    ],
  },
  smartstore_brief: {
    icon: '◉',
    title: 'SMARTSTORE BRIEF',
    subtitle: 'Order pipeline & daily metrics syncing.',
    color: '#00FF88',
    quickCommands: [
      { label: '신규 주문', cmd: '현재 신규주문 보여줘' },
      { label: '배송준비', cmd: '배송준비 현황 보여줘' },
      { label: '오늘 매출', cmd: '오늘 매출 알려줘' },
      { label: '발주서 생성', cmd: '오늘 발주서 만들어줘' },
    ],
  },
  keyword_radar: {
    icon: '◎',
    title: 'KEYWORD RADAR',
    subtitle: 'Rank tracking & search volume monitoring.',
    color: '#9B8EC4',
    quickCommands: [
      { label: '키워드 순위', cmd: '키워드 순위 확인해줘' },
      { label: '상품 링크 분석', cmd: '상품 링크 분석해줘' },
      { label: '검색 트렌드', cmd: '검색 트렌드 보여줘' },
    ],
  },
  growth_link: {
    icon: '⬢',
    title: 'GROWTH LINK',
    subtitle: 'Deep link generation & Chrome optimization.',
    color: '#FF9800',
    quickCommands: [
      { label: '딥링크 생성', cmd: '딥링크 만들어줘' },
      { label: '공동구매 링크', cmd: '공동구매 링크 만들어줘' },
      { label: '크롬 최적화', cmd: '크롬으로 열리게 해줘' },
    ],
  },
  cs_copilot: {
    icon: '◇',
    title: 'CS COPILOT',
    subtitle: 'Customer inquiry queue & auto-response ready.',
    color: '#4A90E2',
    quickCommands: [
      { label: '고객 문의 답변', cmd: '고객 문의 답변 써줘' },
      { label: '리뷰 답글', cmd: '리뷰 답글 써줘' },
      { label: '환불 안내', cmd: '환불 안내 문구 만들어줘' },
    ],
  },
  approval_gate: {
    icon: '⚠',
    title: 'APPROVAL GATE',
    subtitle: 'Security check required. Execute locked.',
    color: '#FF4444',
    quickCommands: [
      { label: '승인 대기 확인', cmd: '승인 대기 항목 보여줘' },
      { label: '실행 잠금 해제', cmd: '실행 승인해줘' },
    ],
  },
  /* legacy scenes — 기존 호환 */
  standby: {
    icon: '⬡',
    title: 'MISSION CONTROL',
    subtitle: 'All systems nominal.',
    color: '#C8A96E',
    quickCommands: [],
  },
  briefing: {
    icon: '◉',
    title: 'DAILY BRIEFING',
    subtitle: 'Morning protocol active.',
    color: '#00FF88',
    quickCommands: [],
  },
  orders: {
    icon: '◉',
    title: 'SMARTSTORE ORDERS',
    subtitle: 'Order sync active.',
    color: '#00FF88',
    quickCommands: [],
  },
  market: {
    icon: '◈',
    title: 'MARKET INTEL',
    subtitle: 'Price tracking active.',
    color: '#00F5FF',
    quickCommands: [],
  },
  outreach: {
    icon: '◎',
    title: 'OUTREACH RADAR',
    subtitle: 'Influencer scan active.',
    color: '#9B8EC4',
    quickCommands: [],
  },
  files: {
    icon: '⬢',
    title: 'WORKSPACE FILES',
    subtitle: 'File system active.',
    color: '#FF9800',
    quickCommands: [],
  },
  approval: {
    icon: '⚠',
    title: 'APPROVAL GATE',
    subtitle: 'Execute locked.',
    color: '#FF4444',
    quickCommands: [],
  },
  voice: {
    icon: '⬡',
    title: 'VOICE LINK',
    subtitle: 'Audio sync active.',
    color: '#C8A96E',
    quickCommands: [],
  },
  error: {
    icon: '⚠',
    title: 'SYSTEM ALERT',
    subtitle: 'Attention required.',
    color: '#FF4444',
    quickCommands: [],
  },
};

export default function JarvisScenePanel({ scene, visible, onQuickCommand }: JarvisScenePanelProps) {
  const [mounted, setMounted] = useState(false);
  const [animClass, setAnimClass] = useState('');

  useEffect(() => {
    if (visible) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimClass('scene-panel-enter'));
      });
    } else {
      setAnimClass('scene-panel-exit');
      const timer = setTimeout(() => setMounted(false), 500);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!mounted) return null;

  const meta = SCENE_META[scene] || SCENE_META.home;
  const isIdle = scene === 'home' || scene === 'standby';

  return (
    <div
      className={`jarvis-scene-panel ${animClass} scene-theme-${scene}`}
      style={{ '--scene-color': meta.color } as React.CSSProperties}
    >
      {/* 배경 그리드 + 글로우 */}
      <div className="scene-panel-bg">
        <div className="scene-panel-grid" />
        <div className="scene-panel-glow" />
      </div>

      {/* 메인 콘텐츠 */}
      <div className="scene-panel-content">
        {/* 아이콘 + 타이틀 */}
        <div className="scene-panel-header">
          <span className="scene-panel-icon">{meta.icon}</span>
          <div className="scene-panel-titles">
            <h3 className="scene-panel-title">{meta.title}</h3>
            <p className="scene-panel-subtitle">{meta.subtitle}</p>
          </div>
        </div>

        {/* 스캔 라인 애니메이션 */}
        <div className="scene-panel-scanline" />

        {/* Quick Commands */}
        {!isIdle && meta.quickCommands.length > 0 && (
          <div className="scene-panel-commands">
            <span className="scene-panel-cmd-label">QUICK COMMANDS</span>
            <div className="scene-panel-cmd-grid">
              {meta.quickCommands.map((qc) => (
                <button
                  key={qc.cmd}
                  className="scene-panel-cmd-btn"
                  onClick={() => onQuickCommand?.(qc.cmd)}
                  type="button"
                >
                  <span className="cmd-btn-dot" />
                  {qc.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 상태 표시 바 */}
        <div className="scene-panel-status-bar">
          <span className="scene-status-dot" />
          <span className="scene-status-text">
            {isIdle ? 'AWAITING COMMAND' : 'SCENE ACTIVE'}
          </span>
        </div>
      </div>
    </div>
  );
}
