// Index of the first non-silent window after the next silent run at/after fromIdx.
export function nextSpeechStart(
  silent: boolean[],
  fromIdx: number
): number | null {
  let i = Math.max(0, fromIdx);
  while (i < silent.length && !silent[i]) i++;
  while (i < silent.length && silent[i]) i++;
  return i < silent.length ? i : null;
}
