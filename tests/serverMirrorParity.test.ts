import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { writeGenerated } from './helpers/writeGenerated';
import type { RosterGroup, RosterGroupReminder } from '@/types';
import * as clientBuildings from '@/config/buildings';
import * as serverBuildings from '@/functions/src/buildingIds';
import * as clientTier from '@/utils/userTier';
import * as serverTier from '@/functions/src/userTierServer';
import * as clientDrive from '@/utils/devDriveWriteGuard';
import * as serverDrive from '@/functions/src/devDriveWriteGuard';
import * as clientBands from '@/utils/scoreColor';
import * as serverBands from '@/functions/src/plcAssessmentMath';
import { resolveResultsVisibility } from '@/utils/quizResultsVisibility';
import { resolveServerResultsVisibility } from '@/functions/src/quizResultsVisibilityServer';
import * as clientReminders from '@/utils/groupReminders';
import * as serverReminders from '@/functions/src/groupReminderSchedule';
import * as clientName from '@/utils/studentName';
import * as serverName from '@/functions/src/studentName.gen';

// Server code can't import the client, so each mirror here is checked against its client original.

describe('building id aliases', () => {
  it('match config/buildings.ts', () => {
    expect(serverBuildings.BUILDING_ID_ALIASES).toEqual(
      clientBuildings.BUILDING_ID_ALIASES
    );
    for (const id of ['orono-high-school', 'high', 'unknown', 'hasOwnProperty'])
      expect(serverBuildings.canonicalBuildingIdServer(id)).toBe(
        clientBuildings.canonicalBuildingId(id)
      );
  });
});

describe('user tiers', () => {
  it('use the same internal domains', () => {
    expect(serverTier.INTERNAL_TIER_DOMAINS).toEqual(
      clientTier.INTERNAL_TIER_DOMAINS
    );
  });

  it('rank every tier the way meetsMinTier does', () => {
    const tiers = ['free', 'org', 'internal'] as const;
    expect(Object.keys(serverTier.TIER_RANK).sort()).toEqual([...tiers].sort());
    for (const tier of tiers)
      for (const min of tiers)
        expect(serverTier.TIER_RANK[tier] >= serverTier.TIER_RANK[min]).toBe(
          clientTier.meetsMinTier(tier, min)
        );
  });
});

describe('dev Drive write guard', () => {
  const hrefs = [
    'https://www.googleapis.com/drive/v3/files/abc123',
    'https://www.googleapis.com/drive/v3/files/abc%2F123?fields=id',
    'https://www.googleapis.com/drive/v3/files/abc123/copy',
    'https://www.googleapis.com/drive/v3/files/abc123/permissions',
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    'https://www.googleapis.com/drive/v2/files/old1',
    'https://sheets.googleapis.com/v4/spreadsheets/sheet1:batchUpdate',
    'https://docs.googleapis.com/v1/documents/doc1:batchUpdate',
    'https://slides.googleapis.com/v1/presentations/deck1:batchUpdate',
    'https://example.com/drive/v3/files/x',
    'not a url',
  ];

  it('finds the same file a write targets', () => {
    for (const href of hrefs)
      expect(serverDrive.writeTargetFileId(href)).toBe(
        clientDrive.writeTargetFileId(href)
      );
  });

  it('treats the same requests as writes', () => {
    const urls = hrefs.filter((h) => h.startsWith('https://'));
    for (const url of urls)
      for (const method of [
        'GET',
        'HEAD',
        'OPTIONS',
        'POST',
        'PATCH',
        'PUT',
        'DELETE',
        'post',
      ])
        expect(serverDrive.isFileApiWrite(url, { method })).toBe(
          clientDrive.isFileApiWrite(url, { method })
        );
  });

  it('accepts the same files as dev-owned', async () => {
    const tree: Record<string, Record<string, unknown>> = {
      root: { name: 'SpartBoard Dev' },
      inside: { name: 'a', parents: ['mid'] },
      mid: { name: 'b', parents: ['root'] },
      trashedRoot: { name: 'SpartBoard Dev', trashed: true },
      underTrashed: { name: 'c', parents: ['trashedRoot'] },
      tagged: { name: 'sheet', properties: { spartboardDevFile: 'true' } },
      prod: { name: 'Lesson', parents: ['prodRoot'] },
      prodRoot: { name: 'SpartBoard' },
      deep: { name: 'd0', parents: ['d1'] },
      ...Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [
          `d${i + 1}`,
          { name: `d${i + 1}`, parents: [i === 11 ? 'root' : `d${i + 2}`] },
        ])
      ),
    };
    const fetchMeta = (id: string) => Promise.resolve(tree[id] ?? null);
    for (const id of [...Object.keys(tree), 'missing'])
      expect(
        await serverDrive.isInDevFolder(id, fetchMeta, 'SpartBoard Dev')
      ).toBe(await clientDrive.isInDevFolder(id, fetchMeta, 'SpartBoard Dev'));
  });
});

