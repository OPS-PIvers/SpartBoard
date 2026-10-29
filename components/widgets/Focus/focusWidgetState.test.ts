import { describe, expect, it } from 'vitest';
import type { FocusStudentDoc } from '@/utils/focus/contract';
import type { ClassRoster, WidgetData } from '@/types';
import {
  addFocusSite,
  boardFocusSites,
  compareFocusRows,
  explainFocusSite,
  focusClassRosters,
  focusCounts,
  focusMinutesLeft,
  focusRowStatus,
  formatFocusDuration,
  liveFocusSession,
  pastFocusSessions,
  type FocusSessionRow,
} from './focusWidgetState';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 29, 15, 0);

const student = (patch: Partial<FocusStudentDoc> = {}): FocusStudentDoc => ({
  status: 'waiting',
  awaySince: null,
  awayMs: 0,
  blockedTries: 0,
  lastReportAt: null,
  protocol: null,
  liveHost: null,
  otherSessionEndsAt: null,
  ...patch,
});

const session = (patch: Partial<FocusSessionRow>): FocusSessionRow => ({
  id: 's',
  orgId: 'orono',
  classId: 'c',
  className: 'P3',
  teacherUid: 't',
  teacherName: 'T',
  teacherUids: ['t'],
  level: 'redirect',
  sites: [],
  studentUids: [],
  startedAt: T0,
  endsAt: T0 + 30 * MIN,
  endedAt: null,
  endReason: null,
  ...patch,
});

describe('focusRowStatus', () => {
  it('shows Connecting for 3 minutes after start, then Not connected', () => {
    expect(focusRowStatus(student(), T0, T0 + 2 * MIN).kind).toBe('connecting');
    expect(focusRowStatus(student(), T0, T0 + 3 * MIN + 1).kind).toBe(
      'not-connected'
    );
  });

  it('counts from the last report, so a quiet device drops to Not connected', () => {
    const s = student({ status: 'on-task', lastReportAt: T0 + 5 * MIN });
    expect(focusRowStatus(s, T0, T0 + 7 * MIN).kind).toBe('on-task');
    expect(focusRowStatus(s, T0, T0 + 8 * MIN + 1).kind).toBe('not-connected');
  });

  it('adds the running away stretch to the total', () => {
    const s = student({
      status: 'away',
      lastReportAt: T0 + 9 * MIN,
      awayMs: 30_000,
      awaySince: T0 + 9 * MIN,
    });
    expect(focusRowStatus(s, T0, T0 + 10 * MIN)).toEqual({
      kind: 'away',
      awayMs: 90_000,
    });
  });

  it('keeps Released and In another session whatever the reports say', () => {
    expect(
      focusRowStatus(student({ status: 'released' }), T0, T0 + 50 * MIN).kind
    ).toBe('released');
    expect(
      focusRowStatus(
        student({ status: 'other-session', otherSessionEndsAt: T0 + 20 * MIN }),
        T0,
        T0 + 50 * MIN
      )
    ).toEqual({ kind: 'other-session', endsAt: T0 + 20 * MIN });
  });
});

describe('roster summary and order', () => {
  it('counts connecting students as not connected', () => {
    expect(
      focusCounts([
        { kind: 'on-task' },
        { kind: 'connecting' },
        { kind: 'not-connected' },
        { kind: 'away', awayMs: 1 },
        { kind: 'released' },
      ])
    ).toEqual({
      onTask: 1,
      away: 1,
      notConnected: 2,
      released: 1,
      otherSession: 0,
    });
  });

  it('puts away students first, released last, then by name', () => {
    const rows = [
      { name: 'B', status: { kind: 'released' as const } },
      { name: 'C', status: { kind: 'on-task' as const } },
      { name: 'A', status: { kind: 'on-task' as const } },
      { name: 'Z', status: { kind: 'away' as const, awayMs: 5 } },
    ].sort(compareFocusRows);
    expect(rows.map((r) => r.name)).toEqual(['Z', 'A', 'C', 'B']);
  });
});

