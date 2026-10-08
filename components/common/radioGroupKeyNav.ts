import React from 'react';

// Roving-tabindex arrow-key nav for a `role="radiogroup"`/`role="tablist"` of `radio`/`tab` buttons — shared by SegmentedControl.tsx and the widget settings primitives, generalized over the option list.
export function handleRadioGroupKeyDown<O>(
  e: React.KeyboardEvent<HTMLDivElement>,
  options: readonly O[],
  onSelect: (option: O) => void
): void {
  // WAI-ARIA's radiogroup pattern treats Down/Up as equivalent to Right/Left, which matters for grid-laid-out groups.
  const key =
    e.key === 'ArrowDown'
      ? 'ArrowRight'
      : e.key === 'ArrowUp'
        ? 'ArrowLeft'
        : e.key;
  if (
    key !== 'ArrowRight' &&
    key !== 'ArrowLeft' &&
    key !== 'Home' &&
    key !== 'End'
  )
    return;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  // Keys typed in a non-radio child (e.g. a hex text field) belong to that child.
  if (
    e.target instanceof Element &&
    !e.target.closest('[role="radio"], [role="tab"]')
  )
    return;
  const nodes = Array.from(
    e.currentTarget.querySelectorAll<HTMLButtonElement>(
      '[role="radio"], [role="tab"]'
    )
  );
  if (nodes.length === 0) return;
  e.preventDefault();
  const idx = nodes.indexOf(document.activeElement as HTMLButtonElement);
  const safeIdx = idx < 0 ? 0 : idx;
  let nextIdx: number;
  if (key === 'Home') nextIdx = 0;
  else if (key === 'End') nextIdx = nodes.length - 1;
  else if (key === 'ArrowRight') nextIdx = (safeIdx + 1) % nodes.length;
  else nextIdx = (safeIdx - 1 + nodes.length) % nodes.length;
  if (nextIdx < 0 || nextIdx >= options.length) return;
  nodes[nextIdx].focus();
  onSelect(options[nextIdx]);
}
