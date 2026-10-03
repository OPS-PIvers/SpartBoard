import { describe, expect, it } from 'vitest';
import { snapshotRecording } from './recordingHandoff';

describe('snapshotRecording', () => {
  it('turns each picture into a reviewable frame bound to its step', () => {
    const frame = new Blob(['x']);
    const rec = snapshotRecording({
      setId: 's',
      stepId: 'b',
      shots: [
        {
          stepId: 'b',
          tour: { anchor: 'dock.open-tools', action: 'click' },
          frame,
          boxes: [{ xPct: 1, yPct: 1, wPct: 2, hPct: 2 }],
          placement: {
            xPct: 50,
            yPct: 50,
            region: { shape: 'rect', wPct: 10, hPct: 10 },
          },
        },
      ],
    });
    expect(rec.frames).toEqual([frame]);
    expect(rec.redactions).toEqual([[{ xPct: 1, yPct: 1, wPct: 2, hPct: 2 }]]);
    expect(rec.steps[0]).toMatchObject({
      id: 'b',
      frameIndex: 0,
      untagged: false,
      xPct: 50,
      tour: { anchor: 'dock.open-tools' },
    });
  });
});
