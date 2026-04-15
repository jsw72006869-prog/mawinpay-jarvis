// SpeechEngine.tsx — v7: Whisper API 기반 STT (Web Speech API 완전 제거)
// ClapDetector 마이크 충돌 문제를 원천 해결: 별도 getUserMedia로 녹음 후 Whisper로 전송
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

// ── Whisper API 기반 음성 인식 훅 ──
export function useSpeechRecognition({ onResult, onStart, onEnd, isListening }: SpeechEngineProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isRunningRef = useRef(false);
  const shouldListenRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastSoundTimeRef = useRef<number>(0);
  const hasSpokenRef = useRef(false);

  const onResultRef = useRef(onResult);
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  useEffect(() => { onResultRef.current = onResult; });
  useEffect(() => { onStartRef.current = onStart; });
  useEffect(() => { onEndRef.current = onEnd; });

  const cleanup = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    isRunningRef.current = false;
    hasSpokenRef.current = false;
  }, []);

  // Whisper API로 오디오 전송
  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string | null> => {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[STT] OpenAI API 키 없음 — Whisper 사용 불가');
      return null;
    }

    console.log(`[STT] 📤 Whisper API 전송 (${(audioBlob.size / 1024).toFixed(1)}KB)`);

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'ko');
      formData.append('response_format', 'json');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('[STT] Whisper API 오류:', res.status, errText);
        return null;
      }

      const data = await res.json();
      const text = data.text?.trim() || '';
      console.log(`[STT] 🎤 Whisper 인식 결과: "${text}"`);
      return text || null;
    } catch (err) {
      console.error('[STT] Whisper API 호출 실패:', err);
      return null;
    }
  }, []);

  // 녹음 시작
  const startRecording = useCallback(async () => {
    if (isRunningRef.current) return;
    
    console.log('[STT] 🚀 Whisper 녹음 시작');

    try {
      // 새로운 마이크 스트림 획득 (ClapDetector가 해제한 후)
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      streamRef.current = stream;

      // 오디오 분석기 설정 (음성 감지용)
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // MediaRecorder 설정
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      hasSpokenRef.current = false;
      lastSoundTimeRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        console.log('[STT] 🛑 녹음 중단, 청크 수:', chunksRef.current.length);
        
        // 스트림 정리
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        analyserRef.current = null;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        isRunningRef.current = false;

        if (chunksRef.current.length === 0 || !hasSpokenRef.current) {
          console.log('[STT] 음성 없음 — 재시작');
          chunksRef.current = [];
          if (shouldListenRef.current) {
            setTimeout(() => {
              if (shouldListenRef.current && !isRunningRef.current) {
                startRecording();
              }
            }, 300);
          }
          return;
        }

        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        // 최소 크기 체크
        if (audioBlob.size < 1000) {
          console.log('[STT] 오디오 너무 짧음 — 재시작');
          if (shouldListenRef.current) {
            setTimeout(() => {
              if (shouldListenRef.current && !isRunningRef.current) {
                startRecording();
              }
            }, 300);
          }
          return;
        }

        // Whisper API로 전송
        const text = await transcribeAudio(audioBlob);
        
        if (text) {
          onResultRef.current(text);
          // onResult 호출 후에는 JarvisApp이 isListening=false로 설정하므로
          // 여기서 재시작하지 않음
        } else if (shouldListenRef.current) {
          console.log('[STT] 인식 실패 — 재시작');
          setTimeout(() => {
            if (shouldListenRef.current && !isRunningRef.current) {
              startRecording();
            }
          }, 500);
        }
      };

      // 녹음 시작 (100ms 간격으로 데이터 수집)
      recorder.start(100);
      isRunningRef.current = true;
      onStartRef.current();
      console.log('[STT] ✅ MediaRecorder 시작됨');

      // 음성 감지 루프
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const SPEECH_THRESHOLD = 0.04;
      const SILENCE_DURATION = 2000; // 2초 무음 후 녹음 중단

      const detectSpeech = () => {
        if (!analyserRef.current || !isRunningRef.current) return;
        
        analyserRef.current.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          const val = (dataArray[i] - 128) / 128;
          sum += val * val;
        }
        const rms = Math.sqrt(sum / bufferLength);

        if (rms > SPEECH_THRESHOLD) {
          lastSoundTimeRef.current = Date.now();
          if (!hasSpokenRef.current) {
            hasSpokenRef.current = true;
            console.log('[STT] 🗣️ 음성 감지됨');
          }
        }

        // 음성이 감지된 후 2초 무음이면 녹음 중단
        if (hasSpokenRef.current && Date.now() - lastSoundTimeRef.current > SILENCE_DURATION) {
          console.log('[STT] 🔇 2초 무음 감지 → 녹음 중단 → Whisper 전송');
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = 0;
            if (recordingTimerRef.current) {
              clearTimeout(recordingTimerRef.current);
              recordingTimerRef.current = null;
            }
            mediaRecorderRef.current.stop();
            return;
          }
        }

        animFrameRef.current = requestAnimationFrame(detectSpeech);
      };

      detectSpeech();

      // 최대 녹음 시간 (15초)
      recordingTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          console.log('[STT] ⏱️ 최대 녹음 시간 도달 (15초)');
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = 0;
          mediaRecorderRef.current.stop();
        }
      }, 15000);

    } catch (err) {
      console.error('[STT] 녹음 시작 실패:', err);
      isRunningRef.current = false;
      
      if (shouldListenRef.current) {
        setTimeout(() => {
          if (shouldListenRef.current && !isRunningRef.current) {
            startRecording();
          }
        }, 1000);
      }
    }
  }, [transcribeAudio]);

  // isListening 변경 시 녹음 시작/중단
  useEffect(() => {
    const prev = shouldListenRef.current;
    shouldListenRef.current = isListening;

    if (isListening && !prev) {
      // ClapDetector가 스트림을 해제한 후 500ms 대기 후 녹음 시작
      const timer = setTimeout(() => {
        if (shouldListenRef.current && !isRunningRef.current) {
          startRecording();
        }
      }, 500);
      
      return () => clearTimeout(timer);
    } else if (!isListening && prev) {
      cleanup();
      onEndRef.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);
}

// ── ElevenLabs TTS ──
// 전역 오디오 인스턴스 (음성 인식 시 즉시 중단용)
let globalAudioRef: HTMLAudioElement | null = null;
export function stopGlobalAudio() {
  if (globalAudioRef) {
    try { globalAudioRef.pause(); } catch { /* ignore */ }
    globalAudioRef.src = '';
    globalAudioRef = null;
  }
  window.speechSynthesis?.cancel();
}

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
    globalAudioRef = audio;

    await new Promise<void>((resolve) => {
      audio.onended = () => {
        console.log('[TTS] 재생 완료');
        URL.revokeObjectURL(url);
        if (globalAudioRef === audio) globalAudioRef = null;
        resolve();
      };
      audio.onerror = (e) => {
        console.warn('[TTS] 재생 오류:', e);
        URL.revokeObjectURL(url);
        if (globalAudioRef === audio) globalAudioRef = null;
        resolve();
      };
      audio.play().catch((e) => {
        console.warn('[TTS] play() 실패:', e);
        URL.revokeObjectURL(url);
        if (globalAudioRef === audio) globalAudioRef = null;
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
    stopGlobalAudio();
  }, []);

  return { speak, stop };
}
