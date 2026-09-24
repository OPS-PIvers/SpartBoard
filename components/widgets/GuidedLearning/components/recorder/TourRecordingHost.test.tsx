import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  requestOpenStudio,
  requestRecordTour,
  requestRerecordStep,
  type StudioReturn,
} from '@/components/tours/tourState';
import { TourRecordingHost } from './TourRecordingHost';
import type { StepRecapture } from './recordingHandoff';

vi.mock('./RecordingSession', () => ({
  default: ({ onEnd }: { onEnd: () => void }) => (
    <button type="button" onClick={onEnd}>
      Stub session
    </button>
  ),
}));

const RECAPTURE: StepRecapture = {
  stepId: 'step-2',
  url: 'https://example.com/new.png',
  placement: { xPct: 1, yPct: 2, region: { shape: 'rect', wPct: 3, hPct: 4 } },
  tour: { anchor: 'sidebar.boards', action: 'click' },
};

vi.mock('./RerecordSession', () => ({
  default: ({
    target,
    onDone,
  }: {
    target: StudioReturn;
    onDone: (r: StepRecapture | null) => void;
  }) => (
    <button type="button" onClick={() => onDone(RECAPTURE)}>
      Stub rerecord {target.stepId}
    </button>
  ),
}));

vi.mock('./StudioReopen', () => ({
  default: ({
    target,
    recapture,
    onEnd,
  }: {
    target: StudioReturn;
    recapture?: StepRecapture;
    onEnd: () => void;
  }) => (
    <button type="button" onClick={onEnd}>
      Stub studio {target.setId} {target.stepId}{' '}
      {recapture ? recapture.url : 'no recapture'}
    </button>
  ),
}));

describe('TourRecordingHost', () => {
  it('runs one session per request and clears when it ends', async () => {
    render(<TourRecordingHost />);
    expect(screen.queryByText('Stub session')).toBeNull();
    act(() => requestRecordTour());
    fireEvent.click(await screen.findByText('Stub session'));
    expect(screen.queryByText('Stub session')).toBeNull();
  });

  it('re-records one step, then reopens the Studio with the new click', async () => {
    render(<TourRecordingHost />);
    act(() => requestRerecordStep({ setId: 'set-1', stepId: 'step-2' }));
    fireEvent.click(await screen.findByText('Stub rerecord step-2'));
    const studio = await screen.findByText(
      'Stub studio set-1 step-2 https://example.com/new.png'
    );
    expect(screen.queryByText('Stub session')).toBeNull();
    fireEvent.click(studio);
    expect(screen.queryByText(/Stub studio/)).toBeNull();
  });

  it('reopens the Studio at a step when a Studio run ends', async () => {
    render(<TourRecordingHost />);
    act(() => requestOpenStudio({ setId: 'set-1', stepId: 'step-3' }));
    expect(
      await screen.findByText('Stub studio set-1 step-3 no recapture')
    ).toBeInTheDocument();
  });
});
