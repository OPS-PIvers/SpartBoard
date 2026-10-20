import { useEffect, useEffectEvent } from 'react';
import { audioContextCtor } from './useMicLevel';
import {
  SPEECH_END_DEFAULTS,
  createSpeechEndDetector,
  type SpeechEndEvent,
  type SpeechEndOptions,
} from './speechEnd';

// A timer, not animation frames, so a covered or backgrounded window still ends the take.
const POLL_MS = 30;

/** Calls onEnd once while `stream` is live and the student has finished speaking (or never started). */
export function useSpeechEnd(
  stream: MediaStream | null,
  onEnd: (event: SpeechEndEvent) => void,
  options: SpeechEndOptions = SPEECH_END_DEFAULTS
): void {
  const fire = useEffectEvent(onEnd);
  const { endSilenceMs, noSpeechMs, minSpeechMs } = options;
  useEffect(() => {
    const Ctor = audioContextCtor();
    if (!stream || !Ctor) return undefined;
    let context: AudioContext | null = null;
    let analyser: AnalyserNode;
    let source: MediaStreamAudioSourceNode;
    try {
      context = new Ctor();
      void context.resume().catch(() => undefined);
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source = context.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch {
      void context?.close().catch(() => undefined);
      return undefined;
    }
    const opened = context;
    const samples = new Float32Array(analyser.fftSize);
    const detector = createSpeechEndDetector({
      endSilenceMs,
      noSpeechMs,
      minSpeechMs,
    });
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const event = detector.push(
        Math.sqrt(sum / samples.length),
        performance.now()
      );
      if (!event) return;
      window.clearInterval(timer);
      fire(event);
    }, POLL_MS);
    return () => {
      window.clearInterval(timer);
      source.disconnect();
      void opened.close().catch(() => undefined);
    };
  }, [stream, endSilenceMs, noSpeechMs, minSpeechMs]);
}
