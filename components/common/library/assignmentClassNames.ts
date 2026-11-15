// Class names an assignment targets, trimmed and without repeats.
export const uniqueClassNames = (
  names: readonly (string | null | undefined)[]
): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw?.trim().replace(/\s+/g, ' ');
    const key = name?.toLocaleLowerCase();
    if (name && key && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
};

/** "1 class" or "N classes". */
export const classCountLabel = (count: number): string =>
  count === 1 ? '1 class' : `${count} classes`;
