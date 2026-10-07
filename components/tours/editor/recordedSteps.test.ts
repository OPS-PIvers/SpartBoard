import { describe, expect, it } from 'vitest';
import type { RecordedStep } from '@/components/widgets/GuidedLearning/components/recorder/useTourCapture';
import { recordedTourSteps } from './recordedSteps';

const rec = (
  tour: RecordedStep['tour'],
  frameIndex: number,
  widgetId?: string
): RecordedStep => ({
  id: `r${frameIndex}`,
  xPct: 50,
  yPct: 50,
  region: { shape: 'rect', wPct: 1, hPct: 1 },
  tour,
  frameIndex,
  untagged: !tour.anchor,
  ...(widgetId ? { widgetId } : {}),
});

const frames = [
  { url: 'f0', w: 100, h: 50 },
  { url: 'f1', w: 100, h: 50 },
  { url: 'f2', w: 100, h: 50 },
];

describe('recordedTourSteps', () => {
  it('turns each click into a new step with its frame as the thumbnail', () => {
    const [step] = recordedTourSteps(
      [rec({ anchor: 'dock.open-tools', action: 'click' }, 1)],
      frames,
      { slots: {}, typeOf: new Map() }
    );
    expect(step.id).toBeTruthy();
    expect(step.tour).toEqual({
      anchor: 'dock.open-tools',
      action: 'click',
      thumbnail: { url: 'f1', anchor: 'dock.open-tools', w: 100, h: 50 },
    });
  });

  it('names the widget type and tour slot of a click inside a widget', () => {
    const [step] = recordedTourSteps(
      [rec({ anchor: 'widget.settings-opener', action: 'click' }, 0, 'w-2')],
      frames,
      { slots: { 1: 'w-2' }, typeOf: new Map([['w-2', 'clock']]) }
    );
    expect(step.tour).toMatchObject({
      anchor: 'widget.settings-opener:clock',
      slot: 1,
    });
  });

  it('leaves the picture off untagged clicks, the whole board and failed uploads', () => {
    const steps = recordedTourSteps(
      [
        rec({ anchor: '', action: 'click' }, 0),
        rec({ anchor: 'board.whole', action: 'observe' }, 1),
        rec({ anchor: 'dock.open-tools', action: 'click' }, 2),
      ],
      [],
      { slots: {}, typeOf: new Map() }
    );
    expect(steps.map((s) => s.tour?.thumbnail)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});
