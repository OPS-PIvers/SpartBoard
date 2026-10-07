import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import type { PublishedTour } from '@/components/tours/tourSnapshot';
import { TourEditorSettings } from './TourEditorSettings';
import type { TourEditorSession } from './useTourEditorSession';
import { clearTourEdit, setTourEdit } from './tourEditStore';

const h = vi.hoisted(() => ({
  published: null as PublishedTour | null,
  publish: vi.fn<(set: unknown, uid: string) => Promise<void>>(() =>
    Promise.resolve()
  ),
}));

vi.mock('@/components/tours/publishedTours', () => ({
  usePublishedTour: () => ({ loaded: true, tour: h.published }),
  publishTour: h.publish,
}));
vi.mock('./TourHelpVisibility', () => ({
  TourHelpVisibility: () => <p>help visibility</p>,
}));
vi.mock('@/hooks/useToolLabel', () => ({
  useToolLabel: () => (type: string) => type,
}));

const tour = (patch: Partial<GuidedLearningSet> = {}): GuidedLearningSet => ({
  id: 'set-1',
  title: 'Clock tour',
  mode: 'tour',
  imageUrls: [],
  createdAt: 1,
  updatedAt: 1,
  steps: [
    {
      id: 'a',
      xPct: 50,
      yPct: 50,
      imageIndex: 0,
      interactionType: 'text-popover',
      tour: { anchor: 'dock.open-tools', action: 'click' },
    },
  ],
  ...patch,
});

const sessionFor = (
  set: GuidedLearningSet,
  over: Partial<TourEditorSession> = {}
): TourEditorSession =>
  ({
    set,
    selected: 0,
    updateSet: vi.fn(),
    flush: vi.fn(() => Promise.resolve(true)),
    ...over,
  }) as unknown as TourEditorSession;

const renderSettings = (session: TourEditorSession) =>
  render(
    <AuthContext.Provider
      value={{ user: { uid: 'admin-1' } } as unknown as AuthContextType}
    >
      <TourEditorSettings session={session} />
    </AuthContext.Provider>
  );

beforeEach(() => {
  h.published = null;
  h.publish.mockClear();
  clearTourEdit();
});

describe('TourEditorSettings', () => {
  it('saves the draft, then publishes what was saved', async () => {
    const set = tour();
    setTourEdit({ set, selected: 0, replay: 0, readAloud: false });
    const session = sessionFor(set);
    renderSettings(session);
    expect(screen.getByRole('status')).toHaveTextContent('Draft');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish tour' }));
      await Promise.resolve();
    });
    expect(session.flush).toHaveBeenCalled();
    expect(h.publish).toHaveBeenCalledWith(set, 'admin-1');
  });

  it('publishes nothing when the draft could not be saved', async () => {
    const set = tour();
    setTourEdit({ set, selected: 0, replay: 0, readAloud: false });
    renderSettings(
      sessionFor(set, { flush: vi.fn(() => Promise.resolve(false)) })
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish tour' }));
      await Promise.resolve();
    });
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('shows unpublished changes and hides Publish once teachers run the latest', () => {
    h.published = { set: tour(), publishedAt: 5, publishedBy: 'admin-1' };
    const { unmount } = renderSettings(sessionFor(tour({ title: 'Renamed' })));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Changes not published'
    );
    expect(
      screen.getByRole('button', { name: 'Publish changes' })
    ).toBeInTheDocument();
    unmount();
    renderSettings(sessionFor(tour()));
    expect(screen.getByRole('status')).toHaveTextContent('Published');
    expect(screen.queryByTestId('tour-editor-publish-button')).toBeNull();
  });

  it('turns Autopilot on at the start and removes the flag when cleared', () => {
    const session = sessionFor(tour({ tourSetup: { widgets: ['clock'] } }));
    renderSettings(session);
    fireEvent.click(screen.getByTestId('tour-editor-autopilot'));
    expect(session.updateSet).toHaveBeenLastCalledWith({
      tourSetup: { widgets: ['clock'], autopilot: true },
    });

    const on = sessionFor(
      tour({ tourSetup: { widgets: ['clock'], autopilot: true } })
    );
    renderSettings(on);
    fireEvent.click(screen.getAllByTestId('tour-editor-autopilot')[1]);
    expect(on.updateSet).toHaveBeenLastCalledWith({
      tourSetup: { widgets: ['clock'] },
    });
  });

  it('adds and removes the widgets the tour adds', () => {
    const session = sessionFor(tour({ tourSetup: { widgets: ['clock'] } }));
    renderSettings(session);
    fireEvent.change(screen.getByLabelText('Add a widget'), {
      target: { value: 'time-tool' },
    });
    expect(session.updateSet).toHaveBeenLastCalledWith({
      tourSetup: { widgets: ['clock', 'time-tool'] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove clock' }));
    expect(session.updateSet).toHaveBeenLastCalledWith({
      tourSetup: { widgets: [] },
    });
  });
});
