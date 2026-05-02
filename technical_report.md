# Jarvis 웹 애플리케이션 기술 보고서 (v4.0)

## 1. 개요

본 보고서는 Jarvis 웹 애플리케이션의 현재 상태(v4.0)를 기술적으로 분석하고, 사용자 요구사항 대비 현재 구현 수준을 평가하며, 향후 개선 방향을 제시합니다. 주요 목표는 애플리케이션을 '아이언맨 스타일'의 시각적으로 몰입감 있는 HUD로 전환하고, 실시간 비즈니스 데이터 동기화 및 안정적인 기능을 확보하는 것입니다.

## 2. 현재 진행 상황 및 구현 상세

### 2.1. UI/UX 전면 개편

기존의 방해되는 UI 요소(HoloDataPanel, Task Complete 바)는 제거되었으며, `PlatformDataCards` 컴포넌트는 활성 작업 중에만 중앙 코어 근처에 홀로그램 카드 형태로 나타나도록 재설계되었습니다. 이는 사용자 경험을 저해하지 않으면서 시각적 몰입감을 높이기 위한 조치입니다.

- **제거된 요소**: `src/components/HoloDataPanel.tsx` (주석 처리 또는 삭제됨)
- **재설계된 요소**: `src/components/PlatformDataCards.tsx`
  - `PlatformDataCards.tsx`는 `framer-motion` 라이브러리를 활용하여 카드 등장 및 사라짐 애니메이션을 구현합니다. 현재 `initial`, `animate`, `exit` 속성을 통해 `opacity`, `scale`, `rotateY`, `x` 값의 변화를 주어 모핑 효과를 연출하고 있습니다. 예를 들어, `animate={{ opacity: 1, scale: 1, rotateY: 0, x: 180 }}`는 중앙 코어 우측에 카드를 배치하며 나타나는 애니메이션을 정의합니다.

### 2.2. 시스템 맵 독립성

`/mission-map` 경로는 독립적인 페이지로 배포되었으며, `BroadcastChannel` 및 `CustomEvent` 시스템을 통해 실시간 동기화를 구현합니다. 이는 메인 애플리케이션과 맵 간의 느슨한 결합을 통해 확장성과 유지보수성을 향상시킵니다.

- **주요 컴포넌트**: `src/components/NeuralMissionMap.tsx`, `src/lib/jarvis-telemetry.ts`
  - `jarvis-telemetry.ts`는 `BroadcastChannel`을 사용하여 `node_state`, `node_data`, `mission_log`, `briefing_sequence`와 같은 이벤트를 발행하고 구독합니다. 이를 통해 메인 앱과 미션 맵 간에 실시간으로 상태 및 데이터를 공유합니다.

### 2.3. API 및 로직 수정

Gemini API 키 로딩 문제는 해결되었으며, 오디오 중복 방지 로직이 구현되었습니다. 이는 `SpeechEngine.tsx`에서 이전 오디오를 중지한 후 새로운 음성을 시작하도록 하여 사용자 경험을 개선합니다.

- **Gemini API 키 로딩**: `src/components/JarvisApp.tsx`에서 `import.meta.env.VITE_GEMINI_API_KEY`를 통해 환경 변수에서 키를 로드하도록 처리됩니다. (참고: `JarvisApp.tsx` 202-204 라인)
- **오디오 중복 방지**: `src/components/SpeechEngine.tsx`의 `useTextToSpeech` 훅 내 `speak` 함수에서 `stopGlobalAudio()`를 호출하여 현재 재생 중인 오디오를 중단하고 새로운 음성을 시작합니다. (참고: `SpeechEngine.tsx` 625-626 라인)

### 2.4. 비즈니스 로직

'옥수수' 제품에 대한 원가 및 마진 계산 로직이 검증되었으며, 네이버 수수료 및 배송비 분석이 포함됩니다. 이는 `api/smartstore-process-order.js`와 같은 백엔드 API에서 처리됩니다.

- **관련 파일**: `api/smartstore-process-order.js` (세부 로직은 별도 분석 필요)

## 3. 'Smoke and Mirrors' 분석 및 개선 필요 사항

사용자의 불만족스러운 경험과 '모닝 브리핑'의 데이터 부정확성, 그리고 '아이언맨 HUD' 효과의 미흡함은 현재 시스템에 'Smoke and Mirrors' 요소가 존재함을 시사합니다. 다음은 주요 문제점과 개선이 필요한 부분입니다.

### 3.1. '모닝 브리핑' 데이터의 부정확성

현재 '모닝 브리핑'은 실제 데이터 연동에 있어 몇 가지 문제점을 가지고 있습니다.

