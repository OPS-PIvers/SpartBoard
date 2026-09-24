import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import {
  rerecordTargetOf,
  TOUR_RECORD_EVENT,
  TOUR_START_EVENT,
} from '@/components/tours/tourState';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { GuidedLearningStudio } from './GuidedLearningStudio';

const features = vi.hoisted(() => new Set<string>(['gl-live-tours']));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user' },
    isAdmin: true,
    featurePermissions: [],
    canAccessFeature: (id: string) => features.has(id),
  }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploading: false,
    uploadGuidedLearningMedia: vi.fn(),
    deleteFile: vi.fn(),
    deleteDriveFile: vi.fn(),
    releaseGuidedLearningFiles: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    currentDialog: null,
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(false),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));
// Publishing reads Firestore; here it only needs its status and the write.
const publishTour = vi.hoisted(() => vi.fn());
vi.mock('@/components/tours/publishedTours', () => ({
  watchTours: () => () => undefined,
  getToursVersion: () => 0,
  readPublishedTour: () => ({ loaded: true, tour: null }),
  publishTour,
}));

const step = (id: string, imageIndex: number): GuidedLearningStep => ({
  id,
  xPct: 40,
  yPct: 30,
  imageIndex,
  interactionType: 'tooltip',
  showOverlay: 'tooltip',
  text: `Step ${id}`,
  tour: { anchor: 'sidebar.boards', action: 'click' },
});

const tourSet = (): GuidedLearningSet => ({
  id: 'set-1',
  schemaVersion: 3,
  title: 'Boards tour',
  imageUrls: [
    'https://example.com/slide-1.png',
    'https://example.com/slide-2.png',
  ],
  steps: [step('step-1', 0), step('step-2', 1)],
  mode: 'guided',
  isBuilding: true,
  tourSetup: { widgets: ['time-tool'] },
  createdAt: 1,
  updatedAt: 1,
});

const renderStudio = (
  props: Partial<React.ComponentProps<typeof GuidedLearningStudio>> = {}
) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <AuthContext.Provider
      value={{ user: { uid: 'test-user' } } as unknown as AuthContextType}
    >
      <GuidedLearningStudio
        set={tourSet()}
        meta={null}
        onClose={onClose}
        onSave={onSave}
        {...props}
      />
    </AuthContext.Provider>
  );
  return { onSave, onClose };
};

const listeners: [string, EventListener][] = [];
const listen = (type: string) => {
  const fn = vi.fn();
  listeners.push([type, fn]);
  window.addEventListener(type, fn);
  return fn;
};

const selectStep = (n: number) => {
  for (let i = 0; i < n; i++) {
    act(() => {
      fireEvent.keyDown(window, { key: ']' });
    });
  }
};

let restore: (() => void) | null = null;
beforeEach(() => {
  localStorage.clear();
  publishTour.mockReset().mockResolvedValue(undefined);
  restore = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
  }).restore;
});
afterEach(() => {
  cleanup();
  restore?.();
  listeners.forEach(([type, fn]) => window.removeEventListener(type, fn));
  listeners.length = 0;
  features.clear();
  features.add('gl-live-tours');
});

