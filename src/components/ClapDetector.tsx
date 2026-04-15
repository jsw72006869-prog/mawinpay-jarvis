import { useEffect, useRef, useCallback } from 'react';

interface ClapDetectorProps {
  onClap: () => void;
  onAudioLevel: (level: number) => void;
  enabled: boolean;
}

/**
 * ClapDetector v2 — 마이크 스트림을 한 번만 열고 유지
 * enabled가 false일 때는 감지 로직만 비활성화 (스트림은 유지)
 * → STT(Web Speech API)와 마이크 충돌 방지
 */
export default function ClapDetector({ onClap, onAudioLevel, enabled }: ClapDetectorProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);
  const lastClapRef = useRef<number>(0);
  const clapCountRef = useRef<number>(0);
  const clapWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  const initializedRef = useRef(false);

  const onClapRef = useRef(onClap);
  const onAudioLevelRef = useRef(onAudioLevel);
  onClapRef.current = onClap;
  onAudioLevelRef.current = onAudioLevel;
  enabledRef.current = enabled;

  const detectLoop = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const check = () => {
      analyser.getByteTimeDomainData(dataArray);

      // RMS 계산 (음량 레벨)
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / bufferLength);

      // enabled일 때만 감지 로직 실행 (스트림은 항상 유지)
      if (enabledRef.current) {
        onAudioLevelRef.current(Math.min(rms * 4, 1));

        // 박수 감지: 짧고 강한 충격음
        const threshold = 0.28;
        const now = Date.now();

        if (rms > threshold && now - lastClapRef.current > 120) {
          lastClapRef.current = now;
          clapCountRef.current += 1;

          // 1초 내에 2번 박수 = 활성화
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

  // 마이크 스트림 1회 초기화 (컴포넌트 마운트 시)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initAudio = async () => {
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

        detectLoop();
      } catch (err) {
        console.warn('[ClapDetector] 마이크 접근 실패:', err);
      }
    };

    initAudio();

    return () => {
      cancelAnimationFrame(animRef.current);
      if (clapWindowTimerRef.current) clearTimeout(clapWindowTimerRef.current);
      // 언마운트 시에만 스트림 정리
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioContextRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
