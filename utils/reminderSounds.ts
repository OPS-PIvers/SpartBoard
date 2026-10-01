import type { RosterGroupReminderSound } from '@/types';
import { getAudioCtx, resumeAudio } from './timeToolAudio';

interface Note {
  freq: number;
  at: number;
  decay: number;
  gain: number;
  type?: OscillatorType;
}

function playNotes(notes: Note[]) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.setValueAtTime(n.freq, now + n.at);
    gain.gain.setValueAtTime(0, now + n.at);
    gain.gain.linearRampToValueAtTime(n.gain, now + n.at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.decay);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + n.at);
    osc.stop(now + n.at + n.decay + 0.05);
  }
}

/** A struck note with a quieter overtone, for bell and mallet timbres. */
const struck = (
  freq: number,
  at: number,
  decay: number,
  overtone: number,
  gain = 0.16
): Note[] => [
  { freq, at, decay, gain },
  { freq: freq * overtone, at, decay: decay * 0.4, gain: gain * 0.25 },
];

const SOUNDS: Record<Exclude<RosterGroupReminderSound, 'off'>, Note[]> = {
  chime: [
    ...struck(659.25, 0, 1.6, 2),
    ...struck(880, 0.18, 1.8, 2),
    ...struck(1046.5, 0.36, 2.2, 2),
  ],
  bell: [...struck(784, 0, 2.6, 2.76, 0.18), ...struck(784, 0.9, 2.6, 2.76)],
  marimba: [
    ...struck(523.25, 0, 0.45, 4, 0.2),
    ...struck(659.25, 0.16, 0.45, 4, 0.2),
    ...struck(783.99, 0.32, 0.7, 4, 0.2),
  ],
  harp: [523.25, 587.33, 659.25, 783.99, 880, 1046.5].map((freq, i) => ({
    freq,
    at: i * 0.09,
    decay: 1.4,
    gain: 0.1,
    type: 'triangle' as const,
  })),
};

export function playReminderSound(sound: RosterGroupReminderSound) {
  if (sound === 'off') return;
  void resumeAudio()
    .catch(() => undefined)
    .then(() => playNotes(SOUNDS[sound]));
}
