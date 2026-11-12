import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { requestRecordTour } from '@/components/tours/tourState';
import { TourRecordingHost } from './TourRecordingHost';

vi.mock('./RecordingSession', () => ({
  default: ({ onEnd, origin }: { onEnd: () => void; origin?: string }) => (
    <button type="button" onClick={onEnd} data-origin={origin}>
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

  it('ignores a second request while a session is open', async () => {
    render(<TourRecordingHost />);
    act(() => requestRecordTour());
    await screen.findByText('Stub session');
    act(() => requestRecordTour());
    expect(screen.getAllByText('Stub session')).toHaveLength(1);
  });

  it('passes where the recording started to the session', async () => {
    render(<TourRecordingHost />);
    act(() => requestRecordTour('help-center'));
    const session = await screen.findByText('Stub session');
    expect(session).toHaveAttribute('data-origin', 'help-center');
    fireEvent.click(session);
    act(() => requestRecordTour());
    expect(await screen.findByText('Stub session')).toHaveAttribute(
      'data-origin',
      'widget'
    );
  });
});
