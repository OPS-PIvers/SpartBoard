import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { FieldPath, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import type {
  BuildingScheduleDefaults,
  FeaturePermission,
  PeriodAccess,
} from '@/types';
import {
  bellCloseFor,
  letInUntil,
  startCloseAt,
  usePeriodAccess,
  LET_IN_FALLBACK_MS,
} from '@/hooks/usePeriodAccess';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  FieldPath: class {
    segments: string[];
    constructor(...segments: string[]) {
      this.segments = segments;
    }
  },
  getDocs: vi.fn(),
  query: vi.fn((ref: unknown) => ref),
  serverTimestamp: vi.fn(() => '__ts__'),
  Timestamp: { fromMillis: vi.fn((ms: number) => ms) },
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));

const permissions: FeaturePermission[] = [];
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    featurePermissions: permissions,
  }),
}));

const day = new Date(2026, 8, 29);
const at = (h: number, m: number) => new Date(2026, 8, 29, h, m).getTime();
const schedule: BuildingScheduleDefaults = {
  buildingId: 'high',
  items: [],
  schedules: [
    {
      id: 'regular',
      name: 'Regular',
      days: [day.getDay()],
      items: [
        {
          task: 'Period 1',
          startTime: '08:15',
          endTime: '09:05',
          isClassPeriod: true,
          periodId: 'P1',
        },
        {
          task: 'Period 3',
          startTime: '10:40',
          endTime: '11:30',
          isClassPeriod: true,
          periodId: 'P3',
        },
      ],
    },
  ],
};
permissions.push({
  widgetType: 'schedule',
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  config: { buildingDefaults: { high: schedule } },
} as unknown as FeaturePermission);

const rosters = [
  { id: 'r1', bellPeriod: { buildingId: 'high', periodId: 'P1' } },
  { id: 'r3', bellPeriod: { buildingId: 'high', periodId: 'P3' } },
  { id: 'r5' },
];
const period = (over: Partial<PeriodAccess>): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P',
  ...over,
});

describe('bell helpers', () => {
  it('reads the end bell only while it is still ahead', () => {
    expect(
      bellCloseFor({ rosterId: 'r1' }, rosters, permissions, at(8, 30))
    ).toBe(at(9, 5));
    expect(
      bellCloseFor({ rosterId: 'r1' }, rosters, permissions, at(9, 30))
    ).toBeNull();
    expect(
      bellCloseFor({ rosterId: 'r5' }, rosters, permissions, at(8, 30))
    ).toBeNull();
  });

  it('closes at the bell in assessment mode and keeps a future window otherwise', () => {
    const now = at(8, 30);
    expect(
      startCloseAt({ accessMode: 'assessment' }, period({}), at(9, 5), now)
    ).toBe(at(9, 5));
    expect(
      startCloseAt(
        { accessMode: 'assignment' },
        period({ closeAt: now + 5 }),
        null,
        now
      )
    ).toBe(now + 5);
    expect(
      startCloseAt(
        { accessMode: 'assignment' },
        period({ closeAt: now - 5 }),
        null,
        now
      )
    ).toBeNull();
  });

  it('lets a student in until the bell of whichever period is in session', () => {
    const pa = { a: period({ rosterId: 'r1' }), b: period({ rosterId: 'r3' }) };
    expect(letInUntil(pa, rosters, permissions, at(10, 50))).toBe(at(11, 30));
    expect(letInUntil(pa, rosters, permissions, at(10, 0))).toBe(
      at(10, 0) + LET_IN_FALLBACK_MS
    );
  });
});

