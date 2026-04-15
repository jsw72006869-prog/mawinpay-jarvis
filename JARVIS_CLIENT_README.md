# JARVIS PC Control Client

MAWINPAY JARVIS 웹 앱에서 음성 명령으로 로컬 PC를 제어하는 Python 클라이언트입니다.

## 빠른 시작

### 1. 패키지 설치

```bash
pip install websockets psutil pyautogui
```

### 2. 클라이언트 실행

```bash
python jarvis_client.py
```

### 3. JARVIS에게 명령

브라우저에서 JARVIS를 활성화(박수 2번)하고 말하세요:

| 명령 예시 | 동작 |
|-----------|------|
| "메모장 열어줘" | 메모장 실행 |
| "크롬 열어줘" | Chrome 브라우저 실행 |
| "유튜브 열어줘" | YouTube 브라우저에서 열기 |
| "CPU 사용률 알려줘" | 시스템 정보 보고 |
| "화면 캡처해줘" | 스크린샷 저장 |
| "볼륨 올려줘" | 볼륨 10% 증가 |
| "볼륨 내려줘" | 볼륨 10% 감소 |
| "음소거해줘" | 음소거 |

## 지원 앱 목록

- 메모장, 계산기, 크롬, 파이어폭스
- 파일 탐색기, 터미널, 작업 관리자
- Microsoft Office (Word, Excel, PowerPoint)
- VS Code, Steam, KakaoTalk, Slack, Discord, Zoom

## 지원 웹사이트

유튜브, 구글, 네이버, 카카오, 깃허브, 인스타그램, 페이스북, 트위터, 지메일, ChatGPT

## 시스템 요구사항

- Python 3.8+
- Windows / macOS / Linux
- MAWINPAY JARVIS 웹 앱 (https://mawinpay-jarvis.vercel.app)

## 작동 원리

```
JARVIS 웹 앱 (브라우저)
    ↓ 음성 명령 인식
    ↓ GPT-4o 처리
    ↓ WebSocket 명령 전송
jarvis_client.py (로컬 PC)
    ↓ 명령 수신 및 실행
    ↓ 결과 반환
JARVIS 웹 앱 (음성으로 결과 보고)
```

## 주의사항

- 클라이언트는 로컬 PC에서만 실행됩니다
- 웹소켓 서버는 JARVIS 웹 앱이 WebSocket 서버 기능을 활성화해야 합니다
- 현재 버전은 로컬 네트워크 내에서만 작동합니다

---

*Powered by MAWINPAY Intelligence System*
