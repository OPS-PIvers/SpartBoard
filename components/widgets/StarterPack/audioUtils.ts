// Singleton-like Audio Manager to prevent performance issues
let audioCtx: AudioContext | null = null;

// Add type definition for webkitAudioContext
interface CustomWindow extends Window {
  webkitAudioContext: typeof AudioContext;
}

export const getAudioCtx = () => {
  if (typeof window === 'undefined') return null; // Guard against SSR/non-browser env
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as CustomWindow).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
};

export const playCleanUp = () => {
  try {
    const ctx = getAudioCtx();
    if (!ctx || ctx.state === 'suspended') return;
    const now = ctx.currentTime;

    // Subtle "Soft Chime" using two sine waves
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783.99, now); // G5 (Harmonic)

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now); // Remove high-frequency "sharpness"

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.02); // Soft attack
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6); // Gentle decay

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(now + 0.7);
    osc2.stop(now + 0.7);
  } catch (_e) {
    // Audio failed - silently ignore
  }
};