describe('Studio tour tools', () => {
  it('shows the publish status and tour setup chips in Activity settings', () => {
    renderStudio();
    const settings = screen.getByTestId('gl-studio-set-tour');
    expect(
      within(settings).getByTestId('gl-studio-tour-publish')
    ).toHaveTextContent('Draft');
    expect(
      within(settings).getByRole('button', { name: 'Publish tour' })
    ).toBeInTheDocument();
    expect(within(settings).getByTestId('gl-studio-tour-setup')).toBeVisible();
  });

  it('saves the draft first and publishes exactly what was saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderStudio({ onSave });
    fireEvent.change(screen.getByLabelText('Activity title'), {
      target: { value: 'Boards tour, revised' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish tour' }));
    await waitFor(() => expect(publishTour).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as GuidedLearningSet;
    const published = publishTour.mock.calls[0][0] as GuidedLearningSet;
    expect(published.title).toBe('Boards tour, revised');
    expect(published.steps).toEqual(saved.steps);
    expect(publishTour.mock.calls[0][1]).toBe('test-user');
    expect(onSave.mock.invocationCallOrder[0]).toBeLessThan(
      publishTour.mock.invocationCallOrder[0]
    );
  });

  it('does not publish when the save fails, and shows the save error', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('offline'));
    renderStudio({ onSave });
    fireEvent.change(screen.getByLabelText('Activity title'), {
      target: { value: 'Boards tour, revised' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish tour' }));
    expect(await screen.findByText('Couldn’t save')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish tour' })).toBeEnabled()
    );
    expect(onSave).toHaveBeenCalled();
    expect(publishTour).not.toHaveBeenCalled();
  });

  it('hides tour settings without the live tours flag', () => {
    features.clear();
    renderStudio();
    expect(screen.queryByTestId('gl-studio-set-tour')).toBeNull();
  });

  it('saves chip edits as undoable set changes', async () => {
    const { onSave } = renderStudio();
    const setup = screen.getByTestId('gl-studio-tour-setup');
    fireEvent.change(within(setup).getByRole('combobox'), {
      target: { value: 'clock' },
    });
    fireEvent.click(within(setup).getByRole('button', { name: /Remove Time/ }));
    expect(
      within(setup).queryByRole('button', { name: /Remove Time/ })
    ).toBeNull();
    fireEvent.click(screen.getByTestId('gl-studio-undo'));
    expect(
      within(setup).getByRole('button', { name: /Remove Time/ })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.lastCall?.[0] as GuidedLearningSet).tourSetup).toEqual({
      widgets: ['time-tool', 'clock'],
    });
  });

  it('runs the saved draft live from the selected step and asks to come back to it', async () => {
    const start = listen(TOUR_START_EVENT);
    const { onClose } = renderStudio();
    selectStep(2);
    fireEvent.click(
      screen.getByRole('button', { name: 'Run live from this step' })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect((start.mock.calls[0][0] as CustomEvent).detail).toEqual({
      setId: 'set-1',
      draft: true,
      fromStep: 1,
      returnToStepId: 'step-2',
    });
  });

  it('re-records one step through the recording host', async () => {
    const record = listen(TOUR_RECORD_EVENT);
    const { onClose } = renderStudio();
    selectStep(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Re-record this step' })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(rerecordTargetOf(record.mock.calls[0][0] as Event)).toEqual({
      setId: 'set-1',
      stepId: 'step-1',
    });
  });

  it('applies a re-recorded click on open, selected and undoable', async () => {
    const { onSave } = renderStudio({
      initialStepId: 'step-2',
      recapture: {
        stepId: 'step-2',
        url: 'https://example.com/new.png',
        placement: {
          xPct: 70,
          yPct: 20,
          region: { shape: 'rect', wPct: 6, hPct: 5 },
        },
        tour: { anchor: 'widget.close', action: 'click' },
      },
    });
    expect(screen.getByTestId('gl-studio-step-section')).toHaveTextContent(
      'Step 2'
    );
    expect(screen.getByTestId('gl-studio-tour-anchor-id')).toHaveTextContent(
      'widget.close'
    );
    expect(screen.getByTestId('gl-studio-undo')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.lastCall?.[0] as GuidedLearningSet;
    expect(saved.imageUrls[1]).toBe('https://example.com/new.png');
    expect(saved.steps[1]).toMatchObject({
      id: 'step-2',
      xPct: 70,
      tour: { anchor: 'widget.close', action: 'click' },
    });
  });

  it('fades the Studio while Find on board flashes a button', () => {
    const board = document.createElement('button');
    board.setAttribute('data-tour', 'sidebar.boards');
    document.body.appendChild(board);
    renderStudio();
    selectStep(1);
    fireEvent.click(screen.getByRole('button', { name: 'Find on board' }));
    expect(screen.getByTestId('gl-studio')).toHaveAttribute(
      'data-peeking',
      'true'
    );
    board.remove();
  });
});
