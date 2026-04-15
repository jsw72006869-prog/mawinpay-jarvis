// SpeechEngine.tsx — 안정적인 음성 인식 + ElevenLabs TTS (v3 완전 재작성)
import { useEffect, useRef, useCallback } from 'react';
import { ELEVENLABS_VOICES } from '../lib/jarvis-brain';

// re-export for convenience
export { ELEVENLABS_VOICES };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any;

interface SpeechEngineProps {
  onResult: (text: string) => void;
  onStart: () => void;
  onEnd: () => void;
  isListening: boolean;
}

// ── 음성 인식 훅 (v3: continuous=true 기반) ──
export function useSpeechRecognition({ onResult, onStart, onEnd, isListening }: SpeechEngineProps) {
  const recRef = useRef<any>(null);
  const isRunningRef = useRef(false);
  const shouldListenRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 콜백 최신 참조 유지
  const onResultRef = useRef(onResult);
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  useEffect(() => { onResultRef.current = onResult; });
  useEffect(() => { onStartRef.current = onStart; });
  useEffect(() => { onEndRef.current = onEnd; });

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const safeStart = useCallback(() => {
    clearRestartTimer();
    if (!recRef.current) return;
    if (isRunningRef.current) return;
    if (!shouldListenRef.current) return;

    try {
      console.log('[STT] safeStart() 호출');
      recRef.current.start();
    } catch (e: any) {
      console.warn('[STT] start() 실패:', e?.message);
      // 이미 실행 중인 경우 무시
      if (e?.message?.includes('already started')) {
        isRunningRef.current = true;
        return;
      }
      // 다른 오류면 재시도
      isRunningRef.current = false;
      restartTimerRef.current = setTimeout(() => {
        if (shouldListenRef.current) safeStart();
      }, 500);
    }
  }, [clearRestartTimer]);

  const safeStop = useCallback(() => {
    clearRestartTimer();
    if (!recRef.current) return;
    if (!isRunningRef.current) return;

    try {
      console.log('[STT] safeStop() 호출');
      recRef.current.stop();
    } catch (e: any) {
      console.warn('[STT] stop() 실패:', e?.message);
      isRunningRef.current = false;
    }
  }, [clearRestartTimer]);

  // recognition 인스턴스 초기화 (1회)
  useEffect(() => {
    const API = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!API) {
      console.warn('[STT] Web Speech API 미지원 — Chrome을 사용해주세요.');
      return;
    }

    const rec = new API();
    rec.lang = 'ko-KR';
    rec.continuous = true;        // ★ 핵심: 연속 인식 모드
    rec.interimResults = false;   // 최종 결과만
    rec.maxAlternatives = 1;

    let notAllowedRetries = 0;
    const MAX_NOT_ALLOWED_RETRIES = 3;

    rec.onstart = () => {
      console.log('[STT] \u2705 \uc778\uc2dd \uc2dc\uc791\ub428');
      isRunningRef.current = true;
      notAllowedRetries = 0; // \uc131\uacf5\uc801\uc73c\ub85c \uc2dc\uc791\ub418\uba74 \uce74\uc6b4\ud130 \ub9ac\uc14b
      onStartRef.current();
    };

    rec.onresult = (event: any) => {
      try {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            const text = event.results[i][0].transcript.trim();
            if (text) {
              console.log('[STT] 🎤 인식 결과:', text);
              onResultRef.current(text);
            }
          }
        }
      } catch (e) {
        console.error('[STT] onresult 오류:', e);
      }
    };

    rec.onend = () => {
      console.log('[STT] 종료됨. shouldListen:', shouldListenRef.current);
      isRunningRef.current = false;

      // continuous=true여도 브라우저가 자동 종료할 수 있음 (no-speech 타임아웃 등)
      // shouldListen이 true면 자동 재시작
      if (shouldListenRef.current) {
        console.log('[STT] 자동 재시작 예약');
        restartTimerRef.current = setTimeout(() => {
          if (shouldListenRef.current && !isRunningRef.current) {
            try {
              console.log('[STT] 자동 재시작 실행');
              rec.start();
            } catch (e: any) {
              console.warn('[STT] 재시작 실패:', e?.message);
              isRunningRef.current = false;
            }
          }
        }, 300);
        return;
      }

      onEndRef.current();
    };

    rec.onerror = (event: any) => {
      console.warn('[STT] 오류:', event.error);
      isRunningRef.current = false;

      if (event.error === 'not-allowed') {
        notAllowedRetries++;
        console.error(`[STT] ❌ 마이크 권한 거부 (${notAllowedRetries}/${MAX_NOT_ALLOWED_RETRIES})`);
        if (notAllowedRetries >= MAX_NOT_ALLOWED_RETRIES) {
          console.error('[STT] 마이크 권한 재시도 한도 초과 — 대기 후 재시도');
          // 3초 후 한 번 더 시도 (사용자가 권한을 허용했을 수 있음)
          restartTimerRef.current = setTimeout(() => {
            notAllowedRetries = 0;
            if (shouldListenRef.current && !isRunningRef.current) {
              try { rec.start(); } catch { /* ignore */ }
            }
          }, 3000);
          return;
        }
        // 짧은 딜레이 후 재시도 (마이크가 아직 해제 안 됐을 수 있음)
        restartTimerRef.current = setTimeout(() => {
          if (shouldListenRef.current && !isRunningRef.current) {
            try { rec.start(); } catch { /* ignore */ }
          }
        }, 800);
        return;
      }

      // 성공적으로 시작되면 카운터 리셋
      notAllowedRetries = 0;

      // aborted는 의도적 중단이므로 shouldListen 확인 후 재시작
      // no-speech는 타임아웃이므로 재시작
      if (shouldListenRef.current) {
        const delay = event.error === 'aborted' ? 200 : 500;
        restartTimerRef.current = setTimeout(() => {
          if (shouldListenRef.current && !isRunningRef.current) {
            try {
              rec.start();
            } catch (e: any) {
              console.warn('[STT] 오류 후 재시작 실패:', e?.message);
            }
          }
        }, delay);
        return;
      }

      onEndRef.current();
    };

    recRef.current = rec;

    return () => {
      clearRestartTimer();
      try { rec.abort(); } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // isListening 변경 시 start/stop
  useEffect(() => {
    const prev = shouldListenRef.current;
    shouldListenRef.current = isListening;

    if (isListening && !prev) {
      // 시작 요청: 약간의 딜레이 후 시작 (TTS 에코 방지)
      clearRestartTimer();
      restartTimerRef.current = setTimeout(() => {
        safeStart();
      }, 200);
    } else if (!isListening && prev) {
      // 중단 요청
      safeStop();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);
}

// ── ElevenLabs TTS ──
const VOICE_STORAGE_KEY = 'jarvis_voice_id';
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam

export function getCurrentVoiceId(): string {
  return localStorage.getItem(VOICE_STORAGE_KEY) || DEFAULT_VOICE_ID;
}

export function setCurrentVoiceId(voiceId: string): void {
  localStorage.setItem(VOICE_STORAGE_KEY, voiceId);
  console.log('[TTS] 목소리 변경됨:', voiceId);
}

async function speakElevenLabs(
  text: string,
  apiKey: string,
  voiceIdOverride?: string
): Promise<void> {
  const ELEVENLABS_VOICE_ID = voiceIdOverride || getCurrentVoiceId();
  console.log('[TTS] ElevenLabs 요청:', text.substring(0, 60));
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.85,
            style: 0.25,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[TTS] ElevenLabs 오류:', res.status, errText);
      throw new Error(`ElevenLabs ${res.status}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    await new Promise<void>((resolve) => {
      audio.onended = () => {
        console.log('[TTS] 재생 완료');
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = (e) => {
        console.warn('[TTS] 재생 오류:', e);
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.play().catch((e) => {
        console.warn('[TTS] play() 실패:', e);
        URL.revokeObjectURL(url);
        resolve();
      });
    });

  } catch (err) {
    console.error('[TTS] ElevenLabs 실패, Web Speech 폴백:', err);
    await speakWebSpeech(text);
  }
}

function speakWebSpeech(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }
    window.speechSynthesis.cancel();

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const koVoice = voices.find((v: SpeechSynthesisVoice) =>
        v.lang === 'ko-KR' && v.name.includes('Google')
      ) || voices.find((v: SpeechSynthesisVoice) => v.lang.startsWith('ko'))
        || voices[0];

      if (koVoice) utterance.voice = koVoice;
      utterance.lang = 'ko-KR';
      utterance.rate = 0.9;
      utterance.pitch = 0.8;
      utterance.volume = 1.0;

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    }, 100);
  });
}

// ── TTS 훅 ──
export function useTextToSpeech() {
  const isSpeakingRef = useRef(false);

  const speak = useCallback(async (
    text: string,
    _onStart?: () => void,
    onEnd?: () => void,
    voiceIdOverride?: string
  ) => {
    if (isSpeakingRef.current) {
      console.warn('[TTS] 이미 재생 중 — 스킵');
      onEnd?.();
      return;
    }

    isSpeakingRef.current = true;
    console.log('[TTS] speak() 시작:', text.substring(0, 60));

    const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;

    try {
      if (apiKey) {
        await speakElevenLabs(text, apiKey, voiceIdOverride);
      } else {
        console.log('[TTS] ElevenLabs 키 없음 — Web Speech 사용');
        await speakWebSpeech(text);
      }
    } finally {
      isSpeakingRef.current = false;
      console.log('[TTS] speak() 완료');
      onEnd?.();
    }
  }, []);

  const stop = useCallback(() => {
    isSpeakingRef.current = false;
    window.speechSynthesis?.cancel();
  }, []);

  return { speak, stop };
}
