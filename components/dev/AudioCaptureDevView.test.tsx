import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import {
  AudioCaptureDevView,
  AUDIO_CAPTURE_STATES,
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
  'mic-unavailable': /microphone did not work/i,
};

describe('AudioCaptureDevView', () => {
  it.each(AUDIO_CAPTURE_STATES)('renders the %s state', async (state) => {
    render(<AudioCaptureDevView state={state} />);
    // The fixture drives the live states through the real buttons.
    expect(
      await screen.findByText(EXPECTED[state], undefined, { timeout: 3000 })
    ).toBeTruthy();
  });
});
