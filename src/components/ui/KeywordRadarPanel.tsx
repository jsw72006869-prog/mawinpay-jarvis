import React, { useState } from 'react';

/* ── SEO-K.1 Keyword Radar Panel ──
   상품 링크 입력 → 키워드 순위 측정 → 결과 표시
   가짜 순위 표시 금지 / 첫 측정 전일 대비 없음 */

interface KeywordResult {
  keyword: string;
  rank: number | null;
  status: 'found' | 'not_found' | 'error';
  checkedAt: string;
  source: string;
}

interface RadarResponse {
  success: boolean;
  productUrl: string;
  productName?: string;
  keywords: KeywordResult[];
  message?: string;
}

type MeasureState = 'idle' | 'loading' | 'done' | 'error';

interface KeywordRadarPanelProps {
  onClose?: () => void;
}

export default function KeywordRadarPanel({ onClose }: KeywordRadarPanelProps) {
  const [productUrl, setProductUrl] = useState('');
  const [manualKeywords, setManualKeywords] = useState('');
  const [state, setState] = useState<MeasureState>('idle');
  const [result, setResult] = useState<RadarResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleMeasure = async () => {
    if (!productUrl.trim()) {
      setErrorMsg('상품 URL을 입력해주세요.');
      return;
    }

    setState('loading');
    setErrorMsg('');
    setResult(null);

    try {
      const body: any = { productUrl: productUrl.trim() };
      if (manualKeywords.trim()) {
        body.manualKeywords = manualKeywords
          .split(',')
          .map(k => k.trim())
          .filter(k => k.length > 0)
          .slice(0, 5);
      }

      const res = await fetch('/api/keyword-radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data: RadarResponse = await res.json();

      if (!res.ok || !data.success) {
        setState('error');
        setErrorMsg(data.message || '측정 실패');
        setResult(data);
        return;
      }

      setState('done');
      setResult(data);
    } catch (err: any) {
      setState('error');
      setErrorMsg(`네트워크 오류: ${err.message || '연결 실패'}`);
    }
  };

  const getRankDisplay = (item: KeywordResult) => {
    if (item.status === 'found' && item.rank !== null) {
      return { text: `${item.rank}위`, className: 'kr-rank-found' };
    }
    if (item.status === 'not_found') {
      return { text: '100위 밖', className: 'kr-rank-notfound' };
    }
    return { text: '측정 실패', className: 'kr-rank-error' };
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="kr-panel">
      {/* Header */}
      <div className="kr-header">
        <span className="kr-dot" />
        <span className="kr-title">KEYWORD RADAR</span>
        <span className="kr-badge">SEO-K.1</span>
        {onClose && (
          <button className="kr-close" onClick={onClose}>CLOSE</button>
        )}
      </div>

      {/* Input Section */}
      <div className="kr-input-section">
        <div className="kr-input-group">
          <label className="kr-label">상품 링크</label>
          <input
            type="text"
            className="kr-input"
            placeholder="https://smartstore.naver.com/.../products/..."
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            disabled={state === 'loading'}
          />
        </div>
        <div className="kr-input-group">
          <label className="kr-label">키워드 직접 입력 <span className="kr-optional">(선택)</span></label>
          <input
            type="text"
            className="kr-input"
            placeholder="초당옥수수, 괴산 초당옥수수 (쉼표 구분, 최대 5개)"
            value={manualKeywords}
            onChange={(e) => setManualKeywords(e.target.value)}
            disabled={state === 'loading'}
          />
        </div>
        <button
          className="kr-measure-btn"
          onClick={handleMeasure}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? '측정 중...' : '순위 측정'}
        </button>
      </div>

      {/* Status */}
      {state === 'loading' && (
        <div className="kr-status kr-status-loading">
          <span className="kr-spinner" />
          네이버 쇼핑 순위 측정 중... 잠시만 기다려주세요.
        </div>
      )}

      {/* Error */}
      {errorMsg && state !== 'loading' && (
        <div className="kr-status kr-status-error">
          {errorMsg}
        </div>
      )}

      {/* Results */}
      {result && result.keywords && result.keywords.length > 0 && (
        <div className="kr-results">
          {/* Product Info */}
          <div className="kr-product-info">
            <div className="kr-product-row">
              <span className="kr-product-label">상품명</span>
              <span className="kr-product-value">
                {result.productName || '추출 실패 (수동 키워드 사용)'}
              </span>
            </div>
            <div className="kr-product-row">
              <span className="kr-product-label">측정 시각</span>
              <span className="kr-product-value">
                {result.keywords[0]?.checkedAt ? formatTime(result.keywords[0].checkedAt) : '-'}
              </span>
            </div>
          </div>

          {/* Keyword Results */}
          <div className="kr-keyword-list">
            <div className="kr-keyword-header">
              <span>키워드</span>
              <span>현재 순위</span>
              <span>상태</span>
            </div>
            {result.keywords.map((item, i) => {
              const display = getRankDisplay(item);
              return (
                <div key={i} className="kr-keyword-row">
                  <span className="kr-keyword-name">{item.keyword}</span>
                  <span className={`kr-keyword-rank ${display.className}`}>
                    {display.text}
                  </span>
                  <span className={`kr-keyword-status kr-status-${item.status}`}>
                    {item.status === 'found' ? '노출' : item.status === 'not_found' ? '미노출' : '오류'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* First Measurement Notice */}
          <div className="kr-notice">
            오늘 첫 측정입니다. 전일 대비는 다음 측정부터 표시됩니다.
          </div>

          {/* Action Suggestions */}
          {result.keywords.some(k => k.status === 'not_found') && (
            <div className="kr-suggestions">
              <span className="kr-suggest-title">추천 액션</span>
              <div className="kr-suggest-list">
                <span className="kr-suggest-item">키워드 후보 다시 뽑기</span>
                <span className="kr-suggest-item">롱테일 키워드 생성</span>
              </div>
            </div>
          )}
          {result.keywords.some(k => k.status === 'found' && k.rank !== null && k.rank > 30) && (
            <div className="kr-suggestions">
              <span className="kr-suggest-title">순위 개선 제안</span>
              <div className="kr-suggest-list">
                <span className="kr-suggest-item">상품명 개선안 만들기</span>
                <span className="kr-suggest-item">상세페이지 첫 문장 개선</span>
                <span className="kr-suggest-item">스레드 홍보글 만들기</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
