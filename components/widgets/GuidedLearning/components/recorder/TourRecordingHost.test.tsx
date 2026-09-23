import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { requestRecordTour } from '@/components/tours/tourState';
import { TourRecordingHost } from './TourRecordingHost';

vi.mock('./RecordingSession', () => ({
  default: ({ onEnd }: { onEnd: () => void }) => (
    <button type="button" onClick={onEnd}>
      Stub session
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
});
