# OUTREACH 수집 로직 변경 설계

## 현재 문제
- `handleOutreachCollect`에서 `keyword` (예: "옥수수", "복숭아")를 YouTube search.list의 `q` 파라미터에 직접 넣어 검색
- 상품명을 카테고리처럼 취급하여 후보 풀이 좁음
- "옥수수 유튜버"라는 카테고리는 YouTube에 존재하지 않음

## 새로운 설계

### 1. YouTube 공식 카테고리 기반 수집
- YouTube Data API `videoCategories.list` (regionCode=KR)로 유효 카테고리 목록 조회
- 실전 세그먼트 매핑: 먹방, 캠핑, 요리, 주부/살림, 건강식, 지역여행 등
- API quota 고려: 카테고리별 소량 수집 → 적합도 높은 카테고리만 확장

### 2. 검색 전략 변경
- 기존: `q=옥수수 유튜버` → 직접 검색
- 변경: 실전 세그먼트별 검색어로 넓게 수집 후, productName으로 적합도 평가
  - 예: productName=옥수수 → "캠핑 먹방", "제철 먹거리", "요리 레시피", "간식 리뷰" 등으로 검색
  - 각 후보에 대해 fitScore/fitReason 계산 시 productName 활용

### 3. 실전 세그먼트 정의
```
PRACTICAL_SEGMENTS = {
  먹방: ['먹방', '대식가', 'mukbang', '맛집'],
  캠핑: ['캠핑', '차박', '캠핑요리', '캠핑장'],
  요리: ['요리', '레시피', '집밥', '쿠킹'],
  주부살림: ['살림', '주부', '육아맘', '가족일상', '장보기'],
  건강식: ['건강', '다이어트', '식단', '건강식'],
  지역여행: ['여행', '지역', '로컬', '산지'],
  제철먹거리: ['제철', '농산물', '산지직송', '로컬푸드'],
}
```

### 4. API 호출 전략 (quota 관리)
- YouTube search.list: 100 units/call
- YouTube channels.list: 1 unit/call
- videoCategories.list: 1 unit/call
- 일일 할당량: 10,000 units (기본)

**전략:**
1. 1차: 실전 세그먼트별 검색 (상위 3-4개 세그먼트만, 각 maxResults=10)
   - 총 3-4 calls × 100 units = 300-400 units
2. 2차: channels.list로 상세 정보 + 이메일 추출
   - 총 3-4 calls × 1 unit = 3-4 units
3. 총 예상: ~400 units/요청

### 5. 이메일 조건 유지
- requireEmail=true 시 email_public 상태인 후보만 최종 카운트
- 이메일 없는 후보는 제외 (부족 보고)
- 문의 링크만 있는 후보도 "이메일 있는" 조건에 불포함
- 가짜 이메일/추정 이메일 생성 금지

### 6. 결과 보고 형식
```
요청 조건: 이메일 있는 옥수수 공동구매 후보 20명
탐색 카테고리: YouTube KR 공식 카테고리 전체
이메일 확인 후보: 17명 / 20명
부족 인원: 3명
제외 후보: 이메일 없음 28명, 문의 링크만 있음 6명
주요 세그먼트: 캠핑 5명, 먹방 4명, 요리 3명, 주부/살림 3명, 지역/여행 2명
저장 위치: Google Sheets influencer_candidates 탭
다음 행동: 추가 수집 / 제안 메일 초안 만들기 / 제외 후보 보기 / 카테고리별 보기
```

### 7. Google Sheets 저장 필드 확장
- campaignId, productName, youtubeCategoryId, youtubeCategoryName
- practicalSegment, seedKeyword
- channelName, channelUrl, email, emailStatus, emailSource, contactLink
- subscriberCount, recentViews, recentContentTitle
- fitScore, fitReason, excludedReason
- status, createdAt, updatedAt
