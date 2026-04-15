#!/usr/bin/env python3
"""
JARVIS PC Control Client
========================
MAWINPAY JARVIS 웹 앱과 연동하여 로컬 PC를 제어하는 Python 클라이언트입니다.

사용법:
  1. 패키지 설치:  pip install websockets pyautogui psutil requests
  2. 실행:         python jarvis_client.py
  3. 브라우저에서 JARVIS에게 "내 PC에서 [프로그램] 열어줘" 등 명령

지원 명령:
  - 프로그램 실행: "메모장 열어줘", "크롬 열어줘", "계산기 열어줘"
  - 파일 탐색기 열기: "파일 탐색기 열어줘"
  - 시스템 정보: "CPU 사용률 알려줘", "메모리 사용량 알려줘"
  - 스크린샷: "화면 캡처해줘"
  - 볼륨 조절: "볼륨 올려줘", "볼륨 내려줘", "음소거"
  - 웹 열기: "유튜브 열어줘", "구글 열어줘"
"""

import asyncio
import json
import os
import platform
import subprocess
import sys
import time
import webbrowser
from datetime import datetime
from pathlib import Path

try:
    import websockets
except ImportError:
    print("websockets 패키지가 없습니다. 설치 중...")
    subprocess.run([sys.executable, "-m", "pip", "install", "websockets"], check=True)
    import websockets

try:
    import psutil
except ImportError:
    print("psutil 패키지가 없습니다. 설치 중...")
    subprocess.run([sys.executable, "-m", "pip", "install", "psutil"], check=True)
    import psutil

# ── 설정 ──
JARVIS_WS_URL = "ws://localhost:8765"  # JARVIS 웹소켓 서버 주소
SCREENSHOT_DIR = Path.home() / "Pictures" / "JARVIS_Screenshots"
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

OS = platform.system()  # 'Windows', 'Darwin', 'Linux'

# ── 앱 실행 매핑 ──
APP_MAP = {
    # Windows
    "메모장": {"windows": "notepad.exe", "darwin": "TextEdit", "linux": "gedit"},
    "계산기": {"windows": "calc.exe", "darwin": "Calculator", "linux": "gnome-calculator"},
    "크롬": {"windows": "chrome.exe", "darwin": "Google Chrome", "linux": "google-chrome"},
    "파이어폭스": {"windows": "firefox.exe", "darwin": "Firefox", "linux": "firefox"},
    "파일탐색기": {"windows": "explorer.exe", "darwin": "Finder", "linux": "nautilus"},
    "파일 탐색기": {"windows": "explorer.exe", "darwin": "Finder", "linux": "nautilus"},
    "워드": {"windows": "WINWORD.EXE", "darwin": "Microsoft Word", "linux": "libreoffice --writer"},
    "엑셀": {"windows": "EXCEL.EXE", "darwin": "Microsoft Excel", "linux": "libreoffice --calc"},
    "파워포인트": {"windows": "POWERPNT.EXE", "darwin": "Microsoft PowerPoint", "linux": "libreoffice --impress"},
    "vscode": {"windows": "code.exe", "darwin": "Visual Studio Code", "linux": "code"},
    "터미널": {"windows": "cmd.exe", "darwin": "Terminal", "linux": "gnome-terminal"},
    "작업관리자": {"windows": "taskmgr.exe", "darwin": "Activity Monitor", "linux": "gnome-system-monitor"},
    "스팀": {"windows": "Steam.exe", "darwin": "Steam", "linux": "steam"},
    "카카오톡": {"windows": "KakaoTalk.exe", "darwin": "KakaoTalk", "linux": ""},
    "슬랙": {"windows": "slack.exe", "darwin": "Slack", "linux": "slack"},
    "디스코드": {"windows": "Discord.exe", "darwin": "Discord", "linux": "discord"},
    "줌": {"windows": "Zoom.exe", "darwin": "zoom.us", "linux": "zoom"},
}

# ── 웹 URL 매핑 ──
WEB_MAP = {
    "유튜브": "https://www.youtube.com",
    "구글": "https://www.google.com",
    "네이버": "https://www.naver.com",
    "카카오": "https://www.kakao.com",
    "깃허브": "https://www.github.com",
    "인스타그램": "https://www.instagram.com",
    "페이스북": "https://www.facebook.com",
    "트위터": "https://www.twitter.com",
    "지메일": "https://mail.google.com",
    "챗gpt": "https://chat.openai.com",
    "chatgpt": "https://chat.openai.com",
    "마누스": "https://manus.im",
    "mawinpay": "https://mawinpay-jarvis.vercel.app",
}


