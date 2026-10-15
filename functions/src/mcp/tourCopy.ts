// Mirror of copyProblem in scripts/widget-grader/static/copyGuard.ts, which functions can't import; tests/tourCopyParity.test.ts keeps them equal.
export const MAX_WORDS = 30;

export const copyProblem = (text: string): string | null => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!/[A-Za-z]{2}/.test(clean)) return null;
  if (clean.includes('—')) return 'em dash';
  if (/^(Pro-tip|Tip|Note):/i.test(clean)) return 'Tip/Note prefix';
  if (clean.split(' ').length > MAX_WORDS) return `over ${MAX_WORDS} words`;
  return null;
};
