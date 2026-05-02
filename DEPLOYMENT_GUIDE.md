# Jarvis 배포 환경 안정성 및 API 키 설정 가이드

## 개요

본 가이드는 Vercel 프로덕션 환경에서 Jarvis 애플리케이션을 안정적으로 배포하고 운영하기 위한 환경 변수 설정, API 키 관리, 그리고 문제 진단 방법을 설명합니다.

## 1. 필수 환경 변수 설정

### 1.1 Vercel 환경 변수 설정

Vercel 대시보드에서 다음 환경 변수를 설정해야 합니다:

#### SmartStore API 인증
```
SMARTSTORE_CLIENT_ID=<네이버 커머스 API 클라이언트 ID>
SMARTSTORE_CLIENT_SECRET=<네이버 커머스 API 클라이언트 시크릿>
QUOTAGUARDSTATIC_URL=http://<사용자명>:<비밀번호>@us-east-static-02.quotaguard.com:9293
```

**설정 방법:**
1. Vercel 프로젝트 대시보드 접속
2. Settings → Environment Variables
3. 위 변수들을 추가
4. 프로덕션, 프리뷰, 개발 환경 모두에 적용 확인

#### Google Sheets 인증
```
GOOGLE_SHEETS_CREDENTIALS=<Google Service Account JSON (한 줄로 변환)>
```

**Google Service Account 생성:**
1. Google Cloud Console 접속
2. 새 프로젝트 생성
3. Sheets API 활성화
4. Service Account 생성
5. JSON 키 다운로드
6. JSON 내용을 한 줄로 변환 (줄바꿈 제거)
7. Vercel 환경 변수에 추가

**JSON 한 줄 변환 예시:**
```bash
# 원본 JSON (여러 줄)
{
  "type": "service_account",
  "project_id": "...",
  ...
}

# 한 줄로 변환
{"type":"service_account","project_id":"..."}
```

#### Gemini API 키
```
VITE_GEMINI_API_KEY=<Google Gemini API 키>
```

