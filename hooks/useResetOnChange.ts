import { useState } from 'react';

/**
 * Resets local state when a tracked value changes, using the documented
 * "adjusting state while rendering" pattern (see CLAUDE.md). The `onChange`
 * callback runs synchronously during render and should call the relevant
 * `setX` setters — React batches them into the same render pass.
 *
 * Caller contract:
 * - `onChange` must be pure and idempotent. It may be invoked more than
 *   once per logical change (StrictMode, concurrent rendering retries),
 *   so do not put subscriptions, network calls, logging, or other side
 *   effects in it — only React state setters.
 * - `value` should be referentially stable across renders when nothing
 *   has logically changed. Passing a freshly-created object/array each
 *   render will trigger an infinite render loop (Object.is will always
 *   be false). Use a primitive id, a memoized value, or a stable ref.
 *
 * @param value The tracked value (typically a prop).
 * @param onChange Called with `(next, prev)` when `value` changes.
 */
export function useResetOnChange<T>(
  value: T,
  onChange: (next: T, prev: T) => void
): void {
  const [prev, setPrev] = useState(value);
  if (!Object.is(value, prev)) {
    setPrev(value);
    onChange(value, prev);
  }
}
