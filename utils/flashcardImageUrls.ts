// Only our own Storage serves card images, so a pasted link can't load from anywhere.
const IMAGE_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

export const isFlashcardImageUrl = (url: unknown): url is string => {
  if (typeof url !== 'string' || url.length > 2048) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
};

export const imageFileFrom = (
  items: DataTransferItemList | FileList | null | undefined
): File | null => {
  if (!items) return null;
  const files: (File | null)[] =
    items instanceof FileList
      ? Array.from(items)
      : Array.from(items, (item) => item.getAsFile());
  return files.find((file) => file?.type.startsWith('image/')) ?? null;
};

/** The card's valid picture fields, for copying through a normalizer. */
export const flashcardImageFields = (card: {
  termImageUrl?: unknown;
  definitionImageUrl?: unknown;
}): { termImageUrl?: string; definitionImageUrl?: string } => ({
  ...(isFlashcardImageUrl(card.termImageUrl)
    ? { termImageUrl: card.termImageUrl }
    : {}),
  ...(isFlashcardImageUrl(card.definitionImageUrl)
    ? { definitionImageUrl: card.definitionImageUrl }
    : {}),
});
