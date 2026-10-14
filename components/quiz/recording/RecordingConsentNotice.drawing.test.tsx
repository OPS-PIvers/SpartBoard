import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { RecordingConsentNotice } from './RecordingConsentNotice';
import { RecordingNoticeDrawingContext } from './recordingNoticeDrawing';

const REPLAY = /replay how you drew, including anything you erase/i;

describe('RecordingConsentNotice drawing variants (D11)', () => {
  it('adds the replay line to the voice notice when narrated', () => {
    render(
      <RecordingNoticeDrawingContext.Provider value="narrated">
        <RecordingConsentNotice onAcknowledge={() => undefined} />
      </RecordingNoticeDrawingContext.Provider>
    );
    expect(screen.getByText('Before you record')).toBeTruthy();
    expect(screen.getByText(REPLAY)).toBeTruthy();
    expect(screen.getByText(/Who receives your recording/i)).toBeTruthy();
  });

  it('shows only the replay line when every whiteboard question is draw-only', () => {
    render(
      <RecordingNoticeDrawingContext.Provider value="draw-only">
        <RecordingConsentNotice onAcknowledge={() => undefined} />
      </RecordingNoticeDrawingContext.Provider>
    );
    expect(screen.getByText('Before you draw')).toBeTruthy();
    expect(screen.getByText(REPLAY)).toBeTruthy();
    expect(screen.queryByText(/Who receives your recording/i)).toBeNull();
  });

  it('leaves the voice notice unchanged without a whiteboard question', () => {
    render(<RecordingConsentNotice onAcknowledge={() => undefined} />);
    expect(screen.queryByText(REPLAY)).toBeNull();
  });
});
