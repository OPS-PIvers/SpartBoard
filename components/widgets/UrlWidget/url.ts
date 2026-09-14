export const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === '' || /^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

// Returns an openable http(s) href, or null for empty/unsafe values such as javascript: URIs.
export const toSafeLinkHref = (value: string | undefined): string | null => {
  const normalized = normalizeUrl(value ?? '');
  if (normalized === '') return null;
  try {
    const { protocol } = new URL(normalized);
    return protocol === 'http:' || protocol === 'https:' ? normalized : null;
  } catch {
    return null;
  }
};
