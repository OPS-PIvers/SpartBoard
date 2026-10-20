import type { SpeakLanguage } from '@/types';

// Native variants learned from Cloud TTS readings (S11b writes this table); a variant swap never counts against a student.

/** A reference sound native voices often realize as `spoken`; null means they drop it. */
export interface NativeVariant {
  target: string;
  spoken: string | null;
}

export const PRONUNCIATION_VARIANTS: Readonly<
  Record<SpeakLanguage, readonly NativeVariant[]>
> = {
  es: [],
  de: [],
  en: [],
};
