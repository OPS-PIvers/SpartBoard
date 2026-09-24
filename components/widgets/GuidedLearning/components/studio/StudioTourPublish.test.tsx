import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { __resetPublishedToursForTests } from '@/components/tours/publishedTours';
import { StudioTourControls } from './StudioTourControls';
import { StudioTourPublish } from './StudioTourPublish';

const h = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  watchers: new Map<string, Set<(snap: unknown) => void>>(),
  failWrites: false,
}));

const snapOf = (id: string) => ({
  exists: () => h.docs.has(id),
  data: () => h.docs.get(id),
});

vi.mock('@/config/firebase', () => ({ db: {}, isConfigured: true }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _coll: string, id: string) => ({ id }),
  getDoc: (ref: { id: string }) => Promise.resolve(snapOf(ref.id)),
  setDoc: (ref: { id: string }, data: unknown) => {
    if (h.failWrites) return Promise.reject(new Error('denied'));
    h.docs.set(ref.id, data);
    h.watchers.get(ref.id)?.forEach((cb) => cb(snapOf(ref.id)));
    return Promise.resolve();
  },
  onSnapshot: (ref: { id: string }, next: (snap: unknown) => void) => {
    const set = h.watchers.get(ref.id) ?? new Set();
    h.watchers.set(ref.id, set);
    set.add(next);
    queueMicrotask(() => next(snapOf(ref.id)));
    return () => set.delete(next);
  },
}));
vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: vi.fn(() => Promise.resolve(null)),
}));

const step = (anchor: string, label = 'Open boards'): GuidedLearningStep => ({
  id: `step-${anchor}`,
  label,
  xPct: 10,
  yPct: 10,
  imageIndex: 0,
  interactionType: 'tooltip',
  tour: { anchor, action: 'click' },
});

const makeSet = (steps: GuidedLearningStep[]): GuidedLearningSet => ({
  id: 'set-1',
  title: 'Boards tour',
  imageUrls: ['https://i/1.png'],
  steps,
  mode: 'guided',
  createdAt: 1,
  updatedAt: 2,
  isBuilding: true,
});

const renderPublish = (set: GuidedLearningSet) => {
  const ui = (s: GuidedLearningSet) => (
    <AuthContext.Provider
      value={{ user: { uid: 'admin-uid' } } as unknown as AuthContextType}
    >
      <StudioTourPublish set={s} />
    </AuthContext.Provider>
  );
  const view = render(ui(set));
  return { rerender: (s: GuidedLearningSet) => view.rerender(ui(s)) };
};

const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

beforeEach(() => {
  __resetPublishedToursForTests();
  h.docs.clear();
  h.watchers.clear();
  h.failWrites = false;
});

describe('Publish tour', () => {
  it('goes Draft → Published → Changes not published as text', async () => {
    const set = makeSet([step('sidebar.boards')]);
    const { rerender } = renderPublish(set);
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('Draft');

    fireEvent.click(screen.getByRole('button', { name: 'Publish tour' }));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('Published');
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull();
    expect(h.docs.get('set-1')).toMatchObject({
      publishedBy: 'admin-uid',
      set: { steps: [{ label: 'Open boards' }] },
    });

    rerender(makeSet([step('sidebar.boards', 'Open your boards')]));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Changes not published'
    );
    // The edit is not in the snapshot teachers run.
    expect(h.docs.get('set-1')).toMatchObject({
      set: { steps: [{ label: 'Open boards' }] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Publish changes' }));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('Published');
    expect(h.docs.get('set-1')).toMatchObject({
      set: { steps: [{ label: 'Open your boards' }] },
    });
  });

  it('warns about broken anchors but still lets the author publish', async () => {
    renderPublish(makeSet([step('sidebar.boards'), step('gone.anchor')]));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Publish tour' }));
    const warning = screen.getByRole('alert');
    expect(warning).toHaveTextContent('1 step has a broken button link');
    expect(warning).toHaveTextContent(
      'Step 2: the linked button no longer exists'
    );
    expect(h.docs.has('set-1')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Publish anyway' }));
    await flush();
    expect(h.docs.has('set-1')).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Published');
  });

  it('can cancel the broken-anchor warning', async () => {
    renderPublish(makeSet([step('gone.anchor')]));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Publish tour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(h.docs.has('set-1')).toBe(false);
  });

  it('says so when publishing fails', async () => {
    h.failWrites = true;
    renderPublish(makeSet([step('sidebar.boards')]));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Publish tour' }));
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't publish the tour"
    );
    expect(screen.getByRole('status')).toHaveTextContent('Draft');
  });

  it("is set-level, so a step's tour controls never show it", () => {
    render(
      <StudioTourControls step={step('sidebar.boards')} onChange={vi.fn()} />
    );
    expect(screen.queryByTestId('gl-studio-tour-publish')).toBeNull();
  });
});
