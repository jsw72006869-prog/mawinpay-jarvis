// SpeechEngine.tsx — v6: 마이크 트랙 비활성화 방식 + 강화된 디버그 로깅
import { useEffect, useRef, useCallback } from 'react';
import { ELEVENLABS_VOICES } from '../lib/jarvis-brain';

export { ELEVENLABS_VOICES };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any;

interface SpeechEngineProps {
  onResult: (text: string) => void;
  onStart: () => void;
  onEnd: () => void;
  isListening: boolean;
}

// ── 음성 인식 훅 (v6: 마이크 트랙 비활성화 방식 + 강화 로깅) ──
export function useSpeechRecognition({ onResult, onStart, onEnd, isListening }: SpeechEngineProps) {
  const recRef = useRef<any>(null);
  const isRunningRef = useRef(false);
  const shouldListenRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startAttemptRef = useRef(0);

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

  const safeStop = useCallback(() => {
    clearRestartTimer();
    if (!recRef.current) return;
    try {
      recRef.current.abort();
    } catch { /* ignore */ }
    isRunningRef.current = false;
  }, [clearRestartTimer]);

  // recognition 인스턴스 초기화 (1회)
  useEffect(() => {
    const API = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!API) {
      console.warn('[STT] Web Speech API 미지원');
      return;
    }

    const rec = new API();
    rec.lang = 'ko-KR';
    rec.continuous = false;  // ★ false로 변경: 한 문장씩 인식 후 자동 재시작
    rec.interimResults = true;  // ★ 중간 결과도 표시 (디버깅용)
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      console.log('[STT] ✅ 인식 시작됨');
      isRunningRef.current = true;
      startAttemptRef.current = 0;
    };

    rec.onaudiostart = () => {
      console.log('[STT] 🎙️ 오디오 캡처 시작');
      onStartRef.current();
    };

    rec.onsoundstart = () => {
      console.log('[STT] 🔊 소리 감지됨');
    };

    rec.onspeechstart = () => {
      console.log('[STT] 🗣️ 음성 감지됨 (사용자가 말하고 있음)');
    };

    rec.onspeechend = () => {
      console.log('[STT] 🗣️ 음성 종료됨 (사용자가 말을 멈춤)');
    };

    rec.onsoundend = () => {
      console.log('[STT] 🔇 소리 종료됨');
    };

    rec.onaudioend = () => {
      console.log('[STT] 🎙️ 오디오 캡처 종료');
    };

    rec.onresult = (event: any) => {
      try {
        console.log('[STT] 📝 onresult 이벤트 발생, resultIndex:', event.resultIndex, 'results.length:', event.results.length);
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript.trim();
          const confidence = result[0].confidence;
          
          if (result.isFinal) {
            console.log(`[STT] 🎤 최종 인식 결과: "${text}" (신뢰도: ${(confidence * 100).toFixed(1)}%)`);
            if (text) {
              onResultRef.current(text);
            }
          } else {
            console.log(`[STT] 💬 중간 결과: "${text}"`);
          }
        }
      } catch (e) {
        console.error('[STT] onresult 오류:', e);
      }
    };

    rec.onnomatch = () => {
      console.log('[STT] ❓ 인식 실패 (no match)');
    };

    rec.onend = () => {
      console.log('[STT] 종료됨. shouldListen:', shouldListenRef.current);
      isRunningRef.current = false;

      if (shouldListenRef.current) {
        // 자동 재시작 (continuous=false이므로 한 문장 후 자동 종료됨)
        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => {
          if (shouldListenRef.current && !isRunningRef.current) {
            try {
              console.log('[STT] 🔄 자동 재시작 (다음 문장 대기)');
              rec.start();
            } catch (e: any) {
              console.warn('[STT] 재시작 실패:', e?.message);
            }
          }
        }, 200);
        return;
      }

      onEndRef.current();
    };

    rec.onerror = (event: any) => {
      console.warn('[STT] ⚠️ 오류:', event.error, event.message || '');
      isRunningRef.current = false;

      if (event.error === 'not-allowed') {
        startAttemptRef.current++;
        console.error(`[STT] ❌ 마이크 권한 거부 (시도 ${startAttemptRef.current})`);
        
        if (startAttemptRef.current >= 8) {
          console.error('[STT] 마이크 권한 재시도 한도 초과 — 포기');
          shouldListenRef.current = false;
          onEndRef.current();
          return;
        }

        const delay = 500 + (500 * startAttemptRef.current);
        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => {
          if (shouldListenRef.current && !isRunningRef.current) {
            try {
              console.log(`[STT] 🔄 not-allowed 재시도 ${startAttemptRef.current + 1}`);
              rec.start();
            } catch { /* ignore */ }
          }
        }, delay);
        return;
      }

      if (event.error === 'no-speech') {
        console.log('[STT] 🤫 음성 없음 — 재시작');
      }

      // no-speech, aborted 등은 재시작
      if (shouldListenRef.current) {
        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => {
          if (shouldListenRef.current && !isRunningRef.current) {
            try { rec.start(); } catch { /* ignore */ }
          }
        }, 300);
      }
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
      clearRestartTimer();
      startAttemptRef.current = 0;

      // ★ ClapDetector가 마이크 트랙을 비활성화한 후 STT 시작
      // 1500ms 딜레이: 마이크 트랙 비활성화 + AudioContext suspend 완료 대기
      restartTimerRef.current = setTimeout(() => {
        if (!shouldListenRef.current) return;
        if (!isRunningRef.current && recRef.current) {
          try {
            console.log('[STT] 🚀 STT 시작 (1500ms 딜레이 후)');
            recRef.current.start();
          } catch (e: any) {
            console.warn('[STT] start() 실패:', e?.message);
            if (e?.message?.includes('already started')) {
              isRunningRef.current = true;
            }
          }
        }
      }, 1500);
    } else if (!isListening && prev) {
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
