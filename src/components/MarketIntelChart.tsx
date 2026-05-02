/**
 * MarketIntelChart.tsx - 농산물 시장 데이터 시각화 컴포넌트
 * 
 * Chart.js를 사용하여 가격 추이, 이동평균, 변동성 지표를 
 * HUD 스타일의 홀로그램 차트로 표시합니다.
 * 
 * Features:
 * - 일별 가격 추이 라인 차트
 * - 5일/20일 이동평균선
 * - 변동성 밴드 (볼린저 밴드 스타일)
 * - 매입/매도 추천 시그널 마커
 * - 실시간 텔레메트리 연동
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PriceDataPoint {
  date: string;
  price: number;
  ma5?: number;
  ma20?: number;
  upperBand?: number;
  lowerBand?: number;
}

interface MarketChartData {
  item: string;
  unit: string;
  prices: PriceDataPoint[];
  recommendation: 'buy' | 'sell' | 'hold';
  confidence: number;
  summary: {
    maxPrice: number;
    minPrice: number;
    avgPrice: number;
    trend: 'up' | 'down' | 'stable';
    volatility: number;
  };
}

interface MarketIntelChartProps {
  visible: boolean;
  data: MarketChartData | null;
  onClose: () => void;
}

export default function MarketIntelChart({ visible, data, onClose }: MarketIntelChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animationProgress, setAnimationProgress] = useState(0);

  // Canvas 기반 차트 렌더링 (Chart.js 대신 커스텀 HUD 스타일)
  useEffect(() => {
    if (!visible || !data || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 애니메이션 프레임
    let frame = 0;
    const totalFrames = 60;
    
    const animate = () => {
      frame++;
      const progress = Math.min(frame / totalFrames, 1);
      setAnimationProgress(progress);

      // 캔버스 클리어
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 배경 그리드
      drawGrid(ctx, canvas.width, canvas.height, progress);

      // 가격 데이터 그리기
      if (data.prices.length > 0) {
        drawPriceLine(ctx, canvas.width, canvas.height, data.prices, progress);
        drawMovingAverages(ctx, canvas.width, canvas.height, data.prices, progress);
        drawVolatilityBand(ctx, canvas.width, canvas.height, data.prices, progress);
        drawSignalMarkers(ctx, canvas.width, canvas.height, data, progress);
      }

      if (frame < totalFrames) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }, [visible, data]);

  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, progress: number) {
    ctx.strokeStyle = `rgba(0, 200, 255, ${0.1 * progress})`;
    ctx.lineWidth = 0.5;

    // 수평선
    for (let i = 0; i < 6; i++) {
      const y = (h / 6) * i + 30;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(w * progress - 10, y);
      ctx.stroke();
    }

    // 수직선
    for (let i = 0; i < 8; i++) {
      const x = 40 + ((w - 50) / 8) * i;
      if (x < w * progress) {
        ctx.beginPath();
        ctx.moveTo(x, 30);
        ctx.lineTo(x, h - 30);
        ctx.stroke();
      }
    }
  }

  function drawPriceLine(ctx: CanvasRenderingContext2D, w: number, h: number, prices: PriceDataPoint[], progress: number) {
    if (prices.length < 2) return;

    const maxPrice = Math.max(...prices.map(p => p.price));
    const minPrice = Math.min(...prices.map(p => p.price));
    const range = maxPrice - minPrice || 1;
    const chartW = w - 60;
    const chartH = h - 70;
    const pointsToShow = Math.floor(prices.length * progress);

    // 메인 가격선
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.9)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0, 255, 200, 0.5)';
    ctx.shadowBlur = 6;

    for (let i = 0; i < pointsToShow; i++) {
      const x = 40 + (chartW / (prices.length - 1)) * i;
      const y = 40 + chartH - ((prices[i].price - minPrice) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 가격 라벨
    ctx.fillStyle = 'rgba(0, 255, 200, 0.8)';
    ctx.font = '10px monospace';
    ctx.fillText(`${maxPrice.toLocaleString()}원`, 2, 40);
    ctx.fillText(`${minPrice.toLocaleString()}원`, 2, h - 35);

    // 날짜 라벨
    if (prices.length > 0) {
      ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
      ctx.fillText(prices[0].date.slice(5), 40, h - 10);
      if (pointsToShow > 0) {
        ctx.fillText(prices[Math.min(pointsToShow - 1, prices.length - 1)].date.slice(5), w - 60, h - 10);
      }
    }
  }

  function drawMovingAverages(ctx: CanvasRenderingContext2D, w: number, h: number, prices: PriceDataPoint[], progress: number) {
    const maxPrice = Math.max(...prices.map(p => p.price));
    const minPrice = Math.min(...prices.map(p => p.price));
    const range = maxPrice - minPrice || 1;
    const chartW = w - 60;
    const chartH = h - 70;
    const pointsToShow = Math.floor(prices.length * progress);

    // MA5 (5일 이동평균)
    const ma5Points = prices.filter(p => p.ma5 !== undefined);
    if (ma5Points.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255, 200, 0, ${0.7 * progress})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      
      const startIdx = prices.indexOf(ma5Points[0]);
      for (let i = 0; i < Math.min(ma5Points.length, pointsToShow - startIdx); i++) {
        const idx = startIdx + i;
        const x = 40 + (chartW / (prices.length - 1)) * idx;
        const y = 40 + chartH - ((ma5Points[i].ma5! - minPrice) / range) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // MA20 (20일 이동평균)
    const ma20Points = prices.filter(p => p.ma20 !== undefined);
    if (ma20Points.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255, 100, 100, ${0.7 * progress})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 4]);
      
      const startIdx = prices.indexOf(ma20Points[0]);
      for (let i = 0; i < Math.min(ma20Points.length, pointsToShow - startIdx); i++) {
        const idx = startIdx + i;
        const x = 40 + (chartW / (prices.length - 1)) * idx;
        const y = 40 + chartH - ((ma20Points[i].ma20! - minPrice) / range) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawVolatilityBand(ctx: CanvasRenderingContext2D, w: number, h: number, prices: PriceDataPoint[], progress: number) {
    const bandsData = prices.filter(p => p.upperBand !== undefined && p.lowerBand !== undefined);
    if (bandsData.length < 2) return;

    const maxPrice = Math.max(...prices.map(p => p.upperBand || p.price));
    const minPrice = Math.min(...prices.map(p => p.lowerBand || p.price));
    const range = maxPrice - minPrice || 1;
    const chartW = w - 60;
    const chartH = h - 70;
    const pointsToShow = Math.floor(bandsData.length * progress);

    // 볼린저 밴드 영역
    ctx.beginPath();
    ctx.fillStyle = `rgba(0, 150, 255, ${0.05 * progress})`;
    
    const startIdx = prices.indexOf(bandsData[0]);
    
    // 상단 밴드
    for (let i = 0; i < pointsToShow; i++) {
      const idx = startIdx + i;
      const x = 40 + (chartW / (prices.length - 1)) * idx;
      const y = 40 + chartH - ((bandsData[i].upperBand! - minPrice) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    
    // 하단 밴드 (역순)
    for (let i = pointsToShow - 1; i >= 0; i--) {
      const idx = startIdx + i;
      const x = 40 + (chartW / (prices.length - 1)) * idx;
      const y = 40 + chartH - ((bandsData[i].lowerBand! - minPrice) / range) * chartH;
      ctx.lineTo(x, y);
    }
    
    ctx.closePath();
    ctx.fill();
  }

  function drawSignalMarkers(ctx: CanvasRenderingContext2D, w: number, h: number, chartData: MarketChartData, progress: number) {
    if (progress < 0.8) return; // 80% 이후에 시그널 표시

    const { recommendation, confidence } = chartData;
    const centerX = w - 80;
    const centerY = 50;

    // 시그널 원
    const color = recommendation === 'buy' 
      ? 'rgba(0, 255, 100, 0.9)' 
      : recommendation === 'sell' 
        ? 'rgba(255, 80, 80, 0.9)' 
        : 'rgba(255, 200, 0, 0.9)';

    ctx.beginPath();
    ctx.arc(centerX, centerY, 12, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 시그널 텍스트
    ctx.fillStyle = 'white';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    const label = recommendation === 'buy' ? 'BUY' : recommendation === 'sell' ? 'SELL' : 'HOLD';
    ctx.fillText(label, centerX, centerY + 3);
    
    // 신뢰도
    ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';
    ctx.font = '8px monospace';
    ctx.fillText(`${confidence}%`, centerX, centerY + 22);
    ctx.textAlign = 'left';
  }

  if (!visible || !data) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 20 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          position: 'fixed',
          bottom: '120px',
          left: '20px',
          width: '420px',
          height: '300px',
          background: 'linear-gradient(135deg, rgba(0,20,40,0.95), rgba(0,10,30,0.98))',
          border: '1px solid rgba(0, 200, 255, 0.3)',
          borderRadius: '12px',
          padding: '16px',
          zIndex: 1100,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 0 30px rgba(0, 150, 255, 0.2), inset 0 0 20px rgba(0, 100, 200, 0.05)',
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: data.summary.trend === 'up' ? '#00ff88' : data.summary.trend === 'down' ? '#ff4444' : '#ffaa00',
              boxShadow: `0 0 6px ${data.summary.trend === 'up' ? '#00ff88' : data.summary.trend === 'down' ? '#ff4444' : '#ffaa00'}`,
            }} />
            <span style={{ color: '#00c8ff', fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace' }}>
              {data.item} 시세 분석
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '16px' }}
          >
            ✕
          </button>
        </div>

        {/* 요약 정보 바 */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '10px', fontFamily: 'monospace' }}>
          <span style={{ color: '#00ff88' }}>최고 {data.summary.maxPrice.toLocaleString()}원</span>
          <span style={{ color: '#ff6666' }}>최저 {data.summary.minPrice.toLocaleString()}원</span>
          <span style={{ color: '#ffaa00' }}>평균 {data.summary.avgPrice.toLocaleString()}원</span>
          <span style={{ color: 'rgba(200,200,200,0.7)' }}>변동성 {data.summary.volatility.toFixed(1)}%</span>
        </div>

        {/* 차트 캔버스 */}
        <canvas
          ref={canvasRef}
          width={388}
          height={200}
          style={{ width: '100%', height: '200px', borderRadius: '6px' }}
        />

        {/* 진행 바 */}
        <div style={{ marginTop: '6px', height: '2px', background: 'rgba(0,100,200,0.2)', borderRadius: '1px' }}>
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: `${animationProgress * 100}%` }}
            style={{ height: '100%', background: 'linear-gradient(90deg, #00c8ff, #00ff88)', borderRadius: '1px' }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
