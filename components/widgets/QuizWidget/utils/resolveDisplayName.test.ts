import { describe, it, expect } from 'vitest';
import { findDuplicateResponseIds, responseTeamId } from './resolveDisplayName';
import { buildPinToNameMap } from './quizScoreboard';
import type { QuizResponse, ClassRoster } from '@/types';
import type { StudentName } from '@/hooks/useAssignmentPseudonyms';

function resp(overrides: Partial<QuizResponse>): QuizResponse {
  return {
    studentUid: 'uid-x',
    joinedAt: 0,
    status: 'completed',
    answers: [],
    score: null,
    submittedAt: 0,
    ...overrides,
  } as QuizResponse;
}

const sso = (uid: string): QuizResponse => resp({ studentUid: uid });
const pinResp = (pin: string, classPeriod?: string): QuizResponse =>
  resp({ studentUid: `anon-${pin}`, pin, classPeriod });

const byUid = (entries: Record<string, StudentName>) =>
  new Map(Object.entries(entries));

describe('findDuplicateResponseIds', () => {
  it('flags two SSO docs that resolve to the same ClassLink name (the fork signature)', () => {
    const a = sso('uidA');
    const b = sso('uidB');
    const dup = findDuplicateResponseIds(
      [a, b],
      {},
      byUid({
        uidA: { givenName: 'Kya', familyName: 'Newell' },
        uidB: { givenName: 'Kya', familyName: 'Newell' },
      })
    );
    expect(dup).toEqual(new Set([responseTeamId(a), responseTeamId(b)]));
  });

  it('flags an SSO stub + a PIN doc that resolve to the same roster student', () => {
    const stub = sso('uidA');
    const pinDoc = pinResp('21', 'Hour 1');
    const roster: ClassRoster = {
      id: 'r1',
      name: 'Hour 1',
      driveFileId: null,
      studentCount: 1,
      createdAt: 0,
      students: [{ id: 's1', firstName: 'Kya', lastName: 'Newell', pin: '21' }],
    };
    const pinToName = buildPinToNameMap([roster], ['Hour 1']);
    const dup = findDuplicateResponseIds(
      [stub, pinDoc],
      pinToName,
      byUid({ uidA: { givenName: 'Kya', familyName: 'Newell' } })
    );
    expect(dup.has(responseTeamId(stub))).toBe(true);
    expect(dup.has(responseTeamId(pinDoc))).toBe(true);
  });

  it('does not flag a real name that appears only once', () => {
    const a = sso('uidA');
    const b = sso('uidB');
    const dup = findDuplicateResponseIds(
      [a, b],
      {},
      byUid({
        uidA: { givenName: 'Kya', familyName: 'Newell' },
        uidB: { givenName: 'Sam', familyName: 'Jones' },
      })
    );
    expect(dup.size).toBe(0);
  });

  it('ignores the generic "Student" fallback (unresolved SSO joiners)', () => {
    // Two SSO docs with no pseudonym match → both resolve to "Student".
    const dup = findDuplicateResponseIds(
      [sso('uidA'), sso('uidB')],
      {},
      byUid({})
    );
    expect(dup.size).toBe(0);
  });

  it('ignores the "PIN <n>" fallback (no roster name)', () => {
    // Two distinct PIN docs with no roster entry → "PIN 5" / "PIN 6", and even
    // two with the same unresolved PIN must not be treated as a real name.
    const dup = findDuplicateResponseIds(
      [pinResp('5', 'Hour 1'), pinResp('5', 'Hour 3')],
      {},
      undefined
    );
    expect(dup.size).toBe(0);
  });
});
