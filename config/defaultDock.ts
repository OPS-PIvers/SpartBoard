import type { WidgetType } from '@/types';

/** The dock a new teacher starts with, from the setup wizard or Getting Started (D2). */
export const DEFAULT_DOCK_TYPES: readonly WidgetType[] = [
  'clock',
  'time-tool',
  'schedule',
  'poll',
  'random',
  'traffic',
  'text',
  'checklist',
  'quiz',
  'weather',
  'lunchCount',
  'drawing',
];
