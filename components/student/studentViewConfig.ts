/**
 * Widget compatibility configuration for student view.
 * Defines which widgets work well in read-only student mode.
 */

export type StudentViewCompatibility =
  'read-only' | 'limited' | 'not-compatible';

export interface StudentViewWidgetCompatibilityConfig {
  readOnlyCompatible: string[];
  limitedSupport: string[];
  notCompatible: string[];
}

/**
 * Configuration defining which widgets are compatible with student view.
 * This can be used by future features (e.g., write mode) to enable or restrict widget interactions.
 */
export const STUDENT_VIEW_WIDGET_COMPATIBILITY: StudentViewWidgetCompatibilityConfig =
  {
    // Widgets that are fully compatible with read-only student view.
    readOnlyCompatible: [
      'clock',
      'time-tool',
      'traffic',
      'text',
      'embed',
      'qr',
      'weather',
      'schedule',
      'calendar',
      'drawing',
      'poll',
    ],
    // Widgets that function in student view but whose state changes
    // (if any) will not persist because update operations are no-ops.
    limitedSupport: ['traffic', 'dice', 'random', 'miniApp'],
    // Widgets that fundamentally rely on user interaction and persistent
    // state updates, and are therefore not compatible with read-only view.
    notCompatible: [
      'checklist',
      'scoreboard',
      'expectations',
      'lunchCount',
      'classes',
      'sound',
      'webcam',
    ],
  };