def get_system_info() -> dict:
    """시스템 정보 수집"""
    cpu = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    battery = psutil.sensors_battery() if hasattr(psutil, "sensors_battery") else None

    return {
        "cpu_percent": cpu,
        "memory_total_gb": round(mem.total / 1e9, 1),
        "memory_used_gb": round(mem.used / 1e9, 1),
        "memory_percent": mem.percent,
        "disk_total_gb": round(disk.total / 1e9, 1),
        "disk_used_gb": round(disk.used / 1e9, 1),
        "disk_percent": disk.percent,
        "battery_percent": battery.percent if battery else None,
        "battery_charging": battery.power_plugged if battery else None,
        "os": OS,
        "hostname": platform.node(),
        "python": platform.python_version(),
    }


def open_app(app_name: str) -> str:
    """앱 실행"""
    key = app_name.lower().replace(" ", "")
    for map_key, platforms in APP_MAP.items():
        if key in map_key.lower().replace(" ", "") or map_key.lower().replace(" ", "") in key:
            cmd = platforms.get(OS.lower(), "")
            if not cmd:
                return f"{app_name}은(는) 이 운영체제에서 지원되지 않습니다."
            try:
                if OS == "Windows":
                    subprocess.Popen(["start", cmd], shell=True)
                elif OS == "Darwin":
                    subprocess.Popen(["open", "-a", cmd])
                else:
                    subprocess.Popen([cmd])
                return f"{map_key}을(를) 실행했습니다."
            except Exception as e:
                return f"{app_name} 실행 실패: {e}"
    return f"{app_name}을(를) 찾을 수 없습니다. 직접 실행해 주세요."


def open_web(site_name: str) -> str:
    """웹사이트 열기"""
    key = site_name.lower().replace(" ", "")
    for map_key, url in WEB_MAP.items():
        if key in map_key.lower() or map_key.lower() in key:
            webbrowser.open(url)
            return f"{map_key}을(를) 브라우저에서 열었습니다."
    # URL 직접 입력인 경우
    if site_name.startswith("http"):
        webbrowser.open(site_name)
        return f"{site_name}을(를) 열었습니다."
    return f"{site_name}을(를) 찾을 수 없습니다."


def take_screenshot() -> str:
    """스크린샷 촬영"""
    try:
        import pyautogui
        filename = SCREENSHOT_DIR / f"jarvis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        screenshot = pyautogui.screenshot()
        screenshot.save(str(filename))
        return f"스크린샷을 저장했습니다: {filename}"
    except ImportError:
        # pyautogui 없으면 OS 기본 방법 사용
        if OS == "Darwin":
            filename = SCREENSHOT_DIR / f"jarvis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            subprocess.run(["screencapture", str(filename)])
            return f"스크린샷을 저장했습니다: {filename}"
        elif OS == "Windows":
            return "pyautogui를 설치하면 스크린샷을 찍을 수 있습니다: pip install pyautogui"
        else:
            filename = SCREENSHOT_DIR / f"jarvis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            subprocess.run(["scrot", str(filename)])
            return f"스크린샷을 저장했습니다: {filename}"


def set_volume(action: str) -> str:
    """볼륨 조절"""
    if OS == "Darwin":
        if "올려" in action or "up" in action.lower():
            subprocess.run(["osascript", "-e", "set volume output volume (output volume of (get volume settings) + 10)"])
            return "볼륨을 10% 올렸습니다."
        elif "내려" in action or "down" in action.lower():
            subprocess.run(["osascript", "-e", "set volume output volume (output volume of (get volume settings) - 10)"])
            return "볼륨을 10% 내렸습니다."
        elif "음소거" in action or "mute" in action.lower():
            subprocess.run(["osascript", "-e", "set volume with output muted"])
            return "음소거했습니다."
    elif OS == "Windows":
        try:
            from ctypes import cast, POINTER
            from comtypes import CLSCTX_ALL
            from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
            devices = AudioUtilities.GetSpeakers()
            interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
            volume = cast(interface, POINTER(IAudioEndpointVolume))
            if "올려" in action:
                current = volume.GetMasterVolumeLevelScalar()
                volume.SetMasterVolumeLevelScalar(min(1.0, current + 0.1), None)
                return "볼륨을 올렸습니다."
            elif "내려" in action:
                current = volume.GetMasterVolumeLevelScalar()
                volume.SetMasterVolumeLevelScalar(max(0.0, current - 0.1), None)
                return "볼륨을 내렸습니다."
            elif "음소거" in action:
                volume.SetMute(1, None)
                return "음소거했습니다."
        except Exception:
            return "Windows 볼륨 제어는 pycaw 패키지가 필요합니다: pip install pycaw"
    return "볼륨 조절을 지원하지 않는 운영체제입니다."


