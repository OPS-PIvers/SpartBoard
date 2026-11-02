import { describe, expect, it } from 'vitest';
import type { SequenceConnection, WidgetData } from '@/types';
import { actionDefFor } from '@/config/widgetConnections';
import { draftFromPicks, isStepFinished, startRun } from './connectionEngine';
import { checkOffCurrent, currentChecklistRow } from './checklistCurrent';

const w = (
  id: string,
  type: WidgetData['type'],
  config: Record<string, unknown>
): WidgetData => ({
  id,
  type,
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  z: 1,
  flipped: false,
  config,
});

const at = (h: number, m: number) => new Date(2026, 10, 2, h, m).getTime();

describe('Checklist next', () => {
  const items = [
    { id: 'a', text: 'Read', completed: true },
    { id: 'b', text: 'Write', completed: false },
    { id: 'c', text: 'Share', completed: false },
  ];

  it('checks off the first open item and ends after the last one', () => {
    const c = { mode: 'manual' as const, items };
    expect(currentChecklistRow(c)).toEqual({ kind: 'item', id: 'b' });
    const first = checkOffCurrent(c);
    expect(first?.ends).toBe(false);
    const second = checkOffCurrent({ ...c, ...first?.patch });
    expect(second?.ends).toBe(true);
    expect(
      checkOffCurrent({ ...c, ...first?.patch, ...second?.patch })
    ).toBeNull();
  });

  it('uses a custom name list in order', () => {
    const c = {
      mode: 'roster' as const,
      rosterMode: 'custom' as const,
      items: [],
      firstNames: 'Ana\nBen',
      completedNames: ['Ana'],
    };
    expect(checkOffCurrent(c)?.patch).toEqual({
      completedNames: ['Ana', 'Ben'],
    });
  });

  it('leaves a class roster to the widget', () => {
    const def = actionDefFor('checklist', 'next');
    expect(
      def?.apply({ mode: 'roster', rosterMode: 'class', items: [] }, 7)
    ).toEqual({ patch: { nextTrigger: 7 } });
  });
});

describe('Schedule next block', () => {
  const config = {
    items: [],
    schedules: [
      {
        id: 's',
        name: 'Day',
        days: [],
        items: [
          { id: '1', task: 'Math', startTime: '09:00', endTime: '09:50' },
          { id: '2', task: 'Reading', startTime: '10:00', endTime: '10:50' },
        ],
      },
    ],
  };
  const done = actionDefFor('schedule', 'next-block')?.isFinished;

  it('waits until the next block after the step began', () => {
    expect(done?.(config, at(9, 59), at(9, 30))).toBe(false);
    expect(done?.(config, at(10, 0), at(9, 30))).toBe(true);
  });

  it('keeps waiting after the last block of the day', () => {
    expect(done?.(config, at(14, 0), at(11, 0))).toBe(false);
  });
});

describe('steps with their own choice', () => {
  it('prefills from what the widget shows when it is picked', () => {
    const draft = draftFromPicks([
      { id: 'ws', type: 'work-symbols', config: { selectedSymbolId: 'pair' } },
      { id: 'm', type: 'materials', config: { activeItems: ['pencil'] } },
    ]);
    expect(draft.sequence?.steps.map((s) => s.actions[0].params)).toEqual([
      { symbolId: 'pair' },
      { items: ['pencil'] },
    ]);
  });

  it('shows the chosen symbol and materials', () => {
    expect(
      actionDefFor('work-symbols', 'show')?.apply({}, 0, { symbolId: 'solo' })
    ).toEqual({ patch: { selectedSymbolId: 'solo' } });
    expect(
      actionDefFor('materials', 'show')?.apply({}, 0, { items: ['laptop'] })
    ).toEqual({ patch: { activeItems: ['laptop'] } });
  });
});

describe('startRun', () => {
  it('starts at step 1 and applies it', () => {
    const widgets = [
      w('ws', 'work-symbols', { selectedSymbolId: null }),
      w('sc', 'schedule', { items: [] }),
    ];
    const seq: SequenceConnection = {
      id: 'q',
      kind: 'sequence',
      repeat: 'once',
      steps: [
        {
          id: '1',
          actions: [
            { widgetId: 'ws', action: 'show', params: { symbolId: 'pair' } },
          ],
        },
        { id: '2', actions: [{ widgetId: 'sc', action: 'next-block' }] },
      ],
    };
    const started = startRun(seq, widgets, 5, 'dev');
    expect(started?.sequence.run).toEqual({
      deviceId: 'dev',
      stepIndex: 0,
      stepStartedAt: 5,
      loops: 0,
    });
    expect(started?.patches).toEqual({ ws: { selectedSymbolId: 'pair' } });
    expect(isStepFinished(seq.steps[0], widgets, 5, 5)).toBe(true);
  });
});
