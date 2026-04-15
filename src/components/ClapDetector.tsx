import { useEffect, useRef, useCallback } from 'react';

interface ClapDetectorProps {
  onClap: () => void;
  onAudioLevel: (level: number) => void;
  enabled: boolean;
  /** true일 때 마이크 스트림 완전 해제 (Whisper STT가 마이크 사용) */
  releaseStream: boolean;
}

/**
 * ClapDetector v6 — Whisper STT와 공존
 * 
 * releaseStream=true → 스트림 완전 해제 (tracks stop + AudioContext close)
 *   → Whisper STT의 getUserMedia가 마이크를 독점 사용 가능
 * releaseStream=false → 새로 getUserMedia 호출하여 박수 감지 재개
 *   → 1.5초 쿨다운 후 박수 감지 시작
 */
export default function ClapDetector({ onClap, onAudioLevel, enabled, releaseStream }: ClapDetectorProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);
  const lastClapRef = useRef<number>(0);
  const clapCountRef = useRef<number>(0);
  const clapWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  const releaseStreamRef = useRef(releaseStream);
  const activeRef = useRef(false);

  const onClapRef = useRef(onClap);
  const onAudioLevelRef = useRef(onAudioLevel);
  onClapRef.current = onClap;
  onAudioLevelRef.current = onAudioLevel;
  enabledRef.current = enabled;
  releaseStreamRef.current = releaseStream;

  // 분석 루프
  const startAnalysisLoop = useCallback(() => {
    if (animRef.current) return;
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const check = () => {
      if (!analyserRef.current || !activeRef.current) {
        animRef.current = 0;
        return;
      }
      analyserRef.current.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / bufferLength);

      if (enabledRef.current) {
        onAudioLevelRef.current(Math.min(rms * 4, 1));

        const threshold = 0.28;
        const now = Date.now();

        if (rms > threshold && now - lastClapRef.current > 120) {
          lastClapRef.current = now;
          clapCountRef.current += 1;

          if (clapWindowTimerRef.current) clearTimeout(clapWindowTimerRef.current);
          clapWindowTimerRef.current = setTimeout(() => {
            clapCountRef.current = 0;
          }, 1000);

          if (clapCountRef.current >= 2) {
            clapCountRef.current = 0;
            if (clapWindowTimerRef.current) clearTimeout(clapWindowTimerRef.current);
            onClapRef.current();
          }
        }
      }

      animRef.current = requestAnimationFrame(check);
    };

    check();
  }, []);

  // 마이크 스트림 시작
  const acquireStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      activeRef.current = true;
      
      // 1.5초 쿨다운 후 박수 감지 시작
      lastClapRef.current = Date.now() + 1500;
      clapCountRef.current = 0;
      
      setTimeout(() => {
        if (activeRef.current) {
          startAnalysisLoop();
        }
      }, 1500);

      console.log('[ClapDetector] 마이크 스트림 획득 완료 (쿨다운 1.5s)');
    } catch (err) {
      console.warn('[ClapDetector] 마이크 접근 실패:', err);
    }
  }, [startAnalysisLoop]);

  // 마이크 스트림 완전 해제
  const releaseAllStream = useCallback(() => {
    activeRef.current = false;
    cancelAnimationFrame(animRef.current);
    animRef.current = 0;
    if (clapWindowTimerRef.current) clearTimeout(clapWindowTimerRef.current);
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    console.log('[ClapDetector] 마이크 스트림 완전 해제');
  }, []);

  // 초기 마이크 획득
  useEffect(() => {
    if (!releaseStreamRef.current) {
      acquireStream();
    }

    return () => {
      releaseAllStream();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // releaseStream 변경 시 스트림 해제/재획득
  useEffect(() => {
    if (releaseStream) {
      // STT가 마이크를 사용해야 하므로 완전 해제
      releaseAllStream();
    } else {
      // STT가 끝났으므로 마이크 재획득
      if (!streamRef.current) {
        acquireStream();
      }
    }
  }, [releaseStream, releaseAllStream, acquireStream]);

  return null;
}
