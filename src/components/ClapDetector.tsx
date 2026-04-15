import { useEffect, useRef, useCallback } from 'react';

interface ClapDetectorProps {
  onClap: () => void;
  onAudioLevel: (level: number) => void;
  enabled: boolean;
  /** true일 때 마이크 스트림을 완전히 해제 (STT와 충돌 방지) */
  releaseStream: boolean;
}

/**
 * ClapDetector v3 — STT와 마이크 공유 문제 해결
 * 
 * releaseStream=true → 마이크 스트림 완전 해제 (STT가 마이크 사용 가능)
 * releaseStream=false → 마이크 스트림 열고 박수 감지 시작
 * enabled=false → 감지 로직만 비활성 (스트림은 releaseStream에 따라)
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

  const onClapRef = useRef(onClap);
  const onAudioLevelRef = useRef(onAudioLevel);
  onClapRef.current = onClap;
  onAudioLevelRef.current = onAudioLevel;
  enabledRef.current = enabled;
  releaseStreamRef.current = releaseStream;

  const stopStream = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    animRef.current = 0;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    console.log('[ClapDetector] 마이크 스트림 해제됨');
  }, []);

  const startStream = useCallback(async () => {
    // 이미 열려있으면 무시
    if (streamRef.current) return;
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

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const check = () => {
        if (!analyserRef.current) return;
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
      console.log('[ClapDetector] 마이크 스트림 시작됨');
    } catch (err) {
      console.warn('[ClapDetector] 마이크 접근 실패:', err);
    }
  }, []);

  // releaseStream 변경 시 마이크 스트림 열기/닫기
  useEffect(() => {
    if (releaseStream) {
      // STT가 마이크를 사용해야 하므로 스트림 해제
      stopStream();
    } else {
      // STT가 끝났으므로 스트림 다시 열기
      startStream();
    }
  }, [releaseStream, stopStream, startStream]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (clapWindowTimerRef.current) clearTimeout(clapWindowTimerRef.current);
      stopStream();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
