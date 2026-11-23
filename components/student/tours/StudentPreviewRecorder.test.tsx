import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TourRecording } from '@/components/widgets/GuidedLearning/components/recorder/useTourCapture';
import {
  STUDENT_TOUR_PROBE,
  STUDENT_TOUR_READY,
  STUDENT_TOUR_RECEIVED,
  STUDENT_TOUR_RECORDING,
} from '@/utils/studentTourHandoff';
import { StudentPreviewRecorder } from './StudentPreviewRecorder';

const h = vi.hoisted(() => ({
  recording: null as unknown as TourRecording,
}));
vi.mock('@/components/tours/useTourOffers', () => ({
  useRunnableTourIds: () => new Set<string>(),
}));
vi.mock(
  '@/components/widgets/GuidedLearning/components/recorder/TourRecorder',
  () => ({
    TourRecorder: (props: {
      matcher: unknown;
      onFinish: (r: TourRecording) => void;
    }) => (
      <button type="button" onClick={() => props.onFinish(h.recording)}>
        Stub finish {props.matcher === null ? 'no names' : 'names'}
      </button>
    ),
  })
);

const admin = { postMessage: vi.fn() };
const teacher = { opener: admin };

const answer = (source: unknown, type: string) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type },
        origin: window.location.origin,
        source: source as Window,
      })
    );
  });

beforeEach(() => {
  admin.postMessage.mockReset();
  h.recording = {
    frames: [new Blob(['f'])],
    redactions: [[]],
    steps: [],
  };
  Object.defineProperty(window, 'opener', {
    configurable: true,
    value: teacher,
  });
});
afterEach(() => {
  Object.defineProperty(window, 'opener', { configurable: true, value: null });
});

describe('StudentPreviewRecorder', () => {
  it('stays hidden until the admin tab answers, and ignores other windows', () => {
    render(<StudentPreviewRecorder />);
    expect(admin.postMessage).toHaveBeenCalledWith(
      { type: STUDENT_TOUR_PROBE },
      window.location.origin
    );
    answer(teacher, STUDENT_TOUR_READY);
    expect(screen.queryByRole('button', { name: 'Help' })).toBeNull();
    answer(admin, STUDENT_TOUR_READY);
    expect(screen.getByRole('button', { name: 'Help' })).toBeTruthy();
  });

  it('records without roster names and hands the recording to the admin tab', () => {
    render(<StudentPreviewRecorder />);
    answer(admin, STUDENT_TOUR_READY);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Record a tour' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Stub finish no names' })
    );
    expect(admin.postMessage).toHaveBeenLastCalledWith(
      { type: STUDENT_TOUR_RECORDING, recording: h.recording },
      window.location.origin
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    answer(admin, STUDENT_TOUR_RECEIVED);
    expect(
      screen.getByText(
        'Finish in your SpartBoard tab. Review the pictures and save there.'
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says the SpartBoard tab is closed when it never confirms', () => {
    vi.useFakeTimers();
    try {
      render(<StudentPreviewRecorder />);
      answer(admin, STUDENT_TOUR_READY);
      fireEvent.click(screen.getByRole('button', { name: 'Help' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Record a tour' }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Stub finish no names' })
      );
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(
        screen.getByText(
          'Your SpartBoard tab is closed. Open View as from it and record again.'
        )
      ).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends nothing when the recording has no pictures', () => {
    h.recording = { frames: [], redactions: [], steps: [] };
    render(<StudentPreviewRecorder />);
    answer(admin, STUDENT_TOUR_READY);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Record a tour' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Stub finish no names' })
    );
    expect(admin.postMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Help' })).toBeTruthy();
  });
});
