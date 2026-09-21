/**
 * What the reader will take on (docs/plans/QUIZ_DOCUMENT_IMPORT.md D18).
 * Its own module so the PDF reader can refuse an over-long document the
 * moment it knows the page count, without importing the front door.
 */

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 20;

/** Thrown before the document is read, so an oversized file costs nothing. */
export class DocumentTooLargeError extends Error {}

export function assertWithinByteLimit(file: Blob): void {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new DocumentTooLargeError(
      `This file is larger than ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB. Split it into smaller files and import them one at a time.`
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
