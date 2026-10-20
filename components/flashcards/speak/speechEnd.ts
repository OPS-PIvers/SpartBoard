// Speak auto-stop: ends a take once speech has been heard and the room has gone quiet again.

export type SpeechEndEvent = 'ended' | 'no-speech';

export interface SpeechEndOptions {
  /** Quiet after the last speech that ends the take. */
  endSilenceMs: number;
  /** A take with no speech by now ends so the student hears "Couldn't hear you". */
  noSpeechMs: number;
  /** Speech shorter than this (a key click, a desk bump) doesn't count. */
  minSpeechMs: number;
}

// 1 s of quiet lets a K-2 student pause between syllables without being cut off.
export const SPEECH_END_DEFAULTS: SpeechEndOptions = {
  endSilenceMs: 1000,
  noSpeechMs: 5000,
  minSpeechMs: 150,
};

// Speech must sit about 10 dB over the quietest moment of the take, and over roughly -42 dBFS.
const OVER_FLOOR = 3.2;
const ABSOLUTE_FLOOR = 0.008;
const FLOOR_SMOOTHING = 3;
// A just-opened mic can hand over exact zeros, which say nothing about the room.
const DIGITAL_SILENCE = 0.0001;
// The room level is a low percentile, so a mic fading in for a few frames can't pin it near zero.
const FLOOR_PERCENTILE = 0.1;
// Caps one frame's weight when a throttled timer leaves a long gap.
const MAX_FRAME_MS = 100;

interface Frame {
  rms: number;
  at: number;
  ms: number;
}

/** Feed it the mic level every few milliseconds; it says when the take should end. */
export function createSpeechEndDetector(
  options: SpeechEndOptions = SPEECH_END_DEFAULTS
) {
  const frames: Frame[] = [];
  const levels: number[] = [];
  let startedAt: number | null = null;
  let heardSound = false;

  return {
    push(rms: number, at: number): SpeechEndEvent | null {
      startedAt ??= at;
      const previous = frames[frames.length - 1];
      frames.push({
        rms,
        at,
        ms: previous ? Math.min(at - previous.at, MAX_FRAME_MS) : 0,
      });
      if (rms >= DIGITAL_SILENCE) heardSound = true;
      if (frames.length >= FLOOR_SMOOTHING) {
        let sum = 0;
        for (let i = frames.length - FLOOR_SMOOTHING; i < frames.length; i++)
          sum += frames[i].rms;
        const level = sum / FLOOR_SMOOTHING;
        if (level >= DIGITAL_SILENCE) levels.push(level);
      }
      const sorted = [...levels].sort((a, b) => a - b);
      const floor = sorted.length
        ? sorted[Math.floor(sorted.length * FLOOR_PERCENTILE)]
        : 0;
      // Re-judged on every frame, so speech heard before the room's floor was known still counts.
      const threshold = Math.max(floor * OVER_FLOOR, ABSOLUTE_FLOOR);
      let voicedMs = 0;
      let lastVoicedAt: number | null = null;
      for (const frame of frames) {
        if (frame.rms < threshold) continue;
        voicedMs += frame.ms;
        lastVoicedAt = frame.at;
      }
      if (voicedMs >= options.minSpeechMs && lastVoicedAt !== null) {
        return at - lastVoicedAt >= options.endSilenceMs ? 'ended' : null;
      }
      // A suspended audio context reads all zeros; leave that take to the time limit.
      return heardSound && at - startedAt >= options.noSpeechMs
        ? 'no-speech'
        : null;
    },
  };
}
