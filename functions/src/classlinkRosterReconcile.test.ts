import { describe, it, expect } from 'vitest';
import {
  reconcileClassLinkStudents,
  assignPins,
  SyncStudent,
} from './classlinkRosterReconcile';
import { ClassLinkStudent } from './classlinkShared';

const local = (
  firstName: string,
  lastName: string,
  extra: Partial<SyncStudent> = {}
): SyncStudent => ({
  id: `local-${firstName}`,
  firstName,
  lastName,
  pin: '',
  ...extra,
});

const upstream = (
  sourcedId: string,
  givenName: string,
  familyName: string,
  email?: string
): ClassLinkStudent => ({
  sourcedId,
  givenName,
  familyName,
  ...(email ? { email } : {}),
});

const names = (rows: { firstName: string; lastName: string }[]): string[] =>
  rows.map((r) => `${r.firstName} ${r.lastName}`);

describe('reconcileClassLinkStudents — additive half (mirrors the client merge)', () => {
  it('appends an upstream student the roster does not have', () => {
    const out = reconcileClassLinkStudents(
      [local('Ada', 'Lovelace', { pin: '01', classLinkSourcedId: 's1' })],
      [upstream('s1', 'Ada', 'Lovelace'), upstream('s2', 'Grace', 'Hopper')]
    );

    expect(out.blocked).toBeUndefined();
    expect(names(out.added)).toEqual(['Grace Hopper']);
    expect(out.students).toHaveLength(2);
  });

  it('preserves local id and pin when matching on sourcedId', () => {
    const out = reconcileClassLinkStudents(
      [local('Ada', 'Lovelace', { pin: '07', classLinkSourcedId: 's1' })],
      [upstream('s1', 'Ada', 'Renamed')]
    );

    expect(out.matched).toBe(1);
    expect(out.removed).toEqual([]);
    expect(out.students[0]).toMatchObject({ id: 'local-Ada', pin: '07' });
  });

  it('upgrades a name match to a stable sourcedId link', () => {
    const out = reconcileClassLinkStudents(
      [local('Ada', 'Lovelace', { pin: '03' })],
      [upstream('s1', 'ada', ' Lovelace ')]
    );

    expect(out.linked).toBe(1);
    expect(out.added).toEqual([]);
    expect(out.students[0]).toMatchObject({
      id: 'local-Ada',
      pin: '03',
      classLinkSourcedId: 's1',
    });
  });

  // Two incoming students sharing a name must not both consume the same local
  // row — the second is a genuinely different kid and has to be appended.
  it('consumes each local row at most once on a name collision', () => {
    const out = reconcileClassLinkStudents(
      [local('Sam', 'Reyes', { pin: '01' })],
      [upstream('s1', 'Sam', 'Reyes'), upstream('s2', 'Sam', 'Reyes')]
    );

    expect(out.linked).toBe(1);
    expect(out.added).toHaveLength(1);
    expect(out.students).toHaveLength(2);
  });

  it('backfills a missing email but never overwrites one', () => {
    const out = reconcileClassLinkStudents(
      [
        local('Ada', 'Lovelace', { pin: '01', classLinkSourcedId: 's1' }),
        local('Grace', 'Hopper', {
          pin: '02',
          classLinkSourcedId: 's2',
          email: 'local@example.com',
        }),
      ],
      [
        upstream('s1', 'Ada', 'Lovelace', 'ada@example.com'),
        upstream('s2', 'Grace', 'Hopper', 'upstream@example.com'),
      ]
    );

    expect(out.students[0].email).toBe('ada@example.com');
    expect(out.students[1].email).toBe('local@example.com');
  });

  it('ignores upstream rows with no sourcedId', () => {
    const out = reconcileClassLinkStudents(
      [local('Ada', 'Lovelace', { pin: '01', classLinkSourcedId: 's1' })],
      [upstream('s1', 'Ada', 'Lovelace'), { givenName: 'Ghost' }]
    );

    expect(out.added).toEqual([]);
    expect(out.students).toHaveLength(1);
  });
});

