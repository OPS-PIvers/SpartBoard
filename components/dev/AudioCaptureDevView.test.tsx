import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import {
  AudioCaptureDevView,
  AUDIO_CAPTURE_STATES,
  AUDIO_CAPTURE_DARK_STATES,
} from './AudioCaptureDevView';

beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:dev');
  globalThis.URL.revokeObjectURL = vi.fn();
});

const EXPECTED: Record<string, RegExp> = {
  notice: /Before you record/i,
  prep: /Thinking time/i,
  armed: /When you press record/i,
  recording: /Recording stops on its own/i,
  review: /Listen back/i,
  committing: /Listen back/i,
  'archive-failed': /Not yet submitted/i,
  'take-limit': /No takes left/i,
  'window-closed': /Recording time is over/i,
  'mic-unavailable': /microphone did not work/i,
  'submit-blocked': /questions still need a recording/i,
};

describe('AudioCaptureDevView', () => {
  it.each(AUDIO_CAPTURE_STATES)('renders the %s state', async (state) => {
    render(<AudioCaptureDevView state={state} />);
    // The fixture drives the live states through the real buttons.
    expect(
      await screen.findByText(EXPECTED[state], undefined, { timeout: 3000 })
    ).toBeTruthy();
  });

  it.each(AUDIO_CAPTURE_DARK_STATES)(
    'renders the %s state on a dark shell',
    async (state) => {
      const { container } = render(<AudioCaptureDevView state={state} />);
      const key = state.slice('dark-'.length);
      expect(
        await screen.findByText(EXPECTED[key], undefined, { timeout: 3000 })
      ).toBeTruthy();
      expect(container.querySelector('section')?.className).toContain(
        'bg-slate-800/60'
      );
    }
  );
});
