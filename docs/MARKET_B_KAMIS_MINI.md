# Phase Market-B-1: KAMIS API Mini 연동

## 개요

KAMIS(농산물유통정보) 공공 API를 자비스에 연동하여, 대표님이 음성/텍스트로 농산물 시장가격을 즉시 조회할 수 있도록 구현한 기능입니다.

## 지원 품목

| 품목 | KAMIS 코드 | 카테고리 | 비고 |
|------|-----------|---------|------|
| 배추 | 211 | 200 (채소류) | 소매 기준 |
| 양파 | 226 | 200 (채소류) | 소매 기준 |
| 대파 | 246 | 200 (채소류) | 소매 기준 |
| 당근 | 232 | 200 (채소류) | 소매 기준 |
| 시금치 | 248 | 200 (채소류) | 소매 기준 |
| 감자 | 152 | 100 (식량작물) | 소매 기준 |
| 고구마 | 151 | 100 (식량작물) | 소매 기준 |
| 사과 | 411 | 400 (과일류) | 소매 기준 |
| 배 | 412 | 400 (과일류) | 소매 기준 |
| 쌀 | 111 | 100 (식량작물) | 소매 기준 |
| 절임배추 | - | - | 배추 원물가 참고 (proxy) |
| 옥수수 | 225 | 200 | 비수확기(5월) 데이터 없음 |

## 사용 가능한 명령어

```
배추 가격 어때?
절임배추 시세 알려줘
양파 도매 가격
시장가격 알려줘 (기본: 배추)
옥수수 가격 확인
```

## API 엔드포인트

### 요청

```
POST /api/cloud-proxy
Content-Type: application/json

{
  "taskType": "kamis-mini",
  "params": {
    "item": "배추"
  }
}
```

### 응답 구조

```json
{
  "success": true,
  "item": "배추",
  "data": {
    "item_name": "배추",
    "kind": "월동(1포기)",
    "rank": "상품",
    "unit": "1포기",
    "today": "-",
    "day1": "3,360",
    "week1": "3,508",
    "month1": "4,544",
    "year1": "5,295",
    "average": "5,105",
    "direction": "N/A"
  },
  "source": "KAMIS",
  "date": "2026-05-07"
}
```

## 아키텍처

```
사용자 명령
  → jarvis-brain.ts (deterministicMatch: kamis_price)
  → JarvisApp.tsx (kamis_price 핸들러)
  → POST /api/cloud-proxy { taskType: "kamis-mini" }
  → handleKamisMini()
    → KAMIS dailyPriceByCategoryList API 호출
    → Google Sheets 저장 (자동)
    → Market Intel 텔레메트리 이벤트 발행
  → 프론트엔드 응답 표시
  → Market Intel 패널 업데이트
```

## 브리핑 통합

`오늘 브리핑 해줘` 명령 시 Step 2에서 KAMIS 데이터를 자동 수집합니다.

- 기존: `/api/market-intelligence` (아카이브됨)
- 현재: `POST /api/cloud-proxy { taskType: "kamis-mini", params: { item: "배추" } }`

브리핑 DAILY BRIEFING 카드에 시장가격 정보가 포함되고, Market Intel 패널이 자동 업데이트됩니다.

## Google Sheets 저장

KAMIS 조회 결과는 자동으로 Google Sheets에 저장됩니다.

- 시트: `jarvis_workspace`
- 헤더: `timestamp | type | title | content | metadata`
- type: `kamis_price`
- 저장 조건: API 응답 성공 시 자동

## Market Intel 패널 연동

KAMIS 조회 시 텔레메트리 이벤트가 발행되어 Market Intel 패널이 업데이트됩니다.

- MAX / AVG / MIN 가격 표시
- MA5 / MA20 이동평균
- HOLD / BUY / SELL 시그널 (전월대비 기준)

## 환경변수

| 변수명 | 설명 | 필수 |
|--------|------|------|
| KAMIS_API_KEY | KAMIS 공공 API 인증키 | ✅ |
| KAMIS_CERT_ID | KAMIS 요청자 ID | ✅ |

## 제한사항

1. KAMIS `dailyPriceByCategoryList` API는 당일 데이터가 오후에 업데이트되므로, 오전 조회 시 당일 가격이 `-`로 표시될 수 있습니다.
2. 비수확기 품목(예: 5월 옥수수)은 KAMIS에 데이터가 없어 "데이터 부족" 메시지가 반환됩니다.
3. 절임배추는 KAMIS에 별도 품목이 없어 배추 원물가를 참고값으로 제공합니다.

## 보안

- KAMIS_API_KEY, KAMIS_CERT_ID는 Vercel 환경변수로만 관리
- 프론트엔드/로그/보고서에 키 값 노출 금지
- debug 엔드포인트는 프로덕션에서 차단됨

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-05-07 | Phase Market-B-1 초기 구현 완료 |
| 2026-05-07 | 옥수수 카테고리 수정 (200→100), 데이터 부족 시 명확 메시지 |
| 2026-05-07 | KAMIS 품목 → market-price-check 우회 로직 추가 |
