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

  const onResultRef = useRef(onResult);
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  useEffect(() => { onResultRef.current = onResult; });
  useEffect(() => { onStartRef.current = onStart; });
  useEffect(() => { onEndRef.current = onEnd; });

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
        if (transcript) onResultRef.current(transcript);
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

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      try { rec.abort(); } catch { /* ignore */ }
    };
  }, []);

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

// ── ElevenLabs TTS 엔진 ──
// JARVIS 목소리: Adam (pNInz6obpgDQGcFmaJgB) — 깊고 차분한 남성 영어 목소리
// 한국어 지원 목소리: Aria (9BWtsMINqrJLrRacOk9x) 또는 기본 다국어 목소리
const ELEVENLABS_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam - JARVIS 느낌

async function speakElevenLabs(
  text: string,
  apiKey: string,
  onStart?: () => void,
  onEnd?: () => void,
  audioRef?: React.MutableRefObject<HTMLAudioElement | null>
): Promise<void> {
  try {
    onStart?.();
    console.log('[JARVIS ElevenLabs] TTS 요청:', text.substring(0, 50));

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2', // 한국어 지원
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.85,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[JARVIS ElevenLabs] API 오류:', err);
      throw new Error(`ElevenLabs API ${response.status}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    if (audioRef) audioRef.current = audio;

    audio.onended = () => {
      console.log('[JARVIS ElevenLabs] 재생 완료');
      URL.revokeObjectURL(audioUrl);
      if (audioRef) audioRef.current = null;
      onEnd?.();
    };

    audio.onerror = () => {
      console.warn('[JARVIS ElevenLabs] 재생 오류');
      URL.revokeObjectURL(audioUrl);
      onEnd?.();
    };

    await audio.play();
    console.log('[JARVIS ElevenLabs] 재생 시작');

  } catch (error) {
    console.error('[JARVIS ElevenLabs] 오류:', error);
    onEnd?.();
  }
}

// Web Speech API 폴백
function speakWebSpeech(
  text: string,
  onStart?: () => void,
  onEnd?: () => void
): void {
  if (!window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();

  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();

    // 한국어 목소리 우선 선택
    const koVoice = voices.find((v: SpeechSynthesisVoice) => v.lang === 'ko-KR' && v.name.includes('Google'))
      || voices.find((v: SpeechSynthesisVoice) => v.lang.startsWith('ko'))
      || voices[0];

    if (koVoice) utterance.voice = koVoice;
    utterance.lang = 'ko-KR';
    utterance.rate = 0.9;
    utterance.pitch = 0.8;
    utterance.volume = 1.0;

    utterance.onstart = () => onStart?.();
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();

    window.speechSynthesis.speak(utterance);
  }, 80);
}

export function useTextToSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = useCallback((text: string, onStart?: () => void, onEnd?: () => void) => {
    const elevenLabsKey = import.meta.env.VITE_ELEVENLABS_API_KEY;

    if (elevenLabsKey) {
      console.log('[JARVIS] ElevenLabs TTS 사용');
      speakElevenLabs(text, elevenLabsKey, onStart, onEnd, audioRef);
    } else {
      console.log('[JARVIS] Web Speech API 폴백 사용');
      speakWebSpeech(text, onStart, onEnd);
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
  }, []);

  return { speak, stop };
}
