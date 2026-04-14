

import { useEffect, useRef, useCallback } from 'react';

interface SpeechEngineProps {
  onResult: (text: string) => void;
  onStart: () => void;
  onEnd: () => void;
  isListening: boolean;
}

export function useSpeechRecognition({
  onResult,
  onStart,
  onEnd,
  isListening,
}: SpeechEngineProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onResultRef = useRef(onResult);
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  onResultRef.current = onResult;
  onStartRef.current = onStart;
  onEndRef.current = onEnd;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.warn('Web Speech API가 지원되지 않는 브라우저입니다. Chrome을 사용해주세요.');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;       // 한 문장씩 처리 (더 안정적)
    recognition.interimResults = false;   // 최종 결과만 사용
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isActiveRef.current = true;
      onStartRef.current();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      if (transcript) {
        onResultRef.current(transcript);
      }
    };

    recognition.onend = () => {
      isActiveRef.current = false;
      onEndRef.current();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      // no-speech는 조용한 실패 처리
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('음성 인식 오류:', event.error);
      }
      isActiveRef.current = false;
      onEndRef.current();
    };

    recognitionRef.current = recognition;

    return () => {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      try { recognition.abort(); } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    if (!recognitionRef.current) return;

    if (isListening && !isActiveRef.current) {
      restartTimerRef.current = setTimeout(() => {
        try {
          recognitionRef.current?.start();
        } catch (e) {
          console.warn('음성 인식 시작 오류:', e);
        }
      }, 100);
    } else if (!isListening && isActiveRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn('음성 인식 중지 오류:', e);
      }
    }

    return () => {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    };
  }, [isListening]);
}

// ── TTS 엔진 ──
export function useTextToSpeech() {
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const voicesLoadedRef = useRef(false);

  // 음성 목록 로드
  const loadVoices = useCallback(() => {
    if (!synthRef.current) return;
    const voices = synthRef.current.getVoices();
    if (voices.length === 0) return;
    voicesLoadedRef.current = true;

    // 우선순위: 한국어 남성 > 한국어 > 영어 남성 (JARVIS 느낌)
    const priorities = [
      (v: SpeechSynthesisVoice) => v.lang === 'ko-KR' && /male|남|man/i.test(v.name),
      (v: SpeechSynthesisVoice) => v.lang === 'ko-KR' && v.name.includes('Google'),
      (v: SpeechSynthesisVoice) => v.lang.startsWith('ko'),
      (v: SpeechSynthesisVoice) => v.lang === 'en-GB' && /male|david|george/i.test(v.name),
      (v: SpeechSynthesisVoice) => v.lang === 'en-US' && /male|david/i.test(v.name),
    ];

    for (const fn of priorities) {
      const found = voices.find(fn);
      if (found) { voiceRef.current = found; return; }
    }
    // 폴백: 첫 번째 한국어 음성
    voiceRef.current = voices.find(v => v.lang.startsWith('ko')) || null;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    synthRef.current = window.speechSynthesis;
    loadVoices();
    // Chrome은 비동기로 음성 목록 로드
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [loadVoices]);

  const speak = useCallback((text: string, onStart?: () => void, onEnd?: () => void) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();

    // 짧은 딜레이 후 발화 (Chrome 버그 방지)
    setTimeout(() => {
      if (!synthRef.current) return;

      const utterance = new SpeechSynthesisUtterance(text);

      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
      }

      utterance.lang = 'ko-KR';
      utterance.rate = 0.92;    // 약간 느리게 — 자연스럽고 명확하게
      utterance.pitch = 0.82;   // 낮은 피치 — JARVIS 남성 목소리
      utterance.volume = 1.0;

      utterance.onstart = () => onStart?.();
      utterance.onend = () => onEnd?.();
      utterance.onerror = () => onEnd?.();

      synthRef.current.speak(utterance);
    }, 50);
  }, []);

  const stop = useCallback(() => {
    synthRef.current?.cancel();
  }, []);

  return { speak, stop };
}
