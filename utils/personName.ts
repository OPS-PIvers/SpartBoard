// Readable member names: an email-style handle like "paul.ivers" shows as "Paul Ivers".

const titleCaseHandle = (handle: string): string =>
  handle
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** First Last for a member whose saved name is empty or just their email handle. */
export function personName(p: {
  displayName?: string;
  email?: string;
}): string {
  const name = p.displayName?.trim() ?? '';
  const handle = p.email?.split('@')[0]?.trim() ?? '';
  if (name && /\s/.test(name)) return name;
  const raw = name.includes('@') ? (name.split('@')[0] ?? '') : name;
  if (!raw) return handle ? titleCaseHandle(handle) : '';
  if (raw.toLowerCase() === handle.toLowerCase() || /[._]/.test(raw)) {
    return titleCaseHandle(raw);
  }
  return raw;
}
