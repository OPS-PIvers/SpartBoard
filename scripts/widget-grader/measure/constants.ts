import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Rubric } from '../types';

// Copied from components/common/DraggableWindow.tsx; tests/widgetGrader/selectors.test.ts keeps them in sync.
export const INTERACTIVE_ELEMENTS_SELECTOR =
  'button, input, textarea, select, canvas, iframe, label, a, summary, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], .cursor-pointer, [contenteditable="true"]';
export const DRAG_BLOCKING_SELECTOR = `${INTERACTIVE_ELEMENTS_SELECTOR}, .resize-handle, [draggable="true"], [data-no-drag="true"]`;

// What counts as a front-face control for G1, I2 and I7.
export const CONTROL_SELECTOR =
  'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="slider"], [role="radio"], [contenteditable="true"], .cursor-pointer';

export const GRID_COLS = 24;
export const GRID_ROWS = 16;
export const MAX_HIT_TESTS = 300;

// Words that mark protected student data on the projected face (R4).
export const PROTECTED_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'iep', pattern: /\bIEP\b/ },
  { name: '504', pattern: /\b504\b/ },
  { name: 'accommodation', pattern: /\baccommodations?\b/i },
  { name: 'behavior', pattern: /\bbehaviou?r notes?\b/i },
  { name: 'attendance', pattern: /\b(absent|tardy|truant)\b/i },
];

// Widgets whose harness fixtures show only part of the widget; their measurements cover what renders.
export const PARTIAL_COVERAGE: Record<string, string> = {
  'car-rider-pro': 'always renders disabled without Firestore data',
  'blending-board': 'always renders disabled without Firestore data',
  'starter-pack': 'shows no packs without Firestore data',
  music: 'shows only its empty state',
  'video-activity': 'shows only its empty state',
  'guided-learning': 'shows only its empty state',
  'specialist-schedule': 'past and current styling depends on the clock',
};

export interface Thresholds {
  touchHitAreaDefaultPx: number;
  touchHitAreaMinimumPx: number;
  primaryContentMinPx: number;
  readableTextMinPx: number;
  textContrast: number;
  largeTextContrast: number;
}

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, '..', '..', '..');

export const loadRubric = (): Rubric =>
  JSON.parse(
    readFileSync(join(REPO_ROOT, 'docs/widget-rubric/rubric.json'), 'utf8')
  ) as Rubric;

export const loadThresholds = (): Thresholds => {
  const t = loadRubric().thresholds;
  return {
    touchHitAreaDefaultPx: t.touchHitAreaDefaultPx,
    touchHitAreaMinimumPx: t.touchHitAreaMinimumPx,
    primaryContentMinPx: t.primaryContentMinPx,
    readableTextMinPx: t.readableTextMinPx,
    textContrast: t.textContrast,
    largeTextContrast: t.largeTextContrast,
  };
};

// Gap between adjacent targets for I2 level 4.
export const MIN_TARGET_SPACING_PX = 8;