**Gemini API 키 발급:**
1. [Google AI Studio](https://aistudio.google.com) 접속
2. "Get API Key" 클릭
3. 새 프로젝트에서 API 키 생성
4. Vercel 환경 변수에 추가

#### OpenAI API 키 (Whisper STT)
```
VITE_OPENAI_API_KEY=<OpenAI API 키>
```

#### ElevenLabs API 키 (TTS)
```
VITE_ELEVENLABS_API_KEY=<ElevenLabs API 키>
```

### 1.2 로컬 개발 환경 설정

프로젝트 루트에 `.env.local` 파일 생성:

```bash
# .env.local
VITE_GEMINI_API_KEY=your_gemini_key_here
VITE_OPENAI_API_KEY=your_openai_key_here
VITE_ELEVENLABS_API_KEY=your_elevenlabs_key_here
VITE_BOOKING_SERVER_URL=https://jarvis-booking-server-production.up.railway.app

# 백엔드 전용 (Node.js)
SMARTSTORE_CLIENT_ID=your_smartstore_client_id
SMARTSTORE_CLIENT_SECRET=your_smartstore_client_secret
QUOTAGUARDSTATIC_URL=http://user:pass@us-east-static-02.quotaguard.com:9293
GOOGLE_SHEETS_CREDENTIALS={"type":"service_account",...}
```

## 2. API 키 안정성 검증

### 2.1 debug-token.js를 통한 진단

SmartStore API 인증 상태를 확인하려면:

```bash
# 프로덕션 환경
curl https://your-vercel-app.vercel.app/api/debug-token

# 로컬 환경
curl http://localhost:5173/api/debug-token
```

**응답 예시:**
```json
{
  "envCheck": {
    "SMARTSTORE_CLIENT_ID": "exists",
    "SMARTSTORE_CLIENT_SECRET": "exists",
    "QUOTAGUARDSTATIC_URL": "exists"
  },
  "serverIP_direct": "203.0.113.1",
  "serverIP_proxy": "198.51.100.1",
  "tokenResult": {
    "status": 200,
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "timestamp": "2026-05-02T12:34:56.789Z"
}
```

**진단 항목:**
- `envCheck`: 필수 환경 변수 존재 여부
- `serverIP_direct`: 프록시 없이 직접 연결 시 IP
- `serverIP_proxy`: QuotaGuard 프록시 경유 시 IP
- `tokenResult`: SmartStore API 토큰 발급 성공 여부

### 2.2 morning-briefing-v2 API 테스트

```bash
# 프로덕션 환경
curl https://your-vercel-app.vercel.app/api/morning-briefing-v2

# 로컬 환경
curl http://localhost:5173/api/morning-briefing-v2
```

**응답 확인 항목:**
- `success` 또는 `partialSuccess` 플래그
- `smartstore` 데이터 (신규 주문, 배송 대기, 매출)
- `influencers` 데이터 (누적 인원, 어제 신규)
- `actionLogs` (각 단계별 진행 상황)

## 3. 환경 변수 주입 문제 해결

### 3.1 "API Key Missing" 오류 원인 분석

**가능한 원인:**

1. **환경 변수 미설정**
   - Vercel 대시보드에서 변수 미추가
   - 변수명 오타 (예: `VITE_GEMINI_API_KEY` vs `VITE_GEMINI_KEY`)

2. **환경 변수 스코프 오류**
   - 프로덕션 환경에만 설정되고 프리뷰/개발 환경에 미설정
   - 배포 후 변수 추가 시 재배포 필요

3. **프론트엔드 vs 백엔드 변수 혼동**
   - 프론트엔드: `VITE_` 접두사 필수
   - 백엔드: 접두사 없음

### 3.2 해결 방법

**Step 1: 환경 변수 재확인**
```bash
# Vercel 대시보드에서 확인
1. Settings → Environment Variables
2. 모든 변수가 올바르게 설정되었는지 확인
3. 프로덕션 환경에 체크 표시 확인
```

**Step 2: 재배포**
```bash
# 로컬에서 강제 재배포
git push origin main

# 또는 Vercel 대시보드에서 "Redeploy" 클릭
```

**Step 3: 빌드 로그 확인**
```bash
# Vercel 대시보드 → Deployments → 해당 배포 → Build Logs
# 환경 변수 로딩 오류 확인
```

## 4. 프록시 설정 (QuotaGuard)

### 4.1 QuotaGuard 프록시 구성

SmartStore API는 고정 IP를 요구하므로 QuotaGuard 프록시를 사용합니다.

**설정 단계:**

1. **QuotaGuard Static 가입**
   - [quotaguard.com](https://www.quotaguard.com) 접속
   - 계정 생성 및 Static IP 플랜 구독

2. **자격증명 확인**
   - 대시보드에서 프록시 URL 확인
   - 형식: `http://username:password@us-east-static-02.quotaguard.com:9293`

3. **Vercel 환경 변수 설정**
   ```
   QUOTAGUARDSTATIC_URL=http://username:password@us-east-static-02.quotaguard.com:9293
   ```

### 4.2 프록시 연결 테스트

```bash
# debug-token.js 응답에서 serverIP_proxy 확인
curl https://your-vercel-app.vercel.app/api/debug-token

# 응답의 serverIP_proxy가 QuotaGuard 고정 IP와 일치하는지 확인
```

## 5. Google Sheets 연동 검증

### 5.1 sheets-read API 테스트

```bash
curl https://your-vercel-app.vercel.app/api/sheets-read
```

**성공 응답:**
```json
{
  "summary": {
    "influencers": [...],
    "emails": [...],
    "naver": [...]
  },
  "contextText": "인플루언서 누적: N명..."
}
```

**실패 원인:**
- `GOOGLE_SHEETS_CREDENTIALS` 환경 변수 미설정
- Google Service Account 권한 부족
- 스프레드시트 공유 권한 미설정

### 5.2 권한 설정

1. **Google Cloud Console에서 Service Account 이메일 확인**
   - 형식: `service-account@project-id.iam.gserviceaccount.com`

2. **Google Sheets에서 공유 설정**
   - 스프레드시트 열기
   - 공유 버튼 클릭
   - Service Account 이메일 추가
   - 편집자 권한 부여

## 6. 모니터링 및 로깅

### 6.1 Vercel 로그 확인

```bash
# 실시간 로그 확인
vercel logs --tail

# 특정 함수의 로그 확인
vercel logs --tail api/morning-briefing-v2
```

### 6.2 에러 추적

**morning-briefing-v2 에러 로그 해석:**

```
[morning-briefing-v2] [SMARTSTORE] fail: 스마트스토어 조회 실패: ECONNREFUSED
→ SmartStore API 연결 실패 (네트워크/인증 문제)

[morning-briefing-v2] [SHEETS] fail: 구글 시트 조회 실패: 401 Unauthorized
→ Google Sheets 인증 실패 (자격증명 문제)

[morning-briefing-v2] [BRIEFING] success: 모닝 브리핑 데이터 통합 완료
→ 정상 완료
```

## 7. 배포 체크리스트

배포 전 다음 항목을 확인하세요:

- [ ] 모든 필수 환경 변수 설정됨
- [ ] `debug-token.js` 테스트 성공
- [ ] `morning-briefing-v2` API 테스트 성공
- [ ] `sheets-read` API 테스트 성공
- [ ] Gemini API 키 유효함
- [ ] OpenAI API 키 유효함
- [ ] ElevenLabs API 키 유효함
- [ ] QuotaGuard 프록시 연결 확인됨
- [ ] Google Service Account 권한 설정됨
- [ ] 로컬 개발 환경에서 정상 작동 확인됨

## 8. 트러블슈팅

### 문제: "API Key Missing" 오류

**해결 방법:**
1. Vercel 대시보드에서 환경 변수 재확인
2. 변수명 정확성 확인 (대소문자 구분)
3. 재배포 실행

### 문제: SmartStore API 연결 실패

**해결 방법:**
1. `debug-token.js` 실행하여 토큰 발급 확인
2. QuotaGuard 프록시 연결 상태 확인
3. `SMARTSTORE_CLIENT_ID`, `SMARTSTORE_CLIENT_SECRET` 유효성 확인

### 문제: Google Sheets 데이터 미수집

**해결 방법:**
1. `sheets-read` API 테스트
2. Service Account 권한 확인
3. 스프레드시트 공유 설정 확인
4. `GOOGLE_SHEETS_CREDENTIALS` 형식 검증

### 문제: 모닝 브리핑 부분 실패

**해결 방법:**
1. `morning-briefing-v2` 응답에서 `actionLogs` 확인
2. 실패한 단계별 원인 파악
3. 해당 API 개별 테스트

## 결론

Jarvis 애플리케이션의 안정적인 배포를 위해서는 환경 변수의 정확한 설정과 각 API의 주기적인 검증이 필수입니다. 본 가이드의 진단 도구와 체크리스트를 활용하여 문제를 사전에 방지하고 빠르게 해결할 수 있습니다.
