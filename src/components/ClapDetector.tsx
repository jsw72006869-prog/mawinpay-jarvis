

import { useEffect, useRef, useCallback } from 'react';

interface ClapDetectorProps {
  onClap: () => void;
  onAudioLevel: (level: number) => void;
  enabled: boolean;
}

export default function ClapDetector({ onClap, onAudioLevel, enabled }: ClapDetectorProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clapTimesRef = useRef<number[]>([]);
  const animRef = useRef<number>(0);
  const lastClapRef = useRef<number>(0);
  const clapCountRef = useRef<number>(0);
  const clapWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onClapRef = useRef(onClap);
  const onAudioLevelRef = useRef(onAudioLevel);
  onClapRef.current = onClap;
  onAudioLevelRef.current = onAudioLevel;

  const detectClap = useCallback(() => {
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
      onAudioLevelRef.current(Math.min(rms * 4, 1));

      // 박수 감지: 짧고 강한 충격음
      // 임계값을 0.28로 높여서 일반 대화와 구분
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
          clapTimesRef.current = [];
          onClapRef.current();
        }
      }

      animRef.current = requestAnimationFrame(check);
    };

    check();
  }, []);

  useEffect(() => {
    if (!enabled) {
      cancelAnimationFrame(animRef.current);
      return;
    }

    const initAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.2; // 빠른 반응
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        detectClap();
      } catch (err) {
        console.warn('마이크 접근 실패:', err);
      }
    };

    initAudio();

    return () => {
      cancelAnimationFrame(animRef.current);
      if (clapWindowTimerRef.current) clearTimeout(clapWindowTimerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioContextRef.current?.close();
    };
  }, [enabled, detectClap]);

  return null; // 렌더링 없음
}
