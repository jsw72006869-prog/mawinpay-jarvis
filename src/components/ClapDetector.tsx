import { useEffect, useRef, useCallback } from 'react';

interface ClapDetectorProps {
  onClap: () => void;
  onAudioLevel: (level: number) => void;
  enabled: boolean;
  /** true일 때 감지 일시 중단 (스트림은 유지, AudioContext만 suspend) */
  releaseStream: boolean;
}

/**
 * ClapDetector v4 — 마이크 스트림 항상 유지, AudioContext suspend/resume으로 전환
 * 
 * 핵심 변경: 마이크 스트림을 절대 해제하지 않음 (getUserMedia 1회만 호출)
 * releaseStream=true → AudioContext.suspend() (분석만 중단, 스트림 유지)
 * releaseStream=false → AudioContext.resume() (분석 재개)
 * 
 * 이렇게 하면 브라우저가 마이크 장치를 "사용 불가"로 표시하지 않으므로
 * Web Speech API(STT)가 마이크에 접근할 수 있음
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
  const suspendedRef = useRef(false);

  const onClapRef = useRef(onClap);
  const onAudioLevelRef = useRef(onAudioLevel);
  onClapRef.current = onClap;
  onAudioLevelRef.current = onAudioLevel;
  enabledRef.current = enabled;
  releaseStreamRef.current = releaseStream;

  // 분석 루프 시작
  const startAnalysisLoop = useCallback(() => {
    if (animRef.current) return; // 이미 실행 중
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const check = () => {
      if (!analyserRef.current || suspendedRef.current) {
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

  // 마이크 스트림 초기화 (1회만)
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;

        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.2;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        console.log('[ClapDetector] 마이크 스트림 초기화 완료 (영구 유지)');

        // 초기 상태에 따라 시작/일시중단
        if (releaseStreamRef.current) {
          audioContext.suspend();
          suspendedRef.current = true;
          console.log('[ClapDetector] 초기 상태: suspended');
        } else {
          suspendedRef.current = false;
          startAnalysisLoop();
        }
      } catch (err) {
        console.warn('[ClapDetector] 마이크 접근 실패:', err);
      }
    }

    init();

    return () => {
      cancelled = true;
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
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // releaseStream 변경 시 AudioContext suspend/resume (스트림은 유지)
  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    if (releaseStream) {
      // STT가 마이크를 사용해야 하므로 분석만 중단 (스트림은 유지!)
      suspendedRef.current = true;
      cancelAnimationFrame(animRef.current);
      animRef.current = 0;
      ctx.suspend().then(() => {
        console.log('[ClapDetector] AudioContext suspended (스트림 유지)');
      }).catch(() => {});
    } else {
      // STT가 끝났으므로 분석 재개
      suspendedRef.current = false;
      ctx.resume().then(() => {
        console.log('[ClapDetector] AudioContext resumed');
        startAnalysisLoop();
      }).catch(() => {});
    }
  }, [releaseStream, startAnalysisLoop]);

  return null;
}
