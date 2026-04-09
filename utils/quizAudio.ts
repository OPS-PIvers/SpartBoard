/**
 * quizAudio — Web Audio API sound effects for the quiz widget.
 *
 * Uses synthesized tones (oscillators) so no external audio files are needed.
 * Follows the global AudioContext singleton pattern from SoundboardWidget.
 */

// Safari fallback
interface CustomWindow extends Window {
  webkitAudioContext: typeof AudioContext;
}

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as CustomWindow).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

/** Resume the AudioContext after a user interaction (required by browsers). */
function ensureResumed() {
  const ctx = getCtx();
  if (ctx.state === 'suspended') {
    // Silently swallow rejection (e.g. no user gesture yet)
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    void ctx.resume().catch(() => {});
  }
}

// ─── Individual sound effects ────────────────────────────────────────────────

/** Short rising chime for correct answers. */
export function playCorrectChime() {
  ensureResumed();
  const ctx = getCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(523.25, now); // C5
  osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
  osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.4);
}

/** Short descending buzz for incorrect answers. */
export function playIncorrectBuzz() {
  ensureResumed();
  const ctx = getCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(150, now + 0.25);
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

/** Countdown tick — used for the last 5 seconds of a timed question. */
export function playCountdownTick() {
  ensureResumed();
  const ctx = getCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now); // A5
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

/** Fanfare for podium/leaderboard reveal. */
export function playPodiumFanfare() {
  ensureResumed();
  const ctx = getCtx();
  const now = ctx.currentTime;

  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const start = now + i * 0.15;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.25, start);
    gain.gain.exponentialRampToValueAtTime(0.01, start + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.35);
  });
}

/** Celebration jingle for quiz completion. */
export function playQuizCompleteCelebration() {
  ensureResumed();
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Ascending arpeggio + final chord
  const melody = [523.25, 587.33, 659.25, 783.99, 1046.5];
  melody.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const start = now + i * 0.12;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.2, start);
    gain.gain.exponentialRampToValueAtTime(0.01, start + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.55);
  });
}

/** Streak fire sound — quick ascending sweep. */
export function playStreakSound() {
  ensureResumed();
  const ctx = getCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}
