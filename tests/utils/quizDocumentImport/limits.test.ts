/**
 * The per-import budget (D18). The test and its answer key share one byte
 * allowance, so attaching a key cannot quietly double what one import reads.
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_DOCUMENT_BYTES,
  DocumentTooLargeError,
  assertWithinByteLimit,
} from '@/utils/quizDocumentImport/limits';

/** A blob of a given size without allocating one; only `size` is read. */
const sized = (bytes: number) => ({ size: bytes }) as Blob;

describe('assertWithinByteLimit', () => {
  it('accepts one file inside the budget', () => {
    expect(() =>
      assertWithinByteLimit(sized(MAX_DOCUMENT_BYTES))
    ).not.toThrow();
  });

  it('refuses one file over the budget', () => {
    expect(() => assertWithinByteLimit(sized(MAX_DOCUMENT_BYTES + 1))).toThrow(
      DocumentTooLargeError
    );
  });

  it('accepts a test and key that fit together', () => {
    expect(() =>
      assertWithinByteLimit(
        sized(MAX_DOCUMENT_BYTES / 2),
        sized(MAX_DOCUMENT_BYTES / 2)
      )
    ).not.toThrow();
  });

  it('refuses a test and key that only fit one at a time', () => {
    // Each is inside the budget alone; the import is what has to fit.
    expect(() =>
      assertWithinByteLimit(
        sized(MAX_DOCUMENT_BYTES),
        sized(MAX_DOCUMENT_BYTES)
      )
    ).toThrow(DocumentTooLargeError);
  });

  it('names the key file when the pair is what went over', () => {
    expect(() =>
      assertWithinByteLimit(
        sized(MAX_DOCUMENT_BYTES),
        sized(MAX_DOCUMENT_BYTES)
      )
    ).toThrow(/answer key/);
  });
});
