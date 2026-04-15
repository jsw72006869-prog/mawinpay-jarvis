// SpeechEngine.tsx — v4: STT 시작 전 마이크 권한 확보 + 안정적 재시작
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

/**
 * 마이크 권한을 먼저 확보한 후 STT를 시작합니다.
 * ClapDetector가 마이크를 해제한 후 호출해야 합니다.
 */
async function ensureMicPermission(): Promise<MediaStream | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('[STT] ✅ 마이크 권한 확보 성공');
    // 즉시 해제 — Web Speech API가 자체적으로 마이크를 열 수 있도록
    stream.getTracks().forEach(t => t.stop());
    return stream;
  } catch (e) {
    console.error('[STT] ❌ 마이크 권한 확보 실패:', e);
    return null;
  }
}

// ── 음성 인식 훅 (v4: 마이크 권한 확보 후 시작) ──
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
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      console.log('[STT] ✅ 인식 시작됨');
      isRunningRef.current = true;
      startAttemptRef.current = 0;
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

      if (shouldListenRef.current) {
        // 자동 재시작 (브라우저가 no-speech 타임아웃으로 종료한 경우)
        restartTimerRef.current = setTimeout(() => {
          if (shouldListenRef.current && !isRunningRef.current) {
            try {
              console.log('[STT] 자동 재시작');
              rec.start();
            } catch (e: any) {
              console.warn('[STT] 재시작 실패:', e?.message);
            }
          }
        }, 400);
        return;
      }

      onEndRef.current();
    };

    rec.onerror = (event: any) => {
      console.warn('[STT] 오류:', event.error);
      isRunningRef.current = false;

      if (event.error === 'not-allowed') {
        startAttemptRef.current++;
        console.error(`[STT] ❌ 마이크 권한 거부 (시도 ${startAttemptRef.current})`);
        
        // 최대 5회까지만 재시도, 이후 포기
        if (startAttemptRef.current >= 5) {
          console.error('[STT] 마이크 권한 재시도 한도 초과 — 포기');
          shouldListenRef.current = false;
          onEndRef.current();
          return;
        }

        // 점점 늘어나는 딜레이로 재시도
        const delay = 1000 * startAttemptRef.current;
        restartTimerRef.current = setTimeout(async () => {
          if (!shouldListenRef.current) return;
          // 마이크 권한 다시 확보 시도
          await ensureMicPermission();
          if (shouldListenRef.current && !isRunningRef.current) {
            try { rec.start(); } catch { /* ignore */ }
          }
        }, delay);
        return;
      }

      // no-speech, aborted 등은 재시작
      if (shouldListenRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (shouldListenRef.current && !isRunningRef.current) {
            try { rec.start(); } catch { /* ignore */ }
          }
        }, 500);
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

      // ★ 핵심: 마이크 권한을 먼저 확보한 후 STT 시작
      // ClapDetector가 스트림을 해제한 후 약간의 딜레이 필요
      restartTimerRef.current = setTimeout(async () => {
        if (!shouldListenRef.current) return;
        
        // 마이크 권한 확보 (ClapDetector가 해제한 후)
        await ensureMicPermission();
        
        // 권한 확보 후 STT 시작
        if (shouldListenRef.current && !isRunningRef.current && recRef.current) {
          try {
            console.log('[STT] safeStart() 호출');
            recRef.current.start();
          } catch (e: any) {
            console.warn('[STT] start() 실패:', e?.message);
            if (e?.message?.includes('already started')) {
              isRunningRef.current = true;
            }
          }
        }
      }, 500); // ClapDetector 스트림 해제 대기
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
