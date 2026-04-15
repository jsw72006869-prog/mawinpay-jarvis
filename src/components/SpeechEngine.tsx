// SpeechEngine.tsx — 안정적인 음성 인식 + ElevenLabs TTS (완전 재작성)
import { useEffect, useRef, useCallback } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any;

interface SpeechEngineProps {
  onResult: (text: string) => void;
  onStart: () => void;
  onEnd: () => void;
  isListening: boolean;
}

// ── 음성 인식 훅 ──
export function useSpeechRecognition({ onResult, onStart, onEnd, isListening }: SpeechEngineProps) {
  const recRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const shouldListenRef = useRef(false);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 콜백 최신 참조 유지
  const onResultRef = useRef(onResult);
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  useEffect(() => { onResultRef.current = onResult; });
  useEffect(() => { onStartRef.current = onStart; });
  useEffect(() => { onEndRef.current = onEnd; });

  // recognition 인스턴스 초기화 (1회)
  useEffect(() => {
    const API = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!API) {
      console.warn('[JARVIS] Web Speech API 미지원 — Chrome을 사용해주세요.');
      return;
    }

    const rec = new API();
    rec.lang = 'ko-KR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      console.log('[JARVIS STT] 시작됨');
      isActiveRef.current = true;
      onStartRef.current();
    };

    rec.onresult = (event: any) => {
      try {
        const results = event.results;
        for (let i = event.resultIndex; i < results.length; i++) {
          if (results[i].isFinal) {
            const text = results[i][0].transcript.trim();
            console.log('[JARVIS STT] 인식 완료:', text);
            if (text) {
              onResultRef.current(text);
              return;
            }
          }
        }
      } catch (e) {
        console.error('[JARVIS STT] onresult 오류:', e);
      }
    };

    rec.onend = () => {
      console.log('[JARVIS STT] 종료됨. shouldListen:', shouldListenRef.current);
      isActiveRef.current = false;
      onEndRef.current();
    };

    rec.onerror = (event: any) => {
      console.warn('[JARVIS STT] 오류:', event.error);
      isActiveRef.current = false;
      if (event.error === 'not-allowed') {
        console.error('[JARVIS STT] 마이크 권한이 거부되었습니다.');
      }
      onEndRef.current();
    };

    recRef.current = rec;

    return () => {
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
      try { rec.abort(); } catch { /* ignore */ }
    };
  }, []);

  // isListening 변경 시 start/stop
  useEffect(() => {
    shouldListenRef.current = isListening;

    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }

    if (isListening) {
      if (!isActiveRef.current && recRef.current) {
        // 약간의 딜레이 후 시작 (이전 오디오 재생 완료 보장)
        startTimerRef.current = setTimeout(() => {
          if (!shouldListenRef.current) return;
          if (isActiveRef.current) return;
          try {
            console.log('[JARVIS STT] recognition.start() 호출');
            recRef.current.start();
          } catch (e: any) {
            console.warn('[JARVIS STT] start() 실패:', e?.message);
            isActiveRef.current = false;
          }
        }, 300);
      }
    } else {
      if (isActiveRef.current && recRef.current) {
        try {
          recRef.current.stop();
          console.log('[JARVIS STT] recognition.stop() 호출');
        } catch (e) {
          console.warn('[JARVIS STT] stop() 실패:', e);
        }
      }
    }
  }, [isListening]);
}

// ── ElevenLabs TTS ──
const ELEVENLABS_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam

async function speakElevenLabs(
  text: string,
  apiKey: string,
  onEnd: () => void
): Promise<void> {
  console.log('[JARVIS TTS] ElevenLabs 요청:', text.substring(0, 60));
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
      console.error('[JARVIS TTS] ElevenLabs 오류:', res.status, errText);
      throw new Error(`ElevenLabs ${res.status}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    await new Promise<void>((resolve) => {
      audio.onended = () => {
        console.log('[JARVIS TTS] 재생 완료');
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = (e) => {
        console.warn('[JARVIS TTS] 재생 오류:', e);
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.play().catch((e) => {
        console.warn('[JARVIS TTS] play() 실패:', e);
        URL.revokeObjectURL(url);
        resolve();
      });
    });

  } catch (err) {
    console.error('[JARVIS TTS] ElevenLabs 실패, Web Speech 폴백:', err);
    await speakWebSpeech(text);
  } finally {
    console.log('[JARVIS TTS] onEnd 호출');
    onEnd();
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

      utterance.onend = () => {
        console.log('[JARVIS TTS] Web Speech 완료');
        resolve();
      };
      utterance.onerror = () => {
        console.warn('[JARVIS TTS] Web Speech 오류');
        resolve();
      };

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
    onEnd?: () => void
  ) => {
    if (isSpeakingRef.current) {
      console.warn('[JARVIS TTS] 이미 재생 중 — 스킵');
      onEnd?.();
      return;
    }

    isSpeakingRef.current = true;
    console.log('[JARVIS TTS] speak() 시작:', text.substring(0, 60));

    const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;

    try {
      if (apiKey) {
        await speakElevenLabs(text, apiKey, () => {});
      } else {
        console.log('[JARVIS TTS] ElevenLabs 키 없음 — Web Speech 사용');
        await speakWebSpeech(text);
      }
    } finally {
      isSpeakingRef.current = false;
      console.log('[JARVIS TTS] speak() 완료, onEnd 호출');
      onEnd?.();
    }
  }, []);

  const stop = useCallback(() => {
    isSpeakingRef.current = false;
    window.speechSynthesis?.cancel();
  }, []);

  return { speak, stop };
}