describe('score bands', () => {
  const scores = [
    -5, 0, 1, 59, 59.5, 59.99, 60, 79, 79.5, 80, 89, 89.5, 89.99, 90, 99.5, 100,
    101, 250,
  ];

  it('use the same floors', () => {
    expect([...serverBands.SCORE_BAND_MINS]).toEqual(
      clientBands.SCORE_DISTRIBUTION_BANDS.map((b) => b.min)
    );
  });

  it('count every score in the same band on both sides', () => {
    for (const score of scores) {
      const server = serverBands.bucketScores([score]);
      const client = clientBands.bucketScores([score]);
      expect(client.map((b) => b.count)).toEqual(server.map((b) => b.count));
      expect(client.reduce((n, b) => n + b.count, 0)).toBe(1);
    }
  });
});

describe('results visibility', () => {
  const NOW = 1_000_000;
  const sessions = [
    {},
    { scoreVisibility: 'none' },
    { scoreVisibility: 'score-only' },
    { scoreVisibility: 'score-and-responses' },
    { scoreVisibility: 'score-responses-and-answers' },
    { scoreVisibility: 'none', showScoreOnSubmit: true },
    { showScoreOnSubmit: true },
    { scoreVisibility: 'score-and-responses', showScoreOnSubmit: true },
  ] as const;
  const shown = {
    mode: 'shown',
    visibility: 'score-and-responses',
    publishedAt: 1,
  } as const;
  const responses = [
    {},
    { status: 'completed', score: 80 },
    { status: 'completed' },
    { status: 'in-progress', score: 80 },
    { status: 'completed', score: 0, resultsOverride: { mode: 'hidden' } },
    { status: 'completed', score: 80, resultsOverride: shown },
    {
      status: 'completed',
      score: 80,
      resultsOverride: { ...shown, expiresAt: NOW },
    },
    {
      resultsOverride: {
        mode: 'shown',
        visibility: 'score-only',
        expiresAt: NOW + 1,
      },
    },
  ] as const;

  it('gives a student the same level and source on both sides', () => {
    for (const session of sessions)
      for (const response of responses) {
        const client = resolveResultsVisibility(
          session,
          response as Parameters<typeof resolveResultsVisibility>[1],
          NOW
        );
        const server = resolveServerResultsVisibility(session, response, NOW);
        expect({ session, response, ...server }).toEqual({
          session,
          response,
          visibility: client.visibility,
          source: client.source,
        });
      }
  });
});

describe('group reminder emails', () => {
  it('share the alert and message caps', () => {
    expect(serverReminders.MAX_EMAIL_ALERTS).toBe(clientReminders.MAX_ALERTS);
    expect(serverReminders.EMAIL_MESSAGE_MAX).toBe(
      clientReminders.EMAIL_MESSAGE_MAX
    );
  });

  // Tests run in UTC (vitest.config.ts), so the client's local time is UTC too.
  const reminders: RosterGroupReminder[] = [
    {
      ...clientReminders.defaultGroupReminder(new Date('2026-11-02T12:00:00Z')),
      days: [1, 3, 5],
      alerts: [
        { time: '09:00', leadMinutes: 0 },
        { time: '00:05', leadMinutes: 15 },
        { time: '23:58', leadMinutes: 0 },
      ],
    },
    {
      ...clientReminders.defaultGroupReminder(new Date('2026-11-04T12:00:00Z')),
      days: [2, 4],
      repeat: 'biweekly',
      alerts: [{ time: '13:40', leadMinutes: 5 }],
    },
  ];

  it('fire on the same days and minutes as the board reminder', () => {
    for (const reminder of reminders) {
      const group = { id: 'g', name: 'Group', reminder } as RosterGroup;
      const roster = { id: 'r', groups: [group] } as Parameters<
        typeof clientReminders.dueReminders
      >[0][number];
      const doc: serverReminders.EmailAlertDoc = {
        groupName: 'Group',
        days: reminder.days,
        alerts: reminder.alerts,
        repeat: reminder.repeat,
        startDate: reminder.startDate,
        timeZone: 'UTC',
        message: '',
      };
      // Each minute around every alert for three weeks; minute 10 of the late window differs on purpose (board inclusive, email not).
      const start = Date.parse('2026-11-01T00:00:00Z');
      const times = new Set<number>();
      for (let day = 0; day < 21; day++)
        for (const a of reminder.alerts) {
          const [h, m] = a.time.split(':').map(Number);
          const showAt =
            start + (day * 1440 + h * 60 + m - a.leadMinutes) * 60_000;
          for (let k = -2; k <= 12; k++) times.add(showAt + k * 60_000);
        }
      for (const t of times) {
        const client = clientReminders
          .dueReminders([roster], t)
          .filter((d) => {
            const lead =
              reminder.alerts.find((a) => a.time === d.time)?.leadMinutes ?? 0;
            return t - (d.at - lead * 60_000) < 10 * 60_000;
          })
          .map((d) => `${d.key.split(':')[2]} ${d.time}`)
          .sort();
        const server = serverReminders
          .dueEmailAlerts(doc, new Date(t))
          .map((d) => `${d.dateKey} ${d.time}`)
          .sort();
        expect(server, new Date(t).toISOString()).toEqual(client);
      }
    }
  });
});

