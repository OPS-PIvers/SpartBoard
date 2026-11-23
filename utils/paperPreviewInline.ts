// Only an img src attribute counts, so escaped teacher text that looks like a URL is left alone.
const BLOB_SRC = /(src=")(blob:[^"]+)(")/g;

/** The object URLs a page document loads as image sources. */
export const blobUrlsOf = (doc: string): string[] =>
  [...doc.matchAll(BLOB_SRC)].map((m) => m[2]);

/** The document with each object URL swapped for its data URL (empty until read). */
export const inlineBlobUrls = (
  doc: string,
  data: ReadonlyMap<string, string>
): string =>
  doc.replace(
    BLOB_SRC,
    (_m, a: string, u: string, b: string) => `${a}${data.get(u) ?? ''}${b}`
  );
