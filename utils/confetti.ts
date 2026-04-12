import confetti from 'canvas-confetti';

export const triggerConfetti = (options?: Parameters<typeof confetti>[0]) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return Promise.resolve();
  }
  return confetti(options);
};
