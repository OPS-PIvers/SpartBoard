// Pins that typing Enter in the custom-roster textarea starts a real new line instead of being silently swallowed.
import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import type { WidgetData } from '@/types';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { CustomRosterField } from './CustomRosterField';

const t = ((key: string, options?: Record<string, unknown>): string =>
  typeof options?.defaultValue === 'string'
    ? options.defaultValue
    : key) as CustomRenderCtx['t'];

const widget: WidgetData = {
  id: 'w1',
  type: 'lunchCount',
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  z: 1,
  flipped: false,
  config: {},
} as WidgetData;

const baseProps = {
  widget,
  t,
  isAdmin: false,
  canAccessFeature: () => true,
  canAccessWidget: () => true,
  id: 'lunch-roster',
  labelId: 'lunch-roster-label',
} satisfies Partial<CustomRenderCtx>;

// Mirrors how FieldRenderer feeds config + updateConfig back into a field.
const Harness: React.FC<{ initialRoster: string[] }> = ({ initialRoster }) => {
  const [roster, setRoster] = useState<string[]>(initialRoster);
  return (
    <CustomRosterField
      {...baseProps}
      config={{ roster }}
      updateConfig={(patch) =>
        setRoster((patch.roster as string[] | undefined) ?? [])
      }
    />
  );
};

describe('CustomRosterField', () => {
  it('keeps a newly-typed blank line so the cursor can move to a new roster entry', () => {
    render(<Harness initialRoster={['Alice']} />);
    const textarea = screen.getByRole<HTMLTextAreaElement>('textbox');

    // Simulates pressing Enter at the end of "Alice".
    fireEvent.change(textarea, { target: { value: 'Alice\n' } });

    expect(textarea.value).toBe('Alice\n');
  });

  it('does not silently merge a second typed name onto the first line', () => {
    render(<Harness initialRoster={['Alice']} />);
    const textarea = screen.getByRole<HTMLTextAreaElement>('textbox');

    // Types "\nBob" one character at a time, each keystroke appended to
    // whatever the textarea actually renders after the previous one — the
    // same way a browser feeds each real keystroke to a controlled input.
    for (const char of ['\n', 'B', 'o', 'b']) {
      fireEvent.change(textarea, { target: { value: textarea.value + char } });
    }
    fireEvent.blur(textarea);

    expect(textarea.value).toBe('Alice\nBob');
  });
});
