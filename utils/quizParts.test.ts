import { describe, expect, it } from 'vitest';
import {
  isWaitingAtStop,
  nextPartToOpen,
  openedPartFor,
  partOfQuestion,
  partsDoneOf,
  periodOfResponse,
  sessionHasStops,
  totalParts,
} from './quizParts';

const sections = [
  { id: 's1', questionIds: ['q1', 'q2'], stopAfter: true },
  { id: 's2', questionIds: ['q3'] },
  { id: 's3', questionIds: ['q4'], stopAfter: true },
];

describe('quizParts', () => {
  it('counts parts, ignoring a Stop on the last section', () => {
    expect(totalParts(undefined)).toBe(1);
    expect(totalParts(sections)).toBe(2);
    expect(totalParts([{ id: 'a', stopAfter: true }])).toBe(1);
  });

  it('applies Stops only to self-paced sessions', () => {
    expect(
      sessionHasStops({
        sessionMode: 'student',
        sections: [...sections].map((s) => ({ ...s, title: '' })),
      })
    ).toBe(true);
    expect(
      sessionHasStops({
        sessionMode: 'teacher',
        sections: [...sections].map((s) => ({ ...s, title: '' })),
      })
    ).toBe(false);
    expect(sessionHasStops({ sessionMode: 'student' })).toBe(false);
  });

  it('places each question in its part', () => {
    expect(partOfQuestion(sections, 'q1')).toBe(1);
    expect(partOfQuestion(sections, 'q2')).toBe(1);
    expect(partOfQuestion(sections, 'q3')).toBe(2);
    expect(partOfQuestion(sections, 'q4')).toBe(2);
    expect(partOfQuestion(sections, 'loose')).toBe(1);
  });

  it('opens a part for the session, a period or one student', () => {
    expect(openedPartFor(undefined, 'P1', 'k')).toBe(1);
    expect(openedPartFor({ all: 2 }, undefined, undefined)).toBe(2);
    expect(openedPartFor({ periods: { P1: 2 } }, 'P1', 'k')).toBe(2);
    expect(openedPartFor({ periods: { P1: 2 } }, 'P2', 'k')).toBe(1);
    expect(openedPartFor({ students: { k: 3 } }, 'P2', 'k')).toBe(3);
    expect(openedPartFor({ all: -4, periods: { P1: 1.5 } }, 'P1', 'k')).toBe(1);
  });

  it('reads the period from the response or its class', () => {
    expect(
      periodOfResponse(
        { classPeriodByClassId: { c1: 'Hour 2' } },
        { classId: 'c1' }
      )
    ).toBe('Hour 2');
    expect(periodOfResponse({}, { classPeriod: 'Hour 3' })).toBe('Hour 3');
  });

  it('treats a missing partsDone as nothing submitted', () => {
    expect(partsDoneOf({})).toBe(0);
    expect(partsDoneOf({ partsDone: 2 })).toBe(2);
  });

  it('waits at a Stop only while held and the next part is closed', () => {
    const held = {
      partsDone: 1,
      partHeld: true,
      status: 'in-progress' as const,
    };
    expect(isWaitingAtStop(held, 1, 2)).toBe(true);
    expect(isWaitingAtStop(held, 2, 2)).toBe(false);
    expect(isWaitingAtStop({ ...held, partHeld: null }, 1, 2)).toBe(false);
    expect(isWaitingAtStop({ ...held, status: 'completed' }, 1, 2)).toBe(false);
  });

  it('opens the earliest part a waiting student needs', () => {
    expect(nextPartToOpen([])).toBeNull();
    expect(nextPartToOpen([{ partsDone: 2 }, { partsDone: 1 }])).toBe(2);
  });
});
