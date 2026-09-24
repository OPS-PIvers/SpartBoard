import i18n from '@/i18n/index';

// Firestore's hard cap is 1 MiB; refuse well before it so the error is ours, not an opaque write failure.
export const GL_MAX_DOC_BYTES = 900 * 1024;

const encoder = new TextEncoder();
const strBytes = (s: string): number => encoder.encode(s).length + 1;

// Firestore's documented storage-size rules (strings UTF-8 + 1, numbers 8, booleans/null 1, map keys as strings).
export function estimateFirestoreBytes(value: unknown): number {
  if (value === undefined) return 0;
  if (value === null || typeof value === 'boolean') return 1;
  if (typeof value === 'number') return 8;
  if (typeof value === 'string') return strBytes(value);
  if (Array.isArray(value)) {
    return value.reduce<number>((n, v) => n + estimateFirestoreBytes(v), 0);
  }
  if (value instanceof Date) return 8;
  if (typeof value === 'object') {
    let n = 0;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      n += strBytes(k) + estimateFirestoreBytes(v);
    }
    return n;
  }
  return 0;
}

export class SetTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(i18n.t('glData.setTooLarge'));
    this.name = 'SetTooLargeError';
  }
}

// Throws SetTooLargeError when the document would be over GL_MAX_DOC_BYTES (path + 32 bytes of doc overhead included).
export function assertGuidedLearningDocFits(path: string, data: unknown): void {
  const bytes = strBytes(path) + 32 + estimateFirestoreBytes(data);
  if (bytes > GL_MAX_DOC_BYTES) throw new SetTooLargeError(bytes);
}
