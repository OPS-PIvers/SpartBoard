import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import type { GuidedLearningSet } from '@/types';
import { DashboardContext } from '@/context/DashboardContextValue';
import { WebTourEditor } from './WebTourEditor';

const storage = vi.hoisted(() => ({
  saveWebTourDraft: vi.fn((_set: GuidedLearningSet) => Promise.resolve()),
  loadWebTourDraft: vi.fn(),
  publishWebTour: vi.fn(
    (_id: string, _uid: string, _check?: (d: GuidedLearningSet) => void) =>
      Promise.resolve()
  ),
  deleteWebTourDraft: vi.fn(() => Promise.resolve()),
  uploadWebTourPicture: vi.fn(() =>
    Promise.resolve('web_tour_pictures/t1/abc.jpg')
  ),
  loadWebTourPicture: vi.fn(() => Promise.resolve(new ArrayBuffer(4))),
}));
vi.mock('@/components/tours/webTours', () => storage);

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'admin-1' } }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: () => Promise.resolve(true) }),
}));

const tour = (name: string): GuidedLearningSet => ({
  id: 't1',
  title: 'Schoology materials',
  imageUrls: [],
  mode: 'tour',
  surface: 'web',
  createdAt: 1,
  updatedAt: 1,
  steps: [
    {
      id: 's1',
      xPct: 50,
      yPct: 50,
      imageIndex: 0,
      interactionType: 'tooltip',
      label: 'Open the course',
      text: '',
      web: {
        urlPattern: 'https://orono.schoology.com/course/*/materials',
        action: 'click',
        locator: { role: 'link', name },
      },
    },
  ],
});

const renderEditor = (set: GuidedLearningSet) =>
  render(
    <DashboardContext.Provider
      value={
        {
          rosters: [{ students: [{ firstName: 'Alice', lastName: 'Nguyen' }] }],
        } as unknown as React.ContextType<typeof DashboardContext>
      }
    >
      <WebTourEditor initial={set} onClose={() => undefined} />
    </DashboardContext.Provider>
  );

const publishButton = () =>
  screen.getByRole('button', { name: 'Publish tour' });
const tick = () =>
  screen.getByRole('checkbox', {
    name: /checked this step's picture, text and page address/,
  });

beforeEach(() => vi.clearAllMocks());

describe('WebTourEditor', () => {
  it('keeps Publish off until every step is ticked', () => {
    renderEditor(tour('Biology 7'));
    expect(publishButton()).toBeDisabled();
    fireEvent.click(tick());
    expect(publishButton()).toBeEnabled();
  });

  it('catches a roster name in captured text and blocks publishing until it is hidden', () => {
    renderEditor(tour('Alice Nguyen'));
    fireEvent.click(tick());
    expect(publishButton()).toBeDisabled();
    expect(
      screen.getByText('Hide the highlighted student data before publishing.')
    ).toBeInTheDocument();
    expect(screen.getByText('Alice Nguyen').tagName).toBe('MARK');
    fireEvent.click(screen.getByRole('button', { name: 'Hide highlighted' }));
    // Editing a ticked step clears its tick.
    expect(tick()).not.toBeChecked();
    fireEvent.click(tick());
    expect(publishButton()).toBeEnabled();
    expect(screen.queryByText('Alice Nguyen')).toBeNull();
  });

  it('runs the gate on the draft publishing reads', async () => {
    renderEditor(tour('Biology 7'));
    fireEvent.click(tick());
    fireEvent.click(publishButton());
    await waitFor(() => expect(storage.publishWebTour).toHaveBeenCalled());
    const [id, uid, check] = storage.publishWebTour.mock
      .calls[0] as unknown as [string, string, (d: GuidedLearningSet) => void];
    expect([id, uid]).toEqual(['t1', 'admin-1']);
    const saved = storage.saveWebTourDraft.mock.calls.at(-1)?.[0];
    expect(() => check(saved as GuidedLearningSet)).not.toThrow();
    // A draft with an unchecked step (say, one recorded meanwhile) is refused.
    expect(() => check(tour('Biology 7'))).toThrow(/unchecked/);
  });

  it('never saves the draft again after Delete', async () => {
    vi.useFakeTimers();
    try {
      renderEditor(tour('Biology 7'));
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'Renamed' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Delete web tour' }));
      await vi.advanceTimersByTimeAsync(2000);
      expect(storage.deleteWebTourDraft).toHaveBeenCalledWith('t1');
      expect(storage.saveWebTourDraft).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('warns when no roster is loaded', () => {
    render(
      <WebTourEditor initial={tour('Biology 7')} onClose={() => undefined} />
    );
    expect(screen.getByText(/No class rosters are loaded/)).toBeInTheDocument();
  });
});