describe('sessions', () => {
  it('treats a session past its end time as over even before the sweep ends it', () => {
    const s = session({});
    expect(liveFocusSession([s], T0 + 29 * MIN)?.id).toBe('s');
    expect(liveFocusSession([s], T0 + 30 * MIN)).toBeNull();
    expect(pastFocusSessions([s], T0 + 31 * MIN).map((x) => x.id)).toEqual([
      's',
    ]);
  });

  it('drops past sessions older than 30 days', () => {
    const old = session({
      id: 'old',
      startedAt: T0 - 31 * 86_400_000,
      endedAt: 1,
    });
    expect(pastFocusSessions([old], T0)).toEqual([]);
  });

  it('rounds minutes left up', () => {
    expect(focusMinutesLeft(T0 + 61_000, T0)).toBe(2);
    expect(focusMinutesLeft(T0, T0 + 1)).toBe(0);
    expect(formatFocusDuration(65_000)).toBe('1:05');
    expect(formatFocusDuration(3_725_000)).toBe('1:02:05');
  });

  it('offers only rosters with a ClassLink or mock class id', () => {
    const r = (patch: Partial<ClassRoster>): ClassRoster => ({
      id: 'r',
      name: 'n',
      driveFileId: null,
      studentCount: 1,
      createdAt: 0,
      students: [],
      ...patch,
    });
    expect(
      focusClassRosters([
        r({ id: 'local' }),
        r({ id: 'cl', classlinkClassId: 'x' }),
        r({ id: 'mock', testClassId: 'y' }),
      ]).map((x) => x.id)
    ).toEqual(['cl', 'mock']);
  });
});

describe('explainFocusSite', () => {
  it('says a www. host covers the whole domain', () => {
    const r = explainFocusSite('www.google.com');
    expect(r).toMatchObject({
      kind: 'ok',
      site: { host: 'google.com', path: '' },
    });
    expect(r.kind === 'ok' && r.covers).toMatch(
      /all of google\.com.*not only www/
    );
  });

  it('describes a plain host, a path and a Google file', () => {
    const host = explainFocusSite('desmos.com');
    expect(host.kind === 'ok' && host.covers).toBe(
      'all of desmos.com and its subdomains.'
    );
    const path = explainFocusSite('https://www.khanacademy.org/math/algebra');
    expect(path.kind === 'ok' && path.covers).toBe(
      'pages under khanacademy.org/math/algebra.'
    );
    const file = explainFocusSite(
      'https://docs.google.com/document/d/abc123/edit'
    );
    expect(file).toMatchObject({
      kind: 'ok',
      site: { host: 'docs.google.com', path: '/document/d/abc123' },
      covers: 'this one file.',
    });
  });

  it('refuses a Drive open?id= link with its own reason', () => {
    expect(explainFocusSite('https://drive.google.com/open?id=abc').kind).toBe(
      'query-id'
    );
    expect(explainFocusSite('drive.google.com/u/1/open?id=abc').kind).toBe(
      'query-id'
    );
  });

  it('marks empty and non-addresses', () => {
    expect(explainFocusSite('   ').kind).toBe('empty');
    expect(explainFocusSite('not a site').kind).toBe('invalid');
    expect(explainFocusSite('localhost').kind).toBe('invalid');
  });
});

describe('site list', () => {
  it('skips duplicates and stops at 20', () => {
    const one = { host: 'a.com', path: '' };
    expect(addFocusSite([one], { ...one })).toEqual([one]);
    const full = Array.from({ length: 20 }, (_, i) => ({
      host: `s${i}.com`,
      path: '',
    }));
    expect(addFocusSite(full, { host: 'new.com', path: '' })).toHaveLength(20);
  });

  it("pulls new sites from the board's Links and Embed widgets", () => {
    const widgets = [
      {
        id: '1',
        type: 'url',
        config: {
          urls: [
            { id: 'a', url: 'https://desmos.com/calculator' },
            { id: 'b', url: 'not a url' },
            { id: 'c', url: 'https://www.desmos.com/calculator' },
          ],
        },
      },
      {
        id: '2',
        type: 'embed',
        config: { url: 'https://www.youtube.com/watch?v=x' },
      },
      { id: '3', type: 'text', config: { content: 'https://nope.com' } },
    ] as unknown as WidgetData[];
    expect(
      boardFocusSites(widgets, [{ host: 'youtube.com', path: '/watch' }])
    ).toEqual([{ host: 'desmos.com', path: '/calculator' }]);
  });
});