def process_command(command: dict) -> dict:
    """JARVIS 웹에서 받은 명령 처리"""
    cmd_type = command.get("type", "")
    params = command.get("params", {})
    result = {"success": False, "message": "알 수 없는 명령입니다."}

    if cmd_type == "open_app":
        app_name = params.get("name", "")
        result = {"success": True, "message": open_app(app_name)}

    elif cmd_type == "open_web":
        site = params.get("site", "")
        result = {"success": True, "message": open_web(site)}

    elif cmd_type == "system_info":
        info = get_system_info()
        msg = (
            f"CPU: {info['cpu_percent']}% | "
            f"메모리: {info['memory_used_gb']}GB/{info['memory_total_gb']}GB ({info['memory_percent']}%) | "
            f"디스크: {info['disk_used_gb']}GB/{info['disk_total_gb']}GB ({info['disk_percent']}%)"
        )
        if info["battery_percent"] is not None:
            msg += f" | 배터리: {info['battery_percent']}%{'(충전 중)' if info['battery_charging'] else ''}"
        result = {"success": True, "message": msg, "data": info}

    elif cmd_type == "screenshot":
        result = {"success": True, "message": take_screenshot()}

    elif cmd_type == "volume":
        action = params.get("action", "")
        result = {"success": True, "message": set_volume(action)}

    elif cmd_type == "ping":
        result = {"success": True, "message": f"JARVIS PC 클라이언트 온라인 — {OS} | {platform.node()}"}

    return result


async def jarvis_client():
    """JARVIS 웹소켓 클라이언트 메인 루프"""
    print("=" * 60)
    print("  JARVIS PC Control Client")
    print("  MAWINPAY Intelligence System")
    print("=" * 60)
    print(f"  OS: {OS} | Host: {platform.node()}")
    print(f"  Python: {platform.python_version()}")
    print(f"  연결 대기: {JARVIS_WS_URL}")
    print("=" * 60)

    while True:
        try:
            async with websockets.connect(JARVIS_WS_URL) as ws:
                print(f"\n[{datetime.now().strftime('%H:%M:%S')}] JARVIS 서버에 연결됨")

                # 연결 시 시스템 정보 전송
                await ws.send(json.dumps({
                    "type": "client_connected",
                    "data": get_system_info(),
                    "timestamp": datetime.now().isoformat(),
                }))

                async for message in ws:
                    try:
                        command = json.loads(message)
                        print(f"[{datetime.now().strftime('%H:%M:%S')}] 명령 수신: {command.get('type')} — {command.get('params', {})}")

                        result = process_command(command)
                        result["command_id"] = command.get("id", "")
                        result["timestamp"] = datetime.now().isoformat()

                        await ws.send(json.dumps(result))
                        print(f"[{datetime.now().strftime('%H:%M:%S')}] 결과: {result['message']}")

                    except json.JSONDecodeError:
                        print(f"[오류] JSON 파싱 실패: {message[:100]}")
                    except Exception as e:
                        print(f"[오류] 명령 처리 실패: {e}")
                        await ws.send(json.dumps({"success": False, "message": str(e)}))

        except (ConnectionRefusedError, OSError):
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 서버 연결 실패 — 5초 후 재시도...")
            await asyncio.sleep(5)
        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 오류: {e} — 5초 후 재시도...")
            await asyncio.sleep(5)


if __name__ == "__main__":
    try:
        asyncio.run(jarvis_client())
    except KeyboardInterrupt:
        print("\n\n[JARVIS] PC 클라이언트 종료됨. Goodbye, sir.")