describe('reconcileClassLinkStudents — removal (diverges from the client merge)', () => {
  it('removes a SIS student upstream no longer returns', () => {
    const out = reconcileClassLinkStudents(
      [
        local('Ada', 'Lovelace', { pin: '01', classLinkSourcedId: 's1' }),
        local('Alan', 'Turing', { pin: '02', classLinkSourcedId: 's2' }),
      ],
      [upstream('s1', 'Ada', 'Lovelace')]
    );

    expect(out.blocked).toBeUndefined();
    expect(names(out.removed)).toEqual(['Alan Turing']);
    expect(names(out.students)).toEqual(['Ada Lovelace']);
  });

  // Aides and hand-added kids are not SIS-governed; a sync has no standing to
  // judge them and must leave them exactly where they are.
  it('never removes a student with no classLinkSourcedId', () => {
    const out = reconcileClassLinkStudents(
      [
        local('Ada', 'Lovelace', { pin: '01', classLinkSourcedId: 's1' }),
        local('Room', 'Aide', { pin: '02' }),
      ],
      [upstream('s1', 'Ada', 'Lovelace')]
    );

    expect(out.removed).toEqual([]);
    expect(names(out.students)).toEqual(['Ada Lovelace', 'Room Aide']);
  });

  // A leaver's printed PIN card must not start pointing at the new kid.
  it('does not hand a departing student pin to an arrival in the same run', () => {
    const out = reconcileClassLinkStudents(
      [
        local('Ada', 'Lovelace', { pin: '02', classLinkSourcedId: 's1' }),
        local('Alan', 'Turing', { pin: '01', classLinkSourcedId: 's2' }),
      ],
      [upstream('s1', 'Ada', 'Lovelace'), upstream('s3', 'Zoe', 'Quinn')]
    );

    expect(names(out.removed)).toEqual(['Alan Turing']);
    const zoe = out.students.find((s) => s.firstName === 'Zoe');
    expect(zoe?.pin).not.toBe('01');
    expect(zoe?.pin).toBeTruthy();
  });
});

describe('reconcileClassLinkStudents — circuit breakers', () => {
  // An empty class is far likelier to be a OneRoster hiccup than a real
  // section with nobody in it, and acting on it would empty the roster.
  it('blocks and changes nothing on an empty upstream payload', () => {
    const existing = [
      local('Ada', 'Lovelace', { pin: '01', classLinkSourcedId: 's1' }),
    ];
    const out = reconcileClassLinkStudents(existing, []);

    expect(out.blocked).toBe('empty-upstream');
    expect(out.students).toEqual(existing);
    expect(out.removed).toEqual([]);
  });

  it('blocks when more than half the SIS-linked students would go', () => {
    const existing = [
      local('A', 'One', { pin: '01', classLinkSourcedId: 's1' }),
      local('B', 'Two', { pin: '02', classLinkSourcedId: 's2' }),
      local('C', 'Three', { pin: '03', classLinkSourcedId: 's3' }),
      local('D', 'Four', { pin: '04', classLinkSourcedId: 's4' }),
    ];
    const out = reconcileClassLinkStudents(existing, [
      upstream('s1', 'A', 'One'),
    ]);

    expect(out.blocked).toBe('mass-removal');
    expect(out.students).toEqual(existing);
  });

  // Exactly half is normal end-of-semester churn, not an outage signature.
  it('allows a removal of exactly half', () => {
    const out = reconcileClassLinkStudents(
      [
        local('A', 'One', { pin: '01', classLinkSourcedId: 's1' }),
        local('B', 'Two', { pin: '02', classLinkSourcedId: 's2' }),
        local('C', 'Three', { pin: '03', classLinkSourcedId: 's3' }),
        local('D', 'Four', { pin: '04', classLinkSourcedId: 's4' }),
      ],
      [upstream('s1', 'A', 'One'), upstream('s2', 'B', 'Two')]
    );

    expect(out.blocked).toBeUndefined();
    expect(names(out.removed)).toEqual(['C Three', 'D Four']);
  });

  // A hand-built roster has nothing to depart: removal keys off a PRE-EXISTING
  // sourcedId, and an unlinked row has none. So a non-matching upstream student
  // is simply added and every local row survives, with no breaker needed.
  it('removes nobody from a roster where nothing is SIS-linked', () => {
    const out = reconcileClassLinkStudents(
      [
        local('Ada', 'Lovelace', { pin: '01' }),
        local('Grace', 'Hopper', { pin: '02' }),
      ],
      [upstream('s9', 'Brand', 'New')]
    );

    expect(out.blocked).toBeUndefined();
    expect(out.removed).toEqual([]);
    expect(names(out.students)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'Brand New',
    ]);
  });

  // A first-time adoption where every local row name-matches is the benign
  // case of the rule above: nothing is "absent", so nothing blocks.
  it('links a hand-built roster when upstream covers everyone', () => {
    const out = reconcileClassLinkStudents(
      [local('Ada', 'Lovelace', { pin: '01' })],
      [upstream('s1', 'Ada', 'Lovelace')]
    );

    expect(out.blocked).toBeUndefined();
    expect(out.linked).toBe(1);
    expect(out.students[0].classLinkSourcedId).toBe('s1');
  });
});

describe('assignPins', () => {
  it('fills only empty pins and never reassigns an existing one', () => {
    const out = assignPins([
      local('A', 'One', { pin: '05' }),
      local('B', 'Two'),
    ]);

    expect(out[0].pin).toBe('05');
    expect(out[1].pin).toBe('01');
  });

  it('skips reserved pins', () => {
    const out = assignPins([local('B', 'Two')], new Set(['01', '02']));
    expect(out[0].pin).toBe('03');
  });
});
