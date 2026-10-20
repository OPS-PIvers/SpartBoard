import { useEffect, useState } from 'react';

type AudioContextCtor = typeof AudioContext;

const audioContextCtor = (): AudioContextCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
};

/** Live 0-1 input level of a mic stream; 0 when Web Audio is missing. */
export function useMicLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const Ctor = audioContextCtor();
    if (!stream || !Ctor) return undefined;
    let context: AudioContext;
    try {
      context = new Ctor();
    } catch {
      return undefined;
    }
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      // Speech RMS sits around 0.02-0.2, so scale it into a readable bar.
      setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 6));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      source.disconnect();
      void context.close().catch(() => undefined);
      setLevel(0);
    };
  }, [stream]);
  return level;
}
