import { describe, expect, it } from 'vitest';
import { buildRecordedSet, untaggedSteps } from './buildRecordedSet';
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
        widgets: ['clock', 'clock', 'dice'],
        now: 5,
      }
    );
    expect(set).toMatchObject({
      id: 'set-9',
      schemaVersion: 3,
      isBuilding: true,
      hasLiveTour: true,
      imageUrls: ['u0', 'u1'],
      tourSetup: { widgets: ['clock', 'dice'] },
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

  it('lists the untagged steps', () => {
    expect(
      untaggedSteps({ steps: [step('a', 0), step('b', 1, true)] }).map(
        (s) => s.id
      )
    ).toEqual(['b']);
  });
});
