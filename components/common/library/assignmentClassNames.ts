// Joins class names for an assignment row, writing a shared SIS prefix or suffix once.

const uniqueNames = (
  names: readonly (string | null | undefined)[]
): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw?.trim().replace(/\s+/g, ' ');
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
};

const commonPrefixLength = (names: string[]): number => {
  let len = names[0].length;
  for (const name of names.slice(1)) {
    let i = 0;
    while (i < len && i < name.length && name[i] === names[0][i]) i++;
    len = i;
  }
  // Only cut right after a space, so "Period 1" and "Period 10" share "Period ".
  const cut = names[0].lastIndexOf(' ', len - 1);
  return cut < 0 ? 0 : cut + 1;
};

const commonSuffixLength = (names: string[], prefixLen: number): number => {
  const shortest = Math.min(...names.map((n) => n.length)) - prefixLen;
  const first = names[0];
  let len = 0;
  while (
    len < shortest &&
    names.every((n) => n[n.length - 1 - len] === first[first.length - 1 - len])
  ) {
    len++;
  }
  // Only cut right before a space, and never take a whole differing part.
  const tail = first.slice(first.length - len);
  const space = tail.indexOf(' ');
  if (space < 0) return 0;
  const suffixLen = len - space;
  return names.every((n) => n.length - prefixLen - suffixLen > 0)
    ? suffixLen
    : 0;
};

/** One readable line for the classes an assignment targets, or null for none. */
export const formatAssignmentClassNames = (
  names: readonly (string | null | undefined)[]
): string | null => {
  const list = uniqueNames(names);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  const prefixLen = commonPrefixLength(list);
  const suffixLen = commonSuffixLength(list, prefixLen);
  if (prefixLen === 0 && suffixLen === 0) return list.join(', ');
  const prefix = list[0].slice(0, prefixLen);
  const suffix = list[0].slice(list[0].length - suffixLen);
  const parts = list.map((n) =>
    n.slice(prefixLen, n.length - suffixLen).trim()
  );
  // Only compress when each class differs by one word, like a period number.
  if (parts.some((p) => p.length === 0 || p.includes(' ')))
    return list.join(', ');
  return `${prefix}${parts.join(', ')}${suffix}`;
};

/** Three or more unrelated classes read as the first one plus a count; null otherwise. */
export const splitAssignmentClassNames = (
  names: readonly (string | null | undefined)[]
): { first: string; more: number; total: number } | null => {
  const list = uniqueNames(names);
  if (list.length < 3) return null;
  if (formatAssignmentClassNames(list) !== list.join(', ')) return null;
  return { first: list[0], more: list.length - 1, total: list.length };
};

/** Every class on its own line, for the hover title. */
export const assignmentClassNamesTitle = (
  names: readonly (string | null | undefined)[]
): string => uniqueNames(names).join('\n');
