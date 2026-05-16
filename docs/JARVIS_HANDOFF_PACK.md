# JARVIS 프로젝트 인수인계 문서 (Handoff Pack)

본 문서는 JARVIS 프로젝트의 아키텍처, API 연동 방식, 주요 수정 이력 및 운영 가이드를 정리한 공식 인수인계 문서입니다. 보안 원칙에 따라 민감한 정보는 제외되었습니다.

## 1. 프로젝트 개요

JARVIS는 스마트스토어 주문 현황 조회, 인플루언서 수집, 이메일 발송 등 다양한 업무를 자동화하는 AI 비서 웹 애플리케이션입니다. React 기반의 프론트엔드와 Vercel Serverless Functions 기반의 백엔드로 구성되어 있습니다.

이 시스템은 네이버 커머스 API를 활용하여 신규주문, 배송준비, 배송중, 배송완료, 구매확정 건수를 실시간 및 정밀 동기화 방식으로 조회합니다. 또한 네이버 블로그/카페, 인스타그램, 유튜브 등에서 인플루언서 정보를 수집하고 Google Sheets에 저장하며, 수집된 인플루언서에게 협업 제안 이메일을 발송하는 기능을 포함합니다. 음성 대화 지원을 위해 Whisper API(STT)와 ElevenLabs API(TTS)를 활용하고 있습니다.

## 2. 시스템 아키텍처

프론트엔드는 React와 Vite를 기반으로 구축되었으며, 주요 컴포넌트로는 `JarvisApp.tsx`, `OrderDashboard.tsx`, `DataWallView.tsx`, `SmartstoreCommandCenter.tsx` 등이 있습니다. 상태 관리는 React Context API와 LocalStorage를 활용하며, `src/lib/cloud-api.ts`를 통해 백엔드 API와 통신합니다.

백엔드는 Vercel Serverless Functions 환경에서 동작합니다. 주요 라우터인 `api/cloud-proxy.ts`가 스마트스토어 API 프록시 및 비즈니스 로직 처리를 담당합니다. 네이버 커머스 API 호출 시 고정 IP를 제공하기 위해 QuotaGuard Static 프록시를 사용하며, 메모리 캐시를 활용하여 API 호출 빈도를 줄이고 응답 속도를 향상시킵니다.

## 3. 스마트스토어 API 연동 (cloud-proxy.ts)

최근 발생한 배송준비 건수 불일치 및 504 Timeout 문제를 해결하기 위해 `cloud-proxy.ts`의 로직이 대폭 개선되었습니다.

### 3.1 주요 변경 사항 (SMARTSTORE-ORDERS-FIX.11 시리즈)

기존에는 결제일 기준(`PAYED_DATETIME`)으로 조회하는 `fetchOrderIds` 방식을 사용했으나, 과거에 결제되었으나 최근에 상태가 변경된 주문을 놓치는 문제가 있었습니다. 이를 해결하기 위해 상태 변경일 기준(`last-changed-statuses`)으로 조회하는 `getLastChangedItems` 방식으로 전환하여 현재 PAYED 상태인 모든 주문을 포착하도록 개선했습니다.

안정성과 속도를 개선하기 위해 `BATCH_SIZE`를 파라미터화했습니다. PAYED 조회 시에는 안정성을 우선하여 3으로 설정하고, `deep_sync` 시에는 속도를 우선하여 7로 설정했습니다. 또한 API 호출 실패 시 Exponential Backoff를 적용하여 최대 3회 재시도하도록 로직을 강화했으며, `deep_sync` 범위를 90일에서 60일로 축소하여 Vercel 60초 Timeout을 방지했습니다.

### 3.2 데이터 기준

스마트스토어 데이터는 다음과 같은 기준으로 분류됩니다.

| 구분 | 기준 |
|---|---|
| 오늘 신규주문 | KST 오늘 날짜 기준 신규 결제 주문 |
| 현재 신규주문 | `productOrderStatus=PAYED` + `placeOrderStatus=NOT_YET` |
| 배송준비 | `productOrderStatus=PAYED` + `placeOrderStatus=OK` |
| 배송 전 처리 대상 전체 | 현재 신규주문 + 배송준비 |

## 4. 운영 가이드

Vercel 대시보드에서 `SMARTSTORE_CLIENT_ID`, `SMARTSTORE_CLIENT_SECRET`, `QUOTAGUARDSTATIC_URL`, `GOOGLE_SHEETS_CREDENTIALS`, `VITE_GEMINI_API_KEY`, `OPENAI_API_KEY`, `VITE_ELEVENLABS_API_KEY` 등의 환경 변수를 관리해야 합니다.

배포는 GitHub 리포지토리에 Push하면 Vercel에서 자동으로 이루어집니다. 배포 후에는 반드시 실제 사용 링크(https://mawinpay-jarvis.vercel.app/)에서 테스트를 진행하여 정상 작동 여부를 확인해야 합니다.

API Timeout 발생 시 `cloud-proxy.ts`의 `BATCH_SIZE` 또는 조회 일수(`days`)를 조정하여 해결할 수 있으며, 인증 오류 발생 시 환경 변수 설정 및 QuotaGuard 프록시 상태를 확인해야 합니다.

## 5. 작업 모드 및 보안 원칙

작업 모드는 `observe` (조회), `draft` (초안 생성), `execute` (실행)로 구분되며, 실행 작업은 반드시 대표 승인 후 진행해야 합니다. 보안 원칙에 따라 API Key, Token, 고객 개인정보 등 민감한 정보는 절대 출력하거나 저장하지 않아야 합니다.

---
*작성자: Manus AI*
*작성일: 2026-05-16*
