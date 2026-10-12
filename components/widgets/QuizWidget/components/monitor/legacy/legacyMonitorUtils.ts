/** Drops the leading words every label shares, so "(S1) Wooley, L SPANISH II A(5)" reads "A(5)". */
export const shortPeriodLabels = (labels: readonly string[]): string[] => {
  if (labels.length < 2) return [...labels];
  const words = labels.map((l) => l.split(/\s+/).filter(Boolean));
  const shortest = Math.min(...words.map((w) => w.length));
  let shared = 0;
  while (
    shared < shortest - 1 &&
    words.every((w) => w[shared] === words[0][shared])
  )
    shared += 1;
  return words.map((w, i) =>
    shared > 0 ? w.slice(shared).join(' ') : labels[i]
  );
};
