/**
 * Trust-boundary parser for the `assignment-modes` GlobalFeaturePermission
 * config blob. The Firestore doc shape is `Record<string, unknown>` (admin
 * writes; admin can put anything in `config`), so consumers must validate
 * before treating it as `AssignmentModesConfig`.
 *
 * The parser drops unknown widget keys and warns on unrecognized mode
 * values, returning a clean `AssignmentModesConfig`. Consumers that want
 * the resolved mode for a single widget should use `getAssignmentMode` on
 * the auth context — this parser is the layer that protects it.
 */

import type {
  AssignmentMode,
  AssignmentModesConfig,
  AssignmentWidgetKey,
} from '../types';

const ASSIGNMENT_WIDGET_KEYS: readonly AssignmentWidgetKey[] = [
  'quiz',
  'videoActivity',
  'miniApp',
  'guidedLearning',
];

const ASSIGNMENT_MODE_VALUES: readonly AssignmentMode[] = [
  'submissions',
  'view-only',
];

const isAssignmentWidgetKey = (key: string): key is AssignmentWidgetKey =>
  (ASSIGNMENT_WIDGET_KEYS as readonly string[]).includes(key);

const isAssignmentMode = (value: unknown): value is AssignmentMode =>
  typeof value === 'string' &&
  (ASSIGNMENT_MODE_VALUES as readonly string[]).includes(value);

/**
 * Validate an unknown blob (typically `permission.config`) and return a
 * clean `AssignmentModesConfig`. Unknown widget keys are silently dropped;
 * unrecognized mode values are warned about and dropped (so the consumer's
 * default — `'submissions'` — applies). Anything else returns an empty
 * config so callers fall through to the `'submissions'` default.
 */
export const parseAssignmentModesConfig = (
  raw: unknown
): AssignmentModesConfig => {
  if (raw == null || typeof raw !== 'object') return {};

  const out: AssignmentModesConfig = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isAssignmentWidgetKey(key)) continue;
    if (!isAssignmentMode(value)) {
      // Surface schema drift (e.g. a future client writes a new mode value
      // that this client doesn't yet know about) so it shows up in logs
      // instead of silently coercing to the 'submissions' default.
      console.warn(
        `[assignmentModesConfig] Unrecognized mode value for widget ${key}: ${String(value)}`
      );
      continue;
    }
    out[key] = value;
  }
  return out;
};
