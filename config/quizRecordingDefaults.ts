import type { RecordingConfig, RecordingPrepExpiry } from '@/types';

export const DEFAULT_PREP_SECONDS = 30;
export const DEFAULT_LIMIT_SECONDS = 60;
/** Audio ceiling (RR-A1 sub-decision 8). Video/whiteboard ceilings are not built. */
export const AUDIO_LIMIT_SECONDS_MAX = 300;
export const AUDIO_LIMIT_SECONDS_MIN = 5;
export const PREP_SECONDS_MAX = 300;

/** Fraction of the limit spent in the wrap-up stretch; no grace tail follows it. */
export const WRAP_UP_FRACTION = 0.1;
/** Wrap-up never opens later than this, so a short take still gets a warning. */
export const WRAP_UP_MIN_SECONDS = 5;

const PREP_EXPIRY_VALUES: RecordingPrepExpiry[] = [
  'auto-start',
  'auto-advance',
  'armed',
  'unanswered',
];

export const DEFAULT_RECORDING_CONFIG: RecordingConfig = {
  prepSeconds: DEFAULT_PREP_SECONDS,
  limitSeconds: DEFAULT_LIMIT_SECONDS,
  prepExpiry: 'armed',
  takeLimit: null,
};

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Seconds at which the wrap-up warning opens for a given limit. */
export function wrapUpThresholdSeconds(limitSeconds: number): number {
  const tenth = Math.round(limitSeconds * WRAP_UP_FRACTION);
  return Math.min(limitSeconds, Math.max(WRAP_UP_MIN_SECONDS, tenth));
}

/**
 * Coerces a stored/authored block into a usable one. Returns `undefined` for
 * absent input so a legacy question stays legacy — never synthesise a block.
 * The rebuilt object drops the authoring-only `priorTimeLimit` by design.
 */
export function normalizeRecordingConfig(
  raw: Partial<RecordingConfig> | undefined | null
): RecordingConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const prepExpiry = PREP_EXPIRY_VALUES.includes(
    raw.prepExpiry as RecordingPrepExpiry
  )
    ? (raw.prepExpiry as RecordingPrepExpiry)
    : DEFAULT_RECORDING_CONFIG.prepExpiry;
  const takeLimit =
    typeof raw.takeLimit === 'number' && Number.isFinite(raw.takeLimit)
      ? Math.max(1, Math.round(raw.takeLimit))
      : null;
  return {
    prepSeconds: clampInt(
      raw.prepSeconds,
      0,
      PREP_SECONDS_MAX,
      DEFAULT_PREP_SECONDS
    ),
    limitSeconds: clampInt(
      raw.limitSeconds,
      AUDIO_LIMIT_SECONDS_MIN,
      AUDIO_LIMIT_SECONDS_MAX,
      DEFAULT_LIMIT_SECONDS
    ),
    prepExpiry,
    takeLimit,
  };
}

/** Advisory only — the archival callable is the authoritative `takeLimit` gate. */
export function takesRemaining(
  config: RecordingConfig,
  takesCommitted: number
): number | null {
  if (config.takeLimit == null) return null;
  return Math.max(0, config.takeLimit - takesCommitted);
}
