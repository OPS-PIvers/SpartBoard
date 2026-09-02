import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import {
  RecordingControlsDevView,
  RECORDING_CONTROL_STATES,
} from './RecordingControlsDevView';
import {
  AUDIO_CAPTURE_STATES,
  AUDIO_CAPTURE_DARK_STATES,
} from './AudioCaptureDevView';

const EXPECTED: Record<string, RegExp> = {
  'rc-typed': /^Format$/,
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

  it('seeds the enabled-defaults fixture on Spoken', () => {
    render(<RecordingControlsDevView state="rc-enabled-defaults" />);
    expect(
      screen.getByRole('tab', { name: 'Spoken' }).getAttribute('aria-selected')
    ).toBe('true');
  });

  it('seeds the typed fixture on Typed', () => {
    render(<RecordingControlsDevView state="rc-typed" />);
    expect(
      screen.getByRole('tab', { name: 'Typed' }).getAttribute('aria-selected')
    ).toBe('true');
  });

  it('shares no state key across the three dev fixture sets', () => {
    const sets: Record<string, readonly string[]> = {
      RECORDING_CONTROL_STATES,
      AUDIO_CAPTURE_STATES,
      AUDIO_CAPTURE_DARK_STATES,
    };
    const names = Object.keys(sets);
    const all = names.flatMap((n) => [...sets[n]]);
    expect(new Set(all).size).toBe(all.length);
    for (const a of names) {
      for (const b of names) {
        if (a === b) continue;
        for (const key of sets[a]) {
          expect(sets[b]).not.toContain(key);
        }
      }
    }
  });
});
