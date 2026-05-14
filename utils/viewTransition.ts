import { flushSync } from 'react-dom';

/**
 * Run `update` inside a CSS View Transition when the browser supports it.
 *
 * Use this to animate React state changes that move DOM nodes between
 * containers (e.g. rotating students between group cards). Any DOM element
 * with a unique `view-transition-name` CSS property will animate from its
 * old position to its new position automatically. Falls back to running
 * `update` directly on browsers without View Transitions (Safari < 18,
 * Firefox at time of writing) so the state change still happens, just
 * without the animation.
 *
 * `flushSync` forces React to commit the state change synchronously inside
 * the callback, which is what `startViewTransition` needs to capture the
 * "after" snapshot.
 */
export function withViewTransition(update: () => void): void {
  if (typeof document === 'undefined' || !document.startViewTransition) {
    update();
    return;
  }
  document.startViewTransition(() => {
    flushSync(update);
  });
}

/**
 * Produce a CSS-safe `view-transition-name` from a student name. Sanitizes
 * any character outside `[A-Za-z0-9_-]` to a hyphen so the name is a valid
 * `<custom-ident>`. Prefixes with `chip-` so it can't collide with other
 * transition names elsewhere in the app.
 */
export function chipViewTransitionName(studentName: string): string {
  const safe = studentName.replace(/[^A-Za-z0-9_-]/g, '-');
  return `chip-${safe}`;
}
