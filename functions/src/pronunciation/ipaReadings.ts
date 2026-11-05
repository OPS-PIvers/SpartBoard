// A dialect's teacher IPA holds one or more accepted readings joined by "|", so older clients still read a string; copy of utils/pronunciation/ipaReadings.ts.
import type { SpeakDialect } from './types';

export type SpeakIpaOverride = Partial<Record<SpeakDialect, string>>;

export const MAX_IPA_READINGS = 4;
export const IPA_READING_SEPARATOR = '|';

/** Every reading for one dialect, in order, blanks kept (the editor shows them as empty boxes). */
export const ipaReadingsOf = (value: unknown): string[] =>
  typeof value === 'string' ? value.split(IPA_READING_SEPARATOR) : [];

/** The non-blank, trimmed readings for one dialect. */
export const filledIpaReadings = (value: unknown): string[] =>
  ipaReadingsOf(value)
    .map((v) => v.trim())
    .filter((v) => v !== '');

/** Joins readings back into the stored string; undefined when there are none. */
export const ipaValueOf = (readings: readonly string[]): string | undefined =>
  readings.length === 0 ? undefined : readings.join(IPA_READING_SEPARATOR);
