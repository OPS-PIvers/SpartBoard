// A dialect's teacher IPA is one reading (string) or several (string[]); functions/src/pronunciation/ipaReadings.ts is a copy.
import type { SpeakDialect } from '@/types';

export type SpeakIpaValue = string | string[];
export type SpeakIpaOverride = Partial<Record<SpeakDialect, SpeakIpaValue>>;

export const MAX_IPA_READINGS = 4;

/** Every reading for one dialect, in order, blanks kept (the editor shows them as empty boxes). */
export const ipaReadingsOf = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string')
      : [];

/** The non-blank, trimmed readings for one dialect. */
export const filledIpaReadings = (value: unknown): string[] =>
  ipaReadingsOf(value)
    .map((v) => v.trim())
    .filter((v) => v !== '');

/** One reading stays a string, so older saved cards keep their shape. */
export const ipaValueOf = (
  readings: readonly string[]
): SpeakIpaValue | undefined =>
  readings.length === 0
    ? undefined
    : readings.length === 1
      ? readings[0]
      : [...readings];
