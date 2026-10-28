import { EMPTY_GUIDES, type Guides } from '@/utils/alignmentGuides';

// Transient guides for the widget being dragged or resized; only the overlay subscribes.
let current: Guides = EMPTY_GUIDES;
let currentKey = '';
const listeners = new Set<() => void>();

const keyOf = (g: Guides) =>
  g.lines.map((l) => `${l.axis}${l.pos},${l.from},${l.to}`).join(';') +
  '|' +
  g.spacing.map((s) => `${s.axis}${s.from},${s.to},${s.at}`).join(';');

export function setAlignmentGuides(next: Guides): void {
  const key = next === EMPTY_GUIDES ? '' : keyOf(next);
  if (key === currentKey) return;
  current = key === '' ? EMPTY_GUIDES : next;
  currentKey = key;
  for (const fn of listeners) fn();
}

export function getAlignmentGuides(): Guides {
  return current;
}

export function subscribeAlignmentGuides(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
