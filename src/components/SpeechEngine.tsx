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

// ── 한국어 STT 후처리 교정 ──
// Whisper가 자주 틀리는 패턴을 자동 교정
function correctKoreanSTT(text: string): string {
  const corrections: [RegExp, string][] = [
    // 명령어 교정
    [/내기\s*해/g, '대기해'],
    [/내기\s*하/g, '대기하'],
    [/대기\s*해줘/g, '대기해'],
    [/수지\s*해/g, '수집해'],
    [/수집\s*해줘/g, '수집해'],
    [/검색\s*해줘/g, '검색해'],
    [/보내\s*줘/g, '보내줘'],
    [/찾아\s*줘/g, '찾아줘'],
    [/저장\s*해줘/g, '저장해'],
    [/시작\s*해줘/g, '시작해'],
    [/중단\s*해줘/g, '중단해'],
    [/확인\s*해줘/g, '확인해'],
    // 플랫폼 이름 교정
    [/인스타/g, '인스타그램'],
    [/유투브/g, '유튜브'],
    [/유투버/g, '유튜버'],
    [/네이버블로그/g, '네이버 블로그'],
    // 자비스 호칭 교정
    [/자비\s*스/g, '자비스'],
    [/재비스/g, '자비스'],
    [/재비\s*스/g, '자비스'],
  ];
  
  let result = text;
  for (const [pattern, replacement] of corrections) {
    result = result.replace(pattern, replacement);
  }
  return result;
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
      formData.append('temperature', '0');
      // 자주 쓰는 명령어/단어 힌트 → Whisper 인식 정확도 향상
      formData.append('prompt', '자비스, 대기해, 수집해, 검색해, 보내줘, 찾아줘, 저장해, 시작해, 중단해, 확인해, 유튜버, 블로거, 인플루언서, 인스타그램, 네이버, 이메일, 팔로워, 맛집, 뷰티, 패션, 여행, 협업, 마케팅, 수집, 발송, 목록, 시트, 자동화');

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
      const rawText = data.text?.trim() || '';
      const text = correctKoreanSTT(rawText);
      if (rawText !== text) {
        console.log(`[STT] 🔧 교정: "${rawText}" → "${text}"`);
      } else {
        console.log(`[STT] 🎤 Whisper 인식 결과: "${text}"`);
      }
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
      const SPEECH_THRESHOLD = 0.035;
      const SILENCE_DURATION = 1200; // 1.2초 무음 후 녹음 중단 (GPT처럼 빠른 응답)

      const detectSpeech = () => {
        if (!analyserRef.current || !isRunningRef.current) return;
        // isListening=false 되면 즉시 녹음 중단 (speaking 중 에코 방지)
        if (!shouldListenRef.current) {
          console.log('[STT] 🔇 isListening=false 감지 → 녹음 즉시 중단');
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = 0;
            mediaRecorderRef.current.stop();
          }
          return;
        }
        
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
          // eleven_turbo_v2_5: 최저 레이턴시 (~75ms), 한국어 지원
          model_id: 'eleven_turbo_v2_5',
          optimize_streaming_latency: 4,
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

    // ── 스트리밍 재생: 전체 다운로드 기다리지 않고 4KB 도착 즉시 재생 시작 ──
    const reader = res.body?.getReader();
    if (!reader) {
      // fallback: blob 방식
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      globalAudioRef = audio;
      await new Promise<void>((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(url); if (globalAudioRef === audio) globalAudioRef = null; resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); if (globalAudioRef === audio) globalAudioRef = null; resolve(); };
        audio.play().catch(() => resolve());
      });
      return;
    }

    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    let earlyAudio: HTMLAudioElement | null = null;
    let earlyUrl = '';
    let earlyStarted = false;

    await new Promise<void>((resolve) => {
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              totalLength += value.length;
              // 첫 4KB 도착 즉시 재생 시작 (저지연 핵심)
              if (!earlyStarted && totalLength >= 4096) {
                earlyStarted = true;
                const combined = new Uint8Array(totalLength);
                let off = 0;
                for (const c of chunks) { combined.set(c, off); off += c.length; }
                earlyUrl = URL.createObjectURL(new Blob([combined], { type: 'audio/mpeg' }));
                earlyAudio = new Audio(earlyUrl);
                globalAudioRef = earlyAudio;
                earlyAudio.play().catch(() => {});
                console.log('[TTS] ⚡ 스트리밍 조기 재생 시작');
              }
            }
          }
          // 스트리밍 완료 → 전체 오디오로 교체 (끊김 방지)
          if (earlyAudio) {
            earlyAudio.pause();
            URL.revokeObjectURL(earlyUrl);
          }
          const full = new Uint8Array(totalLength);
          let off = 0;
          for (const c of chunks) { full.set(c, off); off += c.length; }
          const finalUrl = URL.createObjectURL(new Blob([full], { type: 'audio/mpeg' }));
          const finalAudio = new Audio(finalUrl);
          globalAudioRef = finalAudio;
          finalAudio.onended = () => { URL.revokeObjectURL(finalUrl); if (globalAudioRef === finalAudio) globalAudioRef = null; resolve(); };
          finalAudio.onerror = () => { URL.revokeObjectURL(finalUrl); if (globalAudioRef === finalAudio) globalAudioRef = null; resolve(); };
          finalAudio.play().catch(() => resolve());
        } catch {
          resolve();
        }
      };
      pump();
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

