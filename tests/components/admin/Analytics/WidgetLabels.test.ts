import { describe, it, expect } from 'vitest';
import type { WidgetType } from '@/types';
import { WIDGET_LABELS } from '@/components/admin/Analytics/widgetLabels';

/**
 * Every member of WidgetType must resolve to a human-readable label in the
 * admin Analytics widget-breakdown table.  Programmatic widget types that are
 * intentionally absent from the TOOLS dock catalogue (sticker, catalyst-*,
 * mathTool, onboarding, custom-widget, blooms-detail) must be listed
 * explicitly in widgetLabels.ts so they never fall back to raw type-ID
 * strings.
 *
 * Mirror of WidgetType union from types.ts — keep in sync when adding new
 * widget types.
 */
const ALL_WIDGET_TYPES = [
  'clock',
  'traffic',
  'text',
  'checklist',
  'random',
  'dice',
  'sound',
  'drawing',
  'qr',
  'embed',
  'poll',
  'webcam',
  'scoreboard',
  'expectations',
  'weather',
  'schedule',
  'calendar',
  'lunchCount',
  'classes',
  'instructionalRoutines',
  'time-tool',
  'miniApp',
  'materials',
  'stickers',
  'sticker',
  'seating-chart',
  'catalyst',
  'catalyst-instruction',
  'catalyst-visual',
  'smartNotebook',
  'recessGear',
  'pdf',
  'quiz',
  'talking-tool',
  'breathing',
  'mathTools',
  'mathTool',
  'nextUp',
  'onboarding',
  'countdown',
  'car-rider-pro',
  'blending-board',
  'music',
  'specialist-schedule',
  'graphic-organizer',
  'concept-web',
  'reveal-grid',
  'numberLine',
  'syntax-framer',
  'hotspot-image',
  'starter-pack',
  'video-activity',
  'guided-learning',
  'custom-widget',
  'soundboard',
  'url',
  'activity-wall',
  'first-5',
  'work-symbols',
  'blooms-taxonomy',
  'blooms-detail',
  'need-do-put-then',
  'stations',
] as const;

// Compile-time set-equality guard: both directions must hold.
// Forward: WidgetType ⊆ ALL_WIDGET_TYPES — new type in types.ts without
// updating the array fails to compile ('true' is not assignable to 'never').
const _exhaustiveCheck: [WidgetType] extends [(typeof ALL_WIDGET_TYPES)[number]]
  ? true
  : never = true;
// Reverse: ALL_WIDGET_TYPES ⊆ WidgetType — stale entry in the array after a
// type is removed from types.ts also fails to compile.
const _reverseExhaustiveCheck: [(typeof ALL_WIDGET_TYPES)[number]] extends [
  WidgetType,
]
  ? true
  : never = true;

describe('WIDGET_LABELS', () => {
  it('has a human-readable label for every WidgetType (not a raw type-ID fallback)', () => {
    const missing: WidgetType[] = [];

    for (const widgetType of ALL_WIDGET_TYPES) {
      const label = WIDGET_LABELS[widgetType];
      if (!label || label === widgetType) {
        missing.push(widgetType);
      }
    }

    expect(
      missing,
      `Missing friendly labels for: ${missing.join(', ')}`
    ).toHaveLength(0);
  });
});
