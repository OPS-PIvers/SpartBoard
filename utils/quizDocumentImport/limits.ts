/**
 * What the reader will take on (docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D18).
 * Its own module so the PDF reader can refuse an over-long document the
 * moment it knows the page count, without importing the front door.
 */

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 20;
/** An LMS export is a zip, so its unpacked size needs its own ceiling. */
export const MAX_CARTRIDGE_UNZIPPED_BYTES = 100 * 1024 * 1024;

/** Thrown before the document is read, so an oversized file costs nothing. */
export class DocumentTooLargeError extends Error {}

/** ExamView keeps pictures as raw bitmaps, so its own test files run large. */
export const MAX_EXAMVIEW_TEST_BYTES = 64 * 1024 * 1024;

/** The byte budget for an import whose test is this kind of file. */
export const byteLimitFor = (kind: string | null): number =>
  kind === 'examview' ? MAX_EXAMVIEW_TEST_BYTES : MAX_DOCUMENT_BYTES;

/**
 * D18's budget is per import, not per file, so a test and its key file share
 * one allowance. Pass every file the import will read.
 */
export function assertWithinByteLimit(...files: Blob[]): void {
  assertWithinByteLimitOf(MAX_DOCUMENT_BYTES, files);
}

export function assertWithinByteLimitOf(
  maxBytes: number,
  files: readonly Blob[]
): void {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > maxBytes) {
    const mb = Math.round(maxBytes / 1024 / 1024);
    throw new DocumentTooLargeError(
      files.length > 1
        ? `The test and its answer key come to more than ${mb} MB together. Split them into smaller files and import them one at a time.`
        : `This file is larger than ${mb} MB. Split it into smaller files and import them one at a time.`
    );
  }
}

export function assertWithinPageLimit(
  pageCount: number,
  maxPages: number = MAX_DOCUMENT_PAGES
): void {
  if (pageCount > maxPages) {
    throw new DocumentTooLargeError(
      `This file is ${pageCount} pages. Split it into files of ${maxPages} pages or fewer and import them one at a time.`
    );
  }
}
