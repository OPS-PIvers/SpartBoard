import React, { useContext } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardContext } from '@/context/DashboardContextValue';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import type { WidgetData } from '@/types';
import type { SharedBoardItemState } from '@/hooks/useSharedBoardItem';
import {
  SharedBoardItemGate,
  SharedBoardItemPanel,
  type SharedBoardLocal,
} from './SharedBoardItemGate';

const flush = () => Promise.resolve();

let sharedState: SharedBoardItemState<{ note: string }> = {
  status: 'off',
  item: null,
};
vi.mock('@/hooks/useSharedBoardItem', () => ({
  useSharedBoardItem: () => sharedState,
}));

const realUpdate = vi.fn();
const addToast = vi.fn();
const dashboard = {
  updateWidget: realUpdate,
  addToast,
} as unknown as DashboardContextValue;

const widget = {
  id: 'w1',
  type: 'quiz',
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  z: 1,
  flipped: false,
  config: { view: 'preview', selectedQuizId: 'q1' },
} as unknown as WidgetData;

const foreign: SharedBoardItemState<{ note: string }> = {
  status: 'foreign',
  item: {
    kind: 'quiz',
    itemId: 'q1',
    ownerUid: 'host',
    title: 'Fractions',
    version: '1',
    publishedAt: 1,
    payload: { note: 'host quiz' },
  },
};

/** Stands in for the teacher widget: shows its config and navigates through updateWidget. */
const OwnWidget: React.FC<{ widget: WidgetData; local?: SharedBoardLocal }> = ({
  widget: w,
  local,
}) => {
  const assignOnOpen = local?.assignOnOpen;
  const ctx = useContext(DashboardContext);
  const config = w.config as { view?: string };
  return (
    <div>
      <span>own:{config.view}</span>
      {assignOnOpen && <span>assign:{assignOnOpen}</span>}
      <button
        type="button"
        onClick={() => ctx?.updateWidget(w.id, { config: { view: 'monitor' } })}
      >
        go-monitor
      </button>
      {local && (
        <button type="button" onClick={local.onAssignOpened}>
          opened
        </button>
      )}
    </div>
  );
};

const gateTree = (onCopy = vi.fn(() => Promise.resolve('q1-copy'))) => (
  <DashboardContext.Provider value={dashboard}>
    <SharedBoardItemGate<{ note: string }>
      widget={widget}
      kind="quiz"
      itemId="q1"
      ownerUid="host"
      label="quiz"
      libraryConfig={{ view: 'manager', selectedQuizId: null }}
      renderShared={(item, onCopied) => (
        <SharedBoardItemPanel label="quiz" onCopy={onCopy} onCopied={onCopied}>
          <span>shared:{item.payload.note}</span>
        </SharedBoardItemPanel>
      )}
      renderOwn={(w, local) => <OwnWidget widget={w} local={local} />}
    />
  </DashboardContext.Provider>
);

const renderGate = (onCopy?: () => Promise<string>) =>
  render(gateTree(onCopy && vi.fn(onCopy)));

beforeEach(() => {
  realUpdate.mockReset();
  addToast.mockReset();
  sharedState = { status: 'off', item: null };
});

describe('SharedBoardItemGate', () => {
  it('renders the teacher widget when no colleague item is open', () => {
    for (const status of ['off', 'pending', 'none'] as const) {
      sharedState = { status, item: null };
      const { unmount } = renderGate();
      expect(screen.getByText('own:preview')).toBeTruthy();
      unmount();
    }
  });

  it('shows a colleague item read-only with Assign', () => {
    sharedState = foreign;
    renderGate();
    expect(screen.getByText('shared:host quiz')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Assign/ })).toBeTruthy();
    expect(screen.queryByText(/^own:/)).toBeNull();
  });

  it('Assign copies, then opens the viewer library locally with the copy queued for Assign', async () => {
    sharedState = foreign;
    const onCopy = vi.fn(() => Promise.resolve('q1-copy'));
    renderGate(onCopy);
    fireEvent.click(screen.getByRole('button', { name: /Assign/ }));
    await act(flush);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('own:manager')).toBeTruthy();
    expect(screen.getByText('assign:q1-copy')).toBeTruthy();
  });

  it('keeps the viewer’s own navigation off the shared board', async () => {
    sharedState = foreign;
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /Assign/ }));
    await act(flush);
    fireEvent.click(screen.getByText('go-monitor'));
    expect(screen.getByText('own:monitor')).toBeTruthy();
    expect(realUpdate).not.toHaveBeenCalled();
  });

  it('opens Assign once, and stays in the viewer library when the colleague moves on', async () => {
    sharedState = foreign;
    const { rerender } = renderGate();
    fireEvent.click(screen.getByRole('button', { name: /Assign/ }));
    await act(flush);
    fireEvent.click(screen.getByText('opened'));
    expect(screen.queryByText(/^assign:/)).toBeNull();
    fireEvent.click(screen.getByText('go-monitor'));
    sharedState = { status: 'off', item: null };
    rerender(gateTree());
    expect(screen.getByText('own:monitor')).toBeTruthy();
  });

  it('goes back to the colleague item', async () => {
    sharedState = foreign;
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /Assign/ }));
    await act(flush);
    fireEvent.click(
      screen.getByRole('button', { name: /Back to the shared quiz/ })
    );
    expect(screen.getByText('shared:host quiz')).toBeTruthy();
  });

  it('a failed copy stays on the colleague item and says so', async () => {
    sharedState = foreign;
    renderGate(
      vi.fn(() => Promise.reject(new Error('Drive is not connected.')))
    );
    fireEvent.click(screen.getByRole('button', { name: /Assign/ }));
    await act(flush);
    expect(addToast).toHaveBeenCalledWith('Drive is not connected.', 'error');
    expect(screen.getByText('shared:host quiz')).toBeTruthy();
  });

  it('a disabled reason replaces Assign', () => {
    render(
      <DashboardContext.Provider value={dashboard}>
        <SharedBoardItemPanel
          label="quiz"
          disabledReason="Can't be copied."
          onCopy={vi.fn()}
          onCopied={vi.fn()}
        >
          <span>preview</span>
        </SharedBoardItemPanel>
      </DashboardContext.Provider>
    );
    expect(screen.getByText("Can't be copied.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Assign/ })).toBeNull();
  });
});
