import { useEffect, useRef, useCallback } from 'react';

interface ClapDetectorProps {
  onClap: () => void;
  onAudioLevel: (level: number) => void;
  enabled: boolean;
  /** true일 때 마이크 스트림 완전 해제 (Whisper STT가 마이크 사용) */
  releaseStream: boolean;
}

/**
 * ClapDetector v7 — 안정적 박수 감지 + Whisper STT 공존
 * 
 * 핵심 변경:
 * - 초기화 시 즉시 마이크 획득 및 분석 시작 (쿨다운 제거)
 * - releaseStream=true → 분석만 중단 (스트림은 유지하되 AudioContext suspend)
 * - releaseStream=false → AudioContext resume + 분석 재개
 * - Whisper STT는 별도 getUserMedia로 마이크 획득 (공존 가능)
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
  const activeRef = useRef(false);
  const initDoneRef = useRef(false);

  const onClapRef = useRef(onClap);
  const onAudioLevelRef = useRef(onAudioLevel);
  onClapRef.current = onClap;
  onAudioLevelRef.current = onAudioLevel;
  enabledRef.current = enabled;

  // 분석 루프
  const startAnalysisLoop = useCallback(() => {
    if (animRef.current) {
      console.log('[ClapDetector] 분석 루프 이미 실행 중');
      return;
    }
    if (!analyserRef.current) {
      console.warn('[ClapDetector] analyser가 없어서 분석 루프 시작 불가');
      return;
    }

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    console.log('[ClapDetector] 분석 루프 시작');

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

        const threshold = 0.10; // 임계값 낙춴 (자연스러운 박수 2번으로 활성화)
        const now = Date.now();
        const MIN_CLAP_GAP = 600; // 박수 1번의 잔향 피크 무시 (600ms 간격)
        const CLAP_WINDOW = 4000; // 4초 안에 2번 박수 쳐야 활성화

        if (rms > threshold && now - lastClapRef.current > MIN_CLAP_GAP) {
          lastClapRef.current = now;
          clapCountRef.current += 1;
          console.log(`[ClapDetector] 박수 감지! count=${clapCountRef.current}, rms=${rms.toFixed(3)}`);

          // 첫 번째 박수 시 윈도우 타이머 시작 (두 번째 박수 기다림)
          if (clapCountRef.current === 1) {
            if (clapWindowTimerRef.current) clearTimeout(clapWindowTimerRef.current);
            clapWindowTimerRef.current = setTimeout(() => {
              console.log('[ClapDetector] 박수 윈도우 만료 — count 리셋');
              clapCountRef.current = 0;
            }, CLAP_WINDOW);
          }

          if (clapCountRef.current >= 2) {
            console.log('[ClapDetector] ✅ 박수 2회 감지! onClap 호출');
            clapCountRef.current = 0;
            if (clapWindowTimerRef.current) clearTimeout(clapWindowTimerRef.current);
            clapWindowTimerRef.current = null;
            onClapRef.current();
          }
        }
      }

      animRef.current = requestAnimationFrame(check);
    };

    check();
  }, []);

  // 분석 루프 중지
  const stopAnalysisLoop = useCallback(() => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = 0;
      console.log('[ClapDetector] 분석 루프 중지');
    }
  }, []);

  // 마이크 스트림 초기 획득 (1회만)
  const initMicrophone = useCallback(async () => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;

    try {
      console.log('[ClapDetector] 마이크 스트림 초기화 시작...');
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
      startAnalysisLoop();

      console.log('[ClapDetector] ✅ 마이크 스트림 초기화 완료 (영구 유지)');
    } catch (err) {
      console.warn('[ClapDetector] ❌ 마이크 접근 실패:', err);
      initDoneRef.current = false; // 재시도 가능하도록
    }
  }, [startAnalysisLoop]);

  // 초기 마이크 획득 (컴포넌트 마운트 시 1회)
  useEffect(() => {
    initMicrophone();

    return () => {
      // 컴포넌트 언마운트 시 정리
      activeRef.current = false;
      stopAnalysisLoop();
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

  // releaseStream 변경 시: suspend/resume으로 전환 (스트림은 유지)
  useEffect(() => {
    if (!audioContextRef.current) return;

    if (releaseStream) {
      // STT가 마이크를 사용해야 하므로 분석 중단 + AudioContext suspend
      activeRef.current = false;
      stopAnalysisLoop();
      audioContextRef.current.suspend().then(() => {
        console.log('[ClapDetector] AudioContext suspended (스트림 유지)');
      });
    } else {
      // STT가 끝났으므로 분석 재개
      audioContextRef.current.resume().then(() => {
        console.log('[ClapDetector] AudioContext resumed');
        activeRef.current = true;
        clapCountRef.current = 0;
        // 1초 쿨다운 후 분석 시작 (잔여 오디오 무시)
        setTimeout(() => {
          if (activeRef.current && analyserRef.current) {
            startAnalysisLoop();
          }
        }, 1000);
      });
    }
  }, [releaseStream, stopAnalysisLoop, startAnalysisLoop]);

  return null;
}
