import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  QuizDriveService,
  PlcSheetMissingError,
  PlcSheetSchemaMismatchError,
} from '@/utils/quizDriveService';
import type { QuizQuestion, QuizResponse } from '@/types';

/**
 * Mock helper: enqueues `fetch` responses in order so the tests can
 * simulate Drive/Sheets multi-call flows (e.g. create sheet, then grant
 * permission) without maintaining an elaborate scripted double.
 */
type FetchSpy = ReturnType<typeof vi.spyOn>;

function queueFetchResponses(
  responses: Array<{
    ok?: boolean;
    status?: number;
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
  }>
): FetchSpy {
  const spy = vi.spyOn(global, 'fetch');
  for (const r of responses) {
    spy.mockResolvedValueOnce({
      ok: r.ok ?? true,
      status: r.status ?? 200,
      statusText: '',
      json: r.json ?? (() => Promise.resolve({})),
      text: r.text ?? (() => Promise.resolve('')),
      headers: new Headers(),
    } as Response);
  }
  return spy;
}

/** Safely decode a fetch call's JSON body. */
function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  if (!init || typeof init.body !== 'string') return {};
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('QuizDriveService.createPlcSheetAndShare', () => {
  const token = 'test-token';
  let service: QuizDriveService;

  beforeEach(() => {
    service = new QuizDriveService(token);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a new sheet and grants writer permission to every teammate email', async () => {
    const fetchSpy = queueFetchResponses([
      // 1. POST /spreadsheets — create the sheet
      {
        json: () =>
          Promise.resolve({
            spreadsheetId: 'sheet-abc',
            spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-abc',
          }),
      },
      // 2. POST /files/sheet-abc/permissions — grant teacher-b
      { json: () => Promise.resolve({ id: 'perm-1' }) },
      // 3. POST /files/sheet-abc/permissions — grant teacher-c
      { json: () => Promise.resolve({ id: 'perm-2' }) },
    ]);

    const result = await service.createPlcSheetAndShare({
      plcName: '6th Grade Math',
      quizTitle: 'Unit 3 Check',
      memberEmailsToShareWith: [
        'teacher.b@example.org',
        'TEACHER.C@example.org',
      ],
    });

    expect(result).toEqual({
      url: 'https://docs.google.com/spreadsheets/d/sheet-abc',
      spreadsheetId: 'sheet-abc',
    });

    // First call = create sheet with the PLC-titled spreadsheet body.
    // `fetchSpy.mock.calls` is typed as `any` through the vi.spyOn return,
    // so we coerce once into the shape we care about.
    const calls = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls as Array<[string, RequestInit]>;
    const [createUrl, createInit] = calls[0];
    expect(createUrl).toBe('https://sheets.googleapis.com/v4/spreadsheets');
    const createBody = parseBody(createInit);
    const properties = createBody.properties as { title?: unknown };
    expect(properties.title).toBe('6th Grade Math – Unit 3 Check – Results');
    const sheetsArr = createBody.sheets as Array<{
      properties?: { title?: unknown };
    }>;
    expect(sheetsArr[0].properties?.title).toBe('Results');

    // Remaining calls = permission grants, normalized to lowercase, with
    // sendNotificationEmail=false so Drive doesn't spam a separate email.
    const permCalls = calls.slice(1);
    expect(permCalls).toHaveLength(2);
    for (const [url, init] of permCalls) {
      expect(url).toContain('/files/sheet-abc/permissions');
      expect(url).toContain('sendNotificationEmail=false');
      const body = parseBody(init);
      expect(body.role).toBe('writer');
      expect(body.type).toBe('user');
      expect(body.emailAddress as string).toMatch(
        /^teacher\.(b|c)@example\.org$/
      );
    }
  });

  it('continues and returns the URL even when a single grant fails', async () => {
    queueFetchResponses([
      // Create succeeds
      {
        json: () =>
          Promise.resolve({
            spreadsheetId: 'sheet-xyz',
            spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-xyz',
          }),
      },
      // First grant fails — e.g. stale email outside the org
      {
        ok: false,
        status: 400,
        text: () => Promise.resolve('invalid email'),
      },
      // Second grant succeeds
      { json: () => Promise.resolve({ id: 'perm-2' }) },
    ]);

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* suppress */
    });
    const result = await service.createPlcSheetAndShare({
      plcName: 'My PLC',
      quizTitle: 'Quiz 1',
      memberEmailsToShareWith: ['bogus@nope', 'ok@example.org'],
    });
    errSpy.mockRestore();

    expect(result.spreadsheetId).toBe('sheet-xyz');
  });

  it('throws a friendly error when Sheets scope is missing (401/403 on create)', async () => {
    queueFetchResponses([
      {
        ok: false,
        status: 403,
        text: () => Promise.resolve('insufficient scope'),
      },
    ]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* suppress */
    });
    await expect(
      service.createPlcSheetAndShare({
        plcName: 'X',
        quizTitle: 'Y',
        memberEmailsToShareWith: [],
      })
    ).rejects.toThrow(/Google Sheets access is not granted/);
    errSpy.mockRestore();
  });

  it('dedupes member emails and skips empty / invalid entries', async () => {
    const fetchSpy = queueFetchResponses([
      {
        json: () =>
          Promise.resolve({
            spreadsheetId: 'sheet-dedupe',
            spreadsheetUrl:
              'https://docs.google.com/spreadsheets/d/sheet-dedupe',
          }),
      },
      { json: () => Promise.resolve({ id: 'perm-1' }) },
    ]);

    await service.createPlcSheetAndShare({
      plcName: 'D',
      quizTitle: 'Q',
      memberEmailsToShareWith: [
        'dupe@example.org',
        'DUPE@example.org',
        '',
        '   ',
        'no-at-sign',
      ],
    });

    // Create + exactly ONE permission grant (dupe collapsed).
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('QuizDriveService.reconcilePlcSheetPermissions', () => {
  const token = 'test-token';
  let service: QuizDriveService;

  beforeEach(() => {
    service = new QuizDriveService(token);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('grants writer to teammates missing from the current permission list', async () => {
    const fetchSpy = queueFetchResponses([
      // LIST existing permissions — teacher-a already has access, teacher-c does not
      {
        json: () =>
          Promise.resolve({
            permissions: [
              {
                id: 'p1',
                type: 'user',
                role: 'owner',
                emailAddress: 'owner@example.org',
              },
              {
                id: 'p2',
                type: 'user',
                role: 'writer',
                emailAddress: 'teacher-a@example.org',
              },
            ],
          }),
      },
      // GRANT teacher-c
      { json: () => Promise.resolve({ id: 'perm-new' }) },
    ]);

    const result = await service.reconcilePlcSheetPermissions({
      sheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-123/edit',
      memberEmailsToShareWith: [
        'teacher-a@example.org',
        'teacher-c@example.org',
      ],
    });

    expect(result.granted).toEqual(['teacher-c@example.org']);
    expect(result.skipped).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns skipped=true without throwing when the caller cannot list permissions (403)', async () => {
    queueFetchResponses([
      { ok: false, status: 403, text: () => Promise.resolve('forbidden') },
    ]);
    const result = await service.reconcilePlcSheetPermissions({
      sheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-xyz/edit',
      memberEmailsToShareWith: ['anyone@example.org'],
    });
    expect(result).toEqual({ granted: [], skipped: true });
  });

  it('returns skipped=true on 404 (sheet deleted in Drive)', async () => {
    queueFetchResponses([
      { ok: false, status: 404, text: () => Promise.resolve('not found') },
    ]);
    const result = await service.reconcilePlcSheetPermissions({
      sheetUrl: 'https://docs.google.com/spreadsheets/d/gone/edit',
      memberEmailsToShareWith: ['anyone@example.org'],
    });
    expect(result.skipped).toBe(true);
  });

  it('returns skipped=true for malformed sheet URLs without calling fetch', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const result = await service.reconcilePlcSheetPermissions({
      sheetUrl: 'not-a-sheet-url',
      memberEmailsToShareWith: ['x@example.org'],
    });
    expect(result).toEqual({ granted: [], skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when no teammates need access', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const result = await service.reconcilePlcSheetPermissions({
      sheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-1/edit',
      memberEmailsToShareWith: [],
    });
    expect(result).toEqual({ granted: [], skipped: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('QuizDriveService appendToExistingSheet error surfacing', () => {
  const token = 'test-token';
  let service: QuizDriveService;

  beforeEach(() => {
    service = new QuizDriveService(token);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws PlcSheetMissingError when the sheet is gone (404)', async () => {
    queueFetchResponses([
      // Title metadata lookup — succeeds with a default tab name
      {
        json: () =>
          Promise.resolve({
            sheets: [{ properties: { title: 'Results' } }],
          }),
      },
      // A1 existence check — 404 Not Found
      { ok: false, status: 404, text: () => Promise.resolve('gone') },
    ]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* suppress */
    });
    await expect(
      service.exportResultsToSheet('Q', [], [], {
        plcMode: true,
        plcSheetUrl: 'https://docs.google.com/spreadsheets/d/gone/edit',
      })
    ).rejects.toBeInstanceOf(PlcSheetMissingError);
    errSpy.mockRestore();
  });

  it('throws PlcSheetMissingError when the caller lost access (403)', async () => {
    queueFetchResponses([
      {
        json: () =>
          Promise.resolve({
            sheets: [{ properties: { title: 'Results' } }],
          }),
      },
      {
        ok: false,
        status: 403,
        text: () => Promise.resolve('forbidden'),
      },
    ]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* suppress */
    });
    await expect(
      service.exportResultsToSheet('Q', [], [], {
        plcMode: true,
        plcSheetUrl: 'https://docs.google.com/spreadsheets/d/locked/edit',
      })
    ).rejects.toBeInstanceOf(PlcSheetMissingError);
    errSpy.mockRestore();
  });
});

// ─── Helpers for column-shape and PLC schema-guard tests ──────────────────

function makeQuestion(id: string, points = 1): QuizQuestion {
  return {
    id,
    text: `Question ${id}`,
    type: 'MC',
    correctAnswer: 'A',
    incorrectAnswers: ['B', 'C'],
    timeLimit: 0,
    points,
  };
}

function makeResponse(overrides: Partial<QuizResponse>): QuizResponse {
  return {
    studentUid: overrides.pin ?? overrides.studentUid ?? 'uid',
    pin: overrides.pin,
    classPeriod: overrides.classPeriod,
    joinedAt: 0,
    status: overrides.status ?? 'completed',
    answers: overrides.answers ?? [
      { questionId: 'q1', answer: 'A', answeredAt: 0 },
    ],
    submittedAt: overrides.submittedAt ?? 0,
    tabSwitchWarnings: overrides.tabSwitchWarnings ?? 0,
    score: overrides.score ?? null,
    ...overrides,
  };
}

describe('QuizDriveService.exportResultsToSheet — column shape', () => {
  let service: QuizDriveService;
  beforeEach(() => {
    service = new QuizDriveService('test-token');
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the post-PR header schema with no "Period" column', async () => {
    const fetchSpy = queueFetchResponses([
      {
        json: () =>
          Promise.resolve({
            spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/abc',
          }),
      },
    ]);

    await service.exportResultsToSheet(
      'Title',
      [
        makeResponse({ pin: '01', classPeriod: 'P1' }),
        makeResponse({ pin: '02', classPeriod: 'P2' }),
      ],
      [makeQuestion('q1')]
    );

    const calls = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls as Array<[string, RequestInit]>;
    const body = parseBody(calls[0][1]);
    const sheets = body.sheets as Array<{
      data: Array<{
        rowData: Array<{
          values: Array<{ userEnteredValue: { stringValue: string } }>;
        }>;
      }>;
    }>;
    const header = sheets[0].data[0].rowData[0].values.map(
      (v) => v.userEnteredValue.stringValue
    );

    // Strict ordering: any change here flags a column-shape regression.
    expect(header.slice(0, 11)).toEqual([
      'Timestamp',
      'Teacher',
      'Class Period',
      'Student',
      'PIN',
      'Status',
      'Score (%)',
      'Points Earned',
      'Max Points',
      'Warnings',
      'Submitted At',
    ]);
    // No legacy "Period" column anywhere.
    expect(header).not.toContain('Period');
  });

  it('sorts data rows by Student column at index 3 (post-Period-removal)', async () => {
    const fetchSpy = queueFetchResponses([
      {
        json: () =>
          Promise.resolve({
            spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/abc',
          }),
      },
    ]);

    await service.exportResultsToSheet(
      'Title',
      [
        makeResponse({ pin: '01', classPeriod: 'P1' }),
        makeResponse({ pin: '02', classPeriod: 'P1' }),
      ],
      [makeQuestion('q1')],
      {
        // Names are looked up by classPeriod. Use the period-scoped key
        // shape `${period}${pin}` (matches `buildPinToNameMap`).
        pinToName: {
          ['P1' + String.fromCharCode(0x01) + '01']: 'Zeta, Alex',
          ['P1' + String.fromCharCode(0x01) + '02']: 'Alpha, Sam',
        },
      }
    );

    const calls = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls as Array<[string, RequestInit]>;
    const body = parseBody(calls[0][1]);
    const sheets = body.sheets as Array<{
      data: Array<{
        rowData: Array<{
          values: Array<{ userEnteredValue: { stringValue: string } }>;
        }>;
      }>;
    }>;
    const allRows = sheets[0].data[0].rowData.map((row) =>
      row.values.map((v) => v.userEnteredValue.stringValue)
    );
    // Header + 2 data rows + question-analysis stats block
    const dataRows = [allRows[1], allRows[2]];
    // Sorted by Student (index 3): Alpha, Sam comes before Zeta, Alex.
    expect(dataRows[0][3]).toBe('Alpha, Sam');
    expect(dataRows[1][3]).toBe('Zeta, Alex');
  });

  it('throws PlcSheetSchemaMismatchError when appending to an old-schema PLC sheet', async () => {
    queueFetchResponses([
      // Tab metadata
      {
        json: () =>
          Promise.resolve({
            sheets: [{ properties: { title: 'Results' } }],
          }),
      },
      // Row-1 read returns the OLD 13-column header that includes "Period"
      {
        json: () =>
          Promise.resolve({
            values: [
              [
                'Timestamp',
                'Teacher',
                'Period',
                'Class Period',
                'Student',
                'PIN',
                'Status',
                'Score (%)',
                'Points Earned',
                'Max Points',
                'Warnings',
                'Submitted At',
                'Q1 (1pt): Question q1',
              ],
            ],
          }),
      },
    ]);

    await expect(
      service.exportResultsToSheet(
        'Q',
        [makeResponse({ pin: '01' })],
        [makeQuestion('q1')],
        {
          plcMode: true,
          plcSheetUrl: 'https://docs.google.com/spreadsheets/d/old-schema/edit',
        }
      )
    ).rejects.toBeInstanceOf(PlcSheetSchemaMismatchError);
  });

  it('appends cleanly when the existing PLC sheet header matches the current schema', async () => {
    const fetchSpy = queueFetchResponses([
      // Tab metadata
      {
        json: () =>
          Promise.resolve({
            sheets: [{ properties: { title: 'Results' } }],
          }),
      },
      // Row-1 read returns the matching 12-column header
      {
        json: () =>
          Promise.resolve({
            values: [
              [
                'Timestamp',
                'Teacher',
                'Class Period',
                'Student',
                'PIN',
                'Status',
                'Score (%)',
                'Points Earned',
                'Max Points',
                'Warnings',
                'Submitted At',
                'Q1 (1pt): Question q1',
              ],
            ],
          }),
      },
      // Append succeeds
      { json: () => Promise.resolve({}) },
    ]);

    await expect(
      service.exportResultsToSheet(
        'Q',
        [makeResponse({ pin: '01', classPeriod: 'P1' })],
        [makeQuestion('q1')],
        {
          plcMode: true,
          plcSheetUrl: 'https://docs.google.com/spreadsheets/d/ok/edit',
        }
      )
    ).resolves.toBe('https://docs.google.com/spreadsheets/d/ok');

    // Last fetch call is the append; verify it ran (i.e. we didn't throw early).
    const calls = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls;
    expect(calls.length).toBe(3);
  });
});

// Headers row produced by buildResultsSheetData — used to seed the
// readPlcSheet response in regeneratePlcSheet tests so the parsed shape
// is correct.
const PLC_SHEET_HEADERS = [
  'Timestamp',
  'Teacher',
  'Class Period',
  'Student',
  'PIN',
  'Status',
  'Score (%)',
  'Points Earned',
  'Max Points',
  'Warnings',
  'Submitted At',
  'Q1 (1pt): Question q1',
];

describe('QuizDriveService.regeneratePlcSheet — peer-row preservation', () => {
  let service: QuizDriveService;
  beforeEach(() => {
    service = new QuizDriveService('test-token');
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves rows from peer teachers and replaces only the owner teacher rows', async () => {
    const sheetUrl = 'https://docs.google.com/spreadsheets/d/plc-sheet-1/edit';

    // Existing sheet has 3 rows: 1 owned by Teacher A (caller) and 2
    // owned by peer teachers. The naïve rebuild would delete all 3 and
    // write only the owner's local responses, destroying peers' data.
    const existingValues = [
      PLC_SHEET_HEADERS,
      [
        '2026-04-29T10:00:00Z',
        'Teacher A',
        'Period 1',
        'Alice',
        '01',
        'completed',
        '50%',
        '0',
        '1',
        '0',
        '2026-04-29T09:55',
        '0',
      ],
      [
        '2026-04-29T11:00:00Z',
        'Teacher B',
        'Period 3',
        'Bob',
        '01',
        'completed',
        '100%',
        '1',
        '1',
        '0',
        '2026-04-29T10:55',
        '1',
      ],
      [
        '2026-04-29T12:00:00Z',
        'Teacher C',
        'Period 2',
        'Carol',
        '02',
        'completed',
        '0%',
        '0',
        '1',
        '1',
        '2026-04-29T11:55',
        '0',
      ],
    ];

    const fetchSpy = queueFetchResponses([
      // 1. metadata read for first-tab title (in readPlcSheet)
      {
        json: () =>
          Promise.resolve({
            sheets: [{ properties: { title: 'Sheet1' } }],
          }),
      },
      // 2. readPlcSheet values fetch
      { json: () => Promise.resolve({ values: existingValues }) },
      // 3. metadata read for first-tab title (in clearAndRewritePlcSheet)
      {
        json: () =>
          Promise.resolve({
            sheets: [{ properties: { title: 'Sheet1' } }],
          }),
      },
      // 4. clear request
      { json: () => Promise.resolve({}) },
      // 5. write request
      { json: () => Promise.resolve({}) },
    ]);

    await service.regeneratePlcSheet(
      sheetUrl,
      // Owner submits ONE updated response; Alice's prior 50% becomes 100%.
      [
        makeResponse({
          pin: '01',
          classPeriod: 'Period 1',
          submittedAt: 1735000000000,
          answers: [{ questionId: 'q1', answer: 'A', answeredAt: 0 }],
        }),
      ],
      [makeQuestion('q1')],
      { teacherName: 'Teacher A' }
    );

    // Inspect the write call (call index 4) to confirm:
    //   - Teacher B's row preserved verbatim (Bob, Period 3, 100%)
    //   - Teacher C's row preserved verbatim (Carol, Period 2, 0%)
    //   - Owner's old row (Alice, 50%) replaced by the rebuilt one (100%)
    const calls = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls as Array<[string, RequestInit]>;
    const writeBody = parseBody(calls[4][1]);
    const writtenRows = writeBody.values as string[][];

    // Header + 3 rows (owner's 1 rebuilt row + 2 preserved peers).
    // Identify rows by teacher rather than by sorted index — sort order
    // depends on how `resolveStudent` renders the owner's anonymous PIN
    // response, which isn't the contract we're testing here.
    expect(writtenRows).toHaveLength(4);
    expect(writtenRows[0]).toEqual(PLC_SHEET_HEADERS);

    const ownerRows = writtenRows.slice(1).filter((r) => r[1] === 'Teacher A');
    const teacherBRows = writtenRows
      .slice(1)
      .filter((r) => r[1] === 'Teacher B');
    const teacherCRows = writtenRows
      .slice(1)
      .filter((r) => r[1] === 'Teacher C');

    // Owner's old Alice/50% row is gone; the rebuilt row scores 100%
    // because the local response answer 'A' matches the correct answer
    // in makeQuestion. This proves the rebuild reflects current local
    // truth (not the stale sheet snapshot).
    expect(ownerRows).toHaveLength(1);
    expect(ownerRows[0][6]).toBe('100%');

    // Teacher B's row preserved verbatim — including class period and
    // score that the owner has no client-side visibility into.
    expect(teacherBRows).toHaveLength(1);
    expect(teacherBRows[0][3]).toBe('Bob');
    expect(teacherBRows[0][2]).toBe('Period 3');
    expect(teacherBRows[0][6]).toBe('100%');

    // Teacher C's row preserved verbatim.
    expect(teacherCRows).toHaveLength(1);
    expect(teacherCRows[0][3]).toBe('Carol');
    expect(teacherCRows[0][6]).toBe('0%');
  });

  it('falls back to "Unknown Teacher" matching when no teacherName is provided', async () => {
    const sheetUrl = 'https://docs.google.com/spreadsheets/d/plc-sheet-2/edit';

    const existingValues = [
      PLC_SHEET_HEADERS,
      // An anonymous row written by an earlier export that had no teacherName.
      [
        '2026-04-29T10:00:00Z',
        'Unknown Teacher',
        'Period 1',
        'Alice',
        '01',
        'completed',
        '50%',
        '0',
        '1',
        '0',
        '2026-04-29T09:55',
        '0',
      ],
      // A peer row from a teacher who DID set their name.
      [
        '2026-04-29T11:00:00Z',
        'Teacher B',
        'Period 3',
        'Bob',
        '01',
        'completed',
        '100%',
        '1',
        '1',
        '0',
        '2026-04-29T10:55',
        '1',
      ],
    ];

    const fetchSpy = queueFetchResponses([
      {
        json: () =>
          Promise.resolve({
            sheets: [{ properties: { title: 'Sheet1' } }],
          }),
      },
      { json: () => Promise.resolve({ values: existingValues }) },
      {
        json: () =>
          Promise.resolve({
            sheets: [{ properties: { title: 'Sheet1' } }],
          }),
      },
      { json: () => Promise.resolve({}) },
      { json: () => Promise.resolve({}) },
    ]);

    await service.regeneratePlcSheet(
      sheetUrl,
      [
        makeResponse({
          pin: '01',
          classPeriod: 'Period 1',
          answers: [{ questionId: 'q1', answer: 'A', answeredAt: 0 }],
        }),
      ],
      [makeQuestion('q1')]
      // No `teacherName` option — same fallback as buildResultsSheetData.
    );

    const calls = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls as Array<[string, RequestInit]>;
    const writtenRows = parseBody(calls[4][1]).values as string[][];

    // Header + 1 owner row (rebuilt) + 1 preserved peer row.
    expect(writtenRows).toHaveLength(3);
    // Owner's old "Unknown Teacher" row was replaced (now 100%, since the
    // local response answer matches the correct answer in makeQuestion).
    const ownerRows = writtenRows.filter((r) => r[1] === 'Unknown Teacher');
    expect(ownerRows).toHaveLength(1);
    expect(ownerRows[0][6]).toBe('100%');
    // Peer row preserved verbatim.
    const peerRows = writtenRows.filter((r) => r[1] === 'Teacher B');
    expect(peerRows).toHaveLength(1);
    expect(peerRows[0][3]).toBe('Bob');
  });

  it('propagates PlcSheetMissingError from the read step so callers fall through to recovery', async () => {
    const sheetUrl = 'https://docs.google.com/spreadsheets/d/missing/edit';

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* suppress */
    });

    queueFetchResponses([
      // First fetch is the metadata read inside readPlcSheet; let it
      // succeed so the values fetch is the one that 404s.
      {
        json: () =>
          Promise.resolve({
            sheets: [{ properties: { title: 'Sheet1' } }],
          }),
      },
      {
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      },
    ]);

    await expect(
      service.regeneratePlcSheet(
        sheetUrl,
        [makeResponse({ pin: '01', classPeriod: 'P1' })],
        [makeQuestion('q1')],
        { teacherName: 'Teacher A' }
      )
    ).rejects.toBeInstanceOf(PlcSheetMissingError);

    errSpy.mockRestore();
  });
});
