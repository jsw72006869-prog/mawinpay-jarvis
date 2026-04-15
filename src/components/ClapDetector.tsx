import { useEffect, useRef, useCallback } from 'react';

interface ClapDetectorProps {
  onClap: () => void;
  onAudioLevel: (level: number) => void;
  enabled: boolean;
  /** true일 때 감지 일시 중단 (마이크 트랙 비활성화 + AudioContext suspend) */
  releaseStream: boolean;
}

/**
 * ClapDetector v5 — 마이크 트랙 enabled 토글로 Web Speech API와 공존
 * 
 * 핵심: releaseStream=true일 때
 *   1. AudioContext.suspend() (분석 중단)
 *   2. 마이크 트랙 enabled=false (마이크를 Web Speech API에 양보)
 * 
 * releaseStream=false일 때
 *   1. 마이크 트랙 enabled=true (마이크 다시 사용)
 *   2. AudioContext.resume() (분석 재개)
 *   3. 1.5초 쿨다운 후 박수 감지 시작
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

  // 마이크 트랙 활성/비활성 헬퍼
  const setMicTrackEnabled = useCallback((value: boolean) => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach(track => {
      track.enabled = value;
    });
    console.log(`[ClapDetector] 마이크 트랙 enabled=${value}`);
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
          // 마이크 트랙도 비활성화
          stream.getAudioTracks().forEach(track => { track.enabled = false; });
          suspendedRef.current = true;
          console.log('[ClapDetector] 초기 상태: suspended + 트랙 비활성');
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

  // releaseStream 변경 시 마이크 트랙 + AudioContext 제어
  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    if (releaseStream) {
      // ★ STT가 마이크를 사용해야 하므로:
      // 1. 분석 루프 중단
      suspendedRef.current = true;
      cancelAnimationFrame(animRef.current);
      animRef.current = 0;
      // 2. AudioContext suspend
      ctx.suspend().then(() => {
        console.log('[ClapDetector] AudioContext suspended');
      }).catch(() => {});
      // 3. 마이크 트랙 비활성화 → Web Speech API가 마이크 독점 사용 가능
      setMicTrackEnabled(false);
    } else {
      // ★ STT가 끝났으므로 마이크 되찾기:
      // 1. 마이크 트랙 다시 활성화
      setMicTrackEnabled(true);
      // 2. AudioContext resume
      ctx.resume().then(() => {
        console.log('[ClapDetector] AudioContext resumed (쿨다운 1.5s)');
        // 쿨다운: resume 직후의 잔여 데이터 무시
        lastClapRef.current = Date.now() + 1500;
        clapCountRef.current = 0;
        setTimeout(() => {
          suspendedRef.current = false;
          startAnalysisLoop();
        }, 1500);
      }).catch(() => {});
    }
  }, [releaseStream, startAnalysisLoop, setMicTrackEnabled]);

  return null;
}
