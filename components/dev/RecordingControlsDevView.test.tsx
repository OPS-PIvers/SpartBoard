import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import {
  RecordingControlsDevView,
  RECORDING_CONTROL_STATES,
} from './RecordingControlsDevView';

const EXPECTED: Record<string, RegExp> = {
  disabled: /Students record their answer instead/i,
  'enabled-defaults': /When thinking time runs out/i,
  'clamped-limit': /Capped at 300s/i,
  'take-limit': /Takes allowed/i,
  advisory: /Records up to 2 slots per student/i,
};

describe('RecordingControlsDevView', () => {
  it.each(RECORDING_CONTROL_STATES)('renders the %s state', (state) => {
    render(<RecordingControlsDevView state={state} />);
    expect(screen.getByText(EXPECTED[state])).toBeTruthy();
  });

  it('shows the shuffle no-op line only in the advisory state', () => {
    const { unmount } = render(
      <RecordingControlsDevView state="enabled-defaults" />
    );
    expect(screen.queryByText(/Question shuffle has no effect/i)).toBeNull();
    unmount();
    render(<RecordingControlsDevView state="advisory" />);
    expect(screen.getByText(/Question shuffle has no effect/i)).toBeTruthy();
  });
});
