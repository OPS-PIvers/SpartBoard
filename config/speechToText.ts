import type { SpeechToTextSettings } from '@/types';

/** `admin_settings/speech_to_text`: the paid engine and tidy-up switches and their caps. */
export const SPEECH_TO_TEXT_SETTINGS_DOC = 'speech_to_text';

export const SPEECH_TO_TEXT_TRANSCRIBE_CALLABLE = 'transcribeSpeechV1';
export const SPEECH_TO_TEXT_TIDY_CALLABLE = 'tidyDictationV1';

/** Longest clip one transcribe call takes, and its size once base64-encoded. */
export const SPEECH_CLIP_MAX_SECONDS = 30;
export const SPEECH_CLIP_MAX_BASE64_CHARS = 700_000;
/** Longest passage one tidy-up call takes. */
export const TIDY_MAX_CHARS = 4000;

export const SPEECH_TO_TEXT_DEFAULT_CAPS = {
  monthlyCapSeconds: 60_000,
  monthlyCapTidyCalls: 5000,
} as const;

/** Everything off: dictation runs on the free browser engine only. */
export const DEFAULT_SPEECH_TO_TEXT_SETTINGS: SpeechToTextSettings = {
  engine: 'browser',
  transcribeMode: 'verbatim',
  tidyUp: false,
  monthlyCapSeconds: SPEECH_TO_TEXT_DEFAULT_CAPS.monthlyCapSeconds,
  monthlyCapTidyCalls: SPEECH_TO_TEXT_DEFAULT_CAPS.monthlyCapTidyCalls,
  updatedAt: 0,
  updatedBy: '',
};

const nonNegativeInt = (raw: unknown, fallback: number): number =>
  typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
    ? Math.floor(raw)
    : fallback;

/** Fills a partial or malformed settings doc with the defaults. */
export function normalizeSpeechToTextSettings(
  raw: unknown
): SpeechToTextSettings {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    engine: src.engine === 'hybrid' ? 'hybrid' : 'browser',
    transcribeMode: src.transcribeMode === 'smart' ? 'smart' : 'verbatim',
    tidyUp: src.tidyUp === true,
    monthlyCapSeconds: nonNegativeInt(
      src.monthlyCapSeconds,
      SPEECH_TO_TEXT_DEFAULT_CAPS.monthlyCapSeconds
    ),
    monthlyCapTidyCalls: nonNegativeInt(
      src.monthlyCapTidyCalls,
      SPEECH_TO_TEXT_DEFAULT_CAPS.monthlyCapTidyCalls
    ),
    updatedAt: nonNegativeInt(src.updatedAt, 0),
    updatedBy: typeof src.updatedBy === 'string' ? src.updatedBy : '',
  };
}

/** `ai_usage/global_speech_to_text_{YYYY-MM}` doc id for the month containing `date`. */
export function monthlySpeechToTextUsageDocId(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `global_speech_to_text_${y}-${m}`;
}

/** Flags for the two paid extras; each is a Previews row with its limits in the row's config. */
export const SPEECH_AI_TRANSCRIPTION_FEATURE =
  'speech-to-text-ai-transcription' as const;
export const SPEECH_TIDY_UP_FEATURE = 'speech-to-text-tidy-up' as const;

/** Tells a student's page which paid extras their teacher's flags allow. */
export const SPEECH_TO_TEXT_ACCESS_CALLABLE = 'getSpeechToTextAccessV1';

/** Per-student daily limits when the row has none saved. */
export const SPEECH_DEFAULT_DAILY_LIMITS = {
  transcription: 300,
  tidyUp: 30,
} as const;

/** Row config keys beside `dailyLimit` and `dailyLimitEnabled`. */
export const SPEECH_ROW_KEYS = {
  monthlyCapSeconds: 'monthlyCapSeconds',
  monthlyCapTidyCalls: 'monthlyCapTidyCalls',
  transcribeMode: 'transcribeMode',
} as const;
