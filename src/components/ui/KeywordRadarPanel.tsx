import React, { useState } from 'react';

/* ── SEO-K.1.2 Keyword Radar Panel ──
   상품 링크 입력 → productId 추출 + nl-query 힌트 → 상품명 추출 보강 → 키워드 순위 측정 → 결과 표시
   상품명 추출 우선순위: og:title → title → json_ld → search_result → keyword_hint → manual → failed
   가짜 상품명/순위 표시 금지 / keyword_hint는 상품명이 아님을 정직하게 표시 */

type ProductNameSource =
  | 'og:title'
  | 'title'
  | 'json_ld'
  | 'search_result'
  | 'keyword_hint'
  | 'manual'
  | 'failed';

interface KeywordResult {
  keyword: string;
  rank: number | null;
  status: 'found' | 'not_found' | 'error';
  rankType?: 'organic_or_mixed' | 'unknown';
  checkedAt: string;
  source: string;
}

interface Diagnostics {
  productId: string | null;
  productIdExtracted: boolean;
  productNameResolved: boolean;
  productNameSource: ProductNameSource;
  keywordHint: string | null;
  checkedKeywords: number;
  maxRank: number;
  matchStrategy: string;
}

interface RadarResponse {
  success: boolean;
  productUrl: string;
  productName?: string;
  productNameSource?: ProductNameSource;
  keywords: KeywordResult[];
  diagnostics?: Diagnostics;
  message?: string;
}

type MeasureState = 'idle' | 'loading' | 'done' | 'error';

interface KeywordRadarPanelProps {
  onClose?: () => void;
}

// 상품명 출처 한국어 레이블
const SOURCE_LABEL: Record<ProductNameSource, string> = {
  'og:title': 'og:title',
  'title': 'title',
  'json_ld': 'JSON-LD',
  'search_result': '검색결과 역추출',
  'keyword_hint': '키워드 힌트',
  'manual': '수동 입력',
  'failed': '추출 실패',
};