const NAME_SOURCE = 'utils/studentName.ts';
const NAME_FILE = resolve(process.cwd(), 'functions/src/studentName.gen.ts');

describe('student names', () => {
  it('functions copy matches utils/studentName.ts (UPDATE_STUDENT_NAME_COPY=1 rewrites it)', async () => {
    const text = [
      '// Generated from utils/studentName.ts by tests/serverMirrorParity.test.ts; rerun it with UPDATE_STUDENT_NAME_COPY=1.',
      readFileSync(resolve(process.cwd(), NAME_SOURCE), 'utf8'),
    ].join('\n');
    if (process.env.UPDATE_STUDENT_NAME_COPY) {
      await writeGenerated(NAME_FILE, text);
      return;
    }
    const config = await resolveConfig(NAME_FILE);
    expect(readFileSync(NAME_FILE, 'utf8')).toBe(
      await format(text, { ...config, filepath: NAME_FILE })
    );
    expect(readFileSync(NAME_FILE, 'utf8')).not.toMatch(/^import /m);
  });

  it('formats and sorts the same on both sides', () => {
    const names = [
      { firstName: 'Martin', lastName: 'Van Buren' },
      { firstName: 'Ana', lastName: 'van Dyke' },
      { givenName: 'Zoe', familyName: 'Adams' },
      { firstName: ' Lee ', lastName: '' },
      { firstName: '', lastName: 'Solo' },
      { givenName: '', familyName: '' },
      { firstName: 'Émile', lastName: 'Ávila' },
      { firstName: 'Bo', lastName: 'Buren' },
    ];
    for (const n of [...names, null, undefined]) {
      expect(serverName.lastFirst(n)).toBe(clientName.lastFirst(n));
      expect(serverName.lastFirstOrUnnamed(n)).toBe(
        clientName.lastFirstOrUnnamed(n)
      );
    }
    const sorted = [...names].sort(clientName.compareLastFirst);
    expect([...names].sort(serverName.compareLastFirst)).toEqual(sorted);
    expect(sorted.map(clientName.lastFirst)).toEqual([
      'Adams, Zoe',
      'Ávila, Émile',
      'Buren, Bo',
      'Lee',
      'Solo',
      'Van Buren, Martin',
      'van Dyke, Ana',
      '',
    ]);
  });
});

describe('one "Last, First"', () => {
  // A hand-built "Last, First" or last-name sort key drifts from utils/studentName.ts; call it instead.
  const COPY_PATTERNS = [
    /\[\s*[\w.?]*\.(lastName|familyName)[^\]]*\.(firstName|givenName)[^\]]*\]\s*\.filter\(Boolean\)\s*\.join\(/,
    /\$\{[\w.?]*\.(lastName|familyName)\},? \$\{[\w.?]*\.(firstName|givenName)\}/,
  ];
  const ROOTS = ['components', 'utils', 'hooks', 'context', 'functions/src'];

  it('has no hand-built copies left', () => {
    const files = execFileSync('git', ['ls-files', ...ROOTS], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter(
        (f) =>
          !f.endsWith('studentName.ts') && !f.endsWith('studentName.gen.ts')
      );
    const hits = files.flatMap((file) =>
      readFileSync(resolve(process.cwd(), file), 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          COPY_PATTERNS.some((p) => p.test(line)) ? [`${file}:${i + 1}`] : []
        )
    );
    expect(hits).toEqual([]);
  });
});
