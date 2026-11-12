import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Toast } from '@/types';
import {
  HELP_CENTER_OPEN_EVENT,
  type HelpCenterOpenRequest,
} from '@/components/tours/tourState';
import { noteFiledHelpItem } from '@/components/tours/helpCenterReturn';
import { clearTourEdit, requestEditTour } from './tourEditStore';
import { TourEditorHost } from './TourEditorHost';

const h = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ isAdmin: true, canAccessFeature: () => false }),
}));
vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => ({ addToast: h.toast }),
}));
vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: (id: string) =>
    Promise.resolve(
      id === 'missing' ? null : { id, title: 'Tour', steps: [], mode: 'tour' }
    ),
}));
vi.mock('@/components/widgets/GuidedLearning/utils/liveTour', () => ({
  isLiveTourSet: () => true,
  isWebTourSet: () => false,
}));
vi.mock('./TourEditorSessionView', () => ({
  default: () => <div>Stub editor</div>,
}));

const opened: (HelpCenterOpenRequest | undefined)[] = [];
const onOpen = (e: Event) =>
  opened.push((e as CustomEvent<HelpCenterOpenRequest>).detail);

beforeEach(() => {
  opened.length = 0;
  h.toast.mockReset();
  window.addEventListener(HELP_CENTER_OPEN_EVENT, onOpen);
});
afterEach(() => {
  window.removeEventListener(HELP_CENTER_OPEN_EVENT, onOpen);
  act(() => clearTourEdit());
});

const editThenDone = async (req: Parameters<typeof requestEditTour>[0]) => {
  render(<TourEditorHost />);
  act(() => requestEditTour(req));
  await screen.findByText('Stub editor');
  act(() => clearTourEdit());
};

describe('TourEditorHost round trip (H2, H13)', () => {
  it('reopens the Help Center on a recorded tour item after Done from a Help Center start', async () => {
    noteFiledHelpItem('set-1', 'item-1');
    await editThenDone({ setId: 'set-1', origin: 'help-center' });
    expect(opened).toEqual([{ selectId: 'item-1' }]);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('reopens the Help Center on the stored selection after editing an existing tour from there', async () => {
    await editThenDone({ setId: 'set-2', origin: 'help-center' });
    expect(opened).toEqual([{}]);
  });

  it('ends a widget recording on the board with a toast that opens its item', async () => {
    noteFiledHelpItem('set-3', 'item-3');
    await editThenDone({ setId: 'set-3', origin: 'widget' });
    expect(opened).toEqual([]);
    expect(h.toast).toHaveBeenCalledTimes(1);
    const [message, type, action] = h.toast.mock.calls[0] as [
      string,
      Toast['type'],
      NonNullable<Toast['action']>,
    ];
    expect(message).toBe('Saved to the Help Center as Hidden.');
    expect(type).toBe('success');
    expect(action.label).toBe('Open in Help Center');
    expect(action.tourId).toBe('board.help-center-toast-open');
    action.onClick();
    expect(opened).toEqual([{ selectId: 'item-3' }]);
  });

  it('does nothing extra when an edit started on the board ends', async () => {
    await editThenDone({ setId: 'set-4' });
    expect(opened).toEqual([]);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('still goes back to the Help Center when the tour cannot be opened', async () => {
    render(<TourEditorHost />);
    act(() => requestEditTour({ setId: 'missing', origin: 'help-center' }));
    await vi.waitFor(() => expect(opened).toEqual([{}]));
    expect(h.toast).toHaveBeenCalledWith(
      "This tour isn't available right now.",
      'error'
    );
  });
});
