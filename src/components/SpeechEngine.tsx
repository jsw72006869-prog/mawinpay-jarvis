import { useEffect, useRef, useCallback } from 'react';

interface SpeechEngineProps {
  onResult: (text: string) => void;
  onStart: () => void;
  onEnd: () => void;
  isListening: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any;

export function useSpeechRecognition({
  onResult,
  onStart,
  onEnd,
  isListening,
}: SpeechEngineProps) {
  const recognitionRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 항상 최신 콜백을 ref로 유지
  const onResultRef = useRef(onResult);
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  useEffect(() => { onResultRef.current = onResult; });
  useEffect(() => { onStartRef.current = onStart; });
  useEffect(() => { onEndRef.current = onEnd; });

  // 최초 1회 recognition 인스턴스 생성
  useEffect(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.warn('[JARVIS] Web Speech API 미지원. Chrome을 사용해주세요.');
      return;
    }

    const rec = new SpeechRecognitionAPI();
    rec.lang = 'ko-KR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      console.log('[JARVIS] 음성 인식 시작됨');
      isActiveRef.current = true;
      onStartRef.current();
    };

    rec.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      if (result.isFinal) {
        const transcript = result[0].transcript.trim();
        console.log('[JARVIS] 인식된 텍스트:', transcript);
        if (transcript) {
          onResultRef.current(transcript);
        }
      }
    };

    rec.onend = () => {
      console.log('[JARVIS] 음성 인식 종료됨');
      isActiveRef.current = false;
      onEndRef.current();
    };

    rec.onerror = (event: any) => {
      console.warn('[JARVIS] 음성 인식 오류:', event.error);
      isActiveRef.current = false;
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onEndRef.current();
      }
    };

    recognitionRef.current = rec;
    console.log('[JARVIS] SpeechRecognition 인스턴스 생성 완료');

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      try { rec.abort(); } catch { /* ignore */ }
    };
  }, []);

  // isListening 변경 시 시작/중지
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (isListening) {
      if (!isActiveRef.current && recognitionRef.current) {
        timerRef.current = setTimeout(() => {
          try {
            console.log('[JARVIS] recognition.start() 호출');
            recognitionRef.current.start();
          } catch (e) {
            console.warn('[JARVIS] start() 오류:', e);
            isActiveRef.current = false;
          }
        }, 150);
      }
    } else {
      if (isActiveRef.current && recognitionRef.current) {
        try {
          console.log('[JARVIS] recognition.stop() 호출');
          recognitionRef.current.stop();
        } catch (e) {
          console.warn('[JARVIS] stop() 오류:', e);
        }
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isListening]);
}

// ── TTS 엔진 ──
export function useTextToSpeech() {
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const loadVoices = useCallback(() => {
    if (!synthRef.current) return;
    const voices = synthRef.current.getVoices();
    if (voices.length === 0) return;

    const priorities = [
      (v: SpeechSynthesisVoice) => v.lang === 'ko-KR' && /male|남|man/i.test(v.name),
      (v: SpeechSynthesisVoice) => v.lang === 'ko-KR' && v.name.includes('Google'),
      (v: SpeechSynthesisVoice) => v.lang.startsWith('ko'),
      (v: SpeechSynthesisVoice) => v.lang === 'en-GB' && /male|david|george/i.test(v.name),
      (v: SpeechSynthesisVoice) => v.lang === 'en-US' && /male|david/i.test(v.name),
    ];

    for (const fn of priorities) {
      const found = voices.find(fn);
      if (found) { voiceRef.current = found; console.log('[JARVIS] TTS 음성:', found.name); return; }
    }
    voiceRef.current = voices.find(v => v.lang.startsWith('ko')) || voices[0] || null;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    synthRef.current = window.speechSynthesis;
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [loadVoices]);

  const speak = useCallback((text: string, onStart?: () => void, onEnd?: () => void) => {
    if (!synthRef.current) { onEnd?.(); return; }
    synthRef.current.cancel();

    setTimeout(() => {
      if (!synthRef.current) { onEnd?.(); return; }

      const utterance = new SpeechSynthesisUtterance(text);
      if (voiceRef.current) utterance.voice = voiceRef.current;
      utterance.lang = 'ko-KR';
      utterance.rate = 0.92;
      utterance.pitch = 0.82;
      utterance.volume = 1.0;

      utterance.onstart = () => { console.log('[JARVIS] TTS 시작'); onStart?.(); };
      utterance.onend = () => { console.log('[JARVIS] TTS 완료'); onEnd?.(); };
      utterance.onerror = (e) => { console.warn('[JARVIS] TTS 오류:', e); onEnd?.(); };

      synthRef.current.speak(utterance);
    }, 80);
  }, []);

  const stop = useCallback(() => {
    synthRef.current?.cancel();
  }, []);

  return { speak, stop };
}
