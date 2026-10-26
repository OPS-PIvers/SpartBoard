import { describe, expect, it } from 'vitest';
import { sessionClassPredicate as client } from '@/utils/sessionClassFilter';
import { sessionClassPredicate as server } from '@/functions/src/sessionClassFilter';

const sessions = [
  null,
  {},
  { classIds: ['cl-A'], periodNames: ['Period 1'] },
  {
    classIds: ['cl-A'],
    periodNames: ['Period 1'],
    removedClasses: { classIds: ['cl-B'], periodNames: ['Period 2', 'Bio'] },
  },
  { periodName: 'Period 2', removedClasses: { periodNames: ['Period 2'] } },
  {
    periodName: 'Period 2',
    periodNames: ['Period 1'],
    removedClasses: { periodNames: ['Period 2'] },
  },
  { classId: 'cl-A' },
  { classIds: [], periodNames: ['Period 1', 'Period 2'] },
  {
    classIds: ['cl-A', 'schoology:9'],
    periodNames: ['Period 1'],
    classPeriodByClassId: { 'cl-A': 'Period 1', 'schoology:9': 'Bio' },
    periodAccess: { 'roster:r1': { label: 'Period 5' } },
    removedClasses: { classIds: ['roster:r1', 'cl-B'], periodNames: ['Bio'] },
  },
];

const responses = [
  {},
  { classId: 'cl-A' },
  { classId: 'cl-B', classPeriod: 'Period 2' },
  { classPeriod: 'Period 1' },
  { classPeriod: 'Bio' },
  { classId: 'schoology:9' },
  { classId: 'roster:r1', classPeriod: 'Period 5' },
  { classId: 7, classPeriod: null },
];

describe('session class filter parity', () => {
  it('client and server keep the same responses', () => {
    for (const s of sessions) {
      const c = client(s);
      const v = server(s);
      for (const r of responses) expect(v(r)).toBe(c(r));
    }
  });
});
