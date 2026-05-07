# YouTube OAuth 설정 가이드 (미완료 — 추후 진행)

**상태:** 대기 (OAuth 클라이언트 ID 생성 완료, 기능 구현 미진행)
**생성일:** 2026-05-07

## 1. 완료된 항목

- Google Cloud Console에서 OAuth 클라이언트 ID 생성 완료
- 프로젝트: `jarvis-youtube-api-2`
- 애플리케이션 유형: 웹 애플리케이션
- 이름: `웹 클라이언트 1`
- 승인된 JavaScript 원본: `https://mawinpay-jarvis.vercel.app`
- 승인된 리디렉션 URI: `https://mawinpay-jarvis.vercel.app/api/auth/callback/google`
- JSON 파일: `credentials/youtube-oauth-client.json` (gitignore 처리됨)

## 2. 추후 진행할 작업

1. Vercel 환경변수 추가:
   - `YOUTUBE_OAUTH_CLIENT_ID`
   - `YOUTUBE_OAUTH_CLIENT_SECRET`

2. OAuth 동의 화면에서 스코프 추가:
   - `https://www.googleapis.com/auth/youtube.force-ssl` (댓글 작성)
   - `https://www.googleapis.com/auth/youtube.upload` (동영상 업로드)

3. OAuth 콜백 API 엔드포인트 생성:
   - `/api/auth/callback/google`

4. JARVIS 명령어 추가:
   - "내 영상에 댓글 달아줘"
   - "동영상 업로드해줘"

## 3. 보안 참고

- client_secret은 절대 코드나 채팅에 노출하지 않음
- credentials/ 폴더는 .gitignore에 등록됨
- 실제 배포 시 Vercel 환경변수로만 관리
