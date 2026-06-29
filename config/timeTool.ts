/**
 * Canonical value sets for the TimeTool (Timer/Stopwatch) widget, shared by:
 *   - the widget's user-level settings (`components/widgets/TimeTool/Settings.tsx`)
 *   - the admin building-config panel (`components/admin/TimeToolConfigurationPanel.tsx`)
 *   - the admin building-config validator (`utils/adminBuildingConfig.ts`)
 *
 * Keeping them in one place means adding a new mode/sound/style is a single
 * edit — previously each list was copied verbatim in all three files, so a
 * missed update silently dropped valid admin-saved values for teachers.
 *
 * These are runtime arrays because TypeScript unions are erased at runtime and
 * the validator needs a membership check (same rationale as `VALID_FONT_FAMILIES`
 * in adminBuildingConfig.ts). The matching type unions live on `TimeToolConfig`
 * in types.ts; the `*[number]` helper types below derive from these arrays so the
 * two stay aligned.
 */
/**
 * Upper bound for a timer duration, in seconds — matches the admin panel's
 * `999` min + `59` s input ceiling. Shared by the panel (input clamp) and the
 * validator (extraction clamp) so a value can't be stored that the panel would
 * then re-display as a different, clamped number.
 */
export const TIME_TOOL_MAX_DURATION_SECONDS = 59999;

export const TIME_TOOL_MODES = ['timer', 'stopwatch'] as const;
export const TIME_TOOL_VISUAL_TYPES = ['digital', 'visual'] as const;
export const TIME_TOOL_SOUNDS = ['Chime', 'Blip', 'Gong', 'Alert'] as const;
export const TIME_TOOL_CLOCK_STYLES = ['modern', 'lcd', 'minimal'] as const;

export type TimeToolMode = (typeof TIME_TOOL_MODES)[number];
export type TimeToolVisualType = (typeof TIME_TOOL_VISUAL_TYPES)[number];
export type TimeToolSound = (typeof TIME_TOOL_SOUNDS)[number];
export type TimeToolClockStyle = (typeof TIME_TOOL_CLOCK_STYLES)[number];
