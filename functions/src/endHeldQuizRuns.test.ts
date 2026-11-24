import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: { FieldValue: { delete: () => 'DELETE' } },
}));

import { heldRunStep } from './endHeldQuizRuns';

const NOW = 1_000_000;
const closed = { state: 'closed', closedAt: 5 };

describe('heldRunStep', () => {
  it('ends a fully closed run once every pass has run out', () => {
    expect(
      heldRunStep(
        {
          status: 'active',
          periodAccess: { c1: closed, c2: { state: 'open', closeAt: NOW - 1 } },
          studentAccess: { s1: NOW - 1 },
        },
        NOW
      )
    ).toEqual({ kind: 'end' });
  });

  it('keeps waiting while a scheduled student still has time', () => {
    expect(
      heldRunStep(
        {
          status: 'active',
          periodAccess: { c1: closed },
          studentAccess: { s1: NOW + 500, s2: NOW - 1 },
          studentAccessFrom: { s1: NOW + 100 },
        },
        NOW
      )
    ).toEqual({
      kind: 'wait',
      hold: {
        until: NOW + 500,
        students: { s1: { from: NOW + 100, until: NOW + 500 } },
      },
    });
  });

  it('forgets the hold when the teacher opened a class again', () => {
    expect(
      heldRunStep(
        {
          status: 'active',
          periodAccess: { c1: closed, c2: { state: 'open' } },
          studentAccess: {},
        },
        NOW
      )
    ).toEqual({ kind: 'clear' });
  });

  it('forgets the hold on a run that already ended', () => {
    expect(
      heldRunStep({ status: 'ended', periodAccess: { c1: closed } }, NOW)
    ).toEqual({ kind: 'clear' });
  });

  it('a paused class is not closed', () => {
    expect(
      heldRunStep(
        { status: 'active', periodAccess: { c1: { state: 'paused' } } },
        NOW
      )
    ).toEqual({ kind: 'clear' });
  });
});