- **Google Sheets 데이터 연동 부족**: `src/lib/jarvis-brain.ts` 파일 분석 결과, `getSheetDataContext()` 함수는 현재 캐시된 플레이스홀더 객체 `{ influencers: [], emails: [], naver: [] }`를 반환하며 실제 Google Sheets API를 호출하지 않습니다. 이로 인해 Gemini가 생성하는 브리핑 보고서의 인플루언서 현황 등은 실제 데이터가 아닌 빈 값 또는 정적인 데이터에 기반하게 됩니다. 이는 사용자에게 '실제 데이터가 흐르지 않는다'는 인상을 줄 수 있습니다.
- **이중화된 모닝 브리핑 로직**: 백엔드에는 `api/morning-briefing.js`와 `api/smartstore-automation.js` 내부에 `morning_report`라는 두 가지 독립적인 모닝 브리핑 구현이 존재합니다. `api/morning-briefing.js`는 SmartStore와 Google Sheets 데이터를 통합하려 시도하지만, `api/smartstore-automation.js`의 `morning_report`는 SmartStore 데이터만을 기반으로 경량화된 요약을 생성합니다. 이로 인해 프론트엔드에서 어떤 로직을 호출하느냐에 따라 다른 결과가 나올 수 있으며, 이는 데이터 일관성 문제를 야기할 수 있습니다.
  - `api/morning-briefing.js`는 `fetchOrders(1, ['PAYED'])`를 통해 오늘 신규 주문을 가져오고, `fetchOrders(7, ['PAYED'])`를 통해 배송 준비 중인 주문을 가져옵니다. 또한 `getGoogleAccessToken` 및 `readSheet` 함수를 통해 Google Sheets에서 인플루언서 데이터를 읽어오려 시도합니다. 그러나 `src/lib/jarvis-brain.ts`의 `getSheetDataContext()`가 실제 데이터를 제공하지 않으므로, 이 백엔드 로직이 프론트엔드와 완전히 연동되지 않을 가능성이 높습니다.
  - `api/_smartstore-auth.js`는 `SMARTSTORE_CLIENT_ID`와 `SMARTSTORE_CLIENT_SECRET` 환경 변수를 사용하여 SmartStore API 인증 토큰을 발급합니다. 이 환경 변수들이 Vercel 배포 환경에서 올바르게 주입되지 않으면 API 호출이 실패할 수 있습니다.

### 3.2. HUD 시각 효과의 미흡함

사용자는 '아이언맨 HUD' 효과에 대해 '더 많은 모핑'과 '홀로그램 존재감'을 요구하고 있습니다. 현재 `PlatformDataCards.tsx`는 `framer-motion`을 사용한 기본적인 애니메이션을 제공하지만, 사용자의 높은 미적 기대치를 충족시키기 위해서는 추가적인 시각 효과 개선이 필요합니다.

- **개선 방향**: 단순히 위치, 크기, 회전 변화를 넘어, 데이터 카드 자체의 질감, 빛 반사, 왜곡, 글리치 효과 등 더욱 복잡하고 동적인 셰이더 기반 애니메이션이나 파티클 효과를 통합하여 '모핑' 및 '홀로그램' 느낌을 강화해야 합니다.

### 3.3. API 키 안정성 문제

Vercel 프로덕션 환경에서 'API Key Missing' 오류가 발생한다는 보고는 환경 변수 주입 및 관리의 불안정성을 시사합니다. `api/_smartstore-auth.js`와 `src/components/SpeechEngine.tsx` (OpenAI API 키) 모두 환경 변수에 의존하므로, 배포 파이프라인에서 이 변수들이 올바르게 설정되고 접근 가능한지 확인해야 합니다.

- **진단 도구**: `api/debug-token.js`는 SmartStore API 인증 및 프록시 연결 문제를 진단하는 데 유용합니다. 이 엔드포인트를 통해 `SMARTSTORE_CLIENT_ID`, `SMARTSTORE_CLIENT_SECRET`, `QUOTAGUARDSTATIC_URL`의 존재 여부와 실제 토큰 발급 성공 여부를 확인할 수 있습니다.

## 4. 결론 및 향후 권고 사항

Jarvis 웹 애플리케이션은 cleaner HUD와 독립적인 미션 맵 등 상당한 진전을 이루었지만, 핵심 기능인 '모닝 브리핑'의 데이터 신뢰성과 '아이언맨 HUD'의 시각적 완성도 측면에서 개선이 시급합니다. 특히, 백엔드와 프론트엔드 간의 데이터 연동 불일치와 환경 변수 관리 문제는 최우선적으로 해결해야 할 과제입니다.

**권고 사항:**

1.  **'모닝 브리핑' 데이터 통합 및 검증**: `src/lib/jarvis-brain.ts`의 `getSheetDataContext()`가 실제 Google Sheets 데이터를 가져오도록 수정하고, `api/morning-briefing.js`와 `api/smartstore-automation.js` 간의 모닝 브리핑 로직을 단일화하여 데이터 일관성을 확보해야 합니다.
2.  **HUD 시각 효과 심화**: `PlatformDataCards.tsx`의 애니메이션을 `Three.js` 또는 커스텀 셰이더와 연동하여 더욱 복잡하고 동적인 모핑/홀로그램 효과를 구현해야 합니다.
3.  **환경 변수 관리 강화**: Vercel 배포 환경에서 모든 API 키 및 민감 정보가 안전하고 일관되게 주입되는지 확인하고, `api/debug-token.js`와 같은 진단 도구를 활용하여 문제를 사전에 방지해야 합니다.

이러한 개선을 통해 Jarvis는 사용자 기대에 부응하는 진정한 '아이언맨 스타일' AI 비서로 거듭날 수 있을 것입니다.

---

**작성자**: Manus AI
**작성일**: 2026년 5월 2일
