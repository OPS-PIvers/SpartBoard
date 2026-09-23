import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { SubShareGuidedLearningWidget } from './SubShareWidget';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import type { WidgetData } from '@/types';
import { subShareContextValue } from '@/tests/helpers/subShareContext';

const getDoc = vi.fn<(ref: { __path: string }) => Promise<unknown>>();
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...path: string[]) => ({
    __path: path.join('/'),
  })),
  getDoc: (ref: { __path: string }): Promise<unknown> => getDoc(ref),
}));
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: () => false }),
}));

// The player is the teacher's own component; this suite is about which set a
// substitute is handed and in which mode, not how a step draws.
vi.mock('./components/GuidedLearningPlayer', () => ({
  GuidedLearningPlayer: ({
    set,
    teacherMode,
    onAnswer,
    onStepEvent,
  }: {
    set: { title: string };
    teacherMode?: boolean;
    onAnswer?: unknown;
    onStepEvent?: unknown;
  }) => (
    <div
      data-testid="gl-player"
      data-teacher={teacherMode ? 'yes' : 'no'}
      data-records={onAnswer || onStepEvent ? 'yes' : 'no'}
    >
      {set.title}
    </div>
  ),
}));

// The panel has its own suite; here it only matters whether it is mounted,
// and its real settings hook would reach for Firestore.
vi.mock('@/components/subs/SubLaunchPanel', () => ({
  SubLaunchPanel: ({ kind, widgetId }: { kind: string; widgetId: string }) => (
    <div data-testid="sub-launch" data-kind={kind} data-widget={widgetId} />
  ),
}));

const widget = (config: Record<string, unknown>) =>
  ({
    id: 'w1',
    type: 'guided-learning',
    config: { view: 'player', ...config },
  }) as unknown as WidgetData;

const inShare = (
  loadKey: () => Promise<{ payload: unknown; denied: boolean }>
) =>
  function InShare({ children }: { children: React.ReactNode }) {
    return (
      <SubShareContentContext.Provider
        value={subShareContextValue({
          shareId: 'share-1',
          version: 0,
          load: (() => Promise.resolve(null)) as never,
          loadKey,
        })}
      >
        {children}
      </SubShareContentContext.Provider>
    );
  };

const bundled = (title: string) => () =>
  Promise.resolve({
    payload: { set: { id: 'set-1', title, steps: [] } },
    denied: false,
  });
const nothingBundled = () => Promise.resolve({ payload: null, denied: false });

beforeEach(() => {
  getDoc.mockReset();
  getDoc.mockResolvedValue({ exists: () => false });
});

describe('SubShareGuidedLearningWidget', () => {
  it('plays the set the share carried, not a library', async () => {
    render(
      <SubShareGuidedLearningWidget
        widget={widget({ playerSetId: 'set-1' })}
      />,
      { wrapper: inShare(bundled('Plant cell')) }
    );

    const player = await screen.findByTestId('gl-player');
    expect(player).toHaveTextContent('Plant cell');
  });

  // The sub is covering the lesson, so they get the teacher's view of it; and
  // with no answer or event callback the player cannot record anything.
  it('plays it in teacher mode and records nothing', async () => {
    render(
      <SubShareGuidedLearningWidget
        widget={widget({ playerSetId: 'set-1' })}
      />,
      { wrapper: inShare(bundled('Plant cell')) }
    );

    const player = await screen.findByTestId('gl-player');
    expect(player).toHaveAttribute('data-teacher', 'yes');
    expect(player).toHaveAttribute('data-records', 'no');
  });

  it('never reads the building collection when the share carried the set', async () => {
    render(
      <SubShareGuidedLearningWidget
        widget={widget({ playerSetId: 'set-1' })}
      />,
      { wrapper: inShare(bundled('Plant cell')) }
    );

    await screen.findByTestId('gl-player');
    expect(getDoc).not.toHaveBeenCalled();
  });

  // A building set is world-readable and so was never bundled; the sub has to
  // read it themselves, or this split would have broken what already worked.
  it('falls back to a building set the share did not bundle', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ id: 'set-1', title: 'Fire drill', steps: [] }),
    });

    render(
      <SubShareGuidedLearningWidget
        widget={widget({ playerSetId: 'set-1' })}
      />,
      { wrapper: inShare(nothingBundled) }
    );

    expect(await screen.findByTestId('gl-player')).toHaveTextContent(
      'Fire drill'
    );
    expect((getDoc.mock.calls[0][0] as { __path: string }).__path).toBe(
      'building_guided_learning/set-1'
    );
  });

  const denied = () => Promise.resolve({ payload: null, denied: true });

  it('says so when the share does not name this reader', async () => {
    render(
      <SubShareGuidedLearningWidget
        widget={widget({ playerSetId: 'set-1' })}
      />,
      { wrapper: inShare(denied) }
    );

    expect(await screen.findByText('Not shared with you')).toBeInTheDocument();
  });

  // A building set is readable by any signed-in user, so a reader the share
  // does not name is still entitled to it: the key refusal says nothing about
  // a collection that never held a key.
  it('falls back to a building set even when the key read was refused', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ id: 'set-1', title: 'Fire drill', steps: [] }),
    });

    render(
      <SubShareGuidedLearningWidget
        widget={widget({ playerSetId: 'set-1' })}
      />,
      { wrapper: inShare(denied) }
    );

    expect(await screen.findByTestId('gl-player')).toHaveTextContent(
      'Fire drill'
    );
    expect(screen.queryByText('Not shared with you')).not.toBeInTheDocument();
  });

  it('says so when neither the share nor the building collection has it', async () => {
    render(
      <SubShareGuidedLearningWidget
        widget={widget({ playerSetId: 'set-1' })}
      />,
      { wrapper: inShare(nothingBundled) }
    );

    expect(await screen.findByText('No guided activity')).toBeInTheDocument();
  });

  it('reads nothing when the widget had no set open', () => {
    const loadKey = vi.fn();
    render(
      <SubShareGuidedLearningWidget widget={widget({ playerSetId: null })} />,
      { wrapper: inShare(loadKey as never) }
    );

    expect(loadKey).not.toHaveBeenCalled();
    expect(getDoc).not.toHaveBeenCalled();
    expect(screen.getByText('No guided activity')).toBeInTheDocument();
  });
});

describe('SubShareGuidedLearningWidget launching', () => {
  it('offers to start the set the share bundled', async () => {
    render(
      <SubShareGuidedLearningWidget
        widget={widget({ playerSetId: 'set-1' })}
      />,
      { wrapper: inShare(bundled('Plant cell')) }
    );

    const panel = await screen.findByTestId('sub-launch');
    expect(panel).toHaveAttribute('data-kind', 'guidedLearning');
    expect(panel).toHaveAttribute('data-widget', 'w1');
  });

  // A building set was never bundled, so there is no key for the callable to
  // derive a run from and nothing to offer.
  it('offers nothing for a building set', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ id: 'set-1', title: 'Fire drill', steps: [] }),
    });

    render(
      <SubShareGuidedLearningWidget
        widget={widget({ playerSetId: 'set-1' })}
      />,
      { wrapper: inShare(nothingBundled) }
    );

    await screen.findByTestId('gl-player');
    expect(screen.queryByTestId('sub-launch')).not.toBeInTheDocument();
  });
});
