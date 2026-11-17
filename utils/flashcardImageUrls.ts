// Only a Drive file link is a card picture, so a pasted link can't load from anywhere.
const DRIVE_IMAGE_URL =
  /^https:\/\/lh3\.googleusercontent\.com\/d\/[\w-]{10,200}$/u;

export const isFlashcardImageUrl = (url: unknown): url is string =>
  typeof url === 'string' && DRIVE_IMAGE_URL.test(url);

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
