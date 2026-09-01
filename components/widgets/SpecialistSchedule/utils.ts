/**
 * Parses an "HH:MM" time string and returns minutes since midnight.
 * Returns -1 if the string is missing, empty, or not a valid "HH:MM" value.
 */
export const parseTime = (t: string | undefined): number => {
  if (!t || !t.includes(':')) return -1;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
};

/**
 * Determines whether a schedule item should be rendered as "past".
 *
 * Rules:
 *   - An already-active item is never past.
 *   - An item whose effective end time (endTime if present, otherwise
 *     startTime) cannot be parsed is never past — rendering it as completed
 *     when it has no valid time data would be misleading.
 *   - Otherwise, the item is past when its effective end time is strictly
 *     before the current minute count.
 */
export const computeIsPast = (
  endTime: string | undefined,
  startTime: string | undefined,
  isActive: boolean,
  nowMinutes: number
): boolean => {
  if (isActive) return false;
  // Empty-string endTime must fall back to startTime (matching how endTime
  // is treated elsewhere in the widget). Explicit equality checks rather
  // than `??` (which only catches null/undefined) or a truthy ternary
  // (which the lint rule rewrites to `??`).
  const effective =
    endTime !== undefined && endTime !== '' ? endTime : startTime;
  const effectiveMinutes = parseTime(effective);
  if (effectiveMinutes < 0) return false; // unparseable — do not flag as past
  return effectiveMinutes < nowMinutes;
};

export interface RotationBlock {
  dayNumber: number;
  startDate: string;
  endDate: string;
}

export interface RotationConfigInput {
  cycleLength: number;
  rotationMode?: 'calendar' | 'blocks';
  startDate?: string;
  schoolDays?: string[];
  blocks?: RotationBlock[];
}

export const MIN_CYCLE_LENGTH = 1;
export const MAX_CYCLE_LENGTH = 30;

/** Clamps an admin-entered cycle length to a sane integer range. */
export const clampCycleLength = (value: number): number => {
  if (!Number.isFinite(value)) return 6;
  return Math.min(
    MAX_CYCLE_LENGTH,
    Math.max(MIN_CYCLE_LENGTH, Math.round(value))
  );
};

/** Resolves the rotation mode; legacy docs without one used blocks only at cycleLength 10. */
export const resolveRotationMode = (
  config: Pick<RotationConfigInput, 'cycleLength' | 'rotationMode'>
): 'calendar' | 'blocks' =>
  config.rotationMode ?? (config.cycleLength === 10 ? 'blocks' : 'calendar');

/** Returns a blocks array padded/trimmed to exactly `length` entries. */
export const normalizeBlocks = (
  blocks: RotationBlock[] | undefined,
  length: number
): RotationBlock[] =>
  Array.from({ length }, (_, i) => ({
    dayNumber: i + 1,
    startDate: blocks?.[i]?.startDate ?? '',
    endDate: blocks?.[i]?.endDate ?? '',
  }));

/** School days that actually drive the rotation: deduped, on/after startDate, sorted. */
export const rotationSchoolDays = (
  schoolDays: string[] | undefined,
  startDate: string | undefined
): string[] => {
  const anchored =
    startDate !== undefined && startDate !== ''
      ? (schoolDays ?? []).filter((d) => d >= startDate)
      : (schoolDays ?? []);
  return Array.from(new Set(anchored)).sort();
};

/** Marked school days that sit before startDate and are therefore excluded from the count. */
export const countPreStartSchoolDays = (
  schoolDays: string[] | undefined,
  startDate: string | undefined
): number => {
  if (startDate === undefined || startDate === '') return 0;
  return Array.from(new Set(schoolDays ?? [])).filter((d) => d < startDate)
    .length;
};

/**
 * Resolves the rotation day number for a date. Returns null when the date is
 * not a school day. Block-mode buildings use explicit date ranges; calendar-mode
 * buildings count marked school days from startDate forward.
 */
export const resolveRotationDayNumber = (
  config: RotationConfigInput,
  dateStr: string
): number | null => {
  const { cycleLength, startDate, schoolDays, blocks } = config;

  if (resolveRotationMode(config) === 'blocks') {
    const activeBlock = (blocks ?? []).find(
      (b) =>
        b.startDate !== '' &&
        b.endDate !== '' &&
        dateStr >= b.startDate &&
        dateStr <= b.endDate
    );
    return activeBlock ? activeBlock.dayNumber : null;
  }

  if (!Number.isFinite(cycleLength) || cycleLength < 1) return null;

  const days = rotationSchoolDays(schoolDays, startDate);
  const index = days.indexOf(dateStr);
  if (index === -1) return null;

  return (index % cycleLength) + 1;
};

/** Custom name for a rotation day, falling back to "<dayLabel> <n>". */
export const formatRotationDayLabel = (
  dayNumber: number,
  customDayNames: Record<number, string> | undefined,
  dayLabel: string | undefined
): string => {
  const custom = customDayNames?.[dayNumber]?.trim();
  if (custom !== undefined && custom !== '') return custom;
  const label = dayLabel !== undefined && dayLabel !== '' ? dayLabel : 'Day';
  return `${label} ${dayNumber}`;
};