// ── Barge-in 감지 훅 ── (JARVIS 말하는 중 사용자 발화 감지 → TTS 즉시 중단)
export function useBargein(enabled: boolean, onBargeIn: () => void) {
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animRef = useRef<number>(0);
  const onBargeInRef = useRef(onBargeIn);
  useEffect(() => { onBargeInRef.current = onBargeIn; });

  useEffect(() => {
    if (!enabled) {
      // 정리
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
      return;
    }

    let active = true;
    let triggered = false;
    const BARGE_THRESHOLD = 0.05; // 발화 감지 임계값 (낮춰서 더 잘 감지)
    const BARGE_SUSTAIN = 150; // 150ms 이상 지속 시 barge-in (빠르게 반응)
    const ECHO_GUARD_MS = 1200; // TTS 시작 직후 에코 방지 대기 시간
    const startTime = Date.now();
    let aboveThresholdSince = 0;

    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.4;
        const src = ctx.createMediaStreamSource(stream);
        src.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);

        const detect = () => {
          if (!active || triggered) return;
          // TTS 시작 직후는 에코 방지를 위해 감지 일시 중단
          if (Date.now() - startTime < ECHO_GUARD_MS) {
            animRef.current = requestAnimationFrame(detect);
            return;
          }
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);

          if (rms > BARGE_THRESHOLD) {
            if (aboveThresholdSince === 0) aboveThresholdSince = Date.now();
            if (Date.now() - aboveThresholdSince > BARGE_SUSTAIN) {
              triggered = true;
              console.log('[Barge-in] 🗣️ 사용자 발화 감지 → TTS 즉시 중단');
              onBargeInRef.current();
              return;
            }
          } else {
            aboveThresholdSince = 0;
          }
          animRef.current = requestAnimationFrame(detect);
        };
        animRef.current = requestAnimationFrame(detect);
      })
      .catch(err => console.warn('[Barge-in] 마이크 접근 실패:', err));

    return () => {
      active = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    };
  }, [enabled]);
}

// ── TTS 훅 ──
export function useTextToSpeech() {
  const isSpeakingRef = useRef(false);
  const interruptRef = useRef(false);

  const speak = useCallback(async (
    text: string,
    onStart?: () => void,
    onEnd?: () => void,
    voiceIdOverride?: string
  ) => {
    if (isSpeakingRef.current) {
      console.warn('[TTS] 이미 재생 중 — 중단 후 새로 시작');
      stopGlobalAudio();
    }

    isSpeakingRef.current = true;
    interruptRef.current = false;
    onStart?.();
    
    console.log('[TTS] speak() 시작:', text.substring(0, 60));

    const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;

    // 문장 단위로 분할하여 스트리밍 효과 극대화
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    
    try {
      for (const sentence of sentences) {
        if (interruptRef.current) break;
        
        const trimmed = sentence.trim();
        if (!trimmed) continue;

        if (apiKey) {
          await speakElevenLabs(trimmed, apiKey, voiceIdOverride);
        } else {
          await speakWebSpeech(trimmed);
        }
      }
    } catch (err) {
      console.error('[TTS] 재생 중 오류:', err);
    } finally {
      isSpeakingRef.current = false;
      interruptRef.current = false;
      console.log('[TTS] speak() 완료');
      onEnd?.();
    }
  }, []);

  const stop = useCallback(() => {
    console.log('[TTS] stop() 호출 — 재생 중단');
    interruptRef.current = true;
    isSpeakingRef.current = false;
    stopGlobalAudio();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  return { speak, stop };
}

// ── Wake Word 감지 훅 ── ("자비스" / "Jarvis" 감지 → 콜백 호출)
// Web Speech API continuous 모드를 사용하여 추가 API 키 없이 동작
export function useWakeWord(enabled: boolean, onWakeWord: () => void) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onWakeWordRef = useRef(onWakeWord);
  const enabledRef = useRef(enabled);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { onWakeWordRef.current = onWakeWord; });
  useEffect(() => { enabledRef.current = enabled; });

  useEffect(() => {
    // Web Speech API 지원 여부 확인
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      console.warn('[WakeWord] Web Speech API 미지원 — Wake Word 비활성');
      return;
    }

    if (!enabled) {
      // 비활성화 시 정리
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
      if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
      return;
    }

    const startRecognition = () => {
      if (!enabledRef.current) return;
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ko-KR';
      recognition.maxAlternatives = 3;
      recognitionRef.current = recognition;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (!enabledRef.current) return;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          for (let j = 0; j < event.results[i].length; j++) {
            const transcript = event.results[i][j].transcript.toLowerCase().trim();
            // 웨이크 워드 감지: 자비스 / jarvis / 재비스
            if (
              transcript.includes('자비스') ||
              transcript.includes('jarvis') ||
              transcript.includes('재비스') ||
              transcript.includes('자비 스')
            ) {
              console.log('[WakeWord] 🎙️ 웨이크 워드 감지:', transcript);
              try { recognition.abort(); } catch { /* ignore */ }
              recognitionRef.current = null;
              onWakeWordRef.current();
              return;
            }
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          console.warn('[WakeWord] 마이크 권한 없음 — Wake Word 비활성');
          return;
        }
        // 그 외 오류는 재시작
        if (enabledRef.current) {
          restartTimerRef.current = setTimeout(startRecognition, 1000);
        }
      };

      recognition.onend = () => {
        // 자동 재시작 (continuous 모드에서 브라우저가 중단할 수 있음)
        if (enabledRef.current && recognitionRef.current === recognition) {
          restartTimerRef.current = setTimeout(startRecognition, 500);
        }
      };

      try {
        recognition.start();
        console.log('[WakeWord] ✅ 웨이크 워드 감지 시작 ("자비스" 또는 "Jarvis")');
      } catch (err) {
        console.warn('[WakeWord] 시작 실패:', err);
        if (enabledRef.current) {
          restartTimerRef.current = setTimeout(startRecognition, 1000);
        }
      }
    };

    startRecognition();

    return () => {
      enabledRef.current = false;
      if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
    };
  }, [enabled]);
}
