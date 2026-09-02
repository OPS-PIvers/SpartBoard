import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import {
  RecordingControlsDevView,
  RECORDING_CONTROL_STATES,
} from './RecordingControlsDevView';
import { AUDIO_CAPTURE_STATES } from './AudioCaptureDevView';

const EXPECTED: Record<string, RegExp> = {
  'rc-disabled': /Students record their answer instead/i,
  'rc-enabled-defaults': /When thinking time runs out/i,
  'rc-clamped-limit': /Capped at 300s/i,
  'rc-take-limit': /Takes allowed/i,
  'rc-advisory': /Records up to 2 slots per student/i,
};

describe('RecordingControlsDevView', () => {
  it.each(RECORDING_CONTROL_STATES)('renders the %s state', (state) => {
    render(<RecordingControlsDevView state={state} />);
    expect(screen.getByText(EXPECTED[state])).toBeTruthy();
  });

  it('shows the shuffle no-op line only in the advisory state', () => {
    const { unmount } = render(
      <RecordingControlsDevView state="rc-enabled-defaults" />
    );
    expect(screen.queryByText(/Question shuffle has no effect/i)).toBeNull();
    unmount();
    render(<RecordingControlsDevView state="rc-advisory" />);
    expect(screen.getByText(/Question shuffle has no effect/i)).toBeTruthy();
  });

  it('seeds the enabled-defaults fixture with the switch on', () => {
    render(<RecordingControlsDevView state="rc-enabled-defaults" />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
      'true'
    );
  });

  it('seeds the disabled fixture with the switch off', () => {
    render(<RecordingControlsDevView state="rc-disabled" />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
      'false'
    );
  });

  it('shares no state key with the audio-capture fixtures', () => {
    for (const key of RECORDING_CONTROL_STATES) {
      expect(AUDIO_CAPTURE_STATES as readonly string[]).not.toContain(key);
    }
  });
});
