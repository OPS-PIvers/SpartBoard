import { describe, expect, it } from 'vitest';
import type { WidgetType } from '@/types';
import {
  buildRecordedSet,
  touchedWidgetTypes,
  untaggedSteps,
} from './buildRecordedSet';
import type { RecordedStep } from './useTourCapture';

const step = (
  id: string,
  frameIndex: number,
  untagged = false
): RecordedStep => ({
  id,
  xPct: 10,
  yPct: 20,
  region: { shape: 'rect', wPct: 5, hPct: 4 },
  tour: { anchor: untagged ? '' : 'sidebar.boards', action: 'click' },
  frameIndex,
  untagged,
});

describe('buildRecordedSet', () => {
  it('makes a v3 building set with one tooltip step per recorded click', () => {
    const set = buildRecordedSet(
      { steps: [step('a', 0), step('b', 1, true)] },
      {
        id: 'set-9',
        title: 'Recorded tour',
        imageUrls: ['u0', 'u1'],
        widgets: [],
        startIds: new Set(),
        now: 5,
      }
    );
    expect(set).toMatchObject({
      id: 'set-9',
      schemaVersion: 3,
      isBuilding: true,
      hasLiveTour: true,
      imageUrls: ['u0', 'u1'],
      tourSetup: { widgets: [] },
      createdAt: 5,
    });
    expect(set.steps[1]).toMatchObject({
      id: 'b',
      imageIndex: 1,
      interactionType: 'tooltip',
      region: { shape: 'rect', wPct: 5, hPct: 4 },
      tour: { anchor: '', action: 'click' },
    });
  });

  it('sets up only the widget types the steps touched on a 12-widget board', () => {
    const types: WidgetType[] = [
      'clock',
      'time-tool',
      'dice',
      'poll',
      'text',
      'checklist',
      'random',
      'drawing',
      'qr',
      'embed',
      'weather',
      'schedule',
    ];
    const board = types.map((type) => ({ id: `w-${type}`, type }));
    const touch = (
      id: string,
      anchor: string,
      widgetId?: string
    ): RecordedStep => ({
      ...step(id, 0, anchor === ''),
      tour: { anchor, action: 'click' },
      ...(widgetId ? { widgetId } : {}),
    });
    const set = buildRecordedSet(
      {
        steps: [
          touch('a', 'sidebar.boards'),
          touch('b', 'widget.settings-opener', 'w-time-tool'),
          touch('c', '', 'w-dice'),
          touch('d', 'settings.close', 'w-time-tool'),
        ],
      },
      {
        id: 'set-12',
        title: 'Timer tour',
        imageUrls: ['u0'],
        widgets: board,
        startIds: new Set(board.map((w) => w.id)),
      }
    );
    expect(set.tourSetup).toEqual({ widgets: ['time-tool', 'dice'] });
  });

  it('skips a widget the tour added itself from the dock', () => {
    const steps = [
      { tour: { anchor: 'dock.item:clock', action: 'click' as const } },
      {
        tour: { anchor: 'widget.settings-opener', action: 'click' as const },
        widgetId: 'new-clock',
      },
      {
        tour: { anchor: 'widget.close', action: 'click' as const },
        widgetId: 'old-time-tool',
      },
    ];
    const board = [
      { id: 'new-clock', type: 'clock' as const },
      { id: 'old-time-tool', type: 'time-tool' as const },
    ];
    expect(
      touchedWidgetTypes(steps, board, new Set(['old-time-tool']))
    ).toEqual(['time-tool']);
    // Opened during a pause rather than by a recorded step, so setup still adds it.
    expect(touchedWidgetTypes(steps.slice(1), board, new Set())).toEqual([
      'clock',
      'time-tool',
    ]);
  });

  it('lists the untagged steps', () => {
    expect(
      untaggedSteps({ steps: [step('a', 0), step('b', 1, true)] }).map(
        (s) => s.id
      )
    ).toEqual(['b']);
  });
});