describe('usePeriodAccess', () => {
  const update = vi.fn();
  const commit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(at(8, 30));
    (writeBatch as Mock).mockReturnValue({ update, commit });
    commit.mockResolvedValue(undefined);
    (updateDoc as Mock).mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  const session = {
    id: 's1',
    teacherUid: 'teacher-1',
    accessMode: 'assessment' as const,
    periodAccess: {
      'cl-1': period({ rosterId: 'r1', label: 'P1' }),
      'roster:r5': period({ rosterId: 'r5', label: 'P5' }),
    },
  };
  const collections = {
    sessionCollection: 'quiz_sessions',
    assignmentCollection: 'quiz_assignments',
  };

  const fieldWrites = (ref: string) =>
    update.mock.calls
      .filter(([r]) => r === ref)
      .map(([, ...rest]: unknown[]) => {
        const out: Record<string, unknown> = {};
        for (let i = 0; i < rest.length; i += 2)
          out[(rest[i] as { segments: string[] }).segments.join('.')] =
            rest[i + 1];
        return out;
      });

  it('starts a period to its end bell on the session and the assignment, refreshing its stale responses', async () => {
    const stale = {
      ref: 'resp-a',
      get: (f: string) => (f === 'classId' ? 'cl-1' : undefined),
    };
    const other = {
      ref: 'resp-b',
      get: (f: string) => (f === 'classId' ? 'roster:r5' : undefined),
    };
    (getDocs as Mock).mockResolvedValue({ docs: [stale, other] });
    const { result } = renderHook(() =>
      usePeriodAccess(session, collections, rosters)
    );
    let untimed: string[] = [];
    await act(async () => {
      untimed = await result.current.startPeriod('cl-1');
    });
    expect(untimed).toEqual([]);
    expect(update).toHaveBeenCalledWith('resp-a', { lastWriteAt: '__ts__' });
    expect(update).not.toHaveBeenCalledWith('resp-b', expect.anything());
    const expected = {
      'periodAccess.cl-1.state': 'open',
      'periodAccess.cl-1.openAt': null,
      'periodAccess.cl-1.closeAt': at(9, 5),
    };
    expect(fieldWrites('quiz_sessions/s1')).toEqual([expected]);
    expect(fieldWrites('users/teacher-1/quiz_assignments/s1')).toEqual([
      expected,
    ]);
  });

  it('reports an untagged assessment period that opened with no bell', async () => {
    (getDocs as Mock).mockResolvedValue({ docs: [] });
    const { result } = renderHook(() =>
      usePeriodAccess(session, collections, rosters)
    );
    let untimed: string[] = [];
    await act(async () => {
      untimed = await result.current.startAll();
    });
    expect(untimed).toEqual(['roster:r5']);
  });

  it('pauses with a pausedAt stamp and lets a student in on the session only', async () => {
    const { result } = renderHook(() =>
      usePeriodAccess(session, collections, rosters)
    );
    await act(async () => {
      await result.current.pausePeriod('cl-1');
      await result.current.letIn('student-9');
    });
    expect(fieldWrites('quiz_sessions/s1')).toEqual([
      {
        'periodAccess.cl-1.state': 'paused',
        'periodAccess.cl-1.pausedAt': at(8, 30),
      },
    ]);
    const [ref, path, until] = (updateDoc as Mock).mock.calls[0] as [
      string,
      FieldPath & { segments: string[] },
      number,
    ];
    expect(ref).toBe('quiz_sessions/s1');
    expect(path.segments).toEqual(['studentAccess', 'student-9']);
    expect(until).toBe(at(9, 5));
  });

  it('extends a live period by ten minutes or clears its close', async () => {
    const live = {
      ...session,
      periodAccess: {
        'cl-1': period({ state: 'open', closeAt: at(9, 5), rosterId: 'r1' }),
      },
    };
    const { result } = renderHook(() =>
      usePeriodAccess(live, collections, rosters)
    );
    await act(async () => {
      await result.current.extendPeriod('cl-1', 10 * 60 * 1000);
      await result.current.extendPeriod('cl-1', null);
    });
    expect(fieldWrites('quiz_sessions/s1')).toEqual([
      { 'periodAccess.cl-1.closeAt': at(9, 15) },
      { 'periodAccess.cl-1.closeAt': null },
    ]);
  });
});
