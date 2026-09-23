import { describe, it, expect } from 'vitest';
import { launchedBySubLabel } from './launchedBySub';

const STAMP = {
  uid: 'sub-1',
  email: 'sub@orono.k12.mn.us',
  shareId: 'share-1',
};
// 2026-09-23T14:00:00Z, read in the runner's own zone like a teacher's browser.
const AT = Date.UTC(2026, 8, 23, 14, 0, 0);

describe('launchedBySubLabel', () => {
  it('names the substitute and the day', () => {
    const day = new Date(AT).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    expect(launchedBySubLabel(STAMP, AT)).toBe(
      `Launched by sub@orono.k12.mn.us · ${day}`
    );
  });

  // A quiz that never started has a null `startedAt`, and who started it is
  // still the thing the teacher needs.
  it('names the substitute alone when there is no time', () => {
    expect(launchedBySubLabel(STAMP, null)).toBe(
      'Launched by sub@orono.k12.mn.us'
    );
    expect(launchedBySubLabel(STAMP, undefined)).toBe(
      'Launched by sub@orono.k12.mn.us'
    );
  });

  it('says nothing without a stamp', () => {
    expect(launchedBySubLabel(undefined, AT)).toBe('');
  });
});