// 상품명 출처 CSS 클래스
const SOURCE_CLASS: Record<ProductNameSource, string> = {
  'og:title': 'kr-source-html',
  'title': 'kr-source-html',
  'json_ld': 'kr-source-html',
  'search_result': 'kr-source-search',
  'keyword_hint': 'kr-source-hint',
  'manual': 'kr-source-manual',
  'failed': 'kr-source-failed',
};

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
      const body: Record<string, unknown> = { productUrl: productUrl.trim() };
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
    } catch (err: unknown) {
      setState('error');
      const msg = err instanceof Error ? err.message : '연결 실패';
      setErrorMsg(`네트워크 오류: ${msg}`);
    }
  };

  const getRankDisplay = (item: KeywordResult) => {
    if (item.status === 'found' && item.rank !== null) {
      if (item.rank <= 10) return { text: `${item.rank}위`, className: 'kr-rank-found kr-rank-top10' };
      if (item.rank <= 30) return { text: `${item.rank}위`, className: 'kr-rank-found kr-rank-top30' };
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

  // productId 마스킹 (앞 4자리만 표시)
  const maskProductId = (id: string | null | undefined): string => {
    if (!id) return '미추출';
    if (id.length <= 4) return id + '...';
    return id.slice(0, 4) + '...' + id.slice(-2);
  };

  // 상품명 표시 텍스트 결정
  const getProductNameDisplay = (
    productName: string | undefined,
    source: ProductNameSource | undefined
  ): { label: string; note: string; isHint: boolean } => {
    if (!source || source === 'failed') {
      return { label: '상품명 자동 추출 실패', note: 'manualKeywords 사용 중', isHint: false };
    }
    if (source === 'keyword_hint') {
      return {
        label: productName || '',
        note: '상품명 자동 추출 실패 / 검색 키워드 힌트 사용 중',
        isHint: true,
      };
    }
    return { label: productName || '', note: '', isHint: false };
  };

  const src = result?.productNameSource ?? result?.diagnostics?.productNameSource;
  const nameDisplay = getProductNameDisplay(result?.productName, src);

  return (
    <div className="kr-panel">
      {/* Header */}
      <div className="kr-header">
        <span className="kr-dot" />
        <span className="kr-title">KEYWORD RADAR</span>
        <span className="kr-badge">SEO-K.1.2</span>
        {onClose && (
          <button className="kr-close" onClick={onClose}>CLOSE</button>
        )}
      </div>

      {/* Input Section */}
      <div className="kr-input-section">
        <div className="kr-input-group">
          <label className="kr-label">
            상품 링크
            <span className="kr-label-hint"> (스마트스토어 상품 URL)</span>
          </label>
          <input
            type="text"
            className="kr-input"
            placeholder="https://smartstore.naver.com/{스토어}/products/{상품ID}"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            disabled={state === 'loading'}
          />
        </div>
        <div className="kr-input-group">
          <label className="kr-label">
            키워드 직접 입력
            <span className="kr-optional"> (선택 — 쉼표 구분, 최대 5개)</span>
          </label>
          <input
            type="text"
            className="kr-input"
            placeholder="예: 복숭아, 황도복숭아, 딱딱한복숭아"
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

      {/* Measurement Basis Notice */}
      <div className="kr-basis-notice">
        측정 기준: 네이버 쇼핑 검색 API (sim 정렬) / 최대 100위 / 광고 포함 혼합 결과
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

            {/* 구현 F: 상품명 + 출처 표시 */}
            <div className="kr-product-row">
              <span className="kr-product-label">상품명</span>
              <span className={`kr-product-value ${nameDisplay.isHint ? 'kr-name-hint' : ''}`}>
                {nameDisplay.label || '추출 실패'}
              </span>
            </div>

            {/* 구현 F: 상품명 출처 표시 */}
            {src && (
              <div className="kr-product-row">
                <span className="kr-product-label">상품명 출처</span>
                <span className={`kr-product-value kr-source-badge ${SOURCE_CLASS[src] || ''}`}>
                  {SOURCE_LABEL[src] || src}
                </span>
              </div>
            )}

            {/* keyword_hint 경고 메시지 */}
            {nameDisplay.isHint && (
              <div className="kr-product-row kr-hint-warning">
                <span className="kr-hint-warning-text">
                  ⚠ {nameDisplay.note}
                </span>
              </div>
            )}

            {/* 상품명 추출 실패 시 안내 */}
            {src === 'failed' && (
              <div className="kr-product-row kr-hint-warning">
                <span className="kr-hint-warning-text">
                  ⚠ 상품명 자동 추출 실패 — manualKeywords 사용 중
                </span>
              </div>
            )}

            {/* 상품 ID 표시 (마스킹) */}
            {result.diagnostics && (
              <div className="kr-product-row">
                <span className="kr-product-label">상품 ID</span>
                <span className={`kr-product-value kr-pid ${result.diagnostics.productIdExtracted ? 'kr-pid-ok' : 'kr-pid-fail'}`}>
                  {result.diagnostics.productIdExtracted
                    ? `${maskProductId(result.diagnostics.productId)} (추출됨)`
                    : '미추출 — 순위 측정 불가'}
                </span>
              </div>
            )}

            {/* nl-query 힌트 표시 */}
            {result.diagnostics?.keywordHint && (
              <div className="kr-product-row">
                <span className="kr-product-label">키워드 힌트</span>
                <span className="kr-product-value kr-hint">{result.diagnostics.keywordHint}</span>
              </div>
            )}

            <div className="kr-product-row">
              <span className="kr-product-label">측정 시각</span>
              <span className="kr-product-value">
                {result.keywords[0]?.checkedAt ? formatTime(result.keywords[0].checkedAt) : '-'}
              </span>
            </div>

            {/* 매칭 전략 표시 */}
            {result.diagnostics?.matchStrategy && (
              <div className="kr-product-row">
                <span className="kr-product-label">매칭 방식</span>
                <span className="kr-product-value kr-match-strategy">
                  {result.diagnostics.matchStrategy}
                </span>
              </div>
            )}
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
                    {item.status === 'found' ? '노출' : item.status === 'not_found' ? '100위 밖' : '오류'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Rank Type Notice */}
          <div className="kr-rank-type-notice">
            ※ 순위 기준: 네이버 쇼핑 검색 API (광고 포함 혼합 결과 / organic_or_mixed)
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

      {/* productId 미추출 경고 */}
      {result && result.diagnostics && !result.diagnostics.productIdExtracted && result.keywords.length === 0 && (
        <div className="kr-status kr-status-error">
          상품 ID를 추출할 수 없습니다.<br />
          URL 형식: smartstore.naver.com/{'{스토어}'}/products/{'{숫자ID}'}
        </div>
      )}
    </div>
  );
}
