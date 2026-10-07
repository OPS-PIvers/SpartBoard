import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { TourEditorPanel } from './TourEditorPanel';
import { IDLE_PLAYBACK } from './tourEditStore';
import type { TourEditorSession } from './useTourEditorSession';

const recorded = vi.hoisted(() => ({
  id: 'r1',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'text-popover' as const,
}));
vi.mock('./RecordFromHere', () => ({
  RecordFromHere: (props: {
    onDone: (steps: unknown[], paths: string[]) => void;
  }) => (
    <button type="button" onClick={() => props.onDone([recorded], ['p.png'])}>
      Stop recording
    </button>
  ),
}));

const step = (id: string, tour?: GuidedLearningStep['tour']) =>
  ({
    id,
    xPct: 50,
    yPct: 50,
    imageIndex: 0,
    interactionType: 'text-popover',
    label: `Step ${id}`,
    ...(tour ? { tour } : {}),
  }) as GuidedLearningStep;

const makeSession = (steps: GuidedLearningStep[]) => {
  const set = { id: 's', title: 'Tour', steps } as unknown as GuidedLearningSet;
  const session = {
    set,
    selected: 0,
    select: vi.fn(),
    updateStep: vi.fn(),
    setBinding: vi.fn(),
    insertStepAfter: vi.fn(() => {
      const created = step('new', { anchor: '', action: 'click' });
      steps.splice(1, 0, created);
      return created;
    }),
    insertStepsAfter: vi.fn(),
    setThumbnail: vi.fn(),
    deleteStep: vi.fn(),
    moveStep: vi.fn(),
    updateSet: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    saveState: 'saved',
    flush: vi.fn(),
  } satisfies TourEditorSession;
  return session;
};

const renderPanel = (session: TourEditorSession) =>
  render(
    <>
      <button type="button" data-tour="dock.open-tools">
        Tools
      </button>
      <TourEditorPanel
        session={session}
        playback={{ ...IDLE_PLAYBACK, slots: {} }}
        readAloud={{ on: false, onToggle: vi.fn() }}
        onClose={vi.fn()}
        initialCollapsed={false}
        initialSide="right"
      />
    </>
  );

describe('TourEditorPanel picking', () => {
  beforeEach(() => {
    document.elementsFromPoint = () => [];
  });

  it("shows the step's control and binds a new one picked on the board", () => {
    const session = makeSession([
      step('a', { anchor: 'widget.close', action: 'toggle', value: true }),
    ]);
    renderPanel(session);
    expect(screen.getByTestId('tour-editor-control')).toHaveTextContent(
      'Close'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    fireEvent.click(screen.getByText('Tools'));
    expect(session.setBinding).toHaveBeenCalledWith('a', {
      anchor: 'dock.open-tools',
      action: 'toggle',
      value: true,
      fallback: { role: 'button', name: 'tools' },
    });
    expect(screen.queryByTestId('tour-anchor-picker-bar')).toBeNull();
  });

  it('chooses from the list instead', () => {
    const session = makeSession([step('a')]);
    renderPanel(session);
    expect(screen.getByTestId('tour-editor-control')).toHaveTextContent(
      'Whole board'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose from list' }));
    expect(screen.queryByTestId('tour-anchor-picker-bar')).toBeNull();
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'dock.open-tools' },
    });
    fireEvent.click(screen.getByRole('option'));
    expect(session.setBinding).toHaveBeenCalledWith('a', {
      anchor: 'dock.open-tools',
      action: 'click',
    });
    expect(screen.getByTestId('tour-editor-outline')).toBeInTheDocument();
  });

  it('adds a step after the selection and starts picking for it', () => {
    const session = makeSession([step('a'), step('b')]);
    renderPanel(session);
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    expect(session.insertStepAfter).toHaveBeenCalledWith('a');
    expect(screen.getByTestId('tour-anchor-picker-bar')).toBeInTheDocument();
  });

  it('steps aside while recording and inserts the recorded steps after the selection', () => {
    const session = makeSession([step('a'), step('b')]);
    renderPanel(session);
    fireEvent.click(screen.getByRole('button', { name: 'Record from here' }));
    expect(screen.queryByTestId('tour-editor-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(session.insertStepsAfter).toHaveBeenCalledWith(
      'a',
      [recorded],
      ['p.png']
    );
    expect(screen.getByTestId('tour-editor-panel')).toBeInTheDocument();
  });
});
