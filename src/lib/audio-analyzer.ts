/**
 * Web Audio API 기반 오디오 레벨 분석기
 * - 마이크 입력 레벨 (0~1)
 * - TTS 오디오 출력 레벨 (0~1)
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ── 마이크 오디오 레벨 분석 ──
export function useMicrophoneLevel(enabled: boolean) {
  const [level, setLevel] = useState(0);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number>(0);
  const dataRef = useRef<Uint8Array | null>(null);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const ctx = new AudioContext();
      contextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      const tick = () => {
        if (!analyserRef.current || !dataRef.current) return;
        analyserRef.current.getByteFrequencyData(dataRef.current);
        const avg = dataRef.current.reduce((s, v) => s + v, 0) / dataRef.current.length;
        setLevel(Math.min(avg / 128, 1));
        frameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn('[AudioAnalyzer] 마이크 접근 실패:', e);
    }
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    contextRef.current?.close();
    contextRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
    return stop;
  }, [enabled, start, stop]);

  return level;
}

// ── TTS HTMLAudioElement 오디오 레벨 분석 ──
export function useAudioElementLevel(audioEl: HTMLAudioElement | null) {
  const [level, setLevel] = useState(0);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const frameRef = useRef<number>(0);
  const dataRef = useRef<Uint8Array | null>(null);
  const connectedRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioEl || connectedRef.current === audioEl) return;
    connectedRef.current = audioEl;

    // 이미 연결된 컨텍스트 정리
    cancelAnimationFrame(frameRef.current);
    sourceRef.current?.disconnect();
    contextRef.current?.close();

    try {
      const ctx = new AudioContext();
      contextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);

      const source = ctx.createMediaElementSource(audioEl);
      source.connect(analyser);
      analyser.connect(ctx.destination); // 스피커로도 출력
      sourceRef.current = source;

      const tick = () => {
        if (!analyserRef.current || !dataRef.current) return;
        analyserRef.current.getByteFrequencyData(dataRef.current);
        const avg = dataRef.current.reduce((s, v) => s + v, 0) / dataRef.current.length;
        setLevel(Math.min(avg / 100, 1));
        frameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn('[AudioAnalyzer] TTS 오디오 분석 실패:', e);
    }

    return () => {
      cancelAnimationFrame(frameRef.current);
      sourceRef.current?.disconnect();
      contextRef.current?.close();
      setLevel(0);
    };
  }, [audioEl]);

  return level;
}
