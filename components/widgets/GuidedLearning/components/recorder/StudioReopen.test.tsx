import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import { StudioReopen } from './StudioReopen';

const h = vi.hoisted(() => ({ load: vi.fn(), studioProps: vi.fn() }));

vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: h.load,
  useGuidedLearning: () => ({ saveBuildingSet: vi.fn() }),
}));
vi.mock('../studio/GuidedLearningStudio', () => ({
  GuidedLearningStudio: (props: Record<string, unknown>) => {
    h.studioProps(props);
    return <p>Stub Studio</p>;
  },
}));

const SET = { id: 'set-1', title: 'Tour' } as GuidedLearningSet;

describe('StudioReopen', () => {
  it('opens the Studio on the saved set at the step, with any recapture', async () => {
    h.load.mockResolvedValue(SET);
    const recapture = {
      stepId: 'step-2',
      url: 'https://example.com/new.png',
      placement: {
        xPct: 1,
        yPct: 1,
        region: { shape: 'rect' as const, wPct: 1, hPct: 1 },
      },
      tour: { anchor: 'sidebar.boards', action: 'click' as const },
    };
    render(
      <StudioReopen
        target={{ setId: 'set-1', stepId: 'step-2' }}
        recapture={recapture}
        onEnd={vi.fn()}
      />
    );
    expect(await screen.findByText('Stub Studio')).toBeInTheDocument();
    expect(h.load).toHaveBeenCalledWith('set-1');
    expect(h.studioProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        set: SET,
        initialStepId: 'step-2',
        recapture,
      })
    );
  });

  it('ends with a toast when the set is gone', async () => {
    h.load.mockResolvedValue(null);
    const addToast = vi.fn();
    const onEnd = vi.fn();
    render(
      <DashboardContext.Provider
        value={{ addToast } as unknown as DashboardContextValue}
      >
        <StudioReopen
          target={{ setId: 'gone', stepId: 'step-2' }}
          onEnd={onEnd}
        />
      </DashboardContext.Provider>
    );
    await waitFor(() => expect(onEnd).toHaveBeenCalled());
    expect(addToast).toHaveBeenCalledWith(
      "Couldn't reopen the tour in the Studio.",
      'error'
    );
  });
});
