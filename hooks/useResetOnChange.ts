import { useState } from 'react';

/**
 * Resets local state when a tracked value changes, using the documented
 * "adjusting state while rendering" pattern (see CLAUDE.md). The `onChange`
 * callback runs synchronously during render and should call the relevant
 * `setX` setters — React batches them into the same render pass.
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
