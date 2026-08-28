import { getAudioCtx } from '@/utils/timeToolAudio';

// Delegates to the app-wide shared AudioContext singleton (avoids per-widget-type contexts).
export const getDiceAudioCtx = getAudioCtx;

export const playRollSound = () => {
  try {
    const ctx = getDiceAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150 + Math.random() * 50, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (_e) {
    // Audio failed - silently ignore
  }
};
