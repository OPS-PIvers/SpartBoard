import { describe, it, expect } from 'vitest';
import type { WidgetType } from '@/types';
import { WIDGET_LABELS } from '@/components/admin/Analytics/widgetLabels';

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

// Compile-time guard — adding a WidgetType without updating this array fails to compile.
const _exhaustiveCheck: [WidgetType] extends [(typeof ALL_WIDGET_TYPES)[number]]
  ? true
  : never = true;
// Reverse guard — a stale entry left in this array after a type is removed also fails to compile.
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
